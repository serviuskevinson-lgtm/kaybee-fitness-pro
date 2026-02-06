import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, app } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { getDatabase, ref as dbRef, update } from "firebase/database";
import {
  Play, Pause, Square, MapPin, Zap, Timer,
  TrendingUp, Users, Heart, Footprints, Navigation, Trophy, ChevronLeft, ChevronRight, Eye, EyeOff, Flame, Smartphone
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
  const { currentUser } = useAuth();
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
  const [showMap, setShowMap] = useState(true);

  const [friendsList, setFriendsList] = useState([]);
  const [personalBest, setPersonalBest] = useState(12.4);

  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryPage, setSummaryPage] = useState('last');

  const timerRef = useRef(null);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Demande de permissions au montage (Uniquement sur mobile)
  useEffect(() => {
    const requestPermissions = async () => {
      if (Capacitor.getPlatform() === 'web') return;
      try {
        await Geolocation.requestPermissions();
      } catch (e) { console.error('Error requesting permissions:', e); }
    };
    requestPermissions();
  }, []);

  // Chargement des vrais amis
  useEffect(() => {
    if (!currentUser) return;
    const fetchFriends = async () => {
      try {
        const q1 = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"));
        const q2 = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"));
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        const friendsIds = [];
        s1.forEach(d => friendsIds.push(d.data().toId));
        s2.forEach(d => friendsIds.push(d.data().fromId));
        friendsIds.push(currentUser.uid); // S'ajouter soi-même pour le classement

        const friendsData = [];
        for (const id of [...new Set(friendsIds)]) {
          const uSnap = await getDoc(doc(db, "users", id));
          const statsRef = doc(db, "users", id, "stats", "running");
          const statsSnap = await getDoc(statsRef);

          if (uSnap.exists()) {
            const userData = uSnap.data();
            const monthKey = format(new Date(), 'yyyy-MM');
            friendsData.push({
              uid: id,
              name: id === currentUser.uid ? "Toi" : (userData.full_name || userData.username),
              avatar: userData.avatar,
              km: statsSnap.exists() ? (statsSnap.data()[monthKey] || 0) : 0
            });
          }
        }
        setFriendsList(friendsData.sort((a, b) => b.km - a.km));
      } catch (err) { console.error(err); }
    };
    fetchFriends();
  }, [currentUser]);

  // Géolocalisation
  useEffect(() => {
    let watchId;
    if (isRunning && !isPaused && !isTreadmill && Capacitor.getPlatform() !== 'web') {
      const startWatching = async () => {
        watchId = await Geolocation.watchPosition({
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }, (position) => {
          if (position) {
            const newPoint = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              cadence: Math.round(Math.random() * (180 - 150) + 150),
              timestamp: new Date().getTime()
            };
            setPath(prev => [...prev, newPoint]);
            setDistance(prev => prev + 0.002);
          }
        });
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
        setCalories(prev => prev + (0.002 * 60));
        if (time > 0) setAvgCadence(Math.round((steps + 2.5) / ((time + 1) / 60)));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning, isPaused, time, steps]);

  const handleStartRequest = () => {
    setCountdown(3);
    const countInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countInterval);
          setIsRunning(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handlePause = () => setIsPaused(!isPaused);
  const handleStopRequest = () => setShowConfirmStop(true);

  const confirmStop = async () => {
    const finalData = {
      type: 'run',
      mode: isTreadmill ? 'treadmill' : 'outdoor',
      name: isTreadmill ? 'Course sur Tapis' : 'Course Extérieure',
      date: new Date().toISOString(),
      duration: time,
      distance: parseFloat(distance.toFixed(2)),
      steps: Math.round(steps),
      calories: Math.round(calories),
      avgBpm: bpm,
      avgCadence,
      path: isTreadmill ? [] : path
    };

    if (currentUser) {
      const userRef = doc(db, "users", currentUser.uid);
      const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);

      await updateDoc(userRef, { history: arrayUnion(finalData) });
      const liveSnap = await getDoc(userRef);
      const currentBurned = liveSnap.data()?.dailyBurned || 0;
      await updateDoc(userRef, { dailyBurned: currentBurned + Math.round(calories) });
      await update(rtdbLiveRef, { calories_burned: currentBurned + Math.round(calories) });

      const monthKey = format(new Date(), 'yyyy-MM');
      const statsRef = doc(db, "users", currentUser.uid, "stats", "running");
      const statsSnap = await getDoc(statsRef);
      let monthlyKm = distance;
      if (statsSnap.exists()) {
        monthlyKm += (statsSnap.data()[monthKey] || 0);
      }
      await setDoc(statsRef, { [monthKey]: monthlyKm, personalBest: distance > personalBest ? distance : personalBest }, { merge: true });
    }

    setIsRunning(false);
    setShowConfirmStop(false);
    setShowSummary(true);
  };

  const resetSession = () => {
    setTime(0); setDistance(0); setSteps(0); setCalories(0); setPath([]); setShowSummary(false); setIsTreadmill(false);
  };

  const renderPathCanvas = (points, isSummary = false) => {
    if (isTreadmill) return <div className="flex flex-col items-center justify-center h-full text-[#7b2cbf]"><Smartphone size={48} className="mb-4 animate-bounce"/><p className="font-black uppercase text-sm tracking-widest">MODE TAPIS ACTIF</p></div>;
    if (points.length < 2) return <div className="flex items-center justify-center h-full text-gray-400 italic">Signal GPS...</div>;
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

    return (
      <svg viewBox={`${minLng} ${minLat} ${maxLng - minLng} ${maxLat - minLat}`} className="w-full h-full transform scale-y-[-1]">
        {points.map((point, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const color = point.cadence > 175 ? "#00f5d4" : point.cadence > 160 ? "#7b2cbf" : "#4a1d7a";
          return <line key={i} x1={prev.lng} y1={prev.lat} x2={point.lng} y2={point.lat} stroke={color} strokeWidth={isSummary ? "0.0005" : "0.001"} strokeLinecap="round" />;
        })}
      </svg>
    );
  };

  return (
    <div className="p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white pb-24 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">

        <div className="lg:col-span-3 space-y-8">
          <header className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] rounded-2xl shadow-[0_0_20px_rgba(123,44,191,0.3)]">
                <Navigation className="text-white w-8 h-8" />
              </div>
              <div>
                <h1 className="text-4xl font-black italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">KAYBEE RUN</h1>
                <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em]">{isTreadmill ? "Mission: Gym / Tapis" : "Mission: Extérieur"}</p>
              </div>
            </div>
            {!isRunning && (
              <Button onClick={() => setIsTreadmill(!isTreadmill)} className={`h-12 px-6 rounded-2xl font-black uppercase text-xs transition-all border-2 ${isTreadmill ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white shadow-[0_0_15px_rgba(123,44,191,0.5)]' : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'}`}>
                <Smartphone className="mr-2" size={16} /> Treadmill {isTreadmill ? "ON" : "OFF"}
              </Button>
            )}
            {isRunning && !isTreadmill && (
              <Button onClick={() => setShowMap(!showMap)} variant="ghost" className="text-gray-400 hover:text-[#00f5d4]">
                {showMap ? <EyeOff size={20} /> : <Eye size={20} />}
                <span className="ml-2 uppercase font-black text-[10px]">{showMap ? "Cacher Map" : "Voir Map"}</span>
              </Button>
            )}
          </header>

          <Card className="bg-[#1a1a20] border-2 border-[#7b2cbf]/30 rounded-[2.5rem] overflow-hidden relative shadow-2xl min-h-[550px] flex flex-col transition-all duration-500">
            {isRunning && showMap && (
              <div className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm p-10">{renderPathCanvas(path)}</div>
            )}

            <CardContent className="p-10 relative z-10 flex-1 flex flex-col justify-center text-center">
              <AnimatePresence mode="wait">
                {countdown !== null ? (
                  <motion.div key="countdown" initial={{ scale: 0 }} animate={{ scale: 1.5 }} exit={{ scale: 4, opacity: 0 }} className="text-9xl font-black italic text-[#00f5d4] drop-shadow-[0_0_30px_rgba(0,245,212,0.4)]">{countdown}</motion.div>
                ) : (
                  <div className={showMap && isRunning ? "bg-black/60 p-8 rounded-[3rem] backdrop-blur-md inline-block mx-auto border border-white/10 shadow-2xl" : ""}>
                    <h2 className="text-8xl font-black italic text-white font-mono tracking-tighter mb-8 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">{formatTime(time)}</h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
                      <RunStat icon={MapPin} label="Distance" value={distance.toFixed(2)} unit="KM" color="#00f5d4" />
                      <RunStat icon={Flame} label="Calories" value={Math.round(calories)} unit="KCAL" color="#ff7675" />
                      <RunStat icon={Heart} label="BPM" value={bpm} unit="MOY" color="#ff0055" />
                      <RunStat icon={Footprints} label="Pas" value={Math.round(steps)} unit="TOT" color="#00f5d4" />
                      <RunStat icon={Zap} label="Cadence" value={avgCadence} unit="SPM" color="#7b2cbf" />
                    </div>
                    <div className="flex justify-center gap-6">
                      {!isRunning ? <Button onClick={handleStartRequest} className="h-24 w-24 rounded-full bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black shadow-[0_0_30px_rgba(0,245,212,0.4)] transition-all hover:scale-110"><Play fill="currentColor" size={40} /></Button> :
                        <><Button onClick={handlePause} className="h-20 w-20 rounded-full bg-white/10 border-2 border-white/20 text-white hover:bg-white/20">{isPaused ? <Play fill="currentColor" size={32}/> : <Pause fill="currentColor" size={32}/>}</Button>
                        <Button onClick={handleStopRequest} className="h-20 w-20 rounded-full bg-red-500/20 border-2 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white"><Square fill="currentColor" size={32}/></Button></>
                      }
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
            <Card className="bg-[#1a1a20] border-2 border-[#7b2cbf]/20 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <CardHeader className="bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] p-6">
                  <CardTitle className="text-white font-black italic uppercase flex items-center gap-2 text-sm"><Users size={18} /> CLUB DE COURSE KB</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  {friendsList.length > 0 ? friendsList.map((friend, idx) => (
                    <div key={friend.uid} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <Avatar className={`h-8 w-8 border ${friend.name === 'Toi' ? 'border-[#00f5d4]' : 'border-gray-800'}`}>
                          <AvatarImage src={friend.avatar} />
                          <AvatarFallback className="text-[10px] bg-black text-white font-black">{friend.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className={`text-xs font-black uppercase ${friend.name === 'Toi' ? 'text-[#00f5d4]' : 'text-white'}`}>{friend.name}</p>
                          <div className="w-16 h-1 bg-black/40 rounded-full mt-1"><div className="h-full bg-[#7b2cbf]" style={{ width: `${Math.min(100, (friend.km / 50) * 100)}%` }} /></div>
                        </div>
                      </div>
                      <div className="text-right"><p className="text-sm font-black italic text-white">{friend.km.toFixed(1)}</p><p className="text-[7px] text-gray-600 font-black uppercase">KM</p></div>
                    </div>
                  )) : <p className="text-[10px] text-gray-600 italic text-center py-4">Aucun membre actif</p>}
                </CardContent>
            </Card>

            <Card className="bg-[#1a1a20] border-2 border-[#7b2cbf]/20 rounded-[2.5rem] p-6 text-white shadow-xl">
                <h3 className="text-[10px] font-black uppercase text-gray-500 mb-6 tracking-widest flex items-center gap-2"><Zap size={12} className="text-[#00f5d4]"/> Zones d'Effort</h3>
                <div className="space-y-4">
                    <CadenceZone color="#00f5d4" label="Elite" range="180+ SPM" />
                    <CadenceZone color="#7b2cbf" label="Vibrant" range="165-180 SPM" />
                    <CadenceZone color="#4a1d7a" label="Récup" range="<165 SPM" />
                </div>
            </Card>
        </div>
      </div>

      <Dialog open={showConfirmStop} onOpenChange={setShowConfirmStop}>
        <DialogContent className="bg-[#1a1a20] border-2 border-[#7b2cbf]/30 text-white rounded-[2.5rem]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-3xl font-black italic uppercase text-[#00f5d4]">RECORD EN VUE !</DialogTitle>
            <DialogDescription className="text-gray-400 font-bold mt-4">Il ne te manque que <span className="text-[#7b2cbf]">{(personalBest - distance).toFixed(2)} KM</span> pour battre ton record.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-4 mt-8">
            <Button onClick={() => setShowConfirmStop(false)} className="flex-1 bg-white/5 text-white h-14 font-black uppercase border border-white/10 rounded-2xl">Continuer</Button>
            <Button onClick={confirmStop} className="flex-1 bg-red-500 text-white h-14 font-black uppercase rounded-2xl">Terminer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSummary} onOpenChange={resetSession}>
        <DialogContent className="bg-[#0a0a0f] border-2 border-[#7b2cbf]/40 text-white max-w-2xl rounded-[3rem] p-0 overflow-hidden h-[90vh] flex flex-col">
          <div className="flex-1 flex flex-col p-8">
             <div className="flex justify-between items-center mb-6">
                <Button variant="ghost" onClick={() => setSummaryPage('last')} className={summaryPage === 'last' ? 'text-[#00f5d4] font-black text-xs' : 'text-gray-500 text-xs'}>RÉSUMÉ MISSION</Button>
                <Trophy className="text-[#ffd700]" />
                <Button variant="ghost" onClick={() => setSummaryPage('best')} className={summaryPage === 'best' ? 'text-[#7b2cbf] font-black text-xs' : 'text-gray-500 text-xs'}>HALL OF FAME</Button>
             </div>
             <div className="flex-1 bg-black/40 rounded-[2.5rem] border border-white/5 relative overflow-hidden mb-6 flex flex-col items-center justify-center">
                {!isTreadmill ? <div className="absolute inset-0 p-8">{renderPathCanvas(path, true)}</div> : <div className="z-10 text-center"><Smartphone size={80} className="text-[#7b2cbf] mx-auto mb-4 opacity-50"/><p className="font-black uppercase tracking-[0.4em] text-gray-500">Session Tapis</p></div>}
                <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-white/5 z-20">
                   <div>
                      <p className="text-6xl font-black italic tracking-tighter text-white">{distance.toFixed(2)} <span className="text-sm font-bold uppercase text-gray-500">KM</span></p>
                      <p className="text-[#00f5d4] font-black uppercase text-[10px] tracking-[0.3em]">Distance Mission</p>
                   </div>
                   <div className="text-right">
                      <p className="text-3xl font-black italic text-[#7b2cbf]">{Math.round(calories)} <span className="text-[10px] text-gray-500 uppercase">KCAL</span></p>
                      <p className="text-white font-black uppercase text-[8px] tracking-[0.3em]">Énergie Brûlée</p>
                   </div>
                </div>
             </div>
             <Button onClick={resetSession} className="h-16 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black uppercase text-lg rounded-2xl">FERMER MISSION</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunStat({ icon: Icon, label, value, unit, color }) {
  return (
    <div className="flex flex-col items-center bg-white/5 p-4 rounded-[2rem] border border-white/5">
      <div className="p-2 bg-white/5 rounded-xl mb-2" style={{ color }}><Icon size={16} /></div>
      <p className="text-gray-400 text-[7px] font-black uppercase mb-1">{label}</p>
      <div className="flex items-baseline gap-1"><span className="text-xl font-black italic text-white">{value}</span><span className="text-[7px] text-gray-500 font-bold uppercase">{unit}</span></div>
    </div>
  );
}

function CadenceZone({ color, label, range }) {
    return (
        <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: color }} />
                <div><p className="text-[10px] font-black uppercase text-white">{label}</p><p className="text-[8px] font-bold text-gray-500 uppercase">{range}</p></div>
            </div>
        </div>
    );
}
