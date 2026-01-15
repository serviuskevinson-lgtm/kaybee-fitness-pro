import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext'; // <--- NOUVEAU
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { 
  Dumbbell, Search, Plus, Calendar, Zap, Trash2, 
  ChevronLeft, ChevronRight, Filter, Clock, Hash, Repeat, UserCheck, Users
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import exercisesData from '../data/exercises_final.json';

const ITEMS_PER_PAGE = 24;
const QUICK_FILTERS = ["Tout", "Quadriceps", "Glutes", "Hamstrings", "Chest", "Lats", "Shoulders", "Triceps", "Biceps", "Core"];

export default function Exercises() {
  const { currentUser } = useAuth();
  // On récupère le contexte client pour savoir où sauvegarder
  const { selectedClient, isCoachView, targetUserId } = useClient();
  
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState("Tout");
  const [currentPage, setCurrentPage] = useState(1);
  const [builderList, setBuilderList] = useState([]);
  const [selectedExo, setSelectedExo] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  // Nettoyage de la description
  const cleanDescription = (text, name, muscles) => {
    if (!text || text.includes("Cinematic 3D")) {
      return `Mouvement contrôlé de ${name}. Travaillez en amplitude complète pour solliciter les ${muscles?.join(', ')}. Gardez le buste droit et contrôlez la phase excentrique pour un maximum d'efficacité.`;
    }
    return text;
  };

  // Filtrage
  const filteredExercises = (exercisesData || []).filter(ex => {
    const matchesSearch = ex.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMuscle = selectedMuscle === "Tout" || (ex.targetMuscles || []).includes(selectedMuscle);
    return matchesSearch && matchesMuscle;
  });

  const totalPages = Math.ceil(filteredExercises.length / ITEMS_PER_PAGE);
  const currentExercises = filteredExercises.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Gestion du Builder
  const toggleToBuilder = (exo) => {
    if (builderList.find(e => e.name === exo.name)) {
      setBuilderList(builderList.filter(e => e.name !== exo.name));
    } else {
      setBuilderList([...builderList, { ...exo, sets: 4, reps: 12, rest: 90 }]);
    }
  };

  const updateBuilderExo = (name, field, value) => {
    setBuilderList(builderList.map(e => e.name === name ? { ...e, [field]: value } : e));
  };

  // --- SAUVEGARDE HYBRIDE (Perso OU Client) ---
  const saveWorkout = async (days = []) => {
    if (!targetUserId || builderList.length === 0) return null; // Utilise targetUserId au lieu de currentUser.uid
    
    try {
      const workoutId = Date.now().toString();
      const newWorkout = {
        id: workoutId,
        name: `Séance ${selectedMuscle === "Tout" ? "Mixte" : selectedMuscle}`,
        exercises: builderList,
        scheduledDays: days,
        createdAt: new Date().toISOString(),
        assignedBy: isCoachView ? 'coach' : 'self' // Marqueur pour savoir qui a créé la séance
      };
      
      // On écrit dans la DB de la cible (Moi ou Client)
      const userRef = doc(db, "users", targetUserId);
      await updateDoc(userRef, { workouts: arrayUnion(newWorkout) });
      return newWorkout;
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la sauvegarde.");
      return null;
    }
  };

  const handleSchedule = async (days) => {
    const success = await saveWorkout(days);
    if (success) {
      setIsScheduleOpen(false);
      setBuilderList([]);
      alert(isCoachView 
        ? `Séance assignée à ${selectedClient?.full_name} pour : ${days.join(', ')}` 
        : "Séance planifiée avec succès !"
      );
    }
  };

  const handleStartOrAssign = async () => {
    const workout = await saveWorkout([]); // Sauvegarde sans jour précis (dans la liste générale)
    if (workout) {
      if (isCoachView) {
          // Si Coach : On confirme juste l'assignation
          setBuilderList([]);
          alert(`Séance ajoutée au profil de ${selectedClient?.full_name}`);
      } else {
          // Si Perso : On lance la séance
          navigate('/session', { state: { workout } });
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#0a0a0f] text-white p-4 lg:p-6 gap-6">
      <div className="flex-1">
        <header className="mb-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <h1 className="text-3xl font-black uppercase italic flex items-center gap-3">
              <Dumbbell className="text-[#00f5d4] w-8 h-8" /> Training Lab
            </h1>
            
            {/* Si Coach View, on affiche un bandeau d'info */}
            {isCoachView && (
                <Badge className="bg-[#7b2cbf] text-white px-3 py-1 text-sm">
                    <Users size={14} className="mr-2"/> Création pour : {selectedClient?.full_name}
                </Badge>
            )}

            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input 
                placeholder="Rechercher un exercice..." 
                className="pl-10 bg-[#1a1a20] border-gray-800" 
                value={searchTerm} 
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
              />
            </div>
          </div>

          {/* BARRE DE FILTRES RAPIDES */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
            <Filter className="w-4 h-4 text-[#7b2cbf] mr-2 flex-shrink-0" />
            {QUICK_FILTERS.map(muscle => (
              <button
                key={muscle}
                onClick={() => { setSelectedMuscle(muscle); setCurrentPage(1); }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex-shrink-0 border ${
                  selectedMuscle === muscle 
                  ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white shadow-[0_0_15px_rgba(123,44,191,0.4)]' 
                  : 'bg-[#1a1a20] border-gray-800 text-gray-400 hover:border-gray-600'
                }`}
              >
                {muscle}
              </button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {currentExercises.map((exo, idx) => {
            const isAdded = builderList.find(e => e.name === exo.name);
            return (
              <div key={idx} className="bg-[#1a1a20] rounded-2xl overflow-hidden border border-gray-800 hover:border-[#7b2cbf] transition-all group">
                <div className="relative h-48 cursor-pointer" onClick={() => { setSelectedExo(exo); setIsDetailOpen(true); }}>
                  <img src={exo.imageUrl} alt={exo.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    {exo.targetMuscles?.slice(0, 2).map(m => (
                      <Badge key={m} className="bg-black/60 text-[#00f5d4] text-[10px] border-none">{m}</Badge>
                    ))}
                  </div>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <h3 className="font-bold truncate text-sm">{exo.name}</h3>
                  <Button 
                    size="sm" 
                    variant={isAdded ? "destructive" : "default"} 
                    className={isAdded ? "" : "bg-[#7b2cbf] hover:bg-[#9d4edd] text-white border-none"}
                    onClick={() => toggleToBuilder(exo)}
                  >
                    {isAdded ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* PAGINATION */}
        <div className="flex justify-center items-center gap-4 mt-10">
          <Button variant="ghost" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <ChevronLeft />
          </Button>
          <span className="text-sm font-mono bg-[#1a1a20] px-4 py-2 rounded-full border border-gray-800">
            Page {currentPage} / {totalPages || 1}
          </span>
          <Button variant="ghost" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* BUILDER SIDEBAR AVEC INPUTS REPS/SETS */}
      {builderList.length > 0 && (
        <aside className="w-full lg:w-96 bg-[#111118] border border-gray-800 rounded-3xl p-6 h-[calc(100vh-2rem)] sticky top-4 flex flex-col shadow-2xl">
          <h2 className="text-xl font-black uppercase mb-6 flex items-center gap-2 text-[#00f5d4]">
            {isCoachView ? <Users className="text-[#00f5d4]"/> : <Zap className="fill-[#00f5d4]" />} 
            {isCoachView ? "Programme Client" : "Ma Séance"}
          </h2>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {builderList.map(exo => (
              <div key={exo.name} className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate pr-2">{exo.name}</span>
                  <Trash2 className="w-4 h-4 text-red-500 cursor-pointer hover:scale-110 transition-transform" onClick={() => toggleToBuilder(exo)} />
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><Hash size={10}/> Sets</label>
                    <input type="number" value={exo.sets} onChange={(e) => updateBuilderExo(exo.name, 'sets', e.target.value)} className="w-full bg-black border border-gray-800 rounded-md p-1 text-center text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><Repeat size={10}/> Reps</label>
                    <input type="number" value={exo.reps} onChange={(e) => updateBuilderExo(exo.name, 'reps', e.target.value)} className="w-full bg-black border border-gray-800 rounded-md p-1 text-center text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><Clock size={10}/> Repos</label>
                    <input type="number" value={exo.rest} onChange={(e) => updateBuilderExo(exo.name, 'rest', e.target.value)} className="w-full bg-black border border-gray-800 rounded-md p-1 text-center text-xs" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3 pt-4 border-t border-gray-800">
            {/* BOUTON PLANIFIER */}
            <Button className="w-full bg-white/5 border border-gray-700 hover:bg-white/10 text-white font-bold" onClick={() => setIsScheduleOpen(true)}>
               <Calendar className="mr-2 w-4 h-4" /> 
               {isCoachView ? "PLANIFIER POUR LE CLIENT" : "PLANIFIER LA SEMAINE"}
            </Button>
            
            {/* BOUTON ACTION PRINCIPALE */}
            <Button className={`w-full hover:scale-[1.02] transition-transform text-black font-black py-6 rounded-xl ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]'}`} onClick={handleStartOrAssign}>
               {isCoachView ? (
                   <><UserCheck className="mr-2 w-5 h-5" /> ASSIGNER SANS DATE</>
               ) : (
                   <><Zap className="mr-2 w-5 h-5 fill-black" /> PASSEZ À L'ACTION</>
               )}
            </Button>
          </div>
        </aside>
      )}

      {/* MODALS DETAILS */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-2xl">
          {selectedExo && (
            <>
              <DialogHeader><DialogTitle className="text-2xl font-black text-[#00f5d4] uppercase italic">{selectedExo.name}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <img src={selectedExo.imageUrl} className="w-full aspect-square object-cover rounded-xl border border-gray-800 shadow-2xl" />
                <div className="flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold text-[#7b2cbf] uppercase tracking-widest mb-2">Guide d'exécution</h4>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <p className="text-sm text-gray-300 italic leading-relaxed">
                        "{cleanDescription(selectedExo.description, selectedExo.name, selectedExo.targetMuscles)}"
                      </p>
                    </div>
                  </div>
                  <Button className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black py-4 rounded-xl shadow-lg" onClick={() => { toggleToBuilder(selectedExo); setIsDetailOpen(false); }}>
                    Ajouter au Workout
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL PLANIFICATION */}
      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white">
          <DialogHeader><DialogTitle className="text-xl font-bold uppercase italic">
              {isCoachView ? `Assigner à ${selectedClient?.full_name}` : "Choisir le jour"}
          </DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-4">
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(day => (
              <Button key={day} variant="outline" className="border-gray-800 hover:border-[#00f5d4] hover:text-[#00f5d4] font-bold" onClick={() => handleSchedule([day])}>{day}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}