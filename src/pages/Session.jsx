import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { 
  Timer, CheckCircle, ChevronDown, ChevronUp, 
  Play, RotateCcw, Dumbbell, AlertCircle, XCircle, Save, 
  Trophy, CalendarClock, ArrowRight
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import { registerPlugin } from '@capacitor/core';

const WearConnectivity = registerPlugin('WearConnectivity');

export default function Session() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // --- ÉTATS ---
  const [userProfile, setUserProfile] = useState(null);
  const [workout, setWorkout] = useState(null); 
  const [loading, setLoading] = useState(true);
  
  // États Séance Active
  const [isSessionStarted, setIsSessionStarted] = useState(false); 
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [expandedExo, setExpandedExo] = useState(null);
  const [sessionLogs, setSessionLogs] = useState({});
  const [activeRest, setActiveRest] = useState({ exoIdx: null, timeLeft: 0 });

  // Modales
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [sessionStats, setSessionStats] = useState({ volume: 0, sets: 0, time: 0, calories: 0 });

  // --- 1. LOGIQUE DE CHARGEMENT & COMPTE À REBOURS ---
  useEffect(() => {
    const initSession = async () => {
      if (!currentUser) return;
      setLoading(true);

      // Si on vient du bouton "Commencer" du dashboard
      if (location.state?.workout) {
        setWorkout(location.state.workout);
        setLoading(false);
        return;
      }

      // Sinon, on cherche la séance du jour dans le profil
      try {
        const docSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);

          // Vérifier si déjà faite aujourd'hui
          const today = new Date().toISOString().split('T')[0];
          const lastWorkoutDate = data.history?.length > 0 ? data.history[data.history.length - 1].date : "";
          
          if (lastWorkoutDate.startsWith(today)) {
              setIsCompletedToday(true);
          }

          // Trouver la séance prévue ce jour
          const weekDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
          const todayName = weekDays[new Date().getDay()];
          const todayWorkout = data.workouts?.find(w => w.scheduledDays?.includes(todayName));
          
          setWorkout(todayWorkout || null);
        }
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    initSession();
  }, [currentUser, location]);

  // Fonction pour trouver le prochain jour d'entraînement
  const getNextWorkoutInfo = () => {
    if (!userProfile?.workouts) return "Aucun programme défini";
    const weekDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const currentDayIdx = new Date().getDay();
    
    for (let i = 1; i <= 7; i++) {
        const nextIdx = (currentDayIdx + i) % 7;
        const nextDayName = weekDays[nextIdx];
        const hasWorkout = userProfile.workouts.some(w => w.scheduledDays?.includes(nextDayName));
        
        if (hasWorkout) {
            return i === 1 ? "Demain" : `Dans ${i} jours (${nextDayName})`;
        }
    }
    return "Aucun autre entraînement prévu";
  };

  // --- 2. DÉMARRAGE ET MONTRE ---
  const handleStartSession = async () => {
    setIsSessionStarted(true);
    if (workout) {
        // Envoi à la montre
        const watchData = {
            name: workout.name,
            exercises: (workout.exercises || []).map(e => ({
                name: e.name,
                sets: parseInt(e.sets || 3),
                reps: parseInt(e.reps || 10),
                weight: parseFloat(e.weight || 0)
            }))
        };
        try {
            await WearConnectivity.sendDataToWatch({
                path: "/start-session",
                data: JSON.stringify(watchData)
            });
        } catch (e) {}
    }
  };

  // --- 3. GESTION CHRONO & LOGS ---
  useEffect(() => {
    let interval = null;
    if (isSessionStarted && !showSummaryModal) interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isSessionStarted, showSummaryModal]);

  useEffect(() => {
    let timer = null;
    if (activeRest.timeLeft > 0) timer = setInterval(() => setActiveRest(p => ({ ...p, timeLeft: p.timeLeft - 1 })), 1000);
    return () => clearInterval(timer);
  }, [activeRest]);

  const startRest = (exoIdx, restTime) => setActiveRest({ exoIdx, timeLeft: restTime || 90 });
  
  const handleSetChange = (exoIdx, setIdx, field, value) => {
    setSessionLogs(prev => ({ ...prev, [`${exoIdx}-${setIdx}`]: { ...prev[`${exoIdx}-${setIdx}`], [field]: value } }));
  };
  const toggleSetComplete = (exoIdx, setIdx) => {
    setSessionLogs(prev => ({ ...prev, [`${exoIdx}-${setIdx}`]: { ...prev[`${exoIdx}-${setIdx}`], done: !prev[`${exoIdx}-${setIdx}`]?.done } }));
  };

  // --- 4. FIN DE SÉANCE ---
  const handleOpenSummary = () => {
    let totalVolume = 0;
    let totalSets = 0;
    Object.values(sessionLogs).forEach(log => {
        if (log.done) {
            totalSets++;
            totalVolume += (parseFloat(log.weight || 0) * parseFloat(log.reps || 0));
        }
    });

    // Formule Calories Muscu : Poids * Durée(min) * 0.07
    const weight = parseFloat(userProfile?.weight) || 80;
    const minutes = seconds / 60;
    const caloriesBurned = Math.floor(minutes * weight * 0.07);

    setSessionStats({ volume: totalVolume, sets: totalSets, time: seconds, calories: caloriesBurned });
    setShowSummaryModal(true);
  };

  const confirmSaveSession = async () => {
    if (!currentUser || !workout) return;
    setIsSaving(true);
    try {
        const historyItem = {
            id: Date.now().toString(),
            name: workout.name,
            date: new Date().toISOString(),
            duration: sessionStats.time,
            volume: sessionStats.volume,
            calories: sessionStats.calories, 
            totalSets: sessionStats.sets,
            type: 'workout', 
            logs: sessionLogs 
        };

        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            history: arrayUnion(historyItem),
            workoutsCompleted: increment(1),
            points: increment(sessionStats.sets * 5 + 50),
            totalVolume: increment(sessionStats.volume),
            dailyBurnedCalories: increment(sessionStats.calories), // IMPORTANT: Ajout au dashboard
            lastActiveDate: new Date().toISOString().split('T')[0]
        });
        
        try { await WearConnectivity.sendDataToWatch({ path: "/stop-session", data: "{}" }); } catch(e){}
        navigate('/dashboard'); 
    } catch (e) { 
        console.error(e);
        setIsSaving(false); 
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">{t('loading')}...</div>;

  // --- VUE 1 : DÉJÀ FAIT (COMPTE À REBOURS) ---
  if (isCompletedToday) {
      return (
        <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle className="w-24 h-24 text-[#00f5d4] mb-6" />
            <h1 className="text-3xl font-black italic uppercase mb-2">Séance Terminée !</h1>
            <p className="text-gray-400 mb-8">Excellent travail. Récupère bien.</p>
            
            <div className="bg-[#1a1a20] p-8 rounded-3xl border border-gray-800 w-full max-w-sm">
                <p className="text-sm text-gray-500 font-bold uppercase mb-2">Prochain Entraînement</p>
                <div className="flex items-center justify-center gap-3 text-[#7b2cbf]">
                    <CalendarClock className="w-8 h-8"/>
                    <span className="text-2xl font-black text-white">{getNextWorkoutInfo()}</span>
                </div>
            </div>
            <Button onClick={() => navigate('/dashboard')} className="mt-8 bg-white text-black font-bold h-12 px-8 rounded-xl">Retour Dashboard</Button>
        </div>
      );
  }

  // --- VUE 2 : PRÉSENTATION SÉANCE (AVANT START) ---
  if (!isSessionStarted) {
      return (
        <div className="min-h-screen bg-[#0a0a0f] text-white p-6 pb-32">
            <div className="mb-8">
                <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-gray-500 pl-0 mb-4 hover:text-white"><ArrowRight className="rotate-180 mr-2"/> Retour</Button>
                <h1 className="text-4xl font-black italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">
                    {workout?.name || "Séance Libre"}
                </h1>
                <div className="flex gap-4 mt-4">
                    <div className="bg-[#1a1a20] px-3 py-1 rounded-lg border border-gray-800 text-xs font-bold text-gray-400 flex items-center gap-2">
                        <Dumbbell size={14}/> {workout?.exercises?.length || 0} Exercices
                    </div>
                    <div className="bg-[#1a1a20] px-3 py-1 rounded-lg border border-gray-800 text-xs font-bold text-gray-400 flex items-center gap-2">
                        <Trophy size={14}/> +50 Pts
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {workout?.exercises?.map((exo, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-[#1a1a20] p-3 rounded-2xl border border-gray-800">
                        <div className="w-16 h-16 bg-black rounded-xl overflow-hidden flex-shrink-0">
                            <img src={exo.imageUrl} className="w-full h-full object-cover opacity-80" alt=""/>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight">{exo.name}</h3>
                            <p className="text-xs text-gray-500 font-bold uppercase mt-1">{exo.sets} Séries x {exo.reps} Reps</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="fixed bottom-0 left-0 w-full p-4 bg-[#0a0a0f]/90 backdrop-blur-md border-t border-gray-800">
                <Button onClick={handleStartSession} className="w-full h-14 text-xl font-black bg-[#00f5d4] text-black rounded-2xl shadow-[0_0_20px_rgba(0,245,212,0.3)]">
                    <Play className="mr-2 fill-black"/> COMMENCER
                </Button>
            </div>
        </div>
      );
  }

  // --- VUE 3 : SÉANCE EN COURS ---
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 pb-32">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 sticky top-0 bg-[#0a0a0f] z-10 pt-2">
            <span className="font-mono text-3xl font-black text-[#00f5d4]">
                {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
            </span>
            <Button variant="destructive" size="sm" onClick={() => setShowCancelModal(true)} className="h-8 text-xs font-bold">Abandonner</Button>
        </div>

        <div className="space-y-4">
            {workout?.exercises?.map((exo, idx) => {
                const isExpanded = expandedExo === idx;
                return (
                    <div key={idx} className={`bg-[#1a1a20] border ${isExpanded ? 'border-[#7b2cbf]' : 'border-gray-800'} rounded-2xl overflow-hidden transition-all`}>
                        <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setExpandedExo(isExpanded ? null : idx)}>
                            <div className="flex items-center gap-3">
                                <span className="text-gray-500 font-bold text-sm w-6">#{idx+1}</span>
                                <span className="font-bold">{exo.name}</span>
                            </div>
                            {isExpanded ? <ChevronUp/> : <ChevronDown/>}
                        </div>
                        {isExpanded && (
                            <div className="p-4 pt-0 space-y-3 bg-[#14141a]">
                                {Array.from({ length: parseInt(exo.sets) }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 w-12 font-bold">SET {i+1}</span>
                                        <Input type="number" placeholder={exo.weight || "kg"} className="h-10 bg-black border-gray-800 text-white text-center font-bold" onChange={(e) => handleSetChange(idx, i, 'weight', e.target.value)} />
                                        <Input type="number" placeholder={exo.reps || "reps"} className="h-10 bg-black border-gray-800 text-white text-center font-bold" onChange={(e) => handleSetChange(idx, i, 'reps', e.target.value)} />
                                        <button onClick={() => toggleSetComplete(idx, i)} className={`h-10 w-10 flex items-center justify-center rounded-lg transition-colors ${sessionLogs[`${idx}-${i}`]?.done ? 'bg-[#00f5d4] text-black' : 'bg-gray-800 text-gray-500'}`}><CheckCircle size={20}/></button>
                                    </div>
                                ))}
                                <Button variant="outline" onClick={() => startRest(idx, exo.rest)} className={`w-full mt-2 font-bold ${activeRest.exoIdx === idx ? 'border-[#00f5d4] text-[#00f5d4]' : 'border-[#7b2cbf] text-[#7b2cbf]'}`}>
                                    <RotateCcw className={`mr-2 ${activeRest.exoIdx === idx ? 'animate-spin' : ''}`} size={16}/> 
                                    {activeRest.exoIdx === idx ? `${activeRest.timeLeft}s` : `Lancer Repos (${exo.rest}s)`}
                                </Button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        <div className="fixed bottom-0 left-0 w-full p-4 bg-[#0a0a0f]/95 border-t border-gray-800 backdrop-blur-md">
            <Button onClick={handleOpenSummary} className="w-full h-12 font-black bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] text-black rounded-xl text-lg shadow-[0_0_20px_rgba(0,245,212,0.2)]">
                TERMINER LA SÉANCE
            </Button>
        </div>

        <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
            <DialogContent className="bg-[#1a1a20] border-[#00f5d4] text-white">
                <DialogHeader><DialogTitle className="text-[#00f5d4] italic uppercase text-2xl text-center">SESSION TERMINÉE</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-6 text-center">
                    <div className="bg-black/50 p-4 rounded-2xl border border-gray-800"><Activity className="mx-auto mb-2 text-gray-500"/><p className="text-gray-500 text-xs uppercase font-bold">Durée</p><p className="text-2xl font-black text-white">{Math.floor(sessionStats.time / 60)} min</p></div>
                    <div className="bg-black/50 p-4 rounded-2xl border border-gray-800"><Trophy className="mx-auto mb-2 text-[#fdcb6e]"/><p className="text-gray-500 text-xs uppercase font-bold">Calories</p><p className="text-2xl font-black text-[#00f5d4]">{sessionStats.calories}</p></div>
                </div>
                <Button onClick={confirmSaveSession} disabled={isSaving} className="w-full bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black h-12 rounded-xl">
                    {isSaving ? "SAUVEGARDE..." : "ENREGISTRER & QUITTER"}
                </Button>
            </DialogContent>
        </Dialog>
    </div>
  );
}