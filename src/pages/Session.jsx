import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, app } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { getDatabase, ref, update, onValue, set } from "firebase/database";
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Dumbbell, XCircle, Zap, Clock, Coffee, Plus, Minus, Layers, Link2, Target, TrendingDown, TrendingUp, Repeat, Footprints, Activity, Flame, X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import { WearPlugin } from '@/lib/wear';
import { format, isSameDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { TimerManager } from '@/lib/timer';
import PostSession from '@/components/PostSession';
import { motion, AnimatePresence } from 'framer-motion';

const SET_TYPE_INFO = {
  straight: { name: 'Série Classique', icon: Dumbbell, color: 'bg-gray-600' },
  superset_antagonist: { name: 'Superset Antagoniste', icon: Link2, color: 'bg-blue-600' },
  superset_agonist: { name: 'Superset Agoniste', icon: Flame, color: 'bg-orange-600' },
  pre_exhaustion: { name: 'Pré-fatigue', icon: Target, color: 'bg-red-600' },
  triset: { name: 'Tri-Set', icon: Layers, color: 'bg-purple-600' },
  giant_set: { name: 'Série Géante', icon: Zap, color: 'bg-yellow-600' },
  dropset: { name: 'Drop Set', icon: TrendingDown, color: 'bg-pink-600' },
  pyramid: { name: 'Pyramide', icon: TrendingUp, color: 'bg-emerald-600' },
  reverse_pyramid: { name: 'Pyramide Inversée', icon: Repeat, color: 'bg-cyan-600' }
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
  const [viewDate, setViewDate] = useState(new Date());
  const [liveSteps, setLiveSteps] = useState(0);

  // États Séance Active
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [expandedGroup, setExpandedGroup] = useState(0);
  const [sessionLogs, setSessionLogs] = useState({});
  const [restTime, setRestTime] = useState(0);

  // Modales
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPostSession, setShowPostSession] = useState(false);
  const [sessionStats, setSessionStats] = useState({ volume: 0, sets: 0, time: 0, calories: 0 });

  // --- GESTION DU BOUTON BACK ANDROID (DÉDIÉ SESSION) ---
  useEffect(() => {
    const handleBack = (e) => {
      if (showPostSession) { e.preventDefault(); setShowPostSession(false); }
      else if (showCancelModal) { e.preventDefault(); setShowCancelModal(false); }
      else if (isSessionStarted) { e.preventDefault(); setShowCancelModal(true); }
    };
    window.addEventListener('kbBackButton', handleBack);
    return () => window.removeEventListener('kbBackButton', handleBack);
  }, [showPostSession, showCancelModal, isSessionStarted]);

  // Chargement initial & Sync RTDB
  useEffect(() => {
    if (authLoading || !targetId) return;
    setLoading(true);

    const checkStatus = async () => {
      try {
          const { value } = await (await import('@capacitor/preferences')).Preferences.get({ key: 'session_start_time' });
          if (value && !isCoachView) setIsSessionStarted(true);
      } catch (e) {}
    };
    checkStatus();

    const unsubProfile = onSnapshot(doc(db, "users", targetId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile(data);
        const dateKey = `Exercise-${format(viewDate, 'MM-dd-yyyy')}`;
        let selectedWorkout = data[dateKey] || (isSameDay(viewDate, new Date()) && location.state?.workout ? location.state.workout : null);

        if (selectedWorkout && !selectedWorkout.groups) {
            selectedWorkout.groups = (selectedWorkout.exercises || []).map(ex => ({ id: Math.random(), setType: 'straight', exercises: [ex], sets: ex.sets || 3, rest: ex.rest || 60 }));
        }
        setWorkout(selectedWorkout);
      }
      setLoading(false);
    });

    const unsubRTDB = onValue(ref(rtdb, `users/${targetId}/live_data`), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.date === new Date().toISOString().split('T')[0]) setLiveSteps(Number(data.steps) || 0);
        if (isCoachView && data.session?.active) {
            setSeconds(data.session.elapsedSeconds || 0);
            setSessionLogs(data.session.logs || {});
            setIsSessionStarted(true);
        }
      }
    });

    return () => { unsubProfile(); unsubRTDB(); };
  }, [targetId, authLoading, isCoachView, viewDate]);

  // CHRONOMÈTRE FIX
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
          if (remainingRest === 0 && restTime > 0) TimerManager.playEndSignal();
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionStarted, showPostSession, isCoachView, currentUser, restTime]);

  const handleStartSession = async () => {
    if (isCoachView || !currentUser || !workout) return;
    setIsSessionStarted(true);
    await TimerManager.startSession();
    set(ref(rtdb, `users/${currentUser.uid}/live_data/session`), {
        active: true,
        workoutName: workout.name,
        startTime: Date.now(),
        elapsedSeconds: 0,
        groups: workout.groups,
        logs: {}
    });
    try { await WearPlugin.sendDataToWatch({ path: "/start-session", data: JSON.stringify({ name: workout.name, exercises: workout.groups.flatMap(g => g.exercises.map(e => ({...e, sets: g.sets}))) }) }); } catch (e) {}
  };

  const handleToggleSet = async (gIdx, eIdx, sIdx) => {
    if (isCoachView || !currentUser) return;
    const key = `${gIdx}-${eIdx}-${sIdx}`;
    const group = workout.groups[gIdx];
    const exercise = group.exercises[eIdx];
    const isDone = !sessionLogs[key]?.done;

    const newLog = { ...sessionLogs[key], done: isDone, weight: sessionLogs[key]?.weight || exercise.weight || 0, reps: sessionLogs[key]?.reps || exercise.reps || 10 };
    const updatedLogs = { ...sessionLogs, [key]: newLog };
    setSessionLogs(updatedLogs);

    if (isDone) {
        const isLastExo = eIdx === group.exercises.length - 1;
        if (isLastExo) {
            const rest = parseInt(group.rest) || 60;
            await TimerManager.startRest(rest);
            setRestTime(rest);
        }
    } else {
        await TimerManager.clearRest();
        setRestTime(0);
    }
    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: newLog });
  };

  const handleUpdateField = (gIdx, eIdx, sIdx, field, val) => {
    const key = `${gIdx}-${eIdx}-${sIdx}`;
    const updated = { ...sessionLogs, [key]: { ...sessionLogs[key], [field]: val } };
    setSessionLogs(updated);
    update(ref(rtdb, `users/${currentUser.uid}/live_data/session/logs`), { [key]: updated[key] });
  };

  const handleFinalizeSession = async () => {
    setShowPostSession(false);
    try {
        await TimerManager.stopSession();
    } catch (e) {
        console.error("Error stopping session timer", e);
    }
    navigate('/dashboard', { replace: true });
  };

  if (loading || authLoading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-[#00f5d4] font-black italic uppercase animate-pulse">Kaybee Live...</div>;

  if (!isSessionStarted) {
    return (
      <div className="h-screen bg-[#0a0a0f] text-white p-4 flex flex-col items-center justify-center overflow-hidden max-w-full">
        <div className="w-full max-w-md flex items-center justify-between mb-8 bg-white/5 p-2 rounded-2xl border border-white/5">
          <Button variant="ghost" className="h-10 w-10 p-0" onClick={() => setViewDate(prev => addDays(prev, -1))}><ChevronLeft/></Button>
          <div className="text-center">
            <p className="text-[9px] sm:text-[10px] font-black uppercase text-[#7b2cbf] tracking-widest">{format(viewDate, 'EEEE', {locale: fr})}</p>
            <p className="text-base sm:text-lg font-black italic uppercase">{format(viewDate, 'd MMMM', {locale: fr})}</p>
          </div>
          <Button variant="ghost" className="h-10 w-10 p-0" onClick={() => setViewDate(prev => addDays(prev, 1))}><ChevronRight/></Button>
        </div>
        {workout ? (
          <div className="w-full max-w-md flex flex-col h-full max-h-[75vh]">
            <div className="text-center mb-6">
                <div className="inline-flex p-4 bg-[#7b2cbf]/20 rounded-full text-[#7b2cbf] mb-2"><Dumbbell size={32}/></div>
                <h1 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter truncate px-2">{workout.name}</h1>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {workout.groups.map((g, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <div className="flex items-center gap-3 truncate">
                            <div className="size-10 rounded-lg bg-gray-800 shrink-0 overflow-hidden border border-white/10">
                                <img src={g.exercises[0]?.imageUrl} className="size-full object-cover" alt="" />
                            </div>
                            <p className="font-black italic uppercase text-[10px] sm:text-xs text-white truncate">{g.exercises.map(e => e.name).join(' + ')}</p>
                        </div>
                        <Badge className="bg-gray-800 text-[8px] sm:text-[9px] ml-2 shrink-0">{g.sets} SÉRIES</Badge>
                    </div>
                ))}
            </div>
            <Button onClick={handleStartSession} className="w-full h-14 sm:h-16 bg-[#00f5d4] text-black font-black text-lg sm:text-xl italic rounded-2xl mt-6 shadow-xl active:scale-95 transition-all">DÉMARRER LA SÉANCE</Button>
          </div>
        ) : (
          <div className="text-center space-y-4 opacity-50">
            <Activity size={60} className="mx-auto text-gray-700"/>
            <p className="font-black italic uppercase text-sm">Aucune séance prévue</p>
            <Button onClick={() => navigate('/exercises')} variant="outline" className="rounded-xl border-gray-800 text-xs">Voir les programmes</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden max-w-full">
        {/* HEADER FIXE */}
        <div className="shrink-0 p-3 sm:p-4 border-b border-gray-800 flex justify-between items-center bg-[#0a0a0f]/90 backdrop-blur-md z-50">
            <div className="flex items-center gap-2 sm:gap-3">
                <Clock size={18} className="text-[#00f5d4] animate-pulse"/>
                <span className="font-mono text-2xl sm:text-3xl font-black text-[#00f5d4] tracking-tighter">
                    {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
                </span>
                <div className="w-[1px] h-5 sm:h-6 bg-gray-800 mx-1"/>
                <div className="flex items-center gap-1 text-[#7b2cbf]"><Footprints size={12}/><span className="font-black text-xs sm:text-sm italic">{liveSteps.toLocaleString()}</span></div>
            </div>

            {/* TIMER DE REPOS */}
            {restTime > 0 && (
                <div className="flex items-center gap-1.5 sm:gap-2 bg-[#7b2cbf] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-lg animate-in zoom-in">
                    <Coffee size={12} className="animate-bounce" />
                    <span className="font-black text-xs sm:text-sm">{restTime}s</span>
                </div>
            )}

            <Button variant="ghost" size="icon" onClick={() => setShowCancelModal(true)} className="text-red-500 h-9 w-9 p-0"><XCircle size={24}/></Button>
        </div>

        {/* REPOS URGENT OVERLAY */}
        <AnimatePresence>
            {restTime > 0 && restTime <= 7 && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] bg-[#7b2cbf] flex flex-col items-center justify-center p-6 sm:p-8 text-center">
                    <h2 className="text-2xl sm:text-3xl font-black italic uppercase text-white mb-2">REPRISE !</h2>
                    <div className="text-[100px] sm:text-[140px] font-black italic text-white leading-none">{restTime}</div>
                    <Button onClick={async () => { await TimerManager.clearRest(); setRestTime(0); }} className="mt-8 bg-white text-[#7b2cbf] font-black text-lg sm:text-xl h-14 sm:h-16 px-10 sm:px-12 rounded-2xl shadow-2xl active:scale-95 transition-all">PRÊT !</Button>
                </motion.div>
            )}
        </AnimatePresence>

        {/* LISTE D'EXERCICES SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar">
            {workout.groups.map((group, gIdx) => {
                const isExp = expandedGroup === gIdx;
                const typeInfo = SET_TYPE_INFO[group.setType] || SET_TYPE_INFO.straight;
                return (
                    <div key={gIdx} className={`rounded-2xl border transition-all ${isExp ? 'bg-white/5 border-[#7b2cbf]' : 'bg-white/5 border-gray-800'}`}>
                        <div className="p-3 sm:p-4 flex flex-col gap-2" onClick={() => setExpandedGroup(isExp ? null : gIdx)}>
                            <div className="flex justify-between items-center">
                                <Badge className={`${typeInfo.color} text-white text-[7px] sm:text-[8px] font-black uppercase`}>{typeInfo.name}</Badge>
                                {isExp ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {group.exercises.map((exo, eIdx) => (
                                    <div key={eIdx} className="flex items-center gap-2 bg-black/20 p-1 rounded-lg border border-white/5">
                                        <div className="size-7 sm:size-8 rounded-md bg-gray-800 overflow-hidden shrink-0">
                                            <img src={exo.imageUrl} className="size-full object-cover" alt="" />
                                        </div>
                                        <span className="font-black italic uppercase text-[10px] text-white truncate max-w-[100px] sm:max-w-[120px]">{exo.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {isExp && (
                            <div className="p-3 sm:p-4 pt-0 space-y-4">
                                {Array.from({ length: group.sets }).map((_, sIdx) => (
                                    <div key={sIdx} className="p-2 sm:p-3 bg-black/40 rounded-xl border border-white/5 space-y-3">
                                        <h4 className="text-[7px] sm:text-[8px] font-black text-[#7b2cbf] text-center uppercase tracking-widest">Série {sIdx+1}</h4>
                                        {group.exercises.map((exo, eIdx) => {
                                            const k = `${gIdx}-${eIdx}-${sIdx}`;
                                            const log = sessionLogs[k] || {};
                                            return (
                                                <div key={eIdx} className="space-y-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                                    <div className="flex justify-between items-center gap-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div className="size-9 sm:size-10 rounded-lg bg-gray-900 overflow-hidden border border-white/5 shrink-0">
                                                                <img src={exo.imageUrl} className="size-full object-cover" alt="" />
                                                            </div>
                                                            <p className="font-black italic uppercase text-[9px] sm:text-[10px] truncate">{exo.name}</p>
                                                        </div>
                                                        <button onClick={() => handleToggleSet(gIdx, eIdx, sIdx)} className={`h-8 px-3 sm:px-4 rounded-lg font-black italic text-[9px] sm:text-[10px] transition-all ${log.done ? 'bg-[#00f5d4] text-black shadow-lg' : 'bg-gray-800 text-gray-500'}`}>{log.done ? 'OK' : 'VAL'}</button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="flex items-center bg-white/5 rounded-lg border border-white/5 h-9 sm:h-10 px-1">
                                                            <Button variant="ghost" size="icon" className="size-7 text-gray-500" onClick={() => handleUpdateField(gIdx, eIdx, sIdx, 'weight', Math.max(0, (parseFloat(log.weight || exo.weight || 0) - 2.5)))}><Minus size={10}/></Button>
                                                            <Input type="number" className="h-7 border-0 bg-transparent text-center font-black text-xs sm:text-sm p-0 focus-visible:ring-0" value={log.weight || exo.weight || ''} onChange={e => handleUpdateField(gIdx, eIdx, sIdx, 'weight', e.target.value)}/>
                                                            <Button variant="ghost" size="icon" className="size-7 text-gray-500" onClick={() => handleUpdateField(gIdx, eIdx, sIdx, 'weight', (parseFloat(log.weight || exo.weight || 0) + 2.5))}><Plus size={10}/></Button>
                                                        </div>
                                                        <div className="flex items-center bg-white/5 rounded-lg border border-white/5 h-9 sm:h-10 px-1">
                                                            <Button variant="ghost" size="icon" className="size-7 text-gray-500" onClick={() => handleUpdateField(gIdx, eIdx, sIdx, 'reps', Math.max(0, (parseInt(log.reps || exo.reps || 0) - 1)))}><Minus size={10}/></Button>
                                                            <Input type="number" className="h-7 border-0 bg-transparent text-center font-black text-xs sm:text-sm p-0 focus-visible:ring-0" value={log.reps || exo.reps || ''} onChange={e => handleUpdateField(gIdx, eIdx, sIdx, 'reps', e.target.value)}/>
                                                            <Button variant="ghost" size="icon" className="size-7 text-gray-500" onClick={() => handleUpdateField(gIdx, eIdx, sIdx, 'reps', (parseInt(log.reps || exo.reps || 0) + 1))}><Plus size={10}/></Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* BOUTON TERMINER FIXE BAS */}
        <div className="shrink-0 p-3 sm:p-4 bg-gradient-to-t from-[#0a0a0f] to-transparent">
            <Button onClick={() => {
                let vol=0; let sets=0; Object.values(sessionLogs).forEach(l => { if(l.done) { sets++; vol += (parseFloat(l.weight||0)*parseFloat(l.reps||0)); }});
                setSessionStats({ volume: vol, sets, time: seconds, calories: Math.floor((seconds/60)*(userProfile?.weight||80)*0.07) });
                setShowPostSession(true);
            }} className="w-full h-12 sm:h-14 bg-white text-black font-black uppercase italic rounded-xl text-base sm:text-lg shadow-2xl active:scale-95 transition-all">TERMINER LA SÉANCE</Button>
        </div>

        <PostSession isOpen={showPostSession} stats={sessionStats} workout={workout} userId={currentUser?.uid} onComplete={handleFinalizeSession} />

        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
            <DialogContent className="bg-[#1a1a20] border-red-500 text-white rounded-[2rem] max-w-[90vw] mx-auto p-5 sm:p-6 shadow-3xl overflow-hidden">
                <DialogHeader><DialogTitle className="text-red-500 font-black text-lg sm:text-xl italic uppercase text-center mb-2">Abandonner ?</DialogTitle></DialogHeader>
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 h-11 sm:h-12 rounded-xl border-gray-800 uppercase font-black text-[10px] sm:text-xs" onClick={() => setShowCancelModal(false)}>RETOURNER</Button>
                    <Button className="flex-1 h-11 sm:h-12 rounded-xl bg-red-500 font-black uppercase text-[10px] sm:text-xs shadow-lg shadow-red-900/30" onClick={async () => {
                        await TimerManager.stopSession();
                        setShowCancelModal(false);
                        navigate('/dashboard');
                    }}>QUITTER</Button>
                </div>
            </DialogContent>
        </Dialog>
    </div>
  );
}
