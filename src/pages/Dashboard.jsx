import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, app } from '@/lib/firebase';
import { 
  doc, onSnapshot, updateDoc, arrayRemove, increment as firestoreIncrement, getDoc, setDoc
} from 'firebase/firestore';
import { getDatabase, ref, onValue, update } from "firebase/database";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Dumbbell, Flame, Trophy, Calendar as CalendarIcon,
  Plus, Zap, Target, Edit3, Trash2, Activity, HeartPulse, Footprints, Droplets, Minus, X, BrainCircuit, Lightbulb, ChevronLeft, ChevronRight, Utensils, Scale, Flag, GlassWater, CheckCircle2, Circle, ChefHat, Sparkles, Loader2, Clock, Layers, Link2, TrendingDown, TrendingUp, Repeat
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
    const goal = 2.5;
    const progress = Math.min(100, (current / goal) * 100);
    const [tempAmount, setTempAmount] = useState(0.25);

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
                // On n'utilise plus Math.max pour permettre le reset à 0 à minuit
                steps: isTodayData ? (Number(data.steps) || 0) : 0,
                caloriesBurned: isTodayData ? (Number(data.calories_burned) || 0) : 0,
                caloriesConsumed: isTodayData ? (Number(data.calories_consumed) || 0) : 0,
                water: isTodayData ? (Number(data.water) || 0) : 0,
                heartRate: Number(data.heart_rate) || 0,
                weight: Number(data.weight) || prev.weight,
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

  // NOUVELLE LOGIQUE DE CONFIRMATION AVEC IA
  const handleToggleMeal = async (planId, mealLogId) => {
    if (isCoachView) return;
    const plan = userProfile?.nutritionalPlans?.find(p => p.id === planId);
    if (!plan) return;
    const meal = plan.meals.find(m => m.logId === mealLogId);
    if (!meal || meal.eaten) return;

    setNutritionConfirmModal({ open: true, planId, mealLogId, data: meal, isLoading: true });

    // Vérification des macros manquantes
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
            <Link to="/session" state={{ workout: todayContent.workout }}><Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-6 px-8 rounded-xl shadow-lg transition-transform hover:scale-105"><Zap className="mr-2 h-5 w-5 fill-black" /> {safe(t('start_session'))}</Button></Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {weightStats && <WeightGoalWidget stats={weightStats} />}
                <div className="bg-[#1a1a20] p-6 rounded-3xl border-l-4 border-l-[#7b2cbf] shadow-xl flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-2"><Utensils className="text-[#7b2cbf]" size={20}/><h3 className="font-bold text-gray-200">Nutrition</h3></div><Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none">{liveStats.caloriesConsumed} Kcal</Badge></div>
                    <div className="space-y-2">
                        <Progress value={(liveStats.caloriesConsumed / (userProfile?.nutritionalGoal || 2500)) * 100} className="h-2 bg-gray-800 [&>div]:bg-[#7b2cbf]" />
                        <p className="text-[10px] text-gray-500 font-bold text-right uppercase">Objectif: {userProfile?.nutritionalGoal || 2500} Kcal</p>
                    </div>
                </div>
            </div>

            {/* INTELLIGENCE KAYBEE AVEC SÉLECTEUR DE MODE */}
            <Card className="bg-gradient-to-br from-[#1a1a20] to-[#0a0a0f] border-[#7b2cbf]/40 border-2 rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="pb-3 border-b border-white/5 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <BrainCircuit className="text-[#00f5d4] animate-pulse" size={24} />
                        <CardTitle className="text-xl font-black italic uppercase text-white tracking-tight">{safe(t('intelligence_title'))}</CardTitle>
                    </div>
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-full sm:w-auto">
                        {[
                            { id: 'accountability', icon: Target, label: 'Mindset' },
                            { id: 'training', icon: Dumbbell, label: 'Exercices' },
                            { id: 'nutrition', icon: Utensils, label: 'Nutrition' }
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => setIntelMode(m.id)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                    intelMode === m.id
                                    ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20'
                                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                <m.icon size={12} />
                                <span className="hidden xs:inline">{m.label}</span>
                            </button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    <AnimatePresence mode="wait">
                        {isIntelLoading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="py-10 flex flex-col items-center justify-center gap-4"
                            >
                                <Loader2 className="animate-spin text-[#00f5d4]" size={40} />
                                <p className="text-xs font-black text-gray-500 uppercase tracking-widest animate-pulse">L'IA analyse tes données...</p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={intelMode}
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="flex items-start gap-4"
                            >
                                <div className={`p-4 rounded-2xl bg-yellow-500/20 text-yellow-400 shrink-0`}>
                                    <Lightbulb size={28} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                                        Focus : <span className="text-white font-black">{safe(accountability.improveWidget)}</span>
                                    </h4>
                                    <p className="text-2xl font-black text-white italic leading-tight uppercase truncate sm:whitespace-normal">
                                        {safe(accountability.primaryNeed)}
                                    </p>
                                    <p className="text-gray-400 mt-2 text-sm leading-relaxed font-medium italic">
                                        "{safe(accountability.recommendation)}"
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
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
                            <motion.div key={date.toISOString()} whileHover={{ x: 5 }} onClick={() => setSelectedDayDetail({ date, ...content })} className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${isToday ? 'bg-[#7b2cbf]/20 border-[#7b2cbf] shadow-[0_0_15px_rgba(123,44,191,0.2)]' : 'bg-black/20 border-gray-800 hover:border-gray-600'}`}>
                                <div className="flex items-center w-full">
                                    <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center mr-3 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}><span className="text-[8px] font-black uppercase">{format(date, 'EEE', { locale: fr })}</span><span className="text-sm font-black">{format(date, 'd')}</span></div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-black truncate uppercase tracking-tight ${isToday ? 'text-[#00f5d4]' : 'text-gray-300'}`}>{safe(content.workout?.name) || "Repos"}</p>
                                        {content.nutritionalPlan && (
                                            <p className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1 mt-0.5"><Utensils size={10} className="text-[#00f5d4]"/> {content.nutritionalPlan.meals.length} plats prévus</p>
                                        )}
                                    </div>
                                    {(content.workout || content.nutritionalPlan) && <div className={`w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse`}></div>}
                                </div>
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

      {/* MODAL DÉTAIL JOURNÉE */}
      <Dialog open={!!selectedDayDetail} onOpenChange={() => setSelectedDayDetail(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-lg overflow-hidden p-0 shadow-2xl">
            {selectedDayDetail && (
                <div className="flex flex-col">
                    <div className="p-8 bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Target size={100} /></div>
                        <h2 className="text-3xl font-black italic uppercase text-white drop-shadow-md">{format(selectedDayDetail.date, 'EEEE d MMMM', { locale: fr })}</h2>
                        <button onClick={() => setSelectedDayDetail(null)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"><X size={24}/></button>
                    </div>

                    <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 mb-2"><Dumbbell size={16} className="text-[#9d4edd]"/><h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Entraînement</h3></div>
                            {selectedDayDetail.workout ? (
                                <>
                                    <div className="flex justify-between items-center bg-black/40 p-4 rounded-2xl border border-white/5">
                                        <p className="text-xl font-black text-white uppercase italic">{selectedDayDetail.workout.name}</p>
                                        <div className="flex gap-2">
                                            <Button size="icon" variant="ghost" onClick={() => handleEditWorkout(selectedDayDetail.workout)} className="h-10 w-10 bg-white/5 hover:bg-white/10 text-white rounded-xl"><Edit3 size={18}/></Button>
                                            <Button size="icon" variant="ghost" onClick={() => handleDeleteWorkout(selectedDayDetail.workout)} className="h-10 w-10 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl"><Trash2 size={18}/></Button>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        {(selectedDayDetail.workout.groups || (selectedDayDetail.workout.exercises?.map(ex => ({ id: Math.random(), setType: 'straight', exercises: [ex], sets: ex.sets || 3, rest: 60 }))))?.map((group, idx) => {
                                            const typeInfo = SET_TYPE_INFO[group.setType] || SET_TYPE_INFO.straight;
                                            const TypeIcon = typeInfo.icon;

                                            return (
                                                <div key={group.id || idx} className="space-y-2">
                                                    <div className="flex items-center gap-2 pl-2">
                                                        <Badge className={`${typeInfo.color} text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border-none flex items-center gap-1`}>
                                                            <TypeIcon size={10} /> {typeInfo.name}
                                                        </Badge>
                                                        {group.rest && (
                                                            <span className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1">
                                                                <Clock size={10}/> {group.rest}s repos
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="space-y-2">
                                                        {group.exercises?.map((exo, i) => (
                                                            <div key={i} className="flex items-center gap-4 p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-[#7b2cbf]/30 transition-all">
                                                                <div className="w-12 h-12 bg-gray-900 rounded-xl overflow-hidden border border-white/5 shrink-0">
                                                                    {exo.imageUrl ? <img src={exo.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/> : <Dumbbell className="w-full h-full p-3 text-gray-600"/>}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-black text-white uppercase text-sm italic truncate">{exo.name}</p>
                                                                    <div className="flex gap-3 mt-1">
                                                                        <Badge className="bg-[#7b2cbf]/20 text-[#9d4edd] border-none text-[10px] font-bold">{group.sets || exo.sets || 3} séries</Badge>
                                                                        <Badge className="bg-[#00f5d4]/10 text-[#00f5d4] border-none text-[10px] font-bold">{exo.reps || "10-12"} reps</Badge>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : ( <div className="bg-black/20 p-6 rounded-2xl border border-dashed border-gray-800 text-center"><p className="text-xs text-gray-600 font-bold uppercase">Pas de séance prévue</p></div> )}
                        </section>

                        <section className="space-y-4">
                            <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><Utensils size={16} className="text-[#00f5d4]"/><h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Plan Nutritionnel</h3></div>{selectedDayDetail.nutritionalPlan && ( <Button size="icon" variant="ghost" onClick={() => handleDeleteNutritionPlan(selectedDayDetail.nutritionalPlan)} className="h-8 w-8 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={14}/></Button> )}</div>
                            {selectedDayDetail.nutritionalPlan ? (
                                <div className="space-y-3">
                                    {selectedDayDetail.nutritionalPlan.meals.map((meal) => (
                                        <div key={meal.logId} onClick={() => handleToggleMeal(selectedDayDetail.nutritionalPlan.id, meal.logId)} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${meal.eaten ? 'bg-[#00f5d4]/10 border-[#00f5d4]/30 opacity-60' : 'bg-black/20 border-white/5 hover:border-[#00f5d4]/30 group'}`}>
                                            <div className="w-12 h-12 bg-gray-800 rounded-xl overflow-hidden border border-white/5 shrink-0">
                                                {meal.imageUrl ? <img src={meal.imageUrl} className="w-full h-full object-cover"/> : <Utensils className="w-full h-full p-3 text-gray-600"/>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-black uppercase text-sm italic truncate ${meal.eaten ? 'text-[#00f5d4] line-through' : 'text-white'}`}>{meal.name}</p>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="text-[10px] font-black text-gray-500">{meal.calories} KCAL</span>
                                                    <span className="text-[10px] font-bold text-blue-400">P: {meal.protein}g</span>
                                                </div>
                                            </div>
                                            <div className={`p-2 rounded-full transition-colors ${meal.eaten ? 'bg-[#00f5d4] text-black' : 'bg-white/5 text-gray-600 group-hover:bg-[#00f5d4]/20 group-hover:text-[#00f5d4]'}`}>
                                                {meal.eaten ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : ( <div className="bg-black/20 p-6 rounded-2xl border border-dashed border-gray-800 text-center"><p className="text-xs text-gray-600 font-bold uppercase">Pas de plan prévu</p><Button asChild variant="ghost" className="text-[#00f5d4] text-[10px] font-black uppercase mt-2 h-8 hover:bg-[#00f5d4]/10"><Link to="/meals">Définir un plan</Link></Button></div> )}
                        </section>
                    </div>

                    <div className="p-8 pt-0 flex gap-3">
                        <Button className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase py-6 rounded-2xl border border-white/10" onClick={() => setSelectedDayDetail(null)}>Fermer</Button>
                        {selectedDayDetail.workout && ( <Button asChild className="flex-1 bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black uppercase py-6 rounded-2xl shadow-[0_0_20px_rgba(0,245,212,0.3)]"><Link to="/session" state={{ workout: selectedDayDetail.workout }}><Zap className="mr-2 h-5 w-5 fill-black"/> Lancer Séance</Link></Button> )}
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMATION NUTRITIONNELLE IA */}
      <Dialog open={nutritionConfirmModal.open} onOpenChange={(open) => !nutritionConfirmModal.isLoading && setNutritionConfirmModal(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white rounded-[2.5rem] max-w-sm p-0 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border-2 border-white/5">
            <div className="relative">
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#00f5d4]/20 to-transparent" />
                <div className="p-8 relative z-10">
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 bg-black/60 rounded-3xl border border-[#00f5d4]/30 flex items-center justify-center shadow-[0_0_30px_rgba(0,245,212,0.2)]">
                            {nutritionConfirmModal.isLoading ? <Loader2 size={40} className="text-[#00f5d4] animate-spin" /> : <ChefHat size={40} className="text-[#00f5d4]" />}
                        </div>
                    </div>

                    <div className="text-center space-y-2 mb-8">
                        <h3 className="text-2xl font-black italic uppercase tracking-tighter">Confirmation</h3>
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest px-4">
                            {nutritionConfirmModal.isLoading ? "Analyse IA en cours..." : `Ajouter "${nutritionConfirmModal.data?.name}" à ton SmartCalorie ?`}
                        </p>
                    </div>

                    {nutritionConfirmModal.isLoading ? (
                        <div className="py-12 flex flex-col items-center gap-4">
                            <Sparkles size={24} className="text-[#00f5d4] animate-pulse" />
                            <p className="text-[10px] font-black text-gray-600 uppercase animate-pulse">Calcul des macronutriments...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 mb-8">
                            <MacroBadge label="Calories" value={nutritionConfirmModal.data?.calories} unit="kcal" color="#00f5d4" />
                            <MacroBadge label="Protéines" value={nutritionConfirmModal.data?.protein} unit="g" color="#3b82f6" />
                            <MacroBadge label="Glucides" value={nutritionConfirmModal.data?.carbs} unit="g" color="#f59e0b" />
                            <MacroBadge label="Lipides" value={nutritionConfirmModal.data?.fats || nutritionConfirmModal.data?.fat} unit="g" color="#ef4444" />
                            <MacroBadge label="Fibres" value={nutritionConfirmModal.data?.fiber} unit="g" color="#10b981" />
                            <MacroBadge label="Sucre" value={nutritionConfirmModal.data?.sugar} unit="g" color="#ec4899" />
                        </div>
                    )}

                    <div className="space-y-3">
                        <Button disabled={nutritionConfirmModal.isLoading} onClick={confirmMealConsumption} className="w-full bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black h-16 rounded-2xl shadow-[0_0_30px_rgba(0,245,212,0.2)] text-lg transition-all active:scale-95">
                            CONFIRMER LE REPAS
                        </Button>
                        <Button disabled={nutritionConfirmModal.isLoading} variant="ghost" onClick={() => setNutritionConfirmModal({ open: false, planId: null, mealLogId: null, data: null, isLoading: false })} className="w-full text-gray-500 font-bold uppercase text-[10px] tracking-widest h-10">
                            ANNULER
                        </Button>
                    </div>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MacroBadge({ label, value, unit, color }) {
    return (
        <div className="bg-black/40 p-3 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
            <p className="text-[8px] font-black text-gray-500 uppercase mb-1 tracking-tighter">{label}</p>
            <p className="text-sm font-black italic" style={{ color }}>{value || 0} <span className="text-[8px] opacity-50">{unit}</span></p>
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
