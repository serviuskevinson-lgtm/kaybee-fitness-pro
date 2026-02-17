import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, app } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment, onSnapshot } from 'firebase/firestore';
import { getDatabase, ref, update, onValue, set } from "firebase/database";
import {
  Timer, CheckCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Play, RotateCcw, Dumbbell, AlertCircle, XCircle, Save, 
  Trophy, CalendarClock, ArrowRight, Activity, Flame, Zap, Clock, Coffee, Plus, Minus, Layers, Link2, Target, TrendingDown, TrendingUp, Repeat, Calendar, Footprints
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import { WearPlugin } from '@/lib/wear';
import { format, isSameDay, parseISO, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { TimerManager } from '@/lib/timer';
import PostSession from '@/components/PostSession';
import { motion, AnimatePresence } from 'framer-motion';

const SET_TYPE_INFO = {
  straight: { name: 'Série Classique', icon: Dumbbell, color: 'bg-gray-600', textColor: 'text-gray-400' },
  superset_antagonist: { name: 'Superset Antagoniste', icon: Link2, color: 'bg-blue-600', textColor: 'text-blue-400' },
  superset_agonist: { name: 'Superset Agoniste', icon: Flame, color: 'bg-orange-600', textColor: 'text-orange-400' },
  pre_exhaustion: { name: 'Pré-fatigue', icon: Target, color: 'bg-red-600', textColor: 'text-red-400' },
  triset: { name: 'Tri-Set', icon: Layers, color: 'bg-purple-600', textColor: 'text-purple-400' },
  giant_set: { name: 'Série Géante', icon: Zap, color: 'bg-yellow-600', textColor: 'text-yellow-400' },
  dropset: { name: 'Drop Set', icon: TrendingDown, color: 'bg-pink-600', textColor: 'text-pink-400' },
  pyramid: { name: 'Pyramide', icon: TrendingUp, color: 'bg-emerald-600', textColor: 'text-emerald-400' },
  reverse_pyramid: { name: 'Pyramide Inversée', icon: Repeat, color: 'bg-cyan-600', textColor: 'text-cyan-400' }
};

export default function Session() {
  const { currentUser, loading: authLoading } = useAuth();
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
  const [viewDate, setViewDate] = useState(new Date());
  const [liveSteps, setLiveSteps] = useState(0);

  // États Séance Active
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [expandedGroup, setExpandedGroup] = useState(0);
  const [sessionLogs, setSessionLogs] = useState({});
  const [restTime, setRestTime] = useState(0);

  // Modales
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPostSession, setShowPostSession] = useState(false);
  const [sessionStats, setSessionStats] = useState({ volume: 0, sets: 0, time: 0, calories: 0 });

  // --- GESTION DU BOUTON BACK ANDROID ---
  useEffect(() => {
    const handleBack = (e) => {
      if (showPostSession) {
        e.preventDefault();
        setShowPostSession(false);
      } else if (showCancelModal) {
        e.preventDefault();
        setShowCancelModal(false);
      } else if (isSessionStarted) {
        e.preventDefault();
        setShowCancelModal(true);
      }
    };

    window.addEventListener('kbBackButton', handleBack);
    return () => window.removeEventListener('kbBackButton', handleBack);
  }, [showPostSession, showCancelModal, isSessionStarted]);

  const normalizeWorkout = (sw) => {
    if (!sw) return null;
    const normalized = { ...sw };
    if (!normalized.groups && normalized.exercises && Array.isArray(normalized.exercises)) {
      normalized.groups = normalized.exercises.map(ex => ({
        id: Math.random(),
        setType: 'straight',
        exercises: [ex],
        sets: ex.sets || 3,
        rest: ex.rest || 60
      }));
    } else if (!normalized.groups) {
      normalized.groups = [];
    }
    return normalized;
  };

  // --- 1. LOGIQUE DE CHARGEMENT TEMPS RÉEL ---
  useEffect(() => {
    if (authLoading || !targetId) return;

    setLoading(true);

    const checkStartTime = async () => {
      try {
        const { value: startTime } = await (await import('@capacitor/preferences')).Preferences.get({ key: 'session_start_time' });
        if (startTime && !isCoachView) setIsSessionStarted(true);
      } catch (e) {}
    };
    checkStartTime();

    // Snapshot temps réel Firestore
    const unsub = onSnapshot(doc(db, "users", targetId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile(data);

        const dateKey = `Exercise-${format(viewDate, 'MM-dd-yyyy')}`;
        let selectedWorkout = data[dateKey] || null;

        if (!selectedWorkout && isSameDay(viewDate, new Date()) && location.state?.workout) {
          selectedWorkout = location.state.workout;
        }

        setWorkout(normalizeWorkout(selectedWorkout));

        const dateISO = format(viewDate, 'yyyy-MM-dd');
        setIsCompletedToday(data.history?.some(h => h.date?.startsWith(dateISO) && h.type === 'workout') || false);
      }
      setLoading(false);
    }, (err) => {
      console.error("Firestore Sync Error:", err);
      setLoading(false);
    });

    // Snapshot temps réel RTDB (Pas & Live Session)
    const unsubRTDB = onValue(ref(rtdb, `users/${targetId}/live_data`), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Mise à jour des pas
        const todayStr = new Date().toISOString().split('T')[0];
        if (data.date === todayStr) {
          setLiveSteps(Number(data.steps) || 0);
        } else {
          setLiveSteps(0);
        }

        // Si coach view, on récupère l'état de la séance
        if (isCoachView && data.session && data.session.active) {
          setWorkout({ name: data.session.workoutName, groups: data.session.groups || data.session.exercises });
          setSessionLogs(data.session.logs || {});
          setSeconds(data.session.elapsedSeconds || 0);
          setIsSessionStarted(true);
        }
      }
    });

    return () => {
      unsub();
      unsubRTDB();
    };
  }, [targetId, authLoading, isCoachView, viewDate, location.state, rtdb]);

  useEffect(() => {
    let interval = null;
    if (isSessionStarted && !showPostSession && !isCoachView) {
      interval = setInterval(async () => {
        const elapsed = await TimerManager.getSessionElapsed();
        setSeconds(elapsed);
        if (elapsed % 5 === 0 && currentUser) {
          update(ref(rtdb, `users/${currentUser.uid}/live_data/session`), { elapsedSeconds: elapsed });
        }
        const remainingRest = await TimerManager.getRestRemaining();
        if (remainingRest !== restTime) {
          setRestTime(remainingRest);
          if (remainingRest === 0 && restTime > 0) {
            TimerManager.playEndSignal();
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionStarted, showPostSession, isCoachView, currentUser, rtdb, restTime]);

  const handleStartSession = async () => {
    if (isCoachView || !currentUser) return;
    setIsSessionStarted(true);
    await TimerManager.startSession();
    if (workout) {
        set(ref(rtdb, `users/${currentUser.uid}/live_data/session`), {
            active: true,
            workoutName: workout.name,
            startTime: Date.now(),
            elapsedSeconds: 0,
            groups: workout.groups,
            logs: {}
        });
        const flatExos = workout.groups.flatMap(g => g.exercises.map(e => ({ ...e, sets: g.sets })));
        try { await WearPlugin.sendDataToWatch({ path: "/start-session", data: JSON.stringify({ name: workout.name, exercises: flatExos }) }); } catch (e) {}
    }
  };

  const toggleSetComplete = async (groupIdx, exoIdx, sIdx) => {
    if (isCoachView || !currentUser) return;
    const group = workout.groups[groupIdx];
    const key = `${groupIdx}-${exoIdx}-${sIdx}`;
    const newDone = !sessionLogs[key]?.done;

    const exercise = group.exercises[exoIdx];
    const weight = sessionLogs[key]?.weight || exercise.weight || 0;
    const reps = sessionLogs[key]?.reps || exercise.reps || 10;

    const updatedLogs = { ...sessionLogs, [key]: { ...sessionLogs[key], done: newDone, weight, reps } };
    setSessionLogs(updatedLogs);

    if (newDone) {
      const isLastExoOfGroup = exoIdx === group.exercises.length - 1;
      if (isLastExoOfGroup) {
        const rest = parseInt(group.rest) || 60;
        await TimerManager.startRest(rest);
        setRestTime(rest);
      }
    } else {
      await TimerManager.clearRest();
      setRestTime(0);
    }

    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updatedLogs[key] });
  };

  const handleSetChange = (groupIdx, exoIdx, sIdx, field, value) => {
    if (isCoachView || !currentUser) return;
    const key = `${groupIdx}-${exoIdx}-${sIdx}`;
    const updatedLogs = { ...sessionLogs, [key]: { ...sessionLogs[key], [field]: value } };
    setSessionLogs(updatedLogs);
    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updatedLogs[key] });
  };

  const handleEndSession = () => {
    let totalVolume = 0; let totalSets = 0;
    Object.values(sessionLogs).forEach(log => { if (log.done) { totalSets++; totalVolume += (parseFloat(log.weight || 0) * parseFloat(log.reps || 0)); } });
    const weight = parseFloat(userProfile?.weight) || 80;
    const caloriesBurned = Math.floor((seconds / 60) * weight * 0.07);
    setSessionStats({ volume: totalVolume, sets: totalSets, time: seconds, calories: caloriesBurned });
    setShowPostSession(true);
  };

  const confirmSaveSession = async () => {
    if (!currentUser || !workout || isCoachView) return;
    setIsSaving(true);
    try {
        const historyItem = { id: Date.now().toString(), name: workout.name, date: new Date().toISOString(), duration: sessionStats.time, volume: sessionStats.volume, calories: sessionStats.calories, totalSets: sessionStats.sets, type: 'workout', logs: sessionLogs };
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            history: arrayUnion(historyItem),
            workoutsCompleted: increment(1),
            points: increment(sessionStats.sets * 5 + 50),
            totalVolume: increment(sessionStats.volume),
            dailyBurnedCalories: increment(sessionStats.calories),
            lastActiveDate: format(new Date(), 'yyyy-MM-dd')
        });

        update(ref(rtdb, `users/${currentUser.uid}/live_data`), {
            calories_burned: increment(sessionStats.calories)
        });

        set(ref(rtdb, `users/${currentUser.uid}/live_data/session`), { active: false });
        await TimerManager.stopSession();
        try { await WearPlugin.sendDataToWatch({ path: "/stop-session", data: "{}" }); } catch(e){}
        navigate('/dashboard');
    } catch (e) { console.error(e); setIsSaving(false); }
  };

  if (loading || authLoading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white font-black uppercase italic animate-pulse">Sync Kaybee...</div>;

  if (!isSessionStarted) {
    const isToday = isSameDay(viewDate, new Date());

    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6 flex flex-col items-center justify-center animate-in fade-in duration-700">

        {/* Navigation de Date */}
        <div className="w-full max-w-md flex items-center justify-between mb-8 bg-[#1a1a20]/50 p-2 rounded-2xl border border-white/5 shadow-2xl">
          <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addDays(prev, -1))} className="text-gray-400 hover:text-white transition-all active:scale-90">
            <ChevronLeft size={24} />
          </Button>

          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#7b2cbf] mb-1">
              {isToday ? t('today') : format(viewDate, 'EEEE', { locale: fr })}
            </span>
            <span className="text-lg font-black italic uppercase text-white">
              {format(viewDate, 'd MMMM', { locale: fr })}
            </span>
          </div>

          <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addDays(prev, 1))} className="text-gray-400 hover:text-white transition-all active:scale-90">
            <ChevronRight size={24} />
          </Button>
        </div>

        {workout ? (
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-4">
              <div className="inline-flex p-4 bg-[#7b2cbf]/20 rounded-full text-[#7b2cbf] mb-2 animate-bounce">
                <Dumbbell size={48} />
              </div>
              <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_15px_rgba(123,44,191,0.5)]">
                {workout.name}
              </h1>
              <p className="text-gray-400 font-medium italic">
                {(workout.groups || []).length} blocs d'exercices prévus.
              </p>
            </div>
            <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
              {(workout.groups || []).map((group, idx) => {
                const typeInfo = SET_TYPE_INFO[group.setType] || SET_TYPE_INFO.straight;
                return (
                  <div key={idx} className="bg-[#1a1a20] p-4 rounded-3xl border border-gray-800 space-y-3 hover:border-[#7b2cbf]/50 transition-colors">
                    <div className="flex justify-between items-center mb-1">
                      <Badge className={`${typeInfo.color} text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border-none`}>
                        {typeInfo.name}
                      </Badge>
                      <span className="text-[10px] font-bold text-gray-500 uppercase">{group.sets} Séries</span>
                    </div>
                    {group.exercises && Array.isArray(group.exercises) && group.exercises.map((exo, eIdx) => (
                      <div key={eIdx} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-800 overflow-hidden shrink-0 border border-white/5">
                          {exo.imageUrl ? <img src={exo.imageUrl} className="w-full h-full object-cover" /> : <Activity size={16} className="m-3 text-gray-600"/>}
                        </div>
                        <p className="font-bold text-white uppercase italic text-sm truncate">{exo.name}</p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 pt-4">
              <Button onClick={handleStartSession} className="w-full h-20 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black text-2xl italic rounded-3xl shadow-[0_0_30px_rgba(123,44,191,0.4)] hover:scale-[1.02] transition-all group active:scale-95">
                <Zap className="mr-3 h-8 w-8 fill-black group-hover:animate-pulse" /> DÉMARRER LA SÉANCE
              </Button>

              {!isToday && (
                <Button onClick={() => setViewDate(new Date())} variant="ghost" className="w-full text-[#7b2cbf] font-black uppercase text-xs tracking-[0.2em] hover:bg-[#7b2cbf]/10 rounded-xl py-4 transition-all">
                  <RotateCcw className="mr-2 h-4 w-4" /> Retour à aujourd'hui
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center space-y-6">
            <div className="p-6 bg-gray-800/50 rounded-full inline-block text-gray-400 border border-white/5"><CalendarClock size={64} /></div>
            <h2 className="text-2xl font-black uppercase italic text-white/80">Aucune séance prévue</h2>
            <p className="text-gray-500 max-w-xs mx-auto italic font-medium">Repose-toi ou choisis une autre date.</p>

            <div className="space-y-4 pt-6">
              {!isToday && (
                <Button onClick={() => setViewDate(new Date())} className="bg-[#7b2cbf]/20 text-[#7b2cbf] border border-[#7b2cbf]/30 font-black h-14 px-8 rounded-2xl w-full flex items-center justify-center uppercase italic tracking-widest hover:bg-[#7b2cbf]/30 transition-all shadow-lg">
                  <RotateCcw className="mr-2 h-5 w-5" /> RETOUR À AUJOURD'HUI
                </Button>
              )}
              <Button onClick={() => navigate('/exercises')} className="bg-[#7b2cbf] text-white font-black h-14 px-8 rounded-2xl w-full uppercase italic tracking-widest shadow-xl shadow-purple-900/20 active:scale-95 transition-all">
                VOIR LES PROGRAMMES
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 pb-32 animate-in slide-in-from-bottom duration-500">
        <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 sticky top-0 bg-[#0a0a0f]/95 backdrop-blur-md z-20 pt-2">
            <div className="flex flex-col">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Clock size={20} className="text-[#00f5d4] animate-pulse" />
                        <span className="font-mono text-4xl font-black text-[#00f5d4] tracking-tighter shadow-sm">
                            {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
                        </span>
                    </div>
                    <div className="h-8 w-[1px] bg-gray-800 mx-1" />
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 text-[#7b2cbf]">
                            <Footprints size={14} className="fill-[#7b2cbf]/20" />
                            <span className="text-lg font-black italic leading-none">{liveSteps.toLocaleString()}</span>
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Pas Aujourd'hui</span>
                    </div>
                </div>
                {isCoachView && <Badge className="bg-[#7b2cbf] text-[10px] w-fit mt-1">VUE COACH (LIVE)</Badge>}
            </div>
            {restTime > 0 && restTime > 7 && (
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#7b2cbf] px-4 py-2 rounded-full animate-in zoom-in duration-300 shadow-[0_0_15px_rgba(123,44,191,0.5)]">
                <Coffee size={16} className="animate-bounce" />
                <span className="font-black text-lg">{restTime}s</span>
              </div>
            )}
            {!isCoachView && <Button variant="ghost" onClick={() => setShowCancelModal(true)} className="text-red-500 font-bold hover:bg-red-500/10"><XCircle size={18} className="mr-1"/> Quitter</Button>}
        </div>

        {/* REPOS URGENT OVERLAY */}
        <AnimatePresence>
          {restTime > 0 && restTime <= 7 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 z-[100] bg-[#7b2cbf] flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }} className="mb-8">
                <Clock size={120} className="text-white" />
              </motion.div>
              <h2 className="text-4xl font-black italic uppercase text-white mb-2">Reprise imminente !</h2>
              <div className="text-[180px] font-black italic text-white leading-none tracking-tighter">{restTime}</div>
              <Button onClick={async () => { await TimerManager.clearRest(); setRestTime(0); }} className="mt-8 bg-white text-[#7b2cbf] font-black text-2xl h-20 px-12 rounded-3xl">PRÊT !</Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-6">
            {(workout?.groups || []).map((group, groupIdx) => {
                const isExpanded = expandedGroup === groupIdx;
                const typeInfo = SET_TYPE_INFO[group.setType] || SET_TYPE_INFO.straight;
                const TypeIcon = typeInfo.icon;

                return (
                    <div key={groupIdx} className={`bg-[#1a1a20] border transition-all duration-300 rounded-[2rem] overflow-hidden ${isExpanded ? 'border-[#7b2cbf] shadow-[0_0_20px_rgba(123,44,191,0.2)]' : 'border-gray-800'}`}>
                        {/* Header du Groupe */}
                        <div className="p-5 flex flex-col gap-3 cursor-pointer" onClick={() => setExpandedGroup(isExpanded ? null : groupIdx)}>
                            <div className="flex justify-between items-center">
                                <Badge className={`${typeInfo.color} text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border-none flex items-center gap-1.5`}>
                                  <TypeIcon size={12}/> {typeInfo.name}
                                </Badge>
                                {isExpanded ? <ChevronUp className="text-[#7b2cbf]"/> : <ChevronDown className="text-gray-500"/>}
                            </div>
                            <div className="space-y-1">
                                {group.exercises && Array.isArray(group.exercises) && group.exercises.map((exo, eIdx) => (
                                    <div key={eIdx} className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-[#7b2cbf]/50" />
                                        <span className="font-black text-lg italic uppercase truncate text-white">{exo.name}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                <span>{group.sets} Séries</span>
                                <span>{group.rest}s Repos</span>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="p-5 pt-0 space-y-8 bg-black/20">
                                {Array.from({ length: group.sets }).map((_, sIdx) => {
                                    return (
                                        <div key={sIdx} className="p-4 rounded-3xl bg-black/40 border border-white/5 space-y-6">
                                            <h4 className="text-[10px] font-black text-[#7b2cbf] uppercase tracking-[0.2em] text-center">SET {sIdx + 1}</h4>

                                            {group.exercises && Array.isArray(group.exercises) && group.exercises.map((exo, eIdx) => {
                                                const logKey = `${groupIdx}-${eIdx}-${sIdx}`;
                                                const isDone = sessionLogs[logKey]?.done;

                                                return (
                                                    <div key={eIdx} className="space-y-4 pb-6 last:pb-0 border-b last:border-0 border-white/5">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-10 h-10 rounded-xl bg-gray-900 overflow-hidden shrink-0 border border-white/5">
                                                                    {exo.imageUrl ? <img src={exo.imageUrl} className="w-full h-full object-cover" /> : <Dumbbell className="m-2.5 text-gray-700" size={20}/>}
                                                                </div>
                                                                <p className="font-black text-white uppercase italic text-sm truncate">{exo.name}</p>
                                                            </div>
                                                            <button disabled={isCoachView} onClick={() => toggleSetComplete(groupIdx, eIdx, sIdx)} className={`h-10 px-6 rounded-xl font-black italic transition-all ${isDone ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20' : 'bg-gray-800 text-gray-500'}`}>
                                                                {isDone ? 'OK' : 'VALIDER'}
                                                            </button>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div className="space-y-1.5">
                                                                <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest pl-1">Poids (LBS)</p>
                                                                <div className="flex items-center bg-[#1a1a20] rounded-2xl border border-white/5 p-1 h-12">
                                                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-500" onClick={() => handleSetChange(groupIdx, eIdx, sIdx, 'weight', Math.max(0, (parseFloat(sessionLogs[logKey]?.weight || exo.weight || 0) - 2.5)))}><Minus size={14}/></Button>
                                                                    <Input disabled={isCoachView} type="number" className="h-10 border-0 bg-transparent text-white text-center font-black text-lg focus-visible:ring-0 p-0" value={sessionLogs[logKey]?.weight || exo.weight || ''} onChange={(e) => handleSetChange(groupIdx, eIdx, sIdx, 'weight', e.target.value)} />
                                                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-500" onClick={() => handleSetChange(groupIdx, eIdx, sIdx, 'weight', (parseFloat(sessionLogs[logKey]?.weight || exo.weight || 0) + 2.5))}><Plus size={14}/></Button>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest pl-1">Répétitions</p>
                                                                <div className="flex items-center bg-[#1a1a20] rounded-2xl border border-white/5 p-1 h-12">
                                                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-500" onClick={() => handleSetChange(groupIdx, eIdx, sIdx, 'reps', Math.max(0, (parseInt(sessionLogs[logKey]?.reps || exo.reps || 0) - 1)))}><Minus size={14}/></Button>
                                                                    <Input disabled={isCoachView} type="number" className="h-10 border-0 bg-transparent text-white text-center font-black text-lg focus-visible:ring-0 p-0" value={sessionLogs[logKey]?.reps || exo.reps || ''} onChange={(e) => handleSetChange(groupIdx, eIdx, sIdx, 'reps', e.target.value)} />
                                                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-500" onClick={() => handleSetChange(groupIdx, eIdx, sIdx, 'reps', (parseInt(sessionLogs[logKey]?.reps || exo.reps || 0) + 1))}><Plus size={14}/></Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {!isCoachView && isSessionStarted && (
            <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0a0a0f] to-transparent z-30">
                <Button onClick={handleEndSession} className="w-full h-16 font-black bg-white text-black rounded-2xl text-xl shadow-2xl hover:scale-105 transition-all uppercase italic"> TERMINER LA SÉANCE </Button>
            </div>
        )}

        <PostSession isOpen={showPostSession} stats={sessionStats} workout={workout} userId={currentUser?.uid} onComplete={confirmSaveSession} />

        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
            <DialogContent className="bg-[#1a1a20] border-red-500 text-white rounded-[2rem] max-w-sm">
                <DialogHeader><DialogTitle className="text-red-500 italic uppercase text-2xl font-black text-center mb-2">Abandonner ?</DialogTitle></DialogHeader>
                <p className="text-center text-gray-400 text-sm mb-6">Ta progression pour cette séance ne sera pas enregistrée.</p>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowCancelModal(false)} className="flex-1 h-12 rounded-xl border-gray-700 bg-transparent text-white font-bold">RETOURNER</Button>
                    <Button onClick={async () => { await TimerManager.stopSession(); navigate('/dashboard'); }} className="flex-1 h-12 rounded-xl bg-red-500 text-white font-black">QUITTER</Button>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
}
