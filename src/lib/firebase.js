import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
// import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check"; // <--- 1. COMMENTE L'IMPORT

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

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// --- 2. COMMENTE TOUT CE BLOC ---
/*
if (typeof window !== "undefined") {
  if (import.meta.env.DEV) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LdpSkosAAAAAF8_w17-tAzT2oHDMHGU2tho6JQZ'),
      isTokenAutoRefreshEnabled: true
    });
  } catch (e) {
    console.warn("App Check désactivé");
  }
}
*/
// --------------------------------

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