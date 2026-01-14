import { createContext, useContext, useEffect, useState } from "react";
import { auth, db, googleProvider, appleProvider } from "@/lib/firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
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

  // 1. Email/Password
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

  // 2. Google & Apple
  async function socialLogin(providerName) {
    let provider;
    if (providerName === 'google') provider = googleProvider;
    if (providerName === 'apple') provider = appleProvider;

    const result = await signInWithPopup(auth, provider);
    return await handleUserInDB(result.user);
  }

  // 3. Téléphone (SMS)
  function setUpRecaptcha(elementId) {
    // Crée le verifier invisible ou visible
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
        'size': 'invisible',
        'callback': (response) => {
          // reCAPTCHA solved
        }
      });
    }
    return window.recaptchaVerifier;
  }

  function sendOtp(phoneNumber, appVerifier) {
    return signInWithPhoneNumber(auth, phoneNumber, appVerifier);
  }

  // --- Helper pour créer/vérifier l'user en DB ---
  async function handleUserInDB(user) {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      let firstName = 'Athlète';
      if (user.displayName) firstName = user.displayName.split(' ')[0];
      
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || user.phoneNumber, // Utilise le tel si pas d'email
        firstName: firstName,
        lastName: '',
        photoURL: user.photoURL,
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    socialLogin,
    setUpRecaptcha, // <--- Pour le Login
    sendOtp,        // <--- Pour envoyer le SMS
    handleUserInDB, // <--- Pour valider après le code
    logout,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}