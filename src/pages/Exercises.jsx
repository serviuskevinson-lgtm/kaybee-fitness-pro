import React, { useState, useEffect } from 'react';
// On importe les outils Firebase
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { Dumbbell, Search, AlertCircle, PlayCircle } from 'lucide-react';
// Mise à jour des clés Vercel

// --- TES VRAIES CLÉS (Celles que tu viens d'envoyer) ---
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

// --- INITIALISATION SÉCURISÉE ---
// Empêche le bug "Firebase already initialized" quand tu modifies le code
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function Exercises() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchExercises = async () => {
      try {
        console.log("Chargement depuis Firebase...");
        
        // On se connecte à la collection "exercises"
        const querySnapshot = await getDocs(collection(db, "exercises"));
        
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log("Exercices trouvés :", data.length);
        setExercises(data);
      } catch (err) {
        console.error("Erreur Firebase:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchExercises();
  }, []);

  // Filtrage par recherche
  const filteredExercises = exercises.filter(ex => 
    ex.name ? ex.name.toLowerCase().includes(searchTerm.toLowerCase()) : false
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-white">
      
      {/* En-tête */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black italic uppercase">Bibliothèque d'Exercices</h1>
        <p className="text-gray-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Connecté à la base de données Kaybee
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="bg-[#1a1a20] p-4 rounded-xl border border-white/10 flex items-center gap-4 focus-within:border-[#00f5d4] transition-colors">
        <Search className="text-gray-400 w-5 h-5" />
        <input 
          type="text"
          placeholder="Rechercher un mouvement (ex: Squat, Bench Press)..." 
          className="bg-transparent border-none outline-none text-white w-full placeholder-gray-600"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Message de Chargement */}
      {loading && (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00f5d4] mb-4"></div>
          <p className="text-[#00f5d4] font-bold">Synchronisation...</p>
        </div>
      )}

      {/* Message d'Erreur */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 p-6 rounded-xl text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
          <h3 className="font-bold text-red-400">Erreur de connexion</h3>
          <p className="text-sm text-gray-300 mt-2">{error}</p>
        </div>
      )}

      {/* Grille des Résultats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {!loading && !error && filteredExercises.map((ex) => (
          <div 
            key={ex.id} 
            className="bg-[#1a1a20]/80 border border-white/10 rounded-xl overflow-hidden hover:border-[#00f5d4] hover:-translate-y-1 transition-all duration-300 group shadow-lg"
          >
            {/* Image de l'exercice */}
            <div className="aspect-video w-full bg-black relative overflow-hidden">
              {ex.thumbnail ? (
                <img 
                  src={ex.thumbnail} 
                  alt={ex.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80 group-hover:opacity-100"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#0a0a0f]">
                  <Dumbbell className="text-gray-700 w-12 h-12 group-hover:text-[#00f5d4] transition-colors" />
                </div>
              )}
              
              {/* Overlay Play */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                 <PlayCircle className="text-[#00f5d4] w-12 h-12 drop-shadow-[0_0_15px_rgba(0,245,212,0.6)]" />
              </div>
            </div>

            {/* Infos */}
            <div className="p-4">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9d4edd] border border-[#9d4edd]/30 bg-[#9d4edd]/10 px-2 py-1 rounded">
                  {ex.muscle || "Général"}
                </span>
                {ex.difficulty && (
                   <span className="text-[10px] text-gray-500">{ex.difficulty}</span>
                )}
              </div>
              <h3 className="font-bold text-lg leading-tight text-white group-hover:text-[#00f5d4] transition-colors">
                {ex.name || "Exercice Sans Nom"}
              </h3>
            </div>
          </div>
        ))}
      </div>
      
      {/* Si aucun résultat */}
      {!loading && !error && filteredExercises.length === 0 && (
        <div className="text-center py-10 text-gray-500">
           Aucun exercice trouvé pour "{searchTerm}"
        </div>
      )}
    </div>
  );
}