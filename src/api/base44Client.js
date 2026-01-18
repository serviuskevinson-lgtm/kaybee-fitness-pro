import { initializeApp, getApps, getApp } from "firebase/app"; // <--- MODIF 1 : Ajout de getApps/getApp
import { getAuth, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TA CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyDb7k5657-5Mxu4Dsm6W4XMM1aglwX97s0",
  authDomain: "kaybee-fitness.firebaseapp.com",
  projectId: "kaybee-fitness",
  storageBucket: "kaybee-fitness.firebasestorage.app",
  messagingSenderId: "194256924870",
  appId: "1:194256924870:web:67660eb37d3a52e87767c7"
};

// <--- MODIF 2 : LA SÉCURITÉ ANTI-PLANTAGE
// Si une app existe déjà (lancée par l'autre fichier), on la récupère. Sinon, on l'initialise.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const formatDoc = (doc) => ({ id: doc.id, ...doc.data() });

const createEntityClient = (collectionName) => ({
  list: async (sortString = '', limitCount = 50) => {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    let data = snapshot.docs.map(formatDoc);
    // Simulation tri
    if (sortString.startsWith('-')) {
        const field = sortString.substring(1);
        data.sort((a, b) => new Date(b[field]) - new Date(a[field]));
    }
    return data.slice(0, limitCount);
  },
  filter: async (filters) => {
    const colRef = collection(db, collectionName);
    const constraints = Object.keys(filters).map(key => where(key, "==", filters[key]));
    const q = query(colRef, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(formatDoc);
  },
  create: async (data) => {
    const docRef = await addDoc(collection(db, collectionName), { ...data, created_date: new Date().toISOString() });
    return { id: docRef.id, ...data };
  },
  update: async (id, data) => {
    await updateDoc(doc(db, collectionName, id), data);
    return { id, ...data };
  },
  delete: async (id) => {
    await deleteDoc(doc(db, collectionName, id));
    return true;
  }
});

export const base44 = {
  auth: {
    me: async () => {
      return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(user => {
          unsubscribe();
          if (user) resolve({ 
            id: user.uid, 
            email: user.email, 
            full_name: user.displayName || user.email.split('@')[0], 
            photo_url: user.photoURL 
          });
          else reject("Not authenticated");
        });
      });
    },
    logout: async () => { await signOut(auth); window.location.href = '/'; }
  },
  entities: {
    User: createEntityClient('users'),
    WeeklyPlan: createEntityClient('weekly_plans'),
    Coach: createEntityClient('coaches'),
    CoachRequest: createEntityClient('coach_requests'),
    Post: createEntityClient('posts'),
    Challenge: createEntityClient('challenges'),
    ChallengeProgress: createEntityClient('challenge_progress'),
    Exercise: createEntityClient('exercises'),
    Meal: createEntityClient('meals'),
    WorkoutLog: createEntityClient('workout_logs'),
    Message: createEntityClient('messages'),
    Notification: createEntityClient('notifications')
  },
  integrations: {
    Core: {
      GenerateImage: async () => ({ url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80" }),
      UploadFile: async () => ({ file_url: "https://via.placeholder.com/150" }),
      InvokeLLM: async () => ({ name: "Plat AI", description: "Généré", ingredients: ["Riz", "Poulet"], calories: 500, protein: 30, carbs: 40, fat: 10, prep_time: 15 })
    }
  }
};