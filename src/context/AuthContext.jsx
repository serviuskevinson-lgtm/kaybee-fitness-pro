import { createContext, useContext, useEffect, useState } from "react";
import { auth, db, googleProvider, appleProvider } from "@/lib/firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier si on revient d'une redirection (utile pour mobile/certains navigateurs)
    getRedirectResult(auth).then((result) => {
      if (result) {
        handleUserInDB(result.user);
      }
    }).catch((error) => {
      console.error("Erreur redirection auth:", error);
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function signup(email, password, userData) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: email,
      createdAt: new Date(),
      onboardingCompleted: false,
      ...userData
    });
    return user;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function socialLogin(providerName) {
    let provider;
    if (providerName === 'google') provider = googleProvider;
    else if (providerName === 'apple') provider = appleProvider;
    else throw new Error("Fournisseur non supporté");

    try {
      // Sur mobile/Capacitor, signInWithPopup peut échouer, signInWithRedirect est plus stable
      // Mais pour le web standard, Popup est plus user-friendly.
      // On tente Popup d'abord, si échec spécifique on pourrait basculer.
      const result = await signInWithPopup(auth, provider);
      return await handleUserInDB(result.user);
    } catch (error) {
      console.error(`Erreur login ${providerName}:`, error);
      // Optionnel: fallback sur redirect si popup est bloqué
      if (error.code === 'auth/popup-blocked') {
        return await signInWithRedirect(auth, provider);
      }
      throw error;
    }
  }

  function setUpRecaptcha(elementId) {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
        'size': 'invisible'
      });
    }
    return window.recaptchaVerifier;
  }

  function sendOtp(phoneNumber, appVerifier) {
    return signInWithPhoneNumber(auth, phoneNumber, appVerifier);
  }

  async function handleUserInDB(user) {
    if (!user) return;
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      let firstName = 'Athlète';
      if (user.displayName) firstName = user.displayName.split(' ')[0];
      
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || user.phoneNumber || "",
        firstName: firstName,
        lastName: '',
        photoURL: user.photoURL || "",
        createdAt: new Date(),
        onboardingCompleted: false,
        role: 'client'
      });
    }
    return user;
  }

  function logout() {
    return signOut(auth);
  }

  async function updateUserProfile(data) {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, data);
  }

  const value = {
    currentUser,
    loading,
    signup,
    login,
    socialLogin,
    setUpRecaptcha,
    sendOtp,
    handleUserInDB,
    logout,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
