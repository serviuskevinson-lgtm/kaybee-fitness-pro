import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, app } from '@/lib/firebase';
import { 
  doc, onSnapshot, updateDoc, arrayRemove, increment as firestoreIncrement, getDoc, setDoc, deleteField
} from 'firebase/firestore';
import { getDatabase, ref, onValue, update } from "firebase/database";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Dumbbell, Flame, Trophy, Calendar as CalendarIcon,
  Plus, Zap, Target, Edit3, Trash2, Activity, HeartPulse, Footprints, Droplets, Minus, X, BrainCircuit, Lightbulb, ChevronLeft, ChevronRight, Utensils, Scale, Flag, GlassWater, CheckCircle2, Circle, ChefHat, Sparkles, Loader2, Clock, Layers, Link2, TrendingDown, TrendingUp, Repeat, Moon, Thermometer, Brain
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import SmartCalorieWidget from '@/components/SmartCalorieWidget';
import { startOfWeek, addWeeks, subWeeks, format, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateDailyAccountability } from '@/lib/geminiadvice';
import { getNutritionalInfoForMeal } from '@/lib/geminicalcul'; // Import IA
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
        <div className="bg-[#1a1a20] p-4 sm:p-6 rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden group h-full">
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

                <div className="grid grid-cols-3 gap-1 items-center">
                    <div className="text-center">
                        <p className="text-[8px] font-bold text-gray-500 uppercase">Départ</p>
                        <p className="text-base sm:text-lg font-black text-gray-400">{stats.initialWeight} <span className="text-[8px]">LBS</span></p>
                    </div>
                    <div className="flex flex-col items-center">
                        <Badge className={`text-[7px] sm:text-[8px] font-black ${diffInitial <= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {diffInitial > 0 ? '+' : ''}{diffInitial.toFixed(1)}
                        </Badge>
                        <div className="w-full h-[1px] bg-gray-800 my-1 relative">
                            <ChevronRight size={10} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-600" />
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-[8px] font-bold text-[#fdcb6e] uppercase">Actuel</p>
                        <p className="text-xl sm:text-2xl font-black text-white">{stats.weight} <span className="text-[8px]">LBS</span></p>
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
    const goal = 2.5;
    const progress = Math.min(100, (current / goal) * 100);
    const [tempAmount, setTempAmount] = useState(0.25);

    return (
        <div className="bg-[#1a1a20] p-4 sm:p-6 rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden group h-full">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Droplets size={60} className="text-blue-500" />
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hydratation</p>
                        <h3 className="text-xl font-black text-white italic uppercase">Quotidienne</h3>
                    </div>
                    <Badge className="bg-blue-500/20 text-blue-400 font-black text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full border-none">
                        {Math.round(progress)}% DU BUT
                    </Badge>
                </div>

                <div className="flex flex-col items-center justify-center py-2">
                    <div className="text-center">
                        <p className="text-3xl sm:text-4xl font-black text-white tracking-tighter">{current.toFixed(2)} <span className="text-base sm:text-lg text-gray-500">L</span></p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Objectif: {goal}L</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <Progress value={progress} className="h-2.5 sm:h-3 bg-gray-900 [&>div]:bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" />

                    {!isCoachView && (
                        <div className="flex items-center gap-2 pt-1">
                            <div className="flex items-center bg-black/40 rounded-xl border border-gray-800 p-1 flex-1 justify-between">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setTempAmount(prev => Math.max(0.05, prev - 0.05))}>
                                    <Minus size={14} />
                                </Button>
                                <span className="text-[10px] font-black text-blue-400">{(tempAmount * 1000).toFixed(0)} ml</span>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setTempAmount(prev => prev + 0.05)}>
                                    <Plus size={14} />
                                </Button>
                            </div>
                            <Button
                                onClick={() => onAdd(tempAmount)}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-black text-[9px] sm:text-[10px] uppercase h-10 px-3 sm:px-4 rounded-xl shadow-lg shadow-blue-900/20 transition-transform active:scale-95"
                            >
                                <GlassWater size={14} className="mr-1" /> AJOUTER
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

  // État pour la confirmation nutritionnelle IA
  const [nutritionConfirmModal, setNutritionConfirmModal] = useState({
    open: false,
    planId: null,
    mealLogId: null,
    data: null,
    isLoading: false
  });

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
      sleep: "--", temp: "--", mindful: "--",
      macros: { protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, meals: [], calories: 0 }
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
            if (!isCoachView) {
                NotificationManager.scheduleStepReminders();
            }
        }
    });

    const unsubRTDB = onValue(ref(rtdb, `users/${targetId}/live_data`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const today = getTodayString();
            const firebaseDate = data.date || "";
            const isTodayData = firebaseDate === today;

            setLiveStats(prev => ({
                ...prev,
                steps: isTodayData ? (Number(data.steps) || 0) : 0,
                caloriesBurned: isTodayData ? (Number(data.calories_burned) || 0) : 0,
                caloriesConsumed: isTodayData ? (Number(data.calories_consumed) || 0) : 0,
                water: isTodayData ? (Number(data.water) || 0) : 0,
                heartRate: Number(data.heart_rate) || 0,
                weight: Number(data.weight) || prev.weight,
                sleep: data.sleep_duration || "--",
                temp: data.skin_temp || "--",
                mindful: data.mindful_minutes || "--",
                macros: isTodayData ? (data.nutrition || prev.macros) : { protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, meals: [], calories: 0 }
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

  const handleEditWorkout = (workout) => {
      navigate('/exercises');
  };

  const handleDeleteWorkout = async (workout) => {
    if (!currentUser || !window.confirm("Supprimer cette séance de votre agenda ?")) return;
    try {
        const dateKey = `Exercise-${format(selectedDayDetail.date, 'MM-dd-yyyy')}`;
        const userRef = doc(db, "users", targetUserId || currentUser.uid);
        await updateDoc(userRef, { [dateKey]: deleteField() });
        setSelectedDayDetail(null);
    } catch (e) { console.error(e); }
  };

  const handleDeleteNutritionPlan = async (plan) => {
    if (!currentUser || !window.confirm("Supprimer ce plan nutritionnel ?")) return;
    try {
        const userRef = doc(db, "users", targetUserId || currentUser.uid);
        await updateDoc(userRef, { nutritionalPlans: arrayRemove(plan) });
        setSelectedDayDetail(null);
    } catch (e) { console.error(e); }
  };

  const handleToggleMeal = async (planId, mealLogId) => {
    if (isCoachView) return;
    const plan = userProfile?.nutritionalPlans?.find(p => p.id === planId);
    if (!plan) return;
    const meal = plan.meals.find(m => m.logId === mealLogId);
    if (!meal || meal.eaten) return;

    setNutritionConfirmModal({ open: true, planId, mealLogId, data: meal, isLoading: true });

    const hasAllMacros = meal.calories && meal.protein && meal.carbs && (meal.fat || meal.fats) && meal.fiber && meal.sugar;

    if (!hasAllMacros) {
        try {
            const aiRes = await getNutritionalInfoForMeal(meal.name, meal.ingredients || []);
            if (aiRes.success) {
                setNutritionConfirmModal(prev => ({ ...prev, data: { ...prev.data, ...aiRes.data }, isLoading: false }));
                return;
            }
        } catch (e) { console.error(e); }
    }
    setNutritionConfirmModal(prev => ({ ...prev, isLoading: false }));
  };

  const confirmMealConsumption = async () => {
    const { planId, mealLogId, data: meal } = nutritionConfirmModal;
    if (!meal) return;

    try {
        const today = getTodayString();
        const userRef = doc(db, "users", currentUser.uid);
        const historyRef = doc(db, "users", currentUser.uid, "nutrition_history", today);
        const rtdbLiveRef = ref(rtdb, `users/${currentUser.uid}/live_data`);

        const updatedPlans = userProfile.nutritionalPlans.map(p => {
            if (p.id === planId) {
                return { ...p, meals: p.meals.map(m => m.logId === mealLogId ? { ...m, ...meal, eaten: true } : m) };
            }
            return p;
        });
        await updateDoc(userRef, { nutritionalPlans: updatedPlans });

        const mealToSave = {
            id: Date.now().toString(),
            name: meal.name,
            calories: Number(meal.calories) || 0,
            protein: Number(meal.protein) || 0,
            carbs: Number(meal.carbs) || 0,
            fats: Number(meal.fat) || Number(meal.fats) || Number(meal.fat) || 0,
            fiber: Number(meal.fiber) || 0,
            sugar: Number(meal.sugar) || 0,
            timestamp: Date.now()
        };

        const historySnap = await getDoc(historyRef);
        const historyData = historySnap.data() || {
            calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, meals: [], date: today
        };

        const updatedMacros = {
            calories: (Number(historyData.calories) || 0) + mealToSave.calories,
            protein: (Number(historyData.protein) || 0) + mealToSave.protein,
            carbs: (Number(historyData.carbs) || 0) + mealToSave.carbs,
            fats: (Number(historyData.fats) || 0) + mealToSave.fats,
            fiber: (Number(historyData.fiber) || 0) + mealToSave.fiber,
            sugar: (Number(historyData.sugar) || 0) + mealToSave.sugar,
            meals: [...(historyData.meals || []), mealToSave],
            date: today,
            timestamp: Date.now()
        };

        await setDoc(historyRef, updatedMacros);
        await update(rtdbLiveRef, {
            calories_consumed: (Number(liveStats.macros.calories) || 0) + mealToSave.calories,
            nutrition: updatedMacros
        });

        setNutritionConfirmModal({ open: false, planId: null, mealLogId: null, data: null, isLoading: false });
        setSelectedDayDetail(prev => ({
            ...prev,
            nutritionalPlan: updatedPlans.find(p => p.id === planId)
        }));

    } catch (e) { console.error("Erreur save meal:", e); }
  };

  const getDayContent = (date) => {
    const dateKey = `Exercise-${format(date, 'MM-dd-yyyy')}`;
    const workout = userProfile?.[dateKey] || null;

    const nutritionalPlan = userProfile?.nutritionalPlans?.find(p =>
        p.scheduledDays?.some(d => isSameDay(typeof d === 'string' ? parseISO(d) : new Date(d), date))
    );
    return { workout, nutritionalPlan };
  };

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{safe(t('loading'))}</div>;

  const stepsGoal = 10000;
  const stepsProgress = Math.min(100, (liveStats.steps / stepsGoal) * 100);

  const todayContent = getDayContent(new Date());

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500 pb-24 p-3 sm:p-4 max-w-full overflow-x-hidden">
      {/* Header Widget Compact Mobile */}
      <div className="bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-5 sm:p-6 rounded-3xl border border-[#7b2cbf]/20 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-black text-white italic tracking-tighter uppercase truncate">
            {safe(t('welcome'))} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">{safe(userProfile?.firstName?.toUpperCase())}</span>
          </h1>
        </div>
        {!isCoachView && todayContent.workout && (
            <div className="mt-4">
                <Link to="/session" state={{ workout: todayContent.workout }}><Button className="w-full bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-4 rounded-xl shadow-lg transition-transform active:scale-95 text-sm"><Zap className="mr-2 h-4 w-4 fill-black" /> {safe(t('start_session'))}</Button></Link>
            </div>
        )}
      </div>

      <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 gap-4">
                {weightStats && <WeightGoalWidget stats={weightStats} />}
                <div className="bg-[#1a1a20] p-4 sm:p-5 rounded-3xl border-l-4 border-l-[#7b2cbf] shadow-xl flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-3"><div className="flex items-center gap-2"><Utensils className="text-[#7b2cbf]" size={14}/><h3 className="text-[10px] sm:text-xs font-bold text-gray-200 uppercase">Nutrition</h3></div><Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none text-[9px] sm:text-[10px]">{liveStats.caloriesConsumed} Kcal</Badge></div>
                    <div className="space-y-2">
                        <Progress value={(liveStats.caloriesConsumed / (userProfile?.nutritionalGoal || 2500)) * 100} className="h-2 bg-gray-800 [&>div]:bg-[#7b2cbf]" />
                    </div>
                </div>
            </div>

            {/* INTELLIGENCE KAYBEE COMPACT */}
            <Card className="bg-gradient-to-br from-[#1a1a20] to-[#0a0a0f] border-[#7b2cbf]/40 border-2 rounded-[2rem] overflow-hidden shadow-2xl">
                <CardHeader className="p-4 border-b border-white/5 bg-white/5 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="text-[#00f5d4] animate-pulse" size={20} />
                        <CardTitle className="text-sm sm:text-md font-black italic uppercase text-white">{safe(t('intelligence_title'))}</CardTitle>
                    </div>
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-full">
                        {['accountability', 'training', 'nutrition'].map(m => (
                            <button key={m} onClick={() => setIntelMode(m)} className={`flex-1 py-1.5 rounded-lg text-[8px] sm:text-[9px] font-black uppercase transition-all ${intelMode === m ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20' : 'text-gray-500'}`}>{m === 'accountability' ? 'Mind' : m}</button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <AnimatePresence mode="wait">
                        {isIntelLoading ? (
                            <div className="py-6 flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-[#00f5d4]" size={24} /></div>
                        ) : (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                                <p className="text-base sm:text-lg font-black text-white italic leading-tight uppercase">{safe(accountability.primaryNeed)}</p>
                                <p className="text-gray-400 text-[10px] sm:text-xs leading-relaxed font-medium italic">"{safe(accountability.recommendation)}"</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-[#1a1a20] p-3 sm:p-4 rounded-2xl border border-gray-800 shadow-xl"><p className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Calories (⌚)</p><h3 className="text-lg sm:text-xl font-black text-white">{Math.floor((Number(userProfile?.nutritionalGoal) || 2000) + liveStats.caloriesBurned)}</h3></div>
                <div className="bg-[#1a1a20] p-3 sm:p-4 rounded-2xl border border-gray-800 shadow-xl"><p className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-1">Pouls (⌚)</p><h3 className="text-lg sm:text-xl font-black text-white">{liveStats.heartRate > 0 ? liveStats.heartRate : "--"} <span className="text-[10px]">BPM</span></h3></div>
            </div>

            <Card className="bg-[#1a1a20] border-gray-800 shadow-xl overflow-hidden relative"><CardHeader className="p-4 pb-2"><CardTitle className="text-white flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest"><Footprints className="text-[#7b2cbf]" size={14}/> Pas</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="flex justify-between items-end mb-2">
                        <h3 className="text-2xl sm:text-3xl font-black text-white">{liveStats.steps.toLocaleString()}</h3>
                        <Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none text-[9px] sm:text-[10px] font-black">{Math.round(stepsProgress)}%</Badge>
                    </div>
                    <Progress value={stepsProgress} className="h-2 bg-gray-900 [&>div]:bg-[#7b2cbf]" />
                </CardContent>
            </Card>

            {/* NEW HEALTH CONNECT WIDGETS */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1a1a20] p-3 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                    <Moon size={16} className="text-blue-400 mb-1"/>
                    <p className="text-[7px] font-bold text-gray-500 uppercase">Sommeil</p>
                    <p className="text-xs font-black text-white">{liveStats.sleep}</p>
                </div>
                <div className="bg-[#1a1a20] p-3 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                    <Thermometer size={16} className="text-red-400 mb-1"/>
                    <p className="text-[7px] font-bold text-gray-500 uppercase">Peau</p>
                    <p className="text-xs font-black text-white">{liveStats.temp}°</p>
                </div>
                <div className="bg-[#1a1a20] p-3 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                    <Brain size={16} className="text-[#00f5d4] mb-1"/>
                    <p className="text-[7px] font-bold text-gray-500 uppercase">Zen</p>
                    <p className="text-xs font-black text-white">{liveStats.mindful}m</p>
                </div>
            </div>

            <HydrationWidget current={liveStats.water} onAdd={handleAddWater} isCoachView={isCoachView} />
            <SmartCalorieWidget userProfile={userProfile} consumed={liveStats.caloriesConsumed} burned={liveStats.caloriesBurned} />

            <div className="bg-[#1a1a20] p-4 sm:p-5 rounded-3xl border border-gray-800 shadow-xl">
                <div className="flex justify-between items-center mb-4"><h3 className="text-xs sm:text-sm font-black italic text-white uppercase flex items-center gap-2"><CalendarIcon size={14} className="text-[#00f5d4]"/> Agenda</h3><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))} className="h-7 w-7 sm:h-8 sm:w-8"><ChevronLeft size={16}/></Button><Button size="icon" variant="ghost" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))} className="h-7 w-7 sm:h-8 sm:w-8"><ChevronRight size={16}/></Button></div></div>
                <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
                    {weekDays.map((date) => {
                        const content = getDayContent(date);
                        const isToday = isSameDay(date, new Date());
                        return (
                            <div key={date.toISOString()} onClick={() => setSelectedDayDetail({ date, ...content })} className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-15 sm:w-12 sm:h-16 rounded-xl border transition-all ${isToday ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white shadow-lg shadow-purple-900/40' : 'bg-black/20 border-gray-800 text-gray-500'}`}>
                                <span className="text-[7px] sm:text-[8px] font-black uppercase mb-1">{format(date, 'EEE', { locale: fr })}</span>
                                <span className="text-sm sm:text-md font-black">{format(date, 'd')}</span>
                                {(content.workout || content.nutritionalPlan) && !isToday && <div className="w-1 h-1 rounded-full bg-[#00f5d4] mt-1"></div>}
                            </div>
                        )
                    })}
                </div>
            </div>
      </div>

      {/* MODAL DÉTAIL JOURNÉE MOBILE */}
      <Dialog open={!!selectedDayDetail} onOpenChange={() => setSelectedDayDetail(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-t-[2rem] md:rounded-[2rem] max-w-full p-0 overflow-hidden shadow-2xl fixed bottom-0 md:relative">
            {selectedDayDetail && (
                <div className="flex flex-col max-h-[85vh]">
                    <div className="p-5 sm:p-6 bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] shrink-0">
                        <h2 className="text-lg sm:text-xl font-black italic uppercase text-white">{format(selectedDayDetail.date, 'EEEE d MMMM', { locale: fr })}</h2>
                    </div>

                    <div className="p-5 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        <section className="space-y-3">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Entraînement</h3>
                            {selectedDayDetail.workout ? (
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                                    <p className="font-black text-white uppercase italic text-xs sm:text-sm truncate mr-2">{selectedDayDetail.workout.name}</p>
                                    <Button size="icon" variant="ghost" onClick={() => handleDeleteWorkout(selectedDayDetail.workout)} className="text-red-500 h-8 w-8 shrink-0"><Trash2 size={16}/></Button>
                                </div>
                            ) : ( <p className="text-[10px] sm:text-xs text-gray-600 font-bold uppercase italic text-center py-2">Jour de repos</p> )}
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nutrition</h3>
                            {selectedDayDetail.nutritionalPlan ? (
                                <div className="space-y-2">
                                    {selectedDayDetail.nutritionalPlan.meals.map((meal) => (
                                        <div key={meal.logId} className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/5">
                                            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-800 rounded-lg shrink-0"></div>
                                            <div className="flex-1 min-w-0"><p className="font-black uppercase text-[10px] sm:text-xs italic text-white truncate">{meal.name}</p><p className="text-[8px] sm:text-[9px] text-gray-500">{meal.calories} KCAL</p></div>
                                        </div>
                                    ))}
                                </div>
                            ) : ( <p className="text-[10px] sm:text-xs text-gray-600 font-bold uppercase italic text-center py-2">Aucun plan</p> )}
                        </section>
                    </div>

                    <div className="p-5 sm:p-6 pt-0 flex gap-2 shrink-0">
                        <Button className="flex-1 bg-white/5 text-white font-black uppercase rounded-xl h-11 sm:h-12 text-[10px] sm:text-xs" onClick={() => setSelectedDayDetail(null)}>Fermer</Button>
                        {selectedDayDetail.workout && ( <Button asChild className="flex-[2] bg-[#00f5d4] text-black font-black uppercase rounded-xl h-11 sm:h-12 text-[10px] sm:text-xs shadow-lg shadow-[#00f5d4]/20"><Link to="/session" state={{ workout: selectedDayDetail.workout }}><Zap size={14} className="mr-2 fill-black"/> Lancer</Link></Button> )}
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMATION NUTRITIONNELLE IA MOBILE */}
      <Dialog open={nutritionConfirmModal.open} onOpenChange={(open) => !nutritionConfirmModal.isLoading && setNutritionConfirmModal(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white rounded-[2rem] max-w-[90vw] mx-auto p-5 sm:p-6 overflow-hidden border-2">
            <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#00f5d4]/10 rounded-2xl flex items-center justify-center border border-[#00f5d4]/30">
                    {nutritionConfirmModal.isLoading ? <Loader2 size={28} className="text-[#00f5d4] animate-spin" /> : <ChefHat size={28} className="text-[#00f5d4]" />}
                </div>
                <h3 className="text-lg sm:text-xl font-black italic uppercase">Confirmation</h3>

                {nutritionConfirmModal.isLoading ? (
                    <p className="text-[10px] text-gray-500 uppercase font-black animate-pulse">Analyse IA...</p>
                ) : (
                    <div className="w-full space-y-4">
                        <p className="text-[10px] sm:text-xs text-gray-400 font-bold">Ajouter "{nutritionConfirmModal.data?.name}" ?</p>
                        <div className="grid grid-cols-3 gap-2">
                            <MacroBadge label="Kcal" value={nutritionConfirmModal.data?.calories} color="#00f5d4" />
                            <MacroBadge label="Prot" value={nutritionConfirmModal.data?.protein} color="#3b82f6" />
                            <MacroBadge label="Carb" value={nutritionConfirmModal.data?.carbs} color="#f59e0b" />
                        </div>
                        <Button disabled={nutritionConfirmModal.isLoading} onClick={confirmMealConsumption} className="w-full bg-[#00f5d4] text-black font-black h-11 sm:h-12 rounded-xl text-xs sm:text-sm">CONFIRMER</Button>
                        <Button disabled={nutritionConfirmModal.isLoading} variant="ghost" onClick={() => setNutritionConfirmModal({ open: false, planId: null, mealLogId: null, data: null, isLoading: false })} className="w-full text-gray-500 font-bold uppercase text-[9px] sm:text-[10px]">ANNULER</Button>
                    </div>
                )}
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MacroBadge({ label, value, color }) {
    return (
        <div className="bg-black/40 p-1.5 sm:p-2 rounded-xl border border-white/5 flex flex-col items-center">
            <p className="text-[6px] sm:text-[7px] font-black text-gray-500 uppercase mb-0.5">{label}</p>
            <p className="text-[10px] sm:text-xs font-black italic" style={{ color }}>{value || 0}</p>
        </div>
    );
}
