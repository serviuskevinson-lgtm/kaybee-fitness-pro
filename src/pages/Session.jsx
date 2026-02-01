import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, app } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { getDatabase, ref, update, onValue, set } from "firebase/database";
import {
  Timer, CheckCircle, ChevronDown, ChevronUp, 
  Play, RotateCcw, Dumbbell, AlertCircle, XCircle, Save, 
  Trophy, CalendarClock, ArrowRight, Activity, Flame
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import { WearPlugin } from '@/lib/wear';
import { format, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Session() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId } = useClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const rtdb = getDatabase(app);

  const targetId = targetUserId || currentUser?.uid;

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
      if (!targetId) return;
      setLoading(true);

      // Si c'est le coach, on écoute la session en direct dans RTDB
      if (isCoachView) {
        const sessionRef = ref(rtdb, `users/${targetId}/live_data/session`);
        onValue(sessionRef, (snapshot) => {
          const data = snapshot.val();
          if (data && data.active) {
            setWorkout({ name: data.workoutName, exercises: data.exercises || [] });
            setSessionLogs(data.logs || {});
            setSeconds(data.elapsedSeconds || 0);
            setIsSessionStarted(true);
          }
        });
      }

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

      try {
        const docSnap = await getDoc(doc(db, "users", targetId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);

          const today = new Date();
          const todayStr = format(today, 'yyyy-MM-dd');

          const history = data.history || [];
          if (history.some(h => h.date && h.date.startsWith(todayStr) && h.type === 'workout')) {
              setIsCompletedToday(true);
          }

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
  }, [targetId, isCoachView]);

  // Sync Timer to RTDB (Client only)
  useEffect(() => {
    let interval = null;
    if (isSessionStarted && !showSummaryModal && !isCoachView) {
      interval = setInterval(() => {
        setSeconds(s => {
          const newSec = s + 1;
          if (newSec % 5 === 0) { // Sync every 5s to avoid overhead
            update(ref(rtdb, `users/${currentUser.uid}/live_data/session`), { elapsedSeconds: newSec });
          }
          return newSec;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionStarted, showSummaryModal, isCoachView]);

  const handleStartSession = async () => {
    if (isCoachView) return;
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

        // Push to RTDB for Coach
        set(ref(rtdb, `users/${currentUser.uid}/live_data/session`), {
            active: true,
            workoutName: workout.name,
            startTime: Date.now(),
            elapsedSeconds: 0,
            exercises: exercises,
            logs: {}
        });

        try { await WearPlugin.sendDataToWatch({ path: "/start-session", data: JSON.stringify(watchData) }); } catch (e) {}
    }
  };

  const toggleSetComplete = (exoIdx, setIdx) => {
    if (isCoachView) return;
    const key = `${exoIdx}-${setIdx}`;
    const newDone = !sessionLogs[key]?.done;
    const weight = sessionLogs[key]?.weight || workout.exercises[exoIdx].weight || 0;
    const reps = sessionLogs[key]?.reps || workout.exercises[exoIdx].reps || 0;

    const updatedLogs = { ...sessionLogs, [key]: { ...sessionLogs[key], done: newDone, weight, reps } };
    setSessionLogs(updatedLogs);

    // Sync to RTDB
    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updatedLogs[key] });
  };

  const handleSetChange = (exoIdx, setIdx, field, value) => {
    if (isCoachView) return;
    const key = `${exoIdx}-${setIdx}`;
    const updatedLogs = { ...sessionLogs, [key]: { ...sessionLogs[key], [field]: value } };
    setSessionLogs(updatedLogs);
    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updatedLogs[key] });
  };

  const confirmSaveSession = async () => {
    if (!currentUser || !workout || isCoachView) return;
    setIsSaving(true);
    try {
        const historyItem = { id: Date.now().toString(), name: workout.name, date: new Date().toISOString(), duration: sessionStats.time, volume: sessionStats.volume, calories: sessionStats.calories, totalSets: sessionStats.sets, type: 'workout', logs: sessionLogs };
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { history: arrayUnion(historyItem), workoutsCompleted: increment(1), points: increment(sessionStats.sets * 5 + 50), totalVolume: increment(sessionStats.volume), dailyBurnedCalories: increment(sessionStats.calories), lastActiveDate: format(new Date(), 'yyyy-MM-dd') });

        // Cleanup RTDB
        set(ref(rtdb, `users/${currentUser.uid}/live_data/session`), { active: false });

        try { await WearPlugin.sendDataToWatch({ path: "/stop-session", data: "{}" }); } catch(e){}
        navigate('/dashboard'); 
    } catch (e) { console.error(e); setIsSaving(false); }
  };

  // ... (Keep the rest of the UI as is, but disable inputs if isCoachView)
  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">{t('loading')}...</div>;

  // Render logic remains similar but uses targetId and isCoachView for permissions
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 pb-32 animate-in slide-in-from-bottom duration-500">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 sticky top-0 bg-[#0a0a0f] z-20 pt-2">
            <div className="flex flex-col">
                <span className="font-mono text-4xl font-black text-[#00f5d4] tracking-tighter shadow-sm">
                    {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
                </span>
                {isCoachView && <Badge className="bg-[#7b2cbf] text-[10px] w-fit mt-1">VUE COACH (LIVE)</Badge>}
            </div>
            {!isCoachView && <Button variant="ghost" onClick={() => setShowCancelModal(true)} className="text-red-500 font-bold hover:bg-red-500/10"><XCircle size={18} className="mr-1"/> Quitter</Button>}
        </div>

        <div className="space-y-4">
            {workout?.exercises?.map((exo, idx) => {
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
                                        <Input disabled={isCoachView} type="number" placeholder="kg" className="h-11 bg-[#1a1a20] border-gray-800 text-white text-center font-black rounded-xl" value={sessionLogs[`${idx}-${i}`]?.weight || ''} onChange={(e) => handleSetChange(idx, i, 'weight', e.target.value)} />
                                        <Input disabled={isCoachView} type="number" placeholder="reps" className="h-11 bg-[#1a1a20] border-gray-800 text-white text-center font-black rounded-xl" value={sessionLogs[`${idx}-${i}`]?.reps || ''} onChange={(e) => handleSetChange(idx, i, 'reps', e.target.value)} />
                                        <button disabled={isCoachView} onClick={() => toggleSetComplete(idx, i)} className={`h-11 w-11 flex items-center justify-center rounded-xl transition-all ${sessionLogs[`${idx}-${i}`]?.done ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20 scale-110' : 'bg-gray-800 text-gray-600'}`}> <CheckCircle size={20}/> </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {!isCoachView && isSessionStarted && (
            <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0a0a0f] to-transparent z-30">
                <Button onClick={() => {
                     let totalVolume = 0; let totalSets = 0;
                     Object.values(sessionLogs).forEach(log => { if (log.done) { totalSets++; totalVolume += (parseFloat(log.weight || 0) * parseFloat(log.reps || 0)); } });
                     const weight = parseFloat(userProfile?.weight) || 80;
                     const caloriesBurned = Math.floor((seconds / 60) * weight * 0.07);
                     setSessionStats({ volume: totalVolume, sets: totalSets, time: seconds, calories: caloriesBurned });
                     setShowSummaryModal(true);
                }} className="w-full h-14 font-black bg-white text-black rounded-2xl text-lg shadow-2xl hover:scale-105 transition-all"> TERMINER & ENREGISTRER </Button>
            </div>
        )}

        {/* ... (Keep Dialogs) */}
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
    </div>
  );
}
