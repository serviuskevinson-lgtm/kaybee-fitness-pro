import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// NOUVEAUX IMPORTS POUR LA SÉCURITÉ
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyDb7k5657-5Mxu4Dsm6W4XMM1aglwX97s0",
  authDomain: "kaybee-fitness.firebaseapp.com",
  databaseURL: "https://kaybee-fitness-default-rtdb.firebaseio.com",
  projectId: "kaybee-fitness",
  storageBucket: "kaybee-fitness.firebasestorage.app",
  messagingSenderId: "194256924870",
  appId: "1:194256924870:web:67660eb37d3a52e87767c7",
  measurementId: "G-SPMZX25BQD"
};

// Singleton pour éviter les erreurs "App already exists"
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// --- ACTIVATION DE LA SÉCURITÉ (APP CHECK) ---
if (typeof window !== "undefined") {
  // Active le mode DEBUG en local pour que localhost ne soit pas bloqué
  // (Pense à aller chercher le "Debug Token" dans ta console navigateur si besoin)
  if (process.env.NODE_ENV === 'development') {
      window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  initializeAppCheck(app, {
    // J'ai inséré TA Clé du Site ici :
    provider: new ReCaptchaV3Provider('6LdpSkosAAAAAF8_w17-tAzT2oHDMHGU2tho6JQZ'),
    isTokenAutoRefreshEnabled: true
  });
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

// Tes fonctions existantes...
export const getAllExercises = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "exercises"));
    const exercisesList = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return exercisesList;
  } catch (error) {
    console.error("Erreur exos :", error);
    return [];
  }
};