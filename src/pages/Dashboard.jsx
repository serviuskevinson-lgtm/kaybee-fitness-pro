import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, app } from '@/lib/firebase';
import { 
  doc, onSnapshot, updateDoc, arrayRemove, increment as firestoreIncrement
} from 'firebase/firestore';
import { getDatabase, ref, onValue, update } from "firebase/database";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Dumbbell, Flame, Trophy, Calendar as CalendarIcon,
  Plus, Zap, Target, Edit3, Trash2, Activity, HeartPulse, Footprints, Droplets, Minus, X, BrainCircuit, Lightbulb, ChevronLeft, ChevronRight, Utensils, Scale, Flag, GlassWater
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import SmartCalorieWidget from '@/components/SmartCalorieWidget';
import { startOfWeek, addWeeks, subWeeks, format, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateDailyAccountability } from '@/lib/geminiadvice';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationManager } from '@/lib/notifications';

// --- IMPORTS NATIFS & PLUGINS ---
import { Capacitor } from '@capacitor/core';
import { WearPlugin } from '@/lib/wear';

const safe = (val) => (val === null || val === undefined || typeof val === 'object' ? "" : String(val));
const getTodayString = () => new Date().toISOString().split('T')[0];

const WeightGoalWidget = ({ stats }) => {
    const diffInitial = stats.diffInitial;
    const diffTarget = stats.diffTarget;
    const isLosing = stats.targetWeight < stats.initialWeight;

    return (
        <div className="bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Scale size={60} />
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Mon Poids</p>
                        <h3 className="text-xl font-black text-white italic uppercase">Objectif</h3>
                    </div>
                    <Badge className="bg-[#fdcb6e] text-black font-black text-[9px] px-2 py-0.5 rounded-full">
                        {stats.targetDate ? format(parseISO(stats.targetDate), 'dd/MM/yy') : 'DATE TBD'}
                    </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                    <div className="text-center">
                        <p className="text-[8px] font-bold text-gray-500 uppercase">Départ</p>
                        <p className="text-lg font-black text-gray-400">{stats.initialWeight} <span className="text-[10px]">LBS</span></p>
                    </div>
                    <div className="flex flex-col items-center">
                        <Badge className={`text-[8px] font-black ${diffInitial <= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {diffInitial > 0 ? '+' : ''}{diffInitial.toFixed(1)}
                        </Badge>
                        <div className="w-full h-[1px] bg-gray-800 my-1 relative">
                            <ChevronRight size={10} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-600" />
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-[8px] font-bold text-[#fdcb6e] uppercase">Actuel</p>
                        <p className="text-2xl font-black text-white">{stats.weight} <span className="text-[10px]">LBS</span></p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between text-[8px] font-black uppercase text-gray-500">
                        <span>Progression</span>
                        <span className="text-[#fdcb6e]">{Math.abs(diffTarget).toFixed(1)} LBS À {isLosing ? 'PERDRE' : 'GAGNER'}</span>
                    </div>
                    <div className="h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.progress}%` }}
                            className="h-full bg-gradient-to-r from-[#fdcb6e] to-[#ff7675] rounded-full"
                        />
                    </div>
                    <div className="flex justify-between items-center text-[8px]">
                        <span className="text-gray-400">Cible: <strong className="text-white">{stats.targetWeight} LBS</strong></span>
                        <span className="text-gray-500 italic">Lâche rien !</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const HydrationWidget = ({ current, onAdd, isCoachView }) => {
    const goal = 2.5; // Objectif recommandé 2.5L
    const progress = Math.min(100, (current / goal) * 100);
    const [tempAmount, setTempAmount] = useState(0.25); // Par défaut 250ml

    return (
        <div className="bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Droplets size={60} className="text-blue-500" />
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hydratation</p>
                        <h3 className="text-xl font-black text-white italic uppercase">Quotidienne</h3>
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-400 font-black text-[10px] px-2 py-0.5 rounded-full border-none">
                        {Math.round(progress)}% DU BUT
                    </Badge>
                </div>

                <div className="flex flex-col items-center justify-center py-2">
                    <div className="text-center">
                        <p className="text-4xl font-black text-white tracking-tighter">{current.toFixed(2)} <span className="text-lg text-gray-500">L</span></p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Objectif: {goal}L</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <Progress value={progress} className="h-3 bg-gray-900 [&>div]:bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" />

                    {!isCoachView && (
                        <div className="flex items-center gap-2 pt-2">
                            <div className="flex items-center bg-black/40 rounded-xl border border-gray-800 p-1 flex-1 justify-between">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setTempAmount(prev => Math.max(0.05, prev - 0.05))}>
                                    <Minus size={14} />
                                </Button>
                                <span className="text-xs font-black text-blue-400">{(tempAmount * 1000).toFixed(0)} ml</span>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setTempAmount(prev => prev + 0.05)}>
                                    <Plus size={14} />
                                </Button>
                            </div>
                            <Button
                                onClick={() => onAdd(tempAmount)}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase h-10 px-4 rounded-xl shadow-lg shadow-blue-900/20 transition-transform active:scale-95"
                            >
                                <GlassWater size={14} className="mr-1.5" /> AJOUTER
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const clientContext = useClient();
  const navigate = useNavigate();
  const currentUser = auth?.currentUser;
  const { isCoachView, targetUserId } = clientContext || {};
  
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDayDetail, setSelectedDayDetail] = useState(null);

  const [intelMode, setIntelMode] = useState("accountability");
  const [isIntelLoading, setIsIntelLoading] = useState(false);
  const [accountability, setAccountability] = useState({
      status: "warning",
      primaryNeed: "ANALYSE...",
      recommendation: "L'IA Kaybee étudie tes données...",
      improveWidget: "Chargement"
  });

  const [liveStats, setLiveStats] = useState({
      steps: 0, caloriesBurned: 0, caloriesConsumed: 0, water: 0, heartRate: 0, points: 0, weight: 0,
      macros: { protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, meals: [] }
  });

  const rtdb = getDatabase(app);

  const weightStats = useMemo(() => {
    if (!userProfile) return null;
    const history = userProfile.history || [];
    const allDailyLogs = history.filter(h => h.type === 'daily_summary').sort((a, b) => new Date(a.date) - new Date(b.date));

    const initialWeight = userProfile.startingWeight || allDailyLogs.find(l => l.weight)?.weight || userProfile.weight || 0;
    const currentWeight = liveStats.weight || userProfile.weight || 0;
    const targetWeight = userProfile.targetWeight || 0;

    const diffInitial = currentWeight - initialWeight;
    const diffTarget = targetWeight - currentWeight;

    let progress = 0;
    if (initialWeight !== targetWeight) {
        progress = ((initialWeight - currentWeight) / (initialWeight - targetWeight)) * 100;
    }

    return {
        initialWeight,
        weight: currentWeight,
        targetWeight,
        targetDate: userProfile.targetDate,
        diffInitial,
        diffTarget,
        progress: Math.min(100, Math.max(0, progress))
    };
  }, [userProfile, liveStats.weight]);

  const fetchIntel = async (profile, stats, mode) => {
      const today = getTodayString();
      const storageKey = `kaybee_ai_${mode}_${today}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) {
          try {
              const parsed = JSON.parse(cached);
              if (parsed && typeof parsed.primaryNeed === 'string') { setAccountability(parsed); return; }
          } catch (e) { localStorage.removeItem(storageKey); }
      }
      setIsIntelLoading(true);
      try {
          const history = profile.history || [];
          const intel = await generateDailyAccountability(profile, stats, history, mode, i18n.language);
          if (intel && typeof intel.primaryNeed === 'string') {
              setAccountability(intel);
              localStorage.setItem(storageKey, JSON.stringify(intel));
          }
      } catch (e) { console.error(e); }
      finally { setIsIntelLoading(false); }
  };

  useEffect(() => {
    if (currentUser?.uid && !isCoachView && Capacitor.getPlatform() !== 'web') {
        try {
            WearPlugin.setUserId({ userId: currentUser.uid });
            WearPlugin.pairWatch({ userId: currentUser.uid }).catch(() => {});
        } catch (error) { console.error(error); }
    }
  }, [currentUser, isCoachView]);

  useEffect(() => {
    if (!currentUser) return;
    const targetId = targetUserId || currentUser.uid;

    const unsubProfile = onSnapshot(doc(db, "users", targetId), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            setUserProfile(data);
            setLoading(false);

            // Planifier les rappels de pas à l'ouverture du dashboard
            if (!isCoachView) {
                NotificationManager.scheduleStepReminders();
            }
        }
    });

    const unsubRTDB = onValue(ref(rtdb, `users/${targetId}/live_data`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            setLiveStats(prev => ({
                ...prev,
                steps: data.source === 'watch' ? Number(data.steps) : Math.max(prev.steps, Number(data.steps) || 0),
                caloriesBurned: data.source === 'watch' ? Number(data.calories_burned) : Math.max(prev.caloriesBurned, Number(data.calories_burned) || 0),
                caloriesConsumed: Number(data.calories_consumed) || 0,
                water: Number(data.water) || 0,
                heartRate: Number(data.heart_rate) || 0,
                weight: Number(data.weight) || prev.weight,
                macros: data.nutrition || prev.macros
            }));
        }
    });

    return () => { unsubProfile(); unsubRTDB(); };
  }, [currentUser, targetUserId]);

  useEffect(() => {
      if (userProfile) fetchIntel(userProfile, liveStats, intelMode);
  }, [intelMode, i18n.language, userProfile?.uid]);

  const handleAddWater = async (amountL) => {
    if (!currentUser || isCoachView) return;
    const newTotal = Math.max(0, liveStats.water + amountL);
    update(ref(rtdb, `users/${currentUser.uid}/live_data`), { water: newTotal });
    await updateDoc(doc(db, "users", currentUser.uid), {
        dailyWater: newTotal,
        lastActiveDate: getTodayString()
    });
  };

  const handleDeleteWorkout = async (workout) => {
    if (!currentUser || !window.confirm("Supprimer cette séance de votre agenda ?")) return;
    try {
        const userRef = doc(db, "users", targetUserId || currentUser.uid);
        await updateDoc(userRef, { workouts: arrayRemove(workout) });
        setSelectedDayDetail(null);
    } catch (e) { console.error(e); }
  };

  const handleEditWorkout = (workout) => {
    navigate(`/create-workout?edit=${workout.id}`);
  };

  const getDayContent = (date) => {
    const workout = userProfile?.workouts?.find(w =>
        w.scheduledDays?.some(d => isSameDay(typeof d === 'string' ? parseISO(d) : new Date(d), date)) ||
        w.scheduledDays?.includes(format(date, 'EEEE', { locale: fr }))
    );
    return { workout };
  };

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{safe(t('loading'))}</div>;

  const stepsGoal = 10000;
  const stepsProgress = Math.min(100, (liveStats.steps / stepsGoal) * 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 p-4 md:p-8">
      {/* Header Widget */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-8 rounded-3xl border border-[#7b2cbf]/20 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase">
            {safe(t('welcome'))} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">{safe(userProfile?.firstName?.toUpperCase())}</span>
          </h1>
          <p className="text-gray-400 mt-2 text-lg">Prêt à exploser les records aujourd'hui ?</p>
        </div>
        {!isCoachView && (
            <Link to="/session"><Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-6 px-8 rounded-xl shadow-lg transition-transform hover:scale-105"><Zap className="mr-2 h-5 w-5 fill-black" /> {safe(t('start_session'))}</Button></Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {weightStats && <WeightGoalWidget stats={weightStats} />}
                <div className="bg-[#1a1a20] p-6 rounded-3xl border-l-4 border-l-[#7b2cbf] shadow-xl flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-2"><Utensils className="text-[#7b2cbf]" size={20}/><h3 className="font-bold text-gray-200">Nutrition</h3></div><Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none">{liveStats.caloriesConsumed} Kcal</Badge></div>
                    <div className="space-y-2">
                        <Progress value={(liveStats.caloriesConsumed / 2500) * 100} className="h-2 bg-gray-800 [&>div]:bg-[#7b2cbf]" />
                        <p className="text-[10px] text-gray-500 font-bold text-right uppercase">Objectif: 2500 Kcal</p>
                    </div>
                </div>
            </div>

            <Card className="bg-gradient-to-br from-[#1a1a20] to-[#0a0a0f] border-[#7b2cbf]/40 border-2 rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="pb-3 border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3"><BrainCircuit className="text-[#00f5d4] animate-pulse" size={24} /><CardTitle className="text-xl font-black italic uppercase text-white tracking-tight">{safe(t('intelligence_title'))}</CardTitle></div>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-4 rounded-2xl bg-yellow-500/20 text-yellow-400`}><Lightbulb size={28} /></div>
                        <div className="flex-1">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{safe(t('focus_label'))} : <span className="text-white font-black">{safe(accountability.improveWidget)}</span></h4>
                            <p className="text-2xl font-black text-white italic leading-tight uppercase">{safe(accountability.primaryNeed)}</p>
                            <p className="text-gray-400 mt-2 text-sm leading-relaxed font-medium italic">"{safe(accountability.recommendation)}"</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between shadow-xl relative overflow-hidden group">
                    <div className="relative z-10"><p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Calories Brûlées (⌚)</p><h3 className="text-3xl font-black text-white">{Math.floor((Number(userProfile?.nutritionalGoal) || 2000) + liveStats.caloriesBurned)} KCAL</h3></div>
                    <Flame className="text-yellow-500 w-10 h-10 group-hover:scale-110 transition-transform relative z-10" />
                </div>
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between shadow-xl relative overflow-hidden group">
                    <div className="relative z-10"><p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Pouls en Direct (⌚)</p><h3 className="text-3xl font-black text-white">{liveStats.heartRate > 0 ? liveStats.heartRate : "--"} BPM</h3></div>
                    <HeartPulse className={`text-blue-500 w-10 h-10 ${liveStats.heartRate > 0 ? 'animate-pulse' : 'opacity-20'} relative z-10`} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#1a1a20] border-gray-800 shadow-xl min-h-[200px] overflow-hidden group relative"><CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest relative z-10"><Footprints className="text-[#7b2cbf]"/> Pas</CardTitle></CardHeader>
                    <CardContent className="flex flex-col justify-between h-[120px] relative z-10">
                        <div className="flex justify-between items-end mb-2">
                            <h3 className="text-4xl font-black text-white tracking-tighter">{liveStats.steps.toLocaleString()}</h3>
                            <Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none text-[10px] font-black">{Math.round(stepsProgress)}%</Badge>
                        </div>
                        <div className="space-y-2">
                            <Progress value={stepsProgress} className="h-3 bg-gray-900 [&>div]:bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] rounded-full" />
                            <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase">
                                <span>But: {stepsGoal.toLocaleString()}</span>
                                <span>{(liveStats.steps * 0.000762).toFixed(2)} km</span>
                            </div>
                        </div>
                    </CardContent>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Footprints size={120} className="text-[#7b2cbf]" />
                    </div>
                </Card>
                <HydrationWidget current={liveStats.water} onAdd={handleAddWater} isCoachView={isCoachView} />
            </div>

            <SmartCalorieWidget userProfile={userProfile} consumed={liveStats.caloriesConsumed} burned={liveStats.caloriesBurned} />
        </div>

        <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 shadow-xl">
                <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black italic text-white uppercase flex items-center gap-2"><CalendarIcon className="text-[#00f5d4]"/> Agenda</h3><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))} className="h-8 w-8"><ChevronLeft/></Button><Button size="icon" variant="ghost" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))} className="h-8 w-8"><ChevronRight/></Button></div></div>
                <div className="space-y-2">
                    {weekDays.map((date) => {
                        const content = getDayContent(date);
                        const isToday = isSameDay(date, new Date());
                        return (
                            <motion.div key={date.toISOString()} whileHover={{ x: 5 }} onClick={() => setSelectedDayDetail({ date, ...content })} className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${isToday ? 'bg-[#7b2cbf]/20 border-[#7b2cbf] shadow-[0_0_15px_rgba(123,44,191,0.2)]' : 'bg-black/20 border-gray-800 hover:border-gray-600'}`}>
                                <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center mr-3 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}><span className="text-[8px] font-black uppercase">{format(date, 'EEE', { locale: fr })}</span><span className="text-sm font-black">{format(date, 'd')}</span></div>
                                <p className={`text-xs font-black truncate flex-1 uppercase tracking-tight ${isToday ? 'text-[#00f5d4]' : 'text-gray-300'}`}>{safe(content.workout?.name) || "Repos"}</p>
                                {content.workout && <div className={`w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse`}></div>}
                            </motion.div>
                        )
                    })}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <StatCard label="POINTS" value={userProfile?.points || 0} color="red" />
                <StatCard label="SÉANCES" value={userProfile?.history?.filter(h => h.type === 'workout').length || 0} color="purple" />
                <StatCard label="DÉFIS" value={userProfile?.challengesCompleted?.length || 0} color="teal" />
                <StatCard label="OBJECTIF" value={`${userProfile?.targetWeight} LBS`} color="orange" />
            </div>
        </div>
      </div>

      <Dialog open={!!selectedDayDetail} onOpenChange={() => setSelectedDayDetail(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-lg overflow-hidden p-0 shadow-2xl">
            {selectedDayDetail && (
                <div className="flex flex-col">
                    <div className="p-8 bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Dumbbell size={100} /></div>
                        <h2 className="text-3xl font-black italic uppercase text-white drop-shadow-md">{format(selectedDayDetail.date, 'EEEE d MMMM', { locale: fr })}</h2>
                        <button onClick={() => setSelectedDayDetail(null)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"><X size={24}/></button>
                    </div>

                    <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {selectedDayDetail.workout ? (
                            <section className="space-y-4">
                                <div className="flex justify-between items-center bg-black/40 p-4 rounded-2xl border border-white/5">
                                    <div>
                                        <h3 className="text-xs font-black text-[#00f5d4] uppercase tracking-widest">Entraînement Prévu</h3>
                                        <p className="text-xl font-black text-white uppercase italic">{selectedDayDetail.workout.name}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="icon" variant="ghost" onClick={() => handleEditWorkout(selectedDayDetail.workout)} className="h-10 w-10 bg-white/5 hover:bg-white/10 text-white rounded-xl"><Edit3 size={18}/></Button>
                                        <Button size="icon" variant="ghost" onClick={() => handleDeleteWorkout(selectedDayDetail.workout)} className="h-10 w-10 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl"><Trash2 size={18}/></Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {selectedDayDetail.workout.exercises?.map((exo, i) => (
                                        <div key={i} className="flex items-center gap-4 p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-[#7b2cbf]/30 transition-all">
                                            <div className="w-12 h-12 bg-gray-800 rounded-xl overflow-hidden border border-white/5">
                                                {exo.imageUrl ? <img src={exo.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/> : <Dumbbell className="w-full h-full p-3 text-gray-600"/>}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-black text-white uppercase text-sm italic">{exo.name}</p>
                                                <div className="flex gap-3 mt-1">
                                                    <Badge className="bg-[#7b2cbf]/20 text-[#9d4edd] border-none text-[10px] font-bold">{exo.sets} séries</Badge>
                                                    <Badge className="bg-[#00f5d4]/10 text-[#00f5d4] border-none text-[10px] font-bold">{exo.reps} reps</Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <div className="text-center py-12 space-y-4">
                                <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center mx-auto border border-white/5"><Flame className="text-gray-600" size={32}/></div>
                                <h3 className="text-xl font-black text-white uppercase italic">Journée de Repos</h3>
                                <Button asChild className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-black uppercase rounded-xl mt-4"><Link to="/create-workout"><Plus className="mr-2 h-4 w-4"/> Planifier une séance</Link></Button>
                            </div>
                        )}
                    </div>

                    {selectedDayDetail.workout && (
                         <div className="p-8 pt-0 flex gap-3">
                            <Button className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase py-6 rounded-2xl border border-white/10" onClick={() => setSelectedDayDetail(null)}>Fermer</Button>
                            <Button asChild className="flex-1 bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black uppercase py-6 rounded-2xl shadow-[0_0_20px_rgba(0,245,212,0.3)]"><Link to="/session"><Zap className="mr-2 h-5 w-5 fill-black"/> Lancer</Link></Button>
                         </div>
                    )}
                </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, color }) {
    const colors = { red: 'bg-red-500', purple: 'bg-[#7b2cbf]', teal: 'bg-[#00f5d4]', orange: 'bg-orange-500' };
    return (
        <motion.div whileHover={{ y: -5 }} className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 shadow-xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${colors[color]}`}></div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</p>
            <h3 className="text-3xl font-black text-white italic">{safe(value)}</h3>
            <div className={`h-1 w-12 ${colors[color]} rounded opacity-30`}></div>
        </motion.div>
    );
}
