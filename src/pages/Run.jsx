import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, app } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getDatabase, ref as dbRef, update } from "firebase/database";
import {
  Play, Pause, Square, MapPin, Zap, Timer,
  Navigation, Trophy, Eye, EyeOff, Flame, Smartphone, ChevronLeft, ChevronRight, Heart, Footprints, X, Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export default function Run() {
  const { currentUser, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const rtdb = getDatabase(app);

  const [countdown, setCountdown] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTreadmill, setIsTreadmill] = useState(false);
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [steps, setSteps] = useState(0);
  const [bpm, setBpm] = useState(0);
  const [avgCadence, setAvgCadence] = useState(0);
  const [calories, setCalories] = useState(0);
  const [path, setPath] = useState([]);
  const [showMap, setShowMap] = useState(false);

  const [friendsList, setFriendsList] = useState([]);
  const [personalBest, setPersonalBest] = useState(12.4);

  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const timerRef = useRef(null);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const requestPermissions = async () => {
      if (Capacitor.getPlatform() === 'web') return;
      try { await Geolocation.requestPermissions(); } catch (e) {}
    };
    requestPermissions();
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchFriends = async () => {
      try {
        const q1 = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"));
        const q2 = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"));
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const friendsIds = [];
        s1.forEach(d => friendsIds.push(d.data().toId));
        s2.forEach(d => friendsIds.push(d.data().fromId));
        friendsIds.push(currentUser.uid);

        const friendsData = [];
        for (const id of [...new Set(friendsIds)]) {
          try {
              const uSnap = await getDoc(doc(db, "users", id));
              const statsRef = doc(db, "users", id, "stats", "running");
              const statsSnap = await getDoc(statsRef);
              if (uSnap.exists()) {
                const userData = uSnap.data();
                const monthKey = format(new Date(), 'yyyy-MM');
                friendsData.push({
                  uid: id,
                  name: id === currentUser.uid ? "Toi" : (userData.full_name || userData.username || "Athlete"),
                  avatar: userData.avatar,
                  km: statsSnap.exists() ? (statsSnap.data()[monthKey] || 0) : 0
                });
              }
          } catch (e) {}
        }
        setFriendsList(friendsData.sort((a, b) => b.km - a.km));
      } catch (err) {}
    };
    fetchFriends();
  }, [currentUser?.uid]);

  useEffect(() => {
    let watchId;
    if (isRunning && !isPaused && !isTreadmill && Capacitor.getPlatform() !== 'web') {
      const startWatching = async () => {
        try {
            watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }, (position) => {
              if (position) {
                const newPoint = { lat: position.coords.latitude, lng: position.coords.longitude, timestamp: new Date().getTime() };
                setPath(prev => [...prev, newPoint]);
                setDistance(prev => prev + 0.005);
              }
            });
        } catch (e) { console.error(e); }
      };
      startWatching();
    }
    return () => { if (watchId) Geolocation.clearWatch({ id: watchId }); };
  }, [isRunning, isPaused, isTreadmill]);

  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setTime(prev => prev + 1);
        setSteps(prev => prev + 2.5);
        setBpm(Math.floor(Math.random() * (160 - 130 + 1)) + 130);
        setCalories(prev => prev + 0.12);
        if (time > 0) setAvgCadence(Math.round((steps + 2.5) / ((time + 1) / 60)));
      }, 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [isRunning, isPaused, steps, time]);

  const handleStart = () => {
    setCountdown(3);
    const countInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countInterval); setIsRunning(true); return null; }
        return prev - 1;
      });
    }, 1000);
  };

  const confirmStop = async () => {
    const caloriesVal = Math.round(calories);
    if (currentUser?.uid) {
      try {
          const userRef = doc(db, "users", currentUser.uid);
          const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);
          await updateDoc(userRef, { history: arrayUnion({ type: 'run', date: new Date().toISOString(), duration: time, distance: parseFloat(distance.toFixed(2)), calories: caloriesVal }) });
          await update(rtdbLiveRef, { calories_burned: caloriesVal });
      } catch (e) {}
    }
    setIsRunning(false); setShowConfirmStop(false); setShowSummary(true);
  };

  const resetSession = () => {
    setTime(0); setDistance(0); setSteps(0); setCalories(0); setPath([]); setShowSummary(false); setIsTreadmill(false);
  };

  if (authLoading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-white">Chargement...</div>;
  if (!currentUser) return null;

  return (
    <div className="p-2 sm:p-4 bg-[#0a0a0f] min-h-screen text-white pb-32 overflow-x-hidden">
      <div className="flex items-center justify-between mb-6 bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#7b2cbf] rounded-xl shadow-lg shadow-purple-900/40"><Navigation className="text-white size-5"/></div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-white">KAYBEE RUN</h1>
        </div>
        {!isRunning && (
          <button onClick={() => setIsTreadmill(!isTreadmill)} className={`h-9 px-4 rounded-xl font-black uppercase text-[10px] border transition-all ${isTreadmill ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white shadow-[0_0_15px_rgba(123,44,191,0.4)]' : 'bg-black/40 border-gray-800 text-gray-500 hover:text-white'}`}>
            {isTreadmill ? "TAPIS ON" : "EXTÉRIEUR"}
          </button>
        )}
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="bg-[#1a1a20] border-gray-800 rounded-[2rem] overflow-hidden relative min-h-[450px] flex flex-col justify-center shadow-2xl">
            <CardContent className="relative z-10 flex flex-col items-center text-center p-6 sm:p-10">
              <AnimatePresence mode="wait">
                {countdown !== null ? (
                  <motion.div key="countdown" initial={{ scale: 0 }} animate={{ scale: 1.5 }} exit={{ scale: 4, opacity: 0 }} className="text-8xl font-black italic text-[#00f5d4] drop-shadow-[0_0_30px_rgba(0,245,212,0.4)]">{countdown}</motion.div>
                ) : (
                  <div className="w-full space-y-8">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Durée Totale</p>
                        <h2 className="text-6xl sm:text-8xl font-black italic font-mono tracking-tighter text-white">{formatTime(time)}</h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <RunMetricItem label="Distance" value={distance.toFixed(2)} unit="KM" color="text-[#00f5d4]" />
                        <RunMetricItem label="Calories" value={Math.round(calories)} unit="KCAL" color="text-[#ff7675]" />
                        <RunMetricItem label="Rythme" value={bpm} unit="BPM" color="text-[#ff0055]" />
                        <RunMetricItem label="Cadence" value={avgCadence} unit="SPM" color="text-[#7b2cbf]" />
                    </div>

                    <div className="pt-4">
                        {!isRunning ? (
                            <Button onClick={handleStart} className="size-20 sm:size-24 rounded-full bg-[#00f5d4] text-black shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:scale-105 active:scale-95 transition-all"><Play fill="currentColor" size={32}/></Button>
                        ) : (
                            <div className="flex justify-center gap-6">
                                <Button onClick={() => setIsPaused(!isPaused)} className="size-16 sm:size-20 rounded-full bg-white/5 border border-white/10 text-white active:scale-95 transition-all">{isPaused ? <Play fill="currentColor" size={24}/> : <Pause fill="currentColor" size={24}/>}</Button>
                                <Button onClick={() => setShowConfirmStop(true)} className="size-16 sm:size-20 rounded-full bg-red-500/20 border border-red-500/50 text-red-500 active:scale-95 transition-all"><Square fill="currentColor" size={24}/></Button>
                            </div>
                        )}
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <CardHeader className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] p-4 border-b border-white/5">
                    <CardTitle className="text-white font-black text-xs uppercase flex items-center gap-2 italic tracking-tighter"><Trophy size={14} className="text-yellow-400"/> CLASSEMENT AMIS</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {friendsList.length > 0 ? friendsList.map((f, i) => (
                        <div key={f.uid} className={`flex items-center justify-between p-3 border-b border-white/5 last:border-0 ${f.uid === currentUser.uid ? 'bg-[#00f5d4]/5' : ''}`}>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-gray-600 w-4">{i+1}</span>
                                <Avatar className="size-7 border border-gray-800"><AvatarImage src={f.avatar} className="object-cover"/><AvatarFallback className="text-[10px] font-black">{f.name[0]}</AvatarFallback></Avatar>
                                <p className={`text-[11px] font-black uppercase italic ${f.uid === currentUser.uid ? 'text-[#00f5d4]' : 'text-white'}`}>{f.name}</p>
                            </div>
                            <p className="text-xs font-black italic text-white">{f.km.toFixed(1)} <span className="text-[8px] text-gray-600 font-bold uppercase">KM</span></p>
                        </div>
                    )) : <div className="p-10 text-center text-gray-600 italic text-[10px] uppercase font-bold">Aucune donnée</div>}
                </CardContent>
            </Card>
        </div>
      </div>

      <Dialog open={showConfirmStop} onOpenChange={setShowConfirmStop}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl w-[90vw] max-w-sm p-6 shadow-3xl">
          <DialogHeader><DialogTitle className="text-xl font-black italic uppercase text-center text-[#ff7675]">ARRÊTER LA COURSE ?</DialogTitle></DialogHeader>
          <div className="flex gap-3 mt-6">
            <Button onClick={() => setShowConfirmStop(false)} variant="outline" className="flex-1 border-gray-700 h-12 rounded-xl text-xs font-black uppercase">REPRENDRE</Button>
            <Button onClick={confirmStop} className="flex-1 bg-red-500 text-white h-12 rounded-xl font-black text-xs uppercase shadow-lg shadow-red-900/30">STOP</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSummary} onOpenChange={(open) => { if(!open) resetSession(); }}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-full sm:max-w-md h-screen sm:h-auto rounded-none sm:rounded-[2rem] p-0 overflow-hidden bottom-0 fixed sm:relative shadow-3xl">
            <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-8 animate-in zoom-in-95 duration-500">
                <div className="size-20 rounded-full bg-[#00f5d4]/10 flex items-center justify-center border border-[#00f5d4]/30 shadow-[0_0_30px_rgba(0,245,212,0.2)]"><Trophy size={40} className="text-[#00f5d4]"/></div>
                <div className="space-y-2">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">MISSION TERMINÉE</h2>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">Données de performance enregistrées</p>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                        <p className="text-[10px] text-gray-500 font-black uppercase mb-1">Distance</p>
                        <p className="text-3xl font-black text-white italic">{distance.toFixed(2)} <span className="text-xs font-bold uppercase opacity-50">KM</span></p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                        <p className="text-[10px] text-gray-500 font-black uppercase mb-1">Calories</p>
                        <p className="text-3xl font-black text-[#ff7675] italic">{Math.round(calories)} <span className="text-xs font-bold uppercase opacity-50">KCAL</span></p>
                    </div>
                </div>
                <Button onClick={() => { setShowSummary(false); setTime(0); setDistance(0); }} className="w-full bg-[#00f5d4] text-black font-black h-16 rounded-2xl text-lg uppercase italic shadow-xl hover:scale-[1.02] active:scale-95 transition-all">CONTINUER</Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunMetricItem({ label, value, unit, color }) {
    return (
        <div className="bg-black/40 p-3 rounded-2xl border border-white/5 text-center flex flex-col justify-center items-center shadow-inner">
            <p className="text-[8px] text-gray-500 font-black uppercase mb-1 tracking-widest">{label}</p>
            <p className={`text-xl font-black ${color} italic leading-none`}>{value}</p>
            <p className="text-[7px] text-gray-600 font-bold uppercase mt-1 opacity-50">{unit}</p>
        </div>
    );
}
