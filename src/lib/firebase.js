import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
// Note: On n'importe pas Vertex AI ici, on le fait dans gemini.js

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

// 1. Initialiser l'App UNE SEULE FOIS
const app = initializeApp(firebaseConfig);

// 2. Initialiser les services
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

// 3. EXPORTS (C'est ça qui manquait pour l'erreur "does not provide an export named app")
export { app, auth, db, storage, googleProvider, appleProvider };

// --- Tes fonctions utilitaires ---
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