import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db } from '@/lib/firebase';
import { 
  doc, getDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc, updateDoc, arrayUnion, increment, setDoc
} from 'firebase/firestore';
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
  
  // État Calendrier
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modale Ajout Pas Manuel
  const [isAddStepsOpen, setIsAddStepsOpen] = useState(false);
  const [manualSteps, setManualSteps] = useState(0);

  const weekDaysShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const todayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date().getDay()];

  // --- ÉCOUTEUR DE LA MONTRE ---
  useEffect(() => {
    if (!currentUser || isCoachView || !Capacitor.isNativePlatform()) return;

    let healthListener;
    const setupListener = async () => {
        try {
            healthListener = await WearConnectivity.addListener('onHealthUpdate', (data) => {
                console.log("⌚ Données Montre reçues:", data);
                if (data.type === 'heart_rate') {
                    setWatchHeartRate(parseInt(data.value));
                } else if (data.type === 'passive_update') {
                    setUserProfile(prev => {
                        const newSteps = data.steps || prev?.dailySteps || 0;
                        const newBurned = data.calories || prev?.dailyBurnedCalories || 0;
                        updateDoc(doc(db, "users", currentUser.uid), {
                            dailySteps: newSteps,
                            dailyBurnedCalories: newBurned
                        });
                        return { ...prev, dailySteps: newSteps, dailyBurnedCalories: newBurned };
                    });
                }
            });
        } catch (e) {
            console.warn("WearConnectivity non disponible");
        }
    };

    setupListener();

    return () => {
        if (healthListener) {
            healthListener.remove();
        }
    };
  }, [currentUser, isCoachView]);

  // --- FONCTION SYNCHRO MONTRE (CALENDRIER ET SANTÉ) ---
  const syncCalendarToWatch = async (profileData) => {
    if (!Capacitor.isNativePlatform()) return;
    setIsSyncing(true);

    const workouts = profileData?.workouts || [];
    const weekDaysFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    // On prépare un calendrier enrichi avec sessions et repas
    const complexCalendar = weekDaysFull.map(day => {
        const workout = workouts.find(w => w.scheduledDays?.includes(day));
        const mealPlan = profileData?.nutritionalPlans?.find(p => p.scheduledDays?.includes(day));

        return {
            day: day,
            workout: workout ? workout.name : "Repos",
            meals: mealPlan ? mealPlan.meals.map(m => m.name).join(', ') : "Standard"
        };
    });

    // Données santé actuelles
    const healthStats = {
        steps: profileData?.dailySteps || 0,
        goal: profileData?.stepGoal || 10000,
        burned: profileData?.dailyBurnedCalories || 0,
        points: profileData?.points || 0
    };

    try {
        await WearConnectivity.sendDataToWatch({
            path: "/update-complex-data",
            data: JSON.stringify({ calendar: complexCalendar, health: healthStats })
        });
        console.log("📅 Données complexes envoyées à la montre !");
    } catch (e) {
        console.warn("Montre non connectée");
    }
    setTimeout(() => setIsSyncing(false), 1000);
  };

  // 1. INITIALISATION DES DONNÉES & LOGIQUE RESET MINUIT
  useEffect(() => {
    let isMounted = true;

    const initData = async () => {
        try {
            if(!currentUser) {
                if(isMounted) setLoading(false);
                return;
            }
            
            // A. Rôle Coach
            const myDoc = await getDoc(doc(db, "users", currentUser.uid));
            if(myDoc.exists() && myDoc.data()?.role === 'coach') {
                if(isMounted) setIsCoach(true);
                const p1 = loadCoachTemplates(currentUser.uid);
                const p2 = loadAppointments(currentUser.uid);
                await Promise.all([p1, p2]);
            }

            // B. Profil Utilisateur Cible & Factures
            const targetId = targetUserId || currentUser.uid;
            if(targetId) {
                const profileRef = doc(db, "users", targetId);
                const profileSnap = await getDoc(profileRef);
                
                if (profileSnap.exists()) {
                    let data = profileSnap.data();
                    const todayStr = getTodayString();
                    
                    // --- LOGIQUE RESET MINUIT ---
                    if (data.lastActiveDate !== todayStr && !isCoachView) {
                        console.log("🌙 Nouveau jour détecté : Reset...");
                        const yesterdayStats = {
                            date: data.lastActiveDate || new Date().toISOString(),
                            water: data.dailyWater || 0,
                            steps: data.dailySteps || 0,
                            calories: data.dailyCalories || 0,
                            burned: data.dailyBurnedCalories || 0,
                            type: 'daily_summary'
                        };

                        await updateDoc(profileRef, {
                            dailyWater: 0,
                            dailySteps: 0,
                            dailyCalories: 0, 
                            lastActiveDate: todayStr,
                            history: arrayUnion(yesterdayStats) 
                        });
                        data.dailyWater = 0; data.dailySteps = 0; data.dailyCalories = 0; data.lastActiveDate = todayStr;
                    }

                    // --- PRÉPARATION SÉANCE & REPAS DU JOUR ---
                    const workout = data.workouts?.find(w => w.scheduledDays?.includes(todayName));
                    if(workout) setTodayWorkout(workout);

                    const plan = data.nutritionalPlans?.find(p => p.scheduledDays?.includes(todayName));
                    if(plan) setTodayMeals(plan.meals || []);

                    if (!isCoachView && Capacitor.isNativePlatform()) syncCalendarToWatch(data);
                    if (isMounted) setUserProfile(data);
                }

                if (!isCoachView) {
                    const invQ = query(collection(db, "invoices"), where("clientId", "==", targetId), where("status", "==", "pending"));
                    const invSnap = await getDocs(invQ);
                    if(isMounted) setHasPendingInvoices(!invSnap.empty);
                }
            }
        } catch(e) {
            console.error("Erreur Dashboard Init:", e);
            if(isMounted) setError(t('error'));
        } finally {
            if(isMounted) setLoading(false);
        }
    };

    initData();
    return () => { isMounted = false; };
  }, [currentUser, targetUserId, isCoachView]);

  // 2. ACCÉLÉROMÈTRE MOBILE (FALLBACK SI PAS DE MONTRE)
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
                    setUserProfile(prev => {
                        const newSteps = (prev?.dailySteps || 0) + 1;
                        const addedBurn = kcalPerStep;
                        if (newSteps % 50 === 0) {
                            updateDoc(doc(db, "users", currentUser.uid), { 
                                dailySteps: newSteps,
                                dailyBurnedCalories: increment(addedBurn * 50)
                            });
                        }
                        return { ...prev, dailySteps: newSteps, dailyBurnedCalories: (prev?.dailyBurnedCalories || 0) + addedBurn };
                    });
                }
                accX = x; accY = y; accZ = z;
            });
        } catch (e) { console.error("Erreur Motion", e); }
    };
    startCounting();
    return () => {
        try {
            Motion.removeAllListeners();
        } catch (e) {}
    };
  }, [currentUser, isCoachView, userProfile?.weight]);

  // 3. FONCTION AJOUT EAU
  const handleAddWater = async (amountML) => {
    if (!currentUser || isCoachView) return;
    try {
        const currentWater = userProfile?.dailyWater || 0;
        const newTotal = currentWater + amountML;
        setUserProfile(prev => ({ ...prev, dailyWater: newTotal }));
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { dailyWater: newTotal, lastActiveDate: getTodayString() });
    } catch (e) { console.error("Erreur ajout eau:", e); }
  };

  // 4. FONCTION AJOUT PAS MANUEL
  const handleManualSteps = async () => {
    if (!currentUser || manualSteps <= 0) return;
    const kcalPerStep = (parseFloat(userProfile?.weight) || 75) * 0.00075;
    const addedBurn = manualSteps * kcalPerStep;

    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
        dailySteps: increment(manualSteps),
        dailyBurnedCalories: increment(addedBurn)
    });

    setUserProfile(prev => ({
        ...prev,
        dailySteps: (prev.dailySteps || 0) + parseInt(manualSteps),
        dailyBurnedCalories: (prev.dailyBurnedCalories || 0) + addedBurn
    }));

    setIsAddStepsOpen(false);
    setManualSteps(0);
  };

  // 5. GESTION REPAS
  const handleEatMeal = async (meal) => {
      if(!meal.calories) return;
      const cal = parseInt(meal.calories);
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, { dailyCalories: increment(cal) });
      setUserProfile(prev => ({ ...prev, dailyCalories: (prev.dailyCalories || 0) + cal }));
  };

  // --- LOGIQUE COACH ---
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

  const handleSaveRdv = async () => {
      if(!rdvData.clientName || !rdvData.date) return alert(t('error'));
      try {
          const workoutName = rdvData.workoutId !== 'none' ? coachTemplates.find(t => t.id === rdvData.workoutId)?.name : null;
          const newRdv = {
              coachId: currentUser?.uid, clientName: rdvData.clientName, date: rdvData.date,
              location: rdvData.location || "Gym", workoutId: rdvData.workoutId !== 'none' ? rdvData.workoutId : null,
              workoutName: workoutName, status: 'upcoming', createdAt: new Date().toISOString()
          };
          const docRef = await addDoc(collection(db, "appointments"), newRdv);
          setAppointments([...appointments, { id: docRef.id, ...newRdv }]);
          setIsRdvOpen(false); setRdvData({ clientName: '', date: '', location: '', workoutId: 'none' });
      } catch(e) { alert(t('error')); }
  };

  const getFirstName = () => userProfile?.firstName || userProfile?.first_name || "Athlète";
  
  // --- VARIABLES D'AFFICHAGE & CALCULS ---
  const currentWeight = userProfile?.weight ? parseFloat(userProfile.weight) : 0;
  const targetWeight = parseFloat(userProfile?.targetWeight || 0);
  const weightDiff = targetWeight - currentWeight;
  const isWeightLoss = weightDiff < 0;

  const currentSteps = userProfile?.dailySteps || 0;
  const burnedCalories = userProfile?.dailyBurnedCalories || 0;
  const stepGoal = userProfile?.stepGoal || 10000;

  const getWorkoutForDay = (dayIndex) => {
    const dayNamesFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    return userProfile?.workouts?.find(w => w?.scheduledDays?.includes(dayNamesFull[dayIndex]));
  };

  const recentActivity = userProfile?.history?.slice(-3).reverse() || [];

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{t('loading')}</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-red-500 gap-2"><AlertTriangle/> {error}</div>;

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
            {hasPendingInvoices && !isCoachView && (
                <Link to="/my-coach"><Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]"><CreditCard className="mr-2 h-4 w-4"/> {t('pending_payments')}</Button></Link>
            )}
            {!isCoachView && (
                <Link to="/session"><Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-6 px-8 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.3)] transition-transform hover:scale-105"><Zap className="mr-2 h-5 w-5 fill-black" /> {t('start_session')}</Button></Link>
            )}
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/10 to-transparent pointer-events-none"></div>
      </div>

      {/* GRILLE PRINCIPALE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Poids */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#00f5d4] relative overflow-hidden group flex flex-col justify-between">
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
                        <div className="flex items-center gap-2"><Utensils className="text-[#7b2cbf]" size={20}/><h3 className="font-bold text-gray-200">Repas du Jour</h3></div>
                        {isCoachView && <Link to="/meals"><Button size="icon" variant="ghost" className="h-6 w-6"><Edit3 size={14}/></Button></Link>}
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
                                <p className="text-gray-500 text-sm italic mb-3">Aucun repas planifié.</p>
                                <Link to="/meals"><Button size="sm" className="bg-[#7b2cbf] text-white">Gérer</Button></Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* SÉANCE DU JOUR DÉTAILLÉE */}
            <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                <CardHeader className="border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                    <CardTitle className="text-xl font-black italic uppercase text-white flex items-center gap-2"><Dumbbell className="text-[#7b2cbf]"/> Séance : {todayWorkout?.name || "Repos"}</CardTitle>
                    {todayWorkout && <Link to="/session"><Button size="sm" className="bg-[#00f5d4] text-black font-black text-xs h-8">LANCER</Button></Link>}
                </CardHeader>
                <CardContent className="p-4">
                    {todayWorkout ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {todayWorkout.exercises?.slice(0, 4).map((exo, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 bg-black/40 rounded-2xl border border-white/5">
                                    <div className="w-14 h-14 rounded-xl bg-gray-800 overflow-hidden"><img src={exo.imageUrl} alt="" className="w-full h-full object-cover opacity-70" style={{ objectFit: 'cover' }}/></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-white truncate">{exo.name}</p>
                                        <div className="flex gap-2 mt-1">
                                            <Badge variant="outline" className="text-[9px] h-4 border-white/10 text-gray-400">{exo.sets} Sets</Badge>
                                            <Badge variant="outline" className="text-[9px] h-4 border-white/10 text-gray-400">{exo.reps} Reps</Badge>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div className="py-8 text-center text-gray-500 italic">Profite de ton jour de repos !</div>}
                </CardContent>
            </Card>

            {/* #1 : PAS ET JAUGE + HYDRATATION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CARTE PAS */}
                <Card className="bg-[#1a1a20] border-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white flex justify-between items-center text-sm font-bold uppercase tracking-wider">
                            <span className="flex items-center gap-2"><Footprints className="text-[#7b2cbf]"/> {t('steps')}</span>
                            <Button size="sm" variant="ghost" onClick={() => setIsAddStepsOpen(true)} className="h-6 text-[10px] text-[#7b2cbf] border border-[#7b2cbf]/30">AJOUTER</Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-3xl font-black text-white">{currentSteps.toLocaleString()}</span>
                            <span className="text-sm text-gray-500 mb-1">/ {stepGoal.toLocaleString()}</span>
                        </div>
                        <Progress value={(currentSteps / stepGoal) * 100} className="h-2 bg-gray-800 [&>div]:bg-[#7b2cbf]" />
                    </CardContent>
                </Card>

                {/* CARTE HYDRATATION */}
                <Card className="bg-[#1a1a20] border-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                            <Droplets className="text-blue-400"/> {t('hydration')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <Button size="icon" variant="outline" onClick={() => handleAddWater(-0.25)} className="h-8 w-8 border-gray-700 bg-gray-800 text-white"><Minus size={16}/></Button>
                            <div className="text-center">
                                <span className="text-3xl font-black text-white">{(userProfile?.dailyWater || 0).toFixed(2)}</span>
                                <span className="text-sm text-gray-500 ml-1">L</span>
                            </div>
                            <Button size="icon" variant="outline" onClick={() => handleAddWater(0.25)} className="h-8 w-8 border-gray-700 bg-gray-800 text-white"><Plus size={16}/></Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* RECTANGLES BRULÉES ET POULS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Rectangle Jaune : Calories Brûlées */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-yellow-500 flex items-center justify-between shadow-xl">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">CALORIES BRÛLÉES</p>
                        <h3 className="text-3xl font-black text-white">{Math.floor(burnedCalories)} <span className="text-sm font-normal text-gray-500">KCAL</span></h3>
                    </div>
                    <Flame className="text-yellow-500 w-10 h-10 opacity-50" />
                </div>

                {/* Rectangle Bleu : Pouls */}
                <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-blue-500 flex items-center justify-between shadow-xl">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">POULS (⌚)</p>
                        <h3 className="text-3xl font-black text-white">{watchHeartRate > 0 ? watchHeartRate : "--"} <span className="text-sm font-normal text-gray-500">BPM</span></h3>
                    </div>
                    <HeartPulse className={`text-blue-500 w-10 h-10 opacity-50 ${watchHeartRate > 0 ? 'animate-pulse' : ''}`} />
                </div>
            </div>
        </div>

        <div className="lg:col-span-1 h-full space-y-6">
            
            {/* WIDGET BALANCE ÉNERGÉTIQUE */}
            <SmartCalorieWidget 
                userProfile={userProfile} 
                consumed={userProfile?.dailyCalories || 0}
                burned={burnedCalories}
            />

            {/* AGENDA */}
            <div className="bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 h-fit max-h-[500px] shadow-xl flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><Calendar className="text-[#00f5d4]"/> {t('week')}</h3>
                    <Button size="icon" variant="ghost" onClick={() => syncCalendarToWatch(userProfile)} className={`h-7 w-7 ${isSyncing ? 'animate-spin text-[#00f5d4]' : 'text-gray-400'}`}><RefreshCw size={14}/></Button>
                </div>
                <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                    {weekDaysShort.map((d, index) => {
                        const workout = getWorkoutForDay(index);
                        const isToday = index === new Date().getDay() - 1;
                        return (
                            <div key={d} className={`flex items-center p-2 rounded-lg border transition-all ${isToday ? 'bg-[#7b2cbf]/10 border-[#7b2cbf]' : 'bg-black/20 border-gray-800'}`}>
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black mr-2 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}>{d.substring(0, 1)}</div>
                                <div className="flex-1 min-w-0"><p className={`text-xs font-bold truncate ${isToday ? 'text-white' : 'text-gray-400'}`}>{workout ? workout.name : "Repos"}</p></div>
                                {workout && <div className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-[#00f5d4] animate-pulse' : 'bg-gray-600'}`}></div>}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* STATS INFÉRIEURES DROITE */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest z-10">POINTS</p>
                    <h3 className="text-3xl font-black text-white z-10">{userProfile?.points || 0}</h3>
                    <div className="h-1.5 w-12 bg-red-500 rounded mt-auto z-10"></div>
                    <TrendingUp className="absolute right-[-10px] bottom-[-10px] text-red-500/10 w-24 h-24" />
                </div>

                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest z-10">SÉANCES</p>
                    <h3 className="text-3xl font-black text-white z-10">{userProfile?.history?.filter(h => h.type === 'workout').length || 0}</h3>
                    <div className="h-1.5 w-12 bg-[#7b2cbf] rounded mt-auto z-10"></div>
                    <Dumbbell className="absolute right-[-10px] bottom-[-10px] text-[#7b2cbf]/10 w-24 h-24" />
                </div>

                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest z-10">DÉFIS</p>
                    <h3 className="text-3xl font-black text-white z-10">{userProfile?.challengesCompleted?.length || 0}</h3>
                    <div className="h-1.5 w-12 bg-[#00f5d4] rounded mt-auto z-10"></div>
                    <Trophy className="absolute right-[-10px] bottom-[-10px] text-[#00f5d4]/10 w-24 h-24" />
                </div>

                <div className="bg-[#1a1a20] rounded-2xl border border-gray-800 p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest z-10">OBJECTIF</p>
                    <h3 className="text-xl font-black text-white z-10">{targetWeight} kg</h3>
                    <div className="h-1.5 w-12 bg-orange-500 rounded mt-auto z-10"></div>
                    <Target className="absolute right-[-10px] bottom-[-10px] text-orange-500/10 w-24 h-24" />
                </div>
            </div>
        </div>
      </div>

      {/* DIALOG AJOUT PAS MANUEL */}
      <Dialog open={isAddStepsOpen} onOpenChange={setIsAddStepsOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader><DialogTitle>{t('add_steps')}</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <Input
                type="number"
                placeholder="Ex: 5000"
                className="bg-black border-gray-700 text-white"
                value={manualSteps}
                onChange={(e) => setManualSteps(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleManualSteps} className="w-full bg-[#7b2cbf] text-white font-bold">{t('validate')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HISTORY */}
      <Card className="bg-[#1a1a20] rounded-2xl border border-gray-800">
        <CardHeader><CardTitle className="text-xl text-white">{t('history')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {recentActivity.length > 0 ? recentActivity.map((activity, idx) => (
            <ActivityItem key={idx} icon={activity.type === 'workout' ? Dumbbell : Trophy} title={activity.name} date={safeDate(activity.date)} color={activity.type === 'workout' ? "#00f5d4" : "#fdcb6e"} />
          )) : <p className="text-center text-gray-500 text-sm">{t('no_content')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityItem({ icon: Icon, title, date, color }) {
  return (
    <div className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-gray-800 transition-all cursor-default group">
      <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800 group-hover:border-[#7b2cbf]/50 transition-colors"><Icon className="h-4 w-4" style={{ color }} /></div>
      <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate group-hover:text-[#00f5d4] transition-colors">{title}</p><p className="text-xs text-gray-500">{date}</p></div>
    </div>
  );
}
