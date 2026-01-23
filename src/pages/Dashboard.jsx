import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db } from '@/lib/firebase';
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
  Dumbbell, Flame, Trophy, TrendingUp, Calendar, 
  ArrowRight, Plus, Zap, Target, Clock, Users, Edit3, MapPin, UserPlus, Trash2, ChefHat, Activity, AlertTriangle, CreditCard, RefreshCw, CheckCircle, Utensils, HeartPulse, Footprints, Droplets, Minus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import SmartCalorieWidget from '@/components/SmartCalorieWidget';

// --- IMPORTS NATIFS & PLUGINS ---
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Motion } from '@capacitor/motion';

// ENREGISTREMENT DU PLUGIN MONTRE (Pont Java)
const WearConnectivity = registerPlugin('WearConnectivity');

// --- FONCTION DE SÉCURITÉ POUR LES DATES ---
const safeDate = (dateVal) => {
    try {
        if (!dateVal) return "";
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ""; }
};

// Utilitaire pour la date format YYYY-MM-DD
const getTodayString = () => new Date().toISOString().split('T')[0];

export default function Dashboard() {
  const auth = useAuth();
  const clientContext = useClient();
  const { t } = useTranslation();
  
  const currentUser = auth?.currentUser;
  const { selectedClient, isCoachView, targetUserId } = clientContext || {};
  
  // --- ÉTATS ---
  const [userProfile, setUserProfile] = useState(null);
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false); // État pour l'animation Sync

  // États Montre / Health Services
  const [watchHeartRate, setWatchHeartRate] = useState(0);

  // Nouveaux États pour les Points 7 & 8
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [todayMeals, setTodayMeals] = useState([]);

  // États Coach
  const [isRdvOpen, setIsRdvOpen] = useState(false);
  const [rdvData, setRdvData] = useState({ clientName: '', date: '', location: '', workoutId: 'none' });
  const [coachTemplates, setCoachTemplates] = useState([]);
  const [appointments, setAppointments] = useState([]);

  // État Facturation
  const [hasPendingInvoices, setHasPendingInvoices] = useState(false);

  // Modale Ajout Pas Manuel
  const [isAddStepsOpen, setIsAddStepsOpen] = useState(false);
  const [manualSteps, setManualSteps] = useState(0);

  // Stats "Live" synchronisées via RTDB
  const [liveStats, setLiveStats] = useState({
      steps: 0,
      caloriesBurned: 0,
      caloriesConsumed: 0,
      water: 0,
      heartRate: 0,
      points: 0
  });

  const rtdb = getDatabase();

  const weekDaysShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const todayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date().getDay()];

  // --- 1. SYNC & RESET LOGIC ---
  useEffect(() => {
    if (!currentUser || isCoachView) return;

    // Handshake avec la montre (UID pour RTDB)
    const setupWatch = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await WearConnectivity.sendDataToWatch({ path: "/set-user-id", data: currentUser.uid });
            } catch (e) {}
        }
    };
    setupWatch();

    const initData = async () => {
        try {
            const targetId = targetUserId || currentUser.uid;
            const profileRef = doc(db, "users", targetId);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists()) {
                const data = profileSnap.data();
                const todayStr = getTodayString();

                // --- LOGIQUE RESET MINUIT ---
                if (data.lastActiveDate && data.lastActiveDate !== todayStr) {
                    console.log("🌙 Nouveau jour : Reset...");

                    const dailyLog = {
                        id: `summary-${data.lastActiveDate}`,
                        type: 'daily_summary',
                        name: 'Résumé Quotidien',
                        date: data.lastActiveDate,
                        steps: data.dailySteps || 0,
                        calories: data.dailyBurnedCalories || 0,
                        water: data.dailyWater || 0,
                        weight: data.weight || 0
                    };

                    await updateDoc(profileRef, {
                        history: arrayUnion(dailyLog),
                        dailySteps: 0,
                        dailyBurnedCalories: 0,
                        dailyWater: 0,
                        dailyCalories: 0,
                        lastActiveDate: todayStr
                    });

                    // Reset RTDB
                    set(ref(rtdb, `users/${currentUser.uid}/live_data`), {
                        steps: 0,
                        calories_burned: 0,
                        calories_consumed: 0,
                        water: 0,
                        heart_rate: 0,
                        timestamp: Date.now()
                    });
                }

                setUserProfile(data);

                // Init Live Stats localement avec Firestore avant que RTDB ne prenne le relais
                setLiveStats(prev => ({
                    ...prev,
                    steps: data.dailySteps || 0,
                    caloriesBurned: data.dailyBurnedCalories || 0,
                    caloriesConsumed: data.dailyCalories || 0,
                    water: data.dailyWater || 0,
                    points: data.points || 0
                }));

                if(data.role === 'coach' && !targetUserId) {
                    setIsCoach(true);
                    loadCoachTemplates(currentUser.uid);
                    loadAppointments(currentUser.uid);
                }

                const workout = data.workouts?.find(w => w.scheduledDays?.includes(todayName));
                const plan = data.nutritionalPlans?.find(p => p.scheduledDays?.includes(todayName));

                setTodayWorkout(workout);
                setTodayMeals(plan?.meals || []);

                // Sync Calendar to RTDB
                syncEverythingToRTDB(data, workout, plan);
            }

            if (!isCoachView) {
                const invQ = query(collection(db, "invoices"), where("clientId", "==", targetId), where("status", "==", "pending"));
                const invSnap = await getDocs(invQ);
                setHasPendingInvoices(!invSnap.empty);
            }
        } catch(e) { console.error(e); setError(t('error')); }
        finally { setLoading(false); }
    };

    initData();

    // Setup Live Listeners (Firebase Realtime Database)
    const liveDataRef = ref(rtdb, `users/${currentUser.uid}/live_data`);
    const unsubscribe = onValue(liveDataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            console.log("⌚ Sync RTDB:", data);
            setLiveStats(prev => ({
                ...prev,
                steps: Math.max(prev.steps, data.steps || 0),
                caloriesBurned: Math.max(prev.caloriesBurned, data.calories_burned || 0),
                caloriesConsumed: data.calories_consumed || prev.caloriesConsumed,
                water: data.water || prev.water,
                heartRate: data.heart_rate || 0,
                points: data.points || prev.points
            }));
            if (data.heart_rate) setWatchHeartRate(data.heart_rate);
        }
    });

    return () => unsubscribe();
  }, [currentUser, isCoachView, targetUserId]);

  // --- 2. ACCÉLÉROMÈTRE DU TÉLÉPHONE (COMPTEUR FALLBACK) ---
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || isCoachView || !currentUser) return;

    let accX = 0, accY = 0, accZ = 0;
    const kcalPerStep = (parseFloat(userProfile?.weight) || 75) * 0.00075;

    const startCounting = async () => {
        try {
            await Motion.addListener('accel', event => {
                const { x, y, z } = event.accelerationIncludingGravity;
                const delta = Math.abs(x - accX) + Math.abs(y - accY) + Math.abs(z - accZ);

                if (delta > 15) {
                    setLiveStats(prev => {
                        const nextSteps = prev.steps + 1;
                        const nextCals = prev.caloriesBurned + kcalPerStep;

                        // On sync vers RTDB (Throttle)
                        if (nextSteps % 20 === 0) {
                            update(ref(rtdb, `users/${currentUser.uid}/live_data`), {
                                steps: nextSteps,
                                calories_burned: nextCals
                            });

                            if (nextSteps % 100 === 0) {
                                updateDoc(doc(db, "users", currentUser.uid), {
                                    dailySteps: nextSteps,
                                    dailyBurnedCalories: nextCals
                                });
                            }
                        }
                        return { ...prev, steps: nextSteps, caloriesBurned: nextCals };
                    });
                }
                accX = x; accY = y; accZ = z;
            });
        } catch (e) {}
    };

    startCounting();
    return () => { try { Motion.removeAllListeners(); } catch (e) {} };
  }, [currentUser, isCoachView, userProfile?.weight]);

  // --- FONCTION SYNC GLOBALE RTDB ---
  const syncEverythingToRTDB = async (profileData, workout, plan) => {
    if (!currentUser) return;
    setIsSyncing(true);

    const weekDaysFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const weeklySummary = weekDaysFull.map(day => {
        const w = profileData.workouts?.find(work => work.scheduledDays?.includes(day));
        return { day, workout: w ? w.name : "Repos" };
    });

    const fullData = {
        live_data: {
            steps: profileData.dailySteps || 0,
            calories_burned: profileData.dailyBurnedCalories || 0,
            calories_consumed: profileData.dailyCalories || 0,
            water: profileData.dailyWater || 0,
            points: profileData.points || 0,
            weight: profileData.weight || 0,
            target_weight: profileData.targetWeight || 0
        },
        calendar: {
            today_workout: workout ? { name: workout.name, exercises: workout.exercises || [] } : null,
            today_meals: plan?.meals || [],
            weekly_summary: weeklySummary
        },
        last_sync: Date.now()
    };

    try {
        await update(ref(rtdb, `users/${currentUser.uid}`), fullData);
        // Fallback Bluetooth pour compatibilité immédiate
        await WearConnectivity.sendDataToWatch({
            path: "/update-complex-data",
            data: JSON.stringify({ calendar: weeklySummary, health: fullData.live_data })
        });
    } catch (e) {}
    setTimeout(() => setIsSyncing(false), 800);
  };

  // --- ACTIONS ---
  const handleAddWater = async (amountML) => {
    if (!currentUser || isCoachView) return;
    try {
        const newTotal = liveStats.water + amountML;
        setLiveStats(prev => ({ ...prev, water: newTotal }));

        // RTDB Sync
        update(ref(rtdb, `users/${currentUser.uid}/live_data`), { water: newTotal });

        // Firestore Sync
        await updateDoc(doc(db, "users", currentUser.uid), { dailyWater: newTotal, lastActiveDate: getTodayString() });
    } catch (e) {}
  };

  const handleManualSteps = async () => {
    if (!currentUser || manualSteps <= 0) return;
    const kcalPerStep = (parseFloat(userProfile?.weight) || 75) * 0.00075;
    const addedBurn = manualSteps * kcalPerStep;

    const nextSteps = liveStats.steps + parseInt(manualSteps);
    const nextCals = liveStats.caloriesBurned + addedBurn;

    setLiveStats(prev => ({ ...prev, steps: nextSteps, caloriesBurned: nextCals }));

    // RTDB Sync
    update(ref(rtdb, `users/${currentUser.uid}/live_data`), { steps: nextSteps, calories_burned: nextCals });

    // Firestore Sync
    await updateDoc(doc(db, "users", currentUser.uid), {
        dailySteps: increment(manualSteps),
        dailyBurnedCalories: increment(addedBurn)
    });

    setIsAddStepsOpen(false);
    setManualSteps(0);
  };

  const handleEatMeal = async (meal) => {
      if(!meal.calories || isCoachView) return;
      const cal = parseInt(meal.calories);
      const newTotal = liveStats.caloriesConsumed + cal;

      setLiveStats(prev => ({ ...prev, caloriesConsumed: newTotal }));

      // RTDB Sync
      update(ref(rtdb, `users/${currentUser.uid}/live_data`), { calories_consumed: newTotal });

      // Firestore Sync
      await updateDoc(doc(db, "users", currentUser.uid), { dailyCalories: increment(cal) });
  };

  const loadCoachTemplates = async (uid) => {
      try {
          const q = query(collection(db, "users", uid, "templates"), orderBy("createdAt", "desc"));
          const snap = await getDocs(q);
          setCoachTemplates(snap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch(e) {}
  };

  const loadAppointments = async (uid) => {
      try {
          const q = query(collection(db, "appointments"), where("coachId", "==", uid));
          const snap = await getDocs(q);
          setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch(e) {}
  };

  // --- VARIABLES D'AFFICHAGE ---
  const getFirstName = () => userProfile?.firstName || userProfile?.first_name || "Athlète";
  const currentWeight = userProfile?.weight ? parseFloat(userProfile.weight) : 0;
  const targetWeight = parseFloat(userProfile?.targetWeight || 0);
  const weightDiff = targetWeight - currentWeight;
  const isWeightLoss = weightDiff < 0;
  const stepGoal = userProfile?.stepGoal || 10000;

  const getWorkoutForDay = (dayIndex) => {
    const dayNamesFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    return userProfile?.workouts?.find(w => w?.scheduledDays?.includes(dayNamesFull[dayIndex]));
  };

  const recentActivity = userProfile?.history?.slice(-3).reverse() || [];

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{t('loading')}</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-8 rounded-3xl border border-[#7b2cbf]/20 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-5xl font-black text-white italic tracking-tighter">
            {isCoachView ? t('dashboard').toUpperCase() : t('welcome').toUpperCase()} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">{getFirstName().toUpperCase()}</span>
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
              {isCoachView ? "Gérez les progrès et assignez les objectifs." : "Prêt à exploser les records aujourd'hui ?"}
          </p>
        </div>

        <div className="flex gap-2 relative z-10">
            <Button size="icon" variant="ghost" onClick={() => syncEverythingToRTDB(userProfile, todayWorkout, { meals: todayMeals })} className={`h-10 w-10 border border-white/10 ${isSyncing ? 'animate-spin text-[#00f5d4]' : 'text-gray-400'}`}><RefreshCw size={20}/></Button>
            {hasPendingInvoices && !isCoachView && (
                <Link to="/my-coach"><Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]"><CreditCard className="mr-2 h-4 w-4"/> {t('pending_payments')}</Button></Link>
            )}
            {!isCoachView && (
                <Link to="/session"><Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-6 px-8 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.3)] transition-transform hover:scale-105"><Zap className="mr-2 h-5 w-5 fill-black" /> {t('start_session')}</Button></Link>
            )}
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/10 to-transparent pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Poids */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#00f5d4] relative overflow-hidden group flex flex-col justify-between shadow-xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#7b2cbf]/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2"><Target className="text-[#00f5d4]" size={20}/><h3 className="font-bold text-gray-200">{t('weight')}</h3></div>
                            {userProfile?.targetWeight && (
                                <Badge className={`border-none ${isWeightLoss ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{isWeightLoss ? '-' : '+'}{Math.abs(weightDiff).toFixed(1)} {userProfile?.weightUnit || 'kg'}</Badge>
                            )}
                        </div>
                        {userProfile?.targetWeight ? (
                            <div className="flex items-end justify-between mb-2">
                                <div><p className="text-4xl font-black text-white">{currentWeight}</p><span className="text-xs text-gray-500 uppercase font-bold">{t('current')}</span></div>
                                <div className="text-right"><p className="text-4xl font-black text-[#00f5d4]">{targetWeight}</p><span className="text-xs text-gray-500 uppercase font-bold">{t('target')}</span></div>
                            </div>
                        ) : (
                            <div className="text-center py-4"><Link to="/profile"><Button variant="outline" size="sm" className="text-[#00f5d4] border-[#00f5d4]">Définir</Button></Link></div>
                        )}
                    </div>
                </div>

                {/* Nutrition DU JOUR */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#7b2cbf] flex flex-col justify-between shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2"><Utensils className="text-[#7b2cbf]" size={20}/><h3 className="font-bold text-gray-200">Nutrition</h3></div>
                        <Badge className="bg-[#7b2cbf]/20 text-[#7b2cbf] border-none">{liveStats.caloriesConsumed} Kcal</Badge>
                    </div>

                    <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                        {todayMeals.length > 0 ? todayMeals.map((meal, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-black/30 p-2 rounded-lg border border-white/5">
                                <div>
                                    <p className="text-xs font-bold text-white truncate">{meal.name}</p>
                                    <p className="text-[10px] text-gray-500">{meal.calories} kcal</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => handleEatMeal(meal)} className="h-6 w-6 text-[#00f5d4] hover:bg-[#00f5d4]/10"><CheckCircle size={14}/></Button>
                            </div>
                        )) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <p className="text-gray-500 text-sm italic mb-3">Rien de prévu.</p>
                                <Link to="/meals"><Button size="sm" className="bg-[#7b2cbf] text-white">Planifier</Button></Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* SÉANCE DU JOUR */}
            <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                    <CardTitle className="text-xl font-black italic uppercase text-white flex items-center gap-2"><Dumbbell className="text-[#7b2cbf]"/> {todayWorkout?.name || "Repos"}</CardTitle>
                    {todayWorkout && <Link to="/session"><Button size="sm" className="bg-[#00f5d4] text-black font-black text-xs h-8">LANCER</Button></Link>}
                </CardHeader>
                <CardContent className="p-4">
                    {todayWorkout ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {todayWorkout.exercises?.slice(0, 4).map((exo, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 bg-black/40 rounded-2xl border border-white/5">
                                    <div className="w-14 h-14 rounded-xl bg-gray-800 overflow-hidden"><img src={exo.imageUrl} alt="" className="w-full h-full object-cover opacity-70"/></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-white truncate">{exo.name}</p>
                                        <p className="text-[10px] text-gray-500">{exo.sets} Sets x {exo.reps} reps</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div className="py-8 text-center text-gray-500 italic uppercase font-black opacity-20 text-4xl tracking-tighter">Rest Day</div>}
                </CardContent>
            </Card>

            {/* PAS ET HYDRATATION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#1a1a20] border-gray-800 shadow-xl">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white flex justify-between items-center text-sm font-bold uppercase tracking-widest">
                            <span className="flex items-center gap-2"><Footprints className="text-[#7b2cbf]"/> Pas du jour</span>
                            <Button size="icon" variant="ghost" onClick={() => setIsAddStepsOpen(true)} className="h-6 w-6 text-[#7b2cbf]"><Plus size={14}/></Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-4xl font-black text-white">{liveStats.steps.toLocaleString()}</span>
                            <span className="text-xs text-gray-500 mb-1">Objectif: {stepGoal}</span>
                        </div>
                        <Progress value={(liveStats.steps / stepGoal) * 100} className="h-2 bg-gray-800 [&>div]:bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]" />
                    </CardContent>
                </Card>

                <Card className="bg-[#1a1a20] border-gray-800 shadow-xl">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
                            <Droplets className="text-blue-400"/> Hydratation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <Button size="icon" variant="outline" onClick={() => handleAddWater(-0.25)} className="h-8 w-8 border-gray-700 bg-gray-800 text-white"><Minus size={16}/></Button>
                            <div className="text-center">
                                <span className="text-3xl font-black text-white">{liveStats.water.toFixed(2)}</span>
                                <span className="text-sm text-gray-500 ml-1 text-blue-400 font-bold tracking-tighter">LITRES</span>
                            </div>
                            <Button size="icon" variant="outline" onClick={() => handleAddWater(0.25)} className="h-8 w-8 border-gray-700 bg-gray-800 text-white"><Plus size={16}/></Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* BRULÉES ET POULS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-3xl group-hover:bg-yellow-500/10 transition-colors"></div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Calories Brûlées (⌚)</p>
                        <h3 className="text-3xl font-black text-white">{Math.floor(liveStats.caloriesBurned)} <span className="text-sm font-normal text-gray-500">KCAL</span></h3>
                    </div>
                    <Flame className="text-yellow-500 w-10 h-10 group-hover:scale-110 transition-transform" />
                </div>

                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors"></div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Pouls en Direct (⌚)</p>
                        <h3 className="text-3xl font-black text-white">{liveStats.heartRate > 0 ? liveStats.heartRate : "--"} <span className="text-sm font-normal text-gray-500">BPM</span></h3>
                    </div>
                    <HeartPulse className={`text-blue-500 w-10 h-10 ${liveStats.heartRate > 0 ? 'animate-pulse' : 'opacity-20'}`} />
                </div>
            </div>
        </div>

        <div className="lg:col-span-1 h-full space-y-6">
            <SmartCalorieWidget
                userProfile={userProfile}
                consumed={liveStats.caloriesConsumed}
                burned={liveStats.caloriesBurned}
            />

            <div className="bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 shadow-xl flex flex-col">
                <h3 className="text-lg font-black italic text-white uppercase mb-4 flex items-center gap-2 tracking-tighter"><Calendar className="text-[#00f5d4]"/> Agenda Hebdo</h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {weekDaysShort.map((d, index) => {
                        const workout = getWorkoutForDay(index);
                        const isToday = index === new Date().getDay() - 1;
                        return (
                            <div key={d} className={`flex items-center p-2 rounded-lg border transition-all ${isToday ? 'bg-[#7b2cbf]/10 border-[#7b2cbf]' : 'bg-black/20 border-gray-800'}`}>
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black mr-2 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}>{d.substring(0, 1)}</div>
                                <p className={`text-xs font-bold truncate flex-1 ${isToday ? 'text-white' : 'text-gray-400'}`}>{workout ? workout.name : "Repos"}</p>
                                {workout && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-[#00f5d4] animate-pulse' : 'bg-gray-600'}`}></div>}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 shadow-xl">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">POINTS</p>
                    <h3 className="text-3xl font-black text-white">{liveStats.points}</h3>
                    <div className="h-1.5 w-12 bg-red-500 rounded"></div>
                </div>
                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 shadow-xl">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">SÉANCES</p>
                    <h3 className="text-3xl font-black text-white">{userProfile?.history?.filter(h => h.type === 'workout').length || 0}</h3>
                    <div className="h-1.5 w-12 bg-[#7b2cbf] rounded"></div>
                </div>
                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 shadow-xl">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">DÉFIS</p>
                    <h3 className="text-3xl font-black text-white">{userProfile?.challengesCompleted?.length || 0}</h3>
                    <div className="h-1.5 w-12 bg-[#00f5d4] rounded"></div>
                </div>
                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 shadow-xl">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">OBJECTIF</p>
                    <h3 className="text-xl font-black text-white">{targetWeight} kg</h3>
                    <div className="h-1.5 w-12 bg-orange-500 rounded"></div>
                </div>
            </div>
        </div>
      </div>

      <Dialog open={isAddStepsOpen} onOpenChange={setIsAddStepsOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader><DialogTitle>{t('add_steps')}</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <Input type="number" placeholder="Ex: 5000" className="bg-black border-gray-700 text-white font-black" value={manualSteps} onChange={(e) => setManualSteps(e.target.value)} />
          </div>
          <DialogFooter><Button onClick={handleManualSteps} className="w-full bg-[#7b2cbf] text-white font-black">{t('validate')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-[#1a1a20] rounded-3xl border border-gray-800 mx-4">
        <CardHeader><CardTitle className="text-xl font-black italic uppercase text-white">{t('history')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {recentActivity.length > 0 ? recentActivity.map((activity, idx) => (
            <ActivityItem key={idx} icon={activity.type === 'workout' ? Dumbbell : Trophy} title={activity.name} date={safeDate(activity.date)} color={activity.type === 'workout' ? "#00f5d4" : "#fdcb6e"} />
          )) : <p className="text-center text-gray-500 text-sm italic py-4">Rien à signaler pour le moment.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityItem({ icon: Icon, title, date, color }) {
  return (
    <div className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-gray-800 transition-all cursor-default group">
      <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800 group-hover:border-[#7b2cbf]/50 transition-colors"><Icon className="h-4 w-4" style={{ color }} /></div>
      <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate group-hover:text-[#00f5d4] transition-colors">{title}</p><p className="text-[10px] text-gray-500 font-bold uppercase">{date}</p></div>
    </div>
  );
}
