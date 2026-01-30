import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, app } from '@/lib/firebase';
import { 
  doc, getDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc, updateDoc, arrayUnion, increment, setDoc
} from 'firebase/firestore';
import { getDatabase, ref, onValue, set, update } from "firebase/database";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Dumbbell, Flame, Trophy, TrendingUp, Calendar as CalendarIcon,
  ArrowRight, Plus, Zap, Target, Clock, Users, Edit3, MapPin, UserPlus, Trash2, ChefHat, Activity, AlertTriangle, CreditCard, RefreshCw, CheckCircle, Utensils, HeartPulse, Footprints, Droplets, Minus, X, BrainCircuit, Lightbulb, Info, Target as TargetIcon, ArrowDownCircle, ArrowUpCircle, Beef, ChevronLeft, ChevronRight, Apple
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import SmartCalorieWidget from '@/components/SmartCalorieWidget';
import { startOfWeek, addWeeks, subWeeks, format, isSameDay, parseISO, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateDailyAccountability } from '@/lib/geminiadvice';

// --- IMPORTS NATIFS & PLUGINS ---
import { Capacitor } from '@capacitor/core';
import { Motion } from '@capacitor/motion';
import { WearConnectivity } from '@/lib/wear'; // Assure-toi que ce fichier exporte bien ton plugin

const safe = (val) => (val === null || val === undefined || typeof val === 'object' ? "" : String(val));
const getTodayString = () => new Date().toISOString().split('T')[0];

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const clientContext = useClient();
  const currentUser = auth?.currentUser;
  const { isCoachView, targetUserId } = clientContext || {};
  
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDayDetail, setSelectedDayDetail] = useState(null);
  const [hasPendingInvoices, setHasPendingInvoices] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Intelligence dynamique
  const [intelMode, setIntelMode] = useState("accountability");
  const [isIntelLoading, setIsIntelLoading] = useState(false);
  const [accountability, setAccountability] = useState({
      status: "warning",
      primaryNeed: "ANALYSE...",
      recommendation: "L'IA Kaybee étudie tes données...",
      improveWidget: "Chargement"
  });

  const [liveStats, setLiveStats] = useState({
      steps: 0, caloriesBurned: 0, caloriesConsumed: 0, water: 0, heartRate: 0, points: 0,
      macros: { protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, meals: [] }
  });

  const lastWatchUpdate = useRef(0);
  const rtdb = getDatabase(app);

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

  // --- 1. INITIALISATION DU COMPTEUR NATIF & JUMELAGE MONTRE ---
  useEffect(() => {
    if (currentUser?.uid && !isCoachView) {
        try {
            console.log("Configuration des périphériques pour :", currentUser.uid);

            // 1. Configurer le TÉLÉPHONE (Mode Fallback)
            // Permet au téléphone de compter les pas si la montre est absente
            WearConnectivity.setUserId({ userId: currentUser.uid });

            // 2. Configurer la MONTRE (Jumelage)
            // Envoie l'ID utilisateur à la montre via Bluetooth pour qu'elle puisse écrire dans Firebase
            WearConnectivity.pairWatch({ userId: currentUser.uid })
                .then(() => console.log("Demande de jumelage envoyée à la montre"))
                .catch(err => console.warn("La montre n'est peut-être pas à portée pour le jumelage immédiat:", err));

        } catch (error) {
            console.error("Erreur activation Native Plugin:", error);
        }
    }
  }, [currentUser, isCoachView]);

  useEffect(() => {
    if (!currentUser) return;
    const targetId = targetUserId || currentUser.uid;

    const initData = async () => {
        try {
            const profileSnap = await getDoc(doc(db, "users", targetId));
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                const today = getTodayString();

                if (data.lastActiveDate && data.lastActiveDate !== today && !isCoachView) {
                    const historyRef = doc(db, "users", targetId, "nutrition_history", data.lastActiveDate);
                    const historySnap = await getDoc(historyRef);

                    if (!historySnap.exists()) {
                        await setDoc(historyRef, {
                            calories: data.dailyCalories || 0,
                            steps: data.dailySteps || 0,
                            water: data.dailyWater || 0,
                            burned: data.dailyBurnedCalories || 0,
                            protein: liveStats.macros?.protein || 0,
                            carbs: liveStats.macros?.carbs || 0,
                            fats: liveStats.macros?.fats || 0,
                            fiber: liveStats.macros?.fiber || 0,
                            sugar: liveStats.macros?.sugar || 0,
                            meals: liveStats.macros?.meals || [],
                            date: data.lastActiveDate,
                            timestamp: Date.now()
                        });
                    }

                    const updates = {
                        dailySteps: 0,
                        dailyBurnedCalories: 0,
                        dailyCalories: 0,
                        dailyWater: 0,
                        lastActiveDate: today
                    };
                    await updateDoc(doc(db, "users", targetId), updates);

                    await update(ref(rtdb, `users/${targetId}/live_data`), {
                        steps: 0,
                        calories_burned: 0,
                        calories_consumed: 0,
                        water: 0,
                        date: today,
                        nutrition: {
                            protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, calories: 0, meals: [], date: today, timestamp: Date.now()
                        }
                    });

                    setUserProfile({ ...data, ...updates });
                    setLiveStats(prev => ({ ...prev, steps: 0, caloriesBurned: 0, caloriesConsumed: 0, water: 0 }));
                } else {
                    setUserProfile(data);
                    setLiveStats(prev => ({
                        ...prev,
                        steps: Number(data.dailySteps) || 0,
                        caloriesBurned: Number(data.dailyBurnedCalories) || 0,
                        caloriesConsumed: Number(data.dailyCalories) || 0,
                        water: Number(data.dailyWater) || 0,
                        points: Number(data.points) || 0
                    }));
                }
                fetchIntel(data, liveStats, intelMode);
            }
            if (!isCoachView) {
                const invQ = query(collection(db, "invoices"), where("clientId", "==", targetId), where("status", "==", "pending"));
                const invSnap = await getDocs(invQ);
                setHasPendingInvoices(!invSnap.empty);
            }
        } catch(e) { console.error(e); } finally { setLoading(false); }
    };
    initData();

    // --- ÉCOUTE DE FIREBASE POUR L'AFFICHAGE ---
    const unsubscribe = onValue(ref(rtdb, `users/${targetId}/live_data`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const today = getTodayString();

            if (data.date && data.date !== today && !isCoachView) {
                initData();
                return;
            }

            if (data.source === 'watch') lastWatchUpdate.current = Date.now();
            
            // C'est ICI que les chiffres arrivent dans tes widgets
            setLiveStats(prev => ({
                ...prev,
                // Priorité à la montre, sinon on prend le max (pour inclure le téléphone)
                steps: data.source === 'watch' ? Number(data.steps) : Math.max(prev.steps, Number(data.steps) || 0),
                caloriesBurned: data.source === 'watch' ? Number(data.calories_burned) : Math.max(prev.caloriesBurned, Number(data.calories_burned) || 0),
                caloriesConsumed: Number(data.calories_consumed) || 0,
                water: Number(data.water) || 0,
                heartRate: Number(data.heart_rate) || 0, // 0 si téléphone seul (géré par le code Java)
                macros: data.nutrition || prev.macros
            }));

            if (!data.date && !isCoachView) {
                update(ref(rtdb, `users/${targetId}/live_data`), { date: today });
            }
        }
    });
    return () => unsubscribe();
  }, [currentUser, targetUserId]);

  useEffect(() => {
      if (userProfile) fetchIntel(userProfile, liveStats, intelMode);
  }, [intelMode, i18n.language]);

  const handleAddWater = async (amountML) => {
    if (!currentUser || isCoachView) return;
    const newTotal = Math.max(0, liveStats.water + amountML);
    update(ref(rtdb, `users/${currentUser.uid}/live_data`), { water: newTotal });
    await updateDoc(doc(db, "users", currentUser.uid), { dailyWater: newTotal, lastActiveDate: getTodayString() });
  };

  const getDayContent = (date) => {
    const workout = userProfile?.workouts?.find(w =>
        w.scheduledDays?.some(d => isSameDay(typeof d === 'string' ? parseISO(d) : new Date(d), date)) ||
        w.scheduledDays?.includes(format(date, 'EEEE', { locale: fr }))
    );
    const plan = userProfile?.nutritionalPlans?.find(p =>
        p.scheduledDays?.some(d => isSameDay(typeof d === 'string' ? parseISO(d) : new Date(d), date)) ||
        p.scheduledDays?.includes(format(date, 'EEEE', { locale: fr }))
    );
    return { workout, plan, meals: plan?.meals || [] };
  };

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{safe(t('loading'))}</div>;

  const currentWeight = Number(userProfile?.weight) || 0;
  const targetWeight = Number(userProfile?.targetWeight) || 0;
  const weightDiff = targetWeight - currentWeight;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-8 rounded-3xl border border-[#7b2cbf]/20 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase">
            {safe(t('welcome'))} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">{safe(userProfile?.firstName?.toUpperCase())}</span>
          </h1>
          <p className="text-gray-400 mt-2 text-lg">Prêt à exploser les records aujourd'hui ?</p>
        </div>
        <div className="flex gap-2 relative z-10">
            {hasPendingInvoices && !isCoachView && (
                <Link to="/my-coach"><Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold animate-pulse shadow-lg"><CreditCard className="mr-2 h-4 w-4"/> {safe(t('pending_payments'))}</Button></Link>
            )}
            {!isCoachView && (
                <Link to="/session"><Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-6 px-8 rounded-xl shadow-lg transition-transform hover:scale-105"><Zap className="mr-2 h-5 w-5 fill-black" /> {safe(t('start_session'))}</Button></Link>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* WIDGET POIDS */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#00f5d4] shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00f5d4]/5 rounded-full blur-3xl"></div>
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-2"><Target className="text-[#00f5d4]" size={20}/><h3 className="font-bold text-gray-200">{safe(t('weight'))}</h3></div><Badge className={`border-none ${weightDiff < 0 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{Math.abs(weightDiff).toFixed(1)} {safe(userProfile?.weightUnit)}</Badge></div>
                    <div className="flex items-end justify-between"><div><p className="text-4xl font-black text-white">{currentWeight}</p><span className="text-xs text-gray-500 uppercase font-bold">{safe(t('current'))}</span></div><div className="text-right"><p className="text-4xl font-black text-[#00f5d4]">{targetWeight}</p><span className="text-xs text-gray-500 uppercase font-bold">{safe(t('target'))}</span></div></div>
                </div>
                {/* WIDGET NUTRITION */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#7b2cbf] shadow-xl">
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-2"><Utensils className="text-[#7b2cbf]" size={20}/><h3 className="font-bold text-gray-200">Nutrition</h3></div><Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none">{liveStats.caloriesConsumed} Kcal</Badge></div>
                    <Progress value={(liveStats.caloriesConsumed / 2500) * 100} className="h-2 bg-gray-800 [&>div]:bg-[#7b2cbf]" />
                </div>
            </div>

            <Card className="bg-gradient-to-br from-[#1a1a20] to-[#0a0a0f] border-[#7b2cbf]/40 border-2 rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-700">
                <CardHeader className="pb-3 border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3"><BrainCircuit className="text-[#00f5d4] animate-pulse" size={24} /><CardTitle className="text-xl font-black italic uppercase text-white tracking-tight">{safe(t('intelligence_title'))}</CardTitle></div>
                    <Select value={intelMode} onValueChange={setIntelMode}>
                        <SelectTrigger className="w-40 bg-[#1a1a20] border-gray-800 text-xs font-black text-white rounded-xl h-9 uppercase"> <SelectValue placeholder="Profil" /> </SelectTrigger>
                        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
                            <SelectItem value="accountability" className="uppercase text-[10px] font-black">{safe(t('mode_accountability'))}</SelectItem>
                            <SelectItem value="nutrition" className="uppercase text-[10px] font-black">{safe(t('mode_nutrition'))}</SelectItem>
                            <SelectItem value="training" className="uppercase text-[10px] font-black">{safe(t('mode_training'))}</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-4 rounded-2xl ${isIntelLoading ? 'animate-pulse' : ''} ${accountability.status === 'critical' ? 'bg-red-500/20 text-red-400' : (accountability.status === 'success' ? 'bg-[#00f5d4]/20 text-[#00f5d4]' : 'bg-yellow-500/20 text-yellow-400')}`}><Lightbulb size={28} /></div>
                        <div className="flex-1">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{safe(t('focus_label'))} : <span className="text-white font-black">{safe(accountability.improveWidget)}</span></h4>
                            <p className="text-2xl font-black text-white italic leading-tight uppercase">{safe(accountability.primaryNeed)}</p>
                            <p className={`text-gray-400 mt-2 text-sm leading-relaxed font-medium italic ${isIntelLoading ? 'opacity-30' : ''}`}>"{safe(accountability.recommendation)}"</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* WIDGET CALORIES BRÛLÉES (Connecté à liveStats.caloriesBurned) */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-3xl group-hover:bg-yellow-500/10 transition-colors"></div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Calories Brûlées (⌚)</p>
                        <h3 className="text-3xl font-black text-white">{Math.floor((Number(userProfile?.nutritionalGoal) || 2000) + liveStats.caloriesBurned)} <span className="text-sm font-normal text-gray-500 ml-2">KCAL</span></h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Base: {userProfile?.nutritionalGoal || 2000} + Activité: {Math.floor(liveStats.caloriesBurned)}</p>
                    </div>
                    <Flame className="text-yellow-500 w-10 h-10 group-hover:scale-110 transition-transform relative z-10" />
                </div>
                
                {/* WIDGET POULS (Connecté à liveStats.heartRate) */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors"></div>
                    <div className="relative z-10"><p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Pouls en Direct (⌚)</p><h3 className="text-3xl font-black text-white">{liveStats.heartRate > 0 ? liveStats.heartRate : "--"} <span className="text-sm font-normal text-gray-500">BPM</span></h3></div>
                    <HeartPulse className={`text-blue-500 w-10 h-10 ${liveStats.heartRate > 0 ? 'animate-pulse' : 'opacity-20'} relative z-10`} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* WIDGET PAS (Connecté à liveStats.steps) */}
                <Card className="bg-[#1a1a20] border-gray-800 shadow-xl"><CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest"><Footprints className="text-[#7b2cbf]"/> {safe(t('steps'))}</CardTitle></CardHeader>
                    <CardContent><h3 className="text-4xl font-black text-white tracking-tighter mb-2">{liveStats.steps.toLocaleString()}</h3><Progress value={(liveStats.steps / 10000) * 100} className="h-2 bg-gray-800 [&>div]:bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]" /></CardContent>
                </Card>
                <Card className="bg-[#1a1a20] border-gray-800 shadow-xl"><CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest"><Droplets className="text-blue-500"/> {safe(t('hydration'))}</CardTitle></CardHeader>
                    <CardContent><div className="flex items-center justify-between"><Button size="icon" variant="outline" onClick={() => handleAddWater(-0.25)} className="h-8 w-8 border-gray-700 bg-gray-800 text-white"><Minus size={16}/></Button><h3 className="text-3xl font-black text-white">{liveStats.water.toFixed(2)} L</h3><Button size="icon" variant="outline" onClick={() => handleAddWater(0.25)} className="h-8 w-8 border-gray-700 bg-gray-800 text-white"><Plus size={16}/></Button></div></CardContent>
                </Card>
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
                            <div key={date.toISOString()} onClick={() => setSelectedDayDetail({ date, ...content })} className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${isToday ? 'bg-[#7b2cbf]/10 border-[#7b2cbf]' : 'bg-black/20 border-gray-800'}`}>
                                <div className={`w-10 h-10 rounded-md flex flex-col items-center justify-center mr-3 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}><span className="text-[8px] font-black uppercase">{format(date, 'EEE', { locale: fr })}</span><span className="text-sm font-black">{format(date, 'd')}</span></div>
                                <p className={`text-xs font-bold truncate flex-1 ${isToday ? 'text-white' : 'text-gray-400'}`}>{safe(content.workout?.name) || "Repos"}</p>
                                {content.workout && <div className={`w-1.5 h-1.5 rounded-full bg-[#00f5d4]`}></div>}
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <StatCard label={safe(t('points')).toUpperCase()} value={liveStats.points} color="red" /><StatCard label={safe(t('workouts')).toUpperCase()} value={userProfile?.history?.filter(h => h.type === 'workout').length || 0} color="purple" /><StatCard label={safe(t('challenges')).toUpperCase()} value={userProfile?.challengesCompleted?.length || 0} color="teal" /><StatCard label={safe(t('target')).toUpperCase()} value={`${safe(userProfile?.targetWeight)}kg`} color="orange" />
            </div>
        </div>
      </div>

      <Dialog open={!!selectedDayDetail} onOpenChange={() => setSelectedDayDetail(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-2xl overflow-hidden p-0">
            {selectedDayDetail && (
                <div className="flex flex-col">
                    <div className="p-6 bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] relative"><h2 className="text-2xl font-black italic uppercase text-white">{format(selectedDayDetail.date, 'EEEE d MMMM', { locale: fr })}</h2><button onClick={() => setSelectedDayDetail(null)} className="absolute top-6 right-6 text-white/50"><X size={24}/></button></div>
                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <section className="bg-black/20 p-4 rounded-2xl border border-white/5">
                            <h3 className="text-sm font-black text-[#9d4edd] uppercase mb-4">Entraînement : {safe(selectedDayDetail.workout?.name) || "Repos"}</h3>
                            {selectedDayDetail.workout?.exercises?.map((exo, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 bg-black/40 rounded-xl mb-2 border border-white/5 group">
                                    <div className="w-10 h-10 bg-gray-800 rounded-lg overflow-hidden"><img src={exo.imageUrl} className="w-full h-full object-cover opacity-60"/></div>
                                    <p className="font-bold text-sm">{safe(exo.name)} ({safe(exo.sets)}x{safe(exo.reps)})</p>
                                </div>
                            ))}
                        </section>
                    </div>
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
        <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 shadow-xl">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</p>
            <h3 className="text-3xl font-black text-white">{safe(value)}</h3>
            <div className={`h-1.5 w-12 ${colors[color]} rounded`}></div>
        </div>
    );
}