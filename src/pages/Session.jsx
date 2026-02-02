import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, app } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { getDatabase, ref, update, onValue, set } from "firebase/database";
import {
  Timer, CheckCircle, ChevronDown, ChevronUp, 
  Play, RotateCcw, Dumbbell, AlertCircle, XCircle, Save, 
  Trophy, CalendarClock, ArrowRight, Activity, Flame, Zap, Clock, Coffee, Plus, Minus
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import { WearPlugin } from '@/lib/wear';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
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
  const [restTime, setRestTime] = useState(0);
  const restTimerRef = useRef(null);

  // Modales
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [sessionStats, setSessionStats] = useState({ volume: 0, sets: 0, time: 0, calories: 0 });

  // --- 1. LOGIQUE DE CHARGEMENT ---
  useEffect(() => {
    const initSession = async () => {
      if (!targetId) return;
      setLoading(true);

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
  }, [targetId, isCoachView, rtdb, location.state]);

  // Sync Timer to RTDB (Client only)
  useEffect(() => {
    let interval = null;
    if (isSessionStarted && !showSummaryModal && !isCoachView) {
      interval = setInterval(() => {
        setSeconds(s => {
          const newSec = s + 1;
          if (newSec % 5 === 0) {
            update(ref(rtdb, `users/${currentUser.uid}/live_data/session`), { elapsedSeconds: newSec });
          }
          return newSec;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionStarted, showSummaryModal, isCoachView, currentUser, rtdb]);

  // Rest Timer Logic
  useEffect(() => {
    if (restTime > 0) {
      restTimerRef.current = setInterval(() => {
        setRestTime(prev => {
          if (prev <= 1) {
            clearInterval(restTimerRef.current);
            handleRestEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restTimerRef.current);
  }, [restTime]);

  const handleRestEnd = async () => {
    try {
      await Haptics.vibrate({ duration: 1000 });
      // On pourrait aussi ajouter une notification locale ici
    } catch (e) {}
  };

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

    if (newDone) {
      const rest = parseInt(workout.exercises[exoIdx].rest) || 60;
      setRestTime(rest);
    } else {
      setRestTime(0);
    }

    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updatedLogs[key] });
  };

  const handleSetChange = (exoIdx, setIdx, field, value) => {
    if (isCoachView) return;
    const key = `${exoIdx}-${setIdx}`;
    const updatedLogs = { ...sessionLogs, [key]: { ...sessionLogs[key], [field]: value } };
    setSessionLogs(updatedLogs);
    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updatedLogs[key] });
  };

  const adjustWeight = (exoIdx, setIdx, delta) => {
    const key = `${exoIdx}-${setIdx}`;
    const currentWeight = parseFloat(sessionLogs[key]?.weight || workout.exercises[exoIdx].weight || 0);
    handleSetChange(exoIdx, setIdx, 'weight', Math.max(0, currentWeight + delta));
  };

  const setReps = (exoIdx, setIdx, value) => {
    handleSetChange(exoIdx, setIdx, 'reps', value);
  };

  const confirmSaveSession = async () => {
    if (!currentUser || !workout || isCoachView) return;
    setIsSaving(true);
    try {
        const historyItem = { id: Date.now().toString(), name: workout.name, date: new Date().toISOString(), duration: sessionStats.time, volume: sessionStats.volume, calories: sessionStats.calories, totalSets: sessionStats.sets, type: 'workout', logs: sessionLogs };
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { history: arrayUnion(historyItem), workoutsCompleted: increment(1), points: increment(sessionStats.sets * 5 + 50), totalVolume: increment(sessionStats.volume), dailyBurnedCalories: increment(sessionStats.calories), lastActiveDate: format(new Date(), 'yyyy-MM-dd') });
        set(ref(rtdb, `users/${currentUser.uid}/live_data/session`), { active: false });
        try { await WearPlugin.sendDataToWatch({ path: "/stop-session", data: "{}" }); } catch(e){}
        navigate('/dashboard'); 
    } catch (e) { console.error(e); setIsSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">{t('loading')}...</div>;

  if (!isSessionStarted) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6 flex flex-col items-center justify-center animate-in fade-in duration-700">
        {workout ? (
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-4">
              <div className="inline-flex p-4 bg-[#7b2cbf]/20 rounded-full text-[#7b2cbf] mb-2 animate-bounce">
                <Dumbbell size={48} />
              </div>
              <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white">
                {workout.name}
              </h1>
              <p className="text-gray-400 font-medium italic">
                {workout.exercises?.length || 0} exercices prévus pour aujourd'hui.
              </p>
            </div>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {workout.exercises?.map((exo, idx) => (
                <div key={idx} className="bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 flex items-center gap-4 group hover:border-[#7b2cbf]/50 transition-all">
                  <div className="w-16 h-16 rounded-xl bg-gray-800 overflow-hidden shrink-0 border border-white/5">
                    {exo.imageUrl ? (
                      <img src={exo.imageUrl} alt={exo.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600"><Activity size={24} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white uppercase italic truncate">{exo.name}</p>
                    <p className="text-xs text-gray-500 font-bold uppercase">{exo.sets} Séries • {exo.reps} Reps</p>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleStartSession} className="w-full h-20 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black text-2xl italic rounded-3xl shadow-[0_0_30px_rgba(123,44,191,0.4)] hover:scale-[1.02] transition-all group">
              <Zap className="mr-3 h-8 w-8 fill-black group-hover:animate-pulse" /> DÉMARRER LA SÉANCE
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-6">
            <div className="p-6 bg-gray-800/50 rounded-full inline-block text-gray-400"><CalendarClock size={64} /></div>
            <h2 className="text-2xl font-black uppercase italic">Aucune séance prévue</h2>
            <p className="text-gray-500 max-w-xs mx-auto">Repose-toi ou choisis une séance manuelle dans ton programme.</p>
            <Button onClick={() => navigate('/exercises')} className="bg-[#7b2cbf] text-white font-bold h-12 px-8 rounded-xl"> VOIR LES PROGRAMMES </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 pb-32 animate-in slide-in-from-bottom duration-500">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 sticky top-0 bg-[#0a0a0f]/95 backdrop-blur-md z-20 pt-2">
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <Clock size={20} className="text-[#00f5d4] animate-pulse" />
                    <span className="font-mono text-4xl font-black text-[#00f5d4] tracking-tighter shadow-sm">
                        {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
                    </span>
                </div>
                {isCoachView && <Badge className="bg-[#7b2cbf] text-[10px] w-fit mt-1">VUE COACH (LIVE)</Badge>}
            </div>
            {restTime > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#7b2cbf] px-4 py-2 rounded-full animate-in zoom-in duration-300 shadow-[0_0_15px_rgba(123,44,191,0.5)]">
                <Coffee size={16} className="animate-bounce" />
                <span className="font-black text-lg">{restTime}s</span>
              </div>
            )}
            {!isCoachView && <Button variant="ghost" onClick={() => setShowCancelModal(true)} className="text-red-500 font-bold hover:bg-red-500/10"><XCircle size={18} className="mr-1"/> Quitter</Button>}
        </div>

        <div className="space-y-4">
            {workout?.exercises?.map((exo, idx) => {
                const isExpanded = expandedExo === idx;
                const numSets = parseInt(exo.sets) || 0;
                return (
                    <div key={idx} className={`bg-[#1a1a20] border transition-all duration-300 rounded-3xl overflow-hidden ${isExpanded ? 'border-[#7b2cbf] shadow-[0_0_20px_rgba(123,44,191,0.2)]' : 'border-gray-800'}`}>
                        <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedExo(isExpanded ? null : idx)}>
                            <div className="w-14 h-14 rounded-xl bg-gray-800 overflow-hidden shrink-0 border border-white/5">
                                {exo.imageUrl ? <img src={exo.imageUrl} alt={exo.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600"><Dumbbell size={20} /></div>}
                            </div>
                            <div className="flex-1">
                                <span className="font-black text-lg italic uppercase block truncate">{exo.name}</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase">{numSets} Séries • {exo.reps} Reps • {exo.rest || 60}s Repos</span>
                            </div>
                            {isExpanded ? <ChevronUp className="text-[#7b2cbf]"/> : <ChevronDown className="text-gray-500"/>}
                        </div>
                        {isExpanded && (
                            <div className="p-5 pt-0 space-y-6 bg-black/20">
                                {Array.from({ length: numSets }).map((_, i) => (
                                    <div key={i} className="space-y-3 animate-in slide-in-from-left duration-300 border-b border-white/5 pb-4 last:border-0" style={{ animationDelay: `${i*100}ms` }}>
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs text-gray-500 font-black uppercase tracking-tighter">SÉRIE {i+1}</span>
                                          <button disabled={isCoachView} onClick={() => toggleSetComplete(idx, i)} className={`h-10 px-6 flex items-center gap-2 rounded-xl font-black italic transition-all ${sessionLogs[`${idx}-${i}`]?.done ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20' : 'bg-gray-800 text-gray-500'}`}>
                                            <CheckCircle size={18}/> {sessionLogs[`${idx}-${i}`]?.done ? 'FAIT' : 'À FAIRE'}
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-gray-600 uppercase">Poids (LBS)</p>
                                            <div className="flex items-center bg-[#1a1a20] rounded-xl border border-gray-800 p-1">
                                              <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400" onClick={() => adjustWeight(idx, i, -5)}><Minus size={16}/></Button>
                                              <Input disabled={isCoachView} type="number" className="h-9 border-0 bg-transparent text-white text-center font-black text-lg focus-visible:ring-0 p-0" value={sessionLogs[`${idx}-${i}`]?.weight || ''} onChange={(e) => handleSetChange(idx, i, 'weight', e.target.value)} />
                                              <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400" onClick={() => adjustWeight(idx, i, 5)}><Plus size={16}/></Button>
                                            </div>
                                          </div>
                                          <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-gray-600 uppercase">Répétitions</p>
                                            <Input disabled={isCoachView} type="number" className="h-11 bg-[#1a1a20] border-gray-800 text-white text-center font-black text-lg rounded-xl" value={sessionLogs[`${idx}-${i}`]?.reps || ''} onChange={(e) => handleSetChange(idx, i, 'reps', e.target.value)} />
                                          </div>
                                        </div>

                                        {!isCoachView && (
                                          <div className="flex flex-wrap gap-2 pt-1">
                                            {[6, 8, 10, 12, 15].map(r => (
                                              <button key={r} onClick={() => setReps(idx, i, r)} className="h-8 px-3 rounded-lg bg-gray-900 border border-gray-800 text-[10px] font-black hover:border-[#7b2cbf] transition-colors">{r}</button>
                                            ))}
                                          </div>
                                        )}
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
                }} className="w-full h-16 font-black bg-white text-black rounded-2xl text-xl shadow-2xl hover:scale-105 transition-all uppercase italic"> TERMINER LA SÉANCE </Button>
            </div>
        )}

        <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
            <DialogContent className="bg-[#1a1a20] border-[#00f5d4] text-white rounded-3xl max-w-sm">
                <DialogHeader><DialogTitle className="text-[#00f5d4] italic uppercase text-3xl font-black text-center mb-4">Bravo !</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 text-center"> <Activity className="mx-auto mb-2 text-[#7b2cbf]" size={28}/> <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Durée</p> <p className="text-xl font-black">{Math.floor(sessionStats.time / 60)}m</p> </div>
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/5 text-center"> <Flame className="mx-auto mb-2 text-orange-500" size={28}/> <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Brûlé</p> <p className="text-xl font-black">{sessionStats.calories} <span className="text-[10px]">kcal</span></p> </div>
                </div>
                <Button onClick={confirmSaveSession} disabled={isSaving} className="w-full bg-[#00f5d4] text-black font-black h-14 rounded-2xl text-lg uppercase italic"> {isSaving ? "SAUVEGARDE..." : "VALIDER LES RÉSULTATS"} </Button>
            </DialogContent>
        </Dialog>

        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
            <DialogContent className="bg-[#1a1a20] border-red-500 text-white rounded-3xl max-w-sm">
                <DialogHeader><DialogTitle className="text-red-500 italic uppercase text-2xl font-black text-center mb-2">Abandonner ?</DialogTitle></DialogHeader>
                <p className="text-center text-gray-400 text-sm mb-6">Ta progression pour cette séance ne sera pas enregistrée.</p>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowCancelModal(false)} className="flex-1 h-12 rounded-xl border-gray-700 bg-transparent text-white font-bold">RETOURNER</Button>
                    <Button onClick={() => navigate('/dashboard')} className="flex-1 h-12 rounded-xl bg-red-500 text-white font-black">QUITTER</Button>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
}
