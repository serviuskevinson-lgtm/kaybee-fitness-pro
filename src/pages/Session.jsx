import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { 
  Timer, CheckCircle, ChevronDown, ChevronUp, 
  Play, RotateCcw, Dumbbell, AlertCircle, XCircle, Save, 
  Trophy, CalendarClock, ArrowRight, Activity, Flame // J'ai ajouté l'import de Flame ici
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import { WearConnectivity } from '@/lib/wear';
import { format, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Session() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // --- ÉTATS ---
  const [userProfile, setUserProfile] = useState(null);
  const [workout, setWorkout] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  // --- 1. LOGIQUE DE CHARGEMENT ---
  useEffect(() => {
    const initSession = async () => {
      if (!currentUser) return;
      setLoading(true);

      // 1. Si on vient du bouton "Démarrer" avec une séance précise
      if (location.state?.sessionData) {
        setWorkout({ name: "Séance Express", exercises: location.state.sessionData });
        setLoading(false);
        return;
      }

      if (location.state?.workout) {
        setWorkout(location.state.workout);
        setLoading(false);
        return;
      }

      // 2. Sinon, on cherche la séance du jour dans le profil
      try {
        const docSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);

          const today = new Date();
          const todayStr = format(today, 'yyyy-MM-dd');

          // Vérifier si déjà faite aujourd'hui
          const history = data.history || [];
          if (history.some(h => h.date && h.date.startsWith(todayStr) && h.type === 'workout')) {
              setIsCompletedToday(true);
          }

          // Trouver la séance prévue
          const todayName = format(today, 'EEEE', { locale: fr });
          const todayWorkout = data.workouts?.find(w =>
            w.scheduledDays?.some(d => {
                const dDate = typeof d === 'string' && d.includes('-') ? parseISO(d) : new Date(d);
                return isSameDay(dDate, today);
            }) || w.scheduledDays?.includes(todayName)
          );
          
          setWorkout(todayWorkout || null);
        }
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    initSession();
  }, [currentUser, location]);

  const handleStartSession = async () => {
    setIsSessionStarted(true);
    if (workout) {
        const exercises = workout.exercises || [];
        const watchData = {
            name: workout.name,
            exercises: exercises.map(e => ({
                name: e.name || "Exercice",
                sets: parseInt(e.sets || 3),
                reps: parseInt(e.reps || 10),
                weight: parseFloat(e.weight || 0)
            }))
        };
        try { await WearConnectivity.sendDataToWatch({ path: "/start-session", data: JSON.stringify(watchData) }); } catch (e) {}
    }
  };

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

  const handleOpenSummary = () => {
    let totalVolume = 0;
    let totalSets = 0;
    Object.values(sessionLogs).forEach(log => {
        if (log.done) {
            totalSets++;
            totalVolume += (parseFloat(log.weight || 0) * parseFloat(log.reps || 0));
        }
    });
    const weight = parseFloat(userProfile?.weight) || 80;
    const caloriesBurned = Math.floor((seconds / 60) * weight * 0.07);
    setSessionStats({ volume: totalVolume, sets: totalSets, time: seconds, calories: caloriesBurned });
    setShowSummaryModal(true);
  };

  const confirmSaveSession = async () => {
    if (!currentUser || !workout) return;
    setIsSaving(true);
    try {
        const historyItem = { id: Date.now().toString(), name: workout.name, date: new Date().toISOString(), duration: sessionStats.time, volume: sessionStats.volume, calories: sessionStats.calories, totalSets: sessionStats.sets, type: 'workout', logs: sessionLogs };
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { history: arrayUnion(historyItem), workoutsCompleted: increment(1), points: increment(sessionStats.sets * 5 + 50), totalVolume: increment(sessionStats.volume), dailyBurnedCalories: increment(sessionStats.calories), lastActiveDate: format(new Date(), 'yyyy-MM-dd') });
        try { await WearConnectivity.sendDataToWatch({ path: "/stop-session", data: "{}" }); } catch(e){}
        navigate('/dashboard'); 
    } catch (e) { console.error(e); setIsSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">{t('loading')}...</div>;

  if (isCompletedToday) {
      return (
        <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle className="w-24 h-24 text-[#00f5d4] mb-6 animate-bounce" />
            <h1 className="text-3xl font-black italic uppercase mb-2">Séance Validée !</h1>
            <p className="text-gray-400 mb-8">Tu as déjà terminé ton entraînement aujourd'hui. Repose-toi bien.</p>
            <Button onClick={() => navigate('/dashboard')} className="bg-[#7b2cbf] text-white font-bold h-14 px-10 rounded-2xl shadow-lg">Retour au Dashboard</Button>
        </div>
      );
  }

  if (!workout) {
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="w-20 h-20 text-gray-600 mb-6" />
            <h1 className="text-2xl font-black italic uppercase mb-2 text-gray-400">Aucune séance prévue</h1>
            <p className="text-gray-500 mb-8 max-w-xs">Planifie tes entraînements sur la page Exercices ou contacte ton coach !</p>
            <Button onClick={() => navigate('/exercises')} className="bg-[#00f5d4] text-black font-black h-12 px-8 rounded-xl">Planifier une séance</Button>
        </div>
    );
  }

  if (!isSessionStarted) {
      return (
        <div className="min-h-screen bg-[#0a0a0f] text-white p-6 pb-32 animate-in fade-in duration-500">
            <div className="mb-8">
                <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-gray-500 pl-0 mb-4 hover:text-white"><ArrowRight className="rotate-180 mr-2"/> Dashboard</Button>
                <h1 className="text-4xl font-black italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] leading-tight">
                    {workout.name}
                </h1>
                <div className="flex gap-4 mt-4">
                    <div className="bg-[#1a1a20] px-3 py-1 rounded-lg border border-gray-800 text-xs font-bold text-gray-400 flex items-center gap-2"> <Dumbbell size={14}/> {workout.exercises?.length || 0} Exos </div>
                </div>
            </div>

            <div className="space-y-4">
                {workout.exercises?.map((exo, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-[#1a1a20] p-4 rounded-2xl border border-gray-800">
                        <div className="w-14 h-14 bg-black rounded-xl overflow-hidden flex-shrink-0"> <img src={exo.imageUrl} className="w-full h-full object-cover opacity-80" alt=""/> </div>
                        <div>
                            <h3 className="font-bold text-white leading-tight">{exo.name}</h3>
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{exo.sets} Séries • {exo.reps} Reps</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-[#0a0a0f] to-transparent">
                <Button onClick={handleStartSession} className="w-full h-16 text-xl font-black bg-[#00f5d4] text-black rounded-2xl shadow-[0_0_30px_rgba(0,245,212,0.4)] hover:scale-105 transition-transform"> <Play className="mr-2 fill-black"/> DÉMARRER LA SÉANCE </Button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 pb-32 animate-in slide-in-from-bottom duration-500">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 sticky top-0 bg-[#0a0a0f] z-20 pt-2">
            <span className="font-mono text-4xl font-black text-[#00f5d4] tracking-tighter shadow-sm">
                {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
            </span>
            <Button variant="ghost" onClick={() => setShowCancelModal(true)} className="text-red-500 font-bold hover:bg-red-500/10"><XCircle size={18} className="mr-1"/> Quitter</Button>
        </div>

        <div className="space-y-4">
            {/* CORRECTION ICI : utilisation de workout.exercises au lieu de exercises */}
            {workout.exercises.map((exo, idx) => {
                const isExpanded = expandedExo === idx;
                const numSets = parseInt(exo.sets) || 0;
                return (
                    <div key={idx} className={`bg-[#1a1a20] border transition-all duration-300 rounded-3xl overflow-hidden ${isExpanded ? 'border-[#7b2cbf] shadow-[0_0_20px_rgba(123,44,191,0.2)]' : 'border-gray-800'}`}>
                        <div className="p-5 flex justify-between items-center cursor-pointer" onClick={() => setExpandedExo(isExpanded ? null : idx)}>
                            <div className="flex items-center gap-4">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${isExpanded ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}>{idx+1}</span>
                                <span className="font-black text-lg italic uppercase">{exo.name}</span>
                            </div>
                            {isExpanded ? <ChevronUp className="text-[#7b2cbf]"/> : <ChevronDown className="text-gray-500"/>}
                        </div>
                        {isExpanded && (
                            <div className="p-5 pt-0 space-y-3 bg-black/20">
                                {Array.from({ length: numSets }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 animate-in slide-in-from-left duration-300" style={{ animationDelay: `${i*100}ms` }}>
                                        <span className="text-[10px] text-gray-500 w-10 font-bold uppercase tracking-tighter">Set {i+1}</span>
                                        <Input type="number" placeholder="kg" className="h-11 bg-[#1a1a20] border-gray-800 text-white text-center font-black rounded-xl" value={sessionLogs[`${idx}-${i}`]?.weight || ''} onChange={(e) => handleSetChange(idx, i, 'weight', e.target.value)} />
                                        <Input type="number" placeholder="reps" className="h-11 bg-[#1a1a20] border-gray-800 text-white text-center font-black rounded-xl" value={sessionLogs[`${idx}-${i}`]?.reps || ''} onChange={(e) => handleSetChange(idx, i, 'reps', e.target.value)} />
                                        <button onClick={() => toggleSetComplete(idx, i)} className={`h-11 w-11 flex items-center justify-center rounded-xl transition-all ${sessionLogs[`${idx}-${i}`]?.done ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20 scale-110' : 'bg-gray-800 text-gray-600'}`}> <CheckCircle size={20}/> </button>
                                    </div>
                                ))}
                                <Button variant="outline" onClick={() => startRest(idx, exo.rest)} className={`w-full h-12 mt-2 font-black rounded-xl transition-all ${activeRest.exoIdx === idx ? 'bg-[#00f5d4]/10 border-[#00f5d4] text-[#00f5d4]' : 'border-[#7b2cbf]/50 text-[#7b2cbf] hover:bg-[#7b2cbf]/10'}`}>
                                    <RotateCcw className={`mr-2 h-4 w-4 ${activeRest.exoIdx === idx ? 'animate-spin' : ''}`} />
                                    {activeRest.exoIdx === idx ? `RÉCUPÉRATION : ${activeRest.timeLeft}s` : `LANCER LE REPOS (${exo.rest}s)`}
                                </Button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0a0a0f] to-transparent z-30">
            <Button onClick={handleOpenSummary} className="w-full h-14 font-black bg-white text-black rounded-2xl text-lg shadow-2xl hover:scale-105 transition-all"> TERMINER & ENREGISTRER </Button>
        </div>

        <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
            <DialogContent className="bg-[#1a1a20] border-[#00f5d4] text-white rounded-3xl max-w-sm">
                <DialogHeader><DialogTitle className="text-[#00f5d4] italic uppercase text-3xl font-black text-center mb-4">Bravo !</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 text-center"> <Activity className="mx-auto mb-2 text-[#7b2cbf]" size={28}/> <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Durée</p> <p className="text-xl font-black">{Math.floor(sessionStats.time / 60)}m</p> </div>
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 text-center"> <Flame className="mx-auto mb-2 text-orange-500" size={28}/> <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Brûlé</p> <p className="text-xl font-black">{sessionStats.calories} <span className="text-[10px]">kcal</span></p> </div>
                </div>
                <Button onClick={confirmSaveSession} disabled={isSaving} className="w-full bg-[#00f5d4] text-black font-black h-14 rounded-2xl text-lg"> {isSaving ? "SAUVEGARDE EN COURS..." : "VALIDER LA SÉANCE"} </Button>
            </DialogContent>
        </Dialog>

        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
            <DialogContent className="bg-[#1a1a20] border-red-500 text-white rounded-3xl">
                <DialogHeader><DialogTitle className="text-red-500 text-center uppercase font-black text-xl">Abandonner ?</DialogTitle></DialogHeader>
                <p className="text-center text-gray-400 text-sm">Tes efforts ne seront pas comptabilisés si tu quittes maintenant.</p>
                <div className="flex gap-4 mt-6">
                    <Button onClick={() => setShowCancelModal(false)} className="flex-1 bg-gray-800 text-white font-bold h-12 rounded-xl">Continuer</Button>
                    <Button onClick={() => navigate('/dashboard')} className="flex-1 bg-red-500 text-white font-black h-12 rounded-xl">Abandonner</Button>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
}