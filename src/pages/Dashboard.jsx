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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Dumbbell, Flame, Trophy, TrendingUp, Calendar, 
  Plus, Zap, Target, Activity, AlertTriangle, RefreshCw, HeartPulse, Footprints, Droplets, Minus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import SmartCalorieWidget from '@/components/SmartCalorieWidget';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Motion } from '@capacitor/motion';

const WearConnectivity = registerPlugin('WearConnectivity');

const getTodayString = () => new Date().toISOString().split('T')[0];

export default function Dashboard() {
  const auth = useAuth();
  const clientContext = useClient();
  const { t } = useTranslation();
  
  const currentUser = auth?.currentUser;
  const { selectedClient, isCoachView, targetUserId } = clientContext || {};
  
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [watchHeartRate, setWatchHeartRate] = useState(0);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [todayMeals, setTodayMeals] = useState([]);

  const [liveSteps, setLiveSteps] = useState(0);
  const [liveCalories, setLiveCalories] = useState(0);

  const rtdb = getDatabase();

  // --- 1. SYNC & RESET LOGIC ---
  useEffect(() => {
    if (!currentUser || isCoachView) return;

    const initData = async () => {
        try {
            const targetId = targetUserId || currentUser.uid;
            const profileRef = doc(db, "users", targetId);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists()) {
                const data = profileSnap.data();
                const todayStr = getTodayString();

                // --- LOGIQUE RESET MINUIT (DAILY LOG) ---
                if (data.lastActiveDate && data.lastActiveDate !== todayStr) {
                    console.log("🌙 Nouveau jour : Sauvegarde de l'historique...");

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

                    // Reset Realtime Database too
                    set(ref(rtdb, `users/${currentUser.uid}/live_data`), {
                        steps: 0,
                        calories: 0,
                        heart_rate: 0,
                        timestamp: Date.now()
                    });

                    setLiveSteps(0);
                    setLiveCalories(0);
                } else {
                    setLiveSteps(data.dailySteps || 0);
                    setLiveCalories(data.dailyBurnedCalories || 0);
                }

                setUserProfile(data);
                const todayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date().getDay()];
                setTodayWorkout(data.workouts?.find(w => w.scheduledDays?.includes(todayName)));
                setTodayMeals(data.nutritionalPlans?.find(p => p.scheduledDays?.includes(todayName))?.meals || []);
            }
        } catch(e) { console.error(e); }
        finally { setLoading(false); }
    };

    initData();

    // Setup Live Listeners
    const liveDataRef = ref(rtdb, `users/${currentUser.uid}/live_data`);
    const unsubscribe = onValue(liveDataRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.heart_rate) setWatchHeartRate(data.heart_rate);
            setLiveSteps(prev => Math.max(prev, data.steps || 0));
            setLiveCalories(prev => Math.max(prev, data.calories || 0));
        }
    });

    return () => unsubscribe();
  }, [currentUser, isCoachView]);

  // Accelerometer counting (fallback)
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
                    setLiveSteps(prev => {
                        const nextSteps = prev + 1;
                        const nextCals = liveCalories + kcalPerStep;
                        if (nextSteps % 20 === 0) {
                            update(ref(rtdb, `users/${currentUser.uid}/live_data`), { steps: nextSteps, calories: nextCals });
                            updateDoc(doc(db, "users", currentUser.uid), { dailySteps: nextSteps, dailyBurnedCalories: nextCals });
                        }
                        setLiveCalories(nextCals);
                        return nextSteps;
                    });
                }
                accX = x; accY = y; accZ = z;
            });
        } catch (e) {}
    };
    startCounting();
    return () => { try { Motion.removeAllListeners(); } catch (e) {} };
  }, [currentUser, isCoachView, userProfile?.weight]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{t('loading')}</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 p-4">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-8 rounded-3xl border border-[#7b2cbf]/20">
        <h1 className="text-4xl font-black text-white italic">SALUT, <span className="text-[#00f5d4]">{userProfile?.firstName?.toUpperCase() || "ATHLÈTE"}</span></h1>
        <Link to="/session"><Button className="bg-[#00f5d4] text-black font-black px-8 py-6 rounded-xl"><Zap className="mr-2"/> DÉMARRER</Button></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#1a1a20] border-gray-800 p-6">
                    <div className="flex justify-between items-center mb-2"><span className="text-gray-400 font-bold uppercase text-xs tracking-widest">Activité</span><Footprints className="text-[#7b2cbf]"/></div>
                    <div className="flex items-end gap-2"><span className="text-4xl font-black text-white">{liveSteps.toLocaleString()}</span><span className="text-gray-500 mb-1 text-sm">/ {userProfile?.stepGoal || 10000}</span></div>
                    <Progress value={(liveSteps / (userProfile?.stepGoal || 10000)) * 100} className="h-2 mt-4 [&>div]:bg-[#7b2cbf]" />
                </Card>

                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 flex items-center justify-between">
                    <div><p className="text-xs font-bold text-gray-500 uppercase mb-1">Pouls (⌚)</p><h3 className="text-3xl font-black text-white">{watchHeartRate > 0 ? watchHeartRate : "--"} <span className="text-sm font-normal text-gray-500">BPM</span></h3></div>
                    <HeartPulse className={`text-blue-500 w-10 h-10 ${watchHeartRate > 0 ? 'animate-pulse' : 'opacity-20'}`} />
                </div>
            </div>

            <div className="bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 flex items-center justify-between">
                <div><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Calories Brûlées</p><h3 className="text-4xl font-black text-white">{Math.floor(liveCalories)} <span className="text-sm font-normal text-gray-500">KCAL</span></h3></div>
                <Flame className="text-orange-500 w-12 h-12" />
            </div>
        </div>
        <div className="lg:col-span-1 space-y-6"><SmartCalorieWidget userProfile={userProfile} consumed={userProfile?.dailyCalories || 0} burned={liveCalories} /></div>
      </div>
    </div>
  );
}
