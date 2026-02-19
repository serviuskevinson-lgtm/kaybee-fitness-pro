import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, app } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getDatabase, ref as dbRef, update } from "firebase/database";
import {
  Play, Pause, Square, MapPin, Zap, Timer,
  Navigation, Trophy, Eye, EyeOff, Flame, Smartphone, ChevronLeft, ChevronRight, Heart, Footprints, X, Loader2, Map as MapIcon
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
import { WearPlugin } from '@/lib/wear';

// --- LEAFLET DYNAMIC IMPORT ---
// We use a CDN version for simplicity in this environment
const L = window.L;

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
  const [path, setPath] = useState([]); // Array of {lat, lng, timestamp}
  const [showMap, setShowMap] = useState(false);

  const [friendsList, setFriendsList] = useState([]);
  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const timerRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);
  const mapContainerId = "run-map-container";

  // --- INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      if (Capacitor.getPlatform() !== 'web') {
        try { await Geolocation.requestPermissions(); } catch (e) {}
      }
      // Load Leaflet CSS dynamically
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
    };
    init();
  }, []);

  // --- MAP UPDATES ---
  useEffect(() => {
    if (showMap && path.length > 0 && window.L) {
        if (!mapRef.current) {
            mapRef.current = window.L.map(mapContainerId, { zoomControl: false }).setView([path[0].lat, path[0].lng], 16);
            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(mapRef.current);
            polylineRef.current = window.L.polyline([], { color: '#00f5d4', weight: 5, opacity: 0.8 }).addTo(mapRef.current);
        }

        const latlngs = path.map(p => [p.lat, p.lng]);
        polylineRef.current.setLatLngs(latlngs);
        const lastPoint = latlngs[latlngs.length - 1];
        mapRef.current.panTo(lastPoint);
    }
  }, [showMap, path]);

  // --- GEOLOCATION TRACKING ---
  useEffect(() => {
    let watchId;
    if (isRunning && !isPaused && !isTreadmill) {
      const startWatching = async () => {
        try {
            watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }, (position) => {
              if (position) {
                const newPoint = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    timestamp: new Date().getTime(),
                    altitude: position.coords.altitude
                };

                setPath(prev => {
                    if (prev.length > 0) {
                        const last = prev[prev.length - 1];
                        // Calculate small distance increment (simplified)
                        const d = calculateDistance(last.lat, last.lng, newPoint.lat, newPoint.lng);
                        setDistance(old => old + d);
                    }
                    return [...prev, newPoint];
                });
              }
            });
        } catch (e) { console.error(e); }
      };
      startWatching();
    }
    return () => { if (watchId) Geolocation.clearWatch({ id: watchId }); };
  }, [isRunning, isPaused, isTreadmill]);

  // --- TIMER & STATS ---
  useEffect(() => {
    if (isRunning && !isPaused) {
      timerRef.current = setInterval(() => {
        setTime(prev => prev + 1);
        setSteps(prev => prev + (isTreadmill ? 2.5 : 2.2));
        setBpm(prev => bpm > 0 ? prev : 140); // Placeholder if no watch data
        setCalories(prev => prev + 0.12);
      }, 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [isRunning, isPaused]);

  // Haversine formula for distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

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
          const runData = {
              type: 'run',
              date: new Date().toISOString(),
              duration: time,
              distance: parseFloat(distance.toFixed(2)),
              calories: caloriesVal,
              route: path // The Exercise Route for Health Connect
          };

          // 1. Save to Firebase
          const userRef = doc(db, "users", currentUser.uid);
          await updateDoc(userRef, { history: arrayUnion(runData) });

          // 2. Write to Health Connect (via Native Plugin)
          if (Capacitor.getPlatform() === 'android') {
              try {
                  await WearPlugin.sendDataToWatch({
                      path: "/write-health-connect-route",
                      data: JSON.stringify(runData)
                  });
              } catch (e) { console.error("Health Connect Error:", e); }
          }
      } catch (e) { console.error(e); }
    }
    setIsRunning(false);
    setShowConfirmStop(false);
    setShowSummary(true);
  };

  const resetSession = () => {
    setTime(0); setDistance(0); setSteps(0); setCalories(0); setPath([]);
    setShowSummary(false); setIsTreadmill(false); setShowMap(false);
    if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (authLoading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-white">Chargement...</div>;

  return (
    <div className="p-3 sm:p-4 bg-[#0a0a0f] min-h-screen text-white pb-32 overflow-x-hidden max-w-full">
      {/* HEADER COMPACT */}
      <div className="flex items-center justify-between mb-4 bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#7b2cbf] rounded-xl"><Navigation className="text-white size-4"/></div>
          <h1 className="text-lg font-black italic uppercase tracking-tighter">KAYBEE RUN</h1>
        </div>
        {!isRunning && (
          <button onClick={() => setIsTreadmill(!isTreadmill)} className={`h-8 px-3 rounded-lg font-black uppercase text-[9px] border transition-all ${isTreadmill ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white' : 'bg-black/40 border-gray-800 text-gray-500'}`}>
            {isTreadmill ? "TAPIS ON" : "EXTÉRIEUR"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
          <Card className={`bg-[#1a1a20] border-gray-800 rounded-[2rem] overflow-hidden relative transition-all duration-500 flex flex-col ${showMap ? 'h-[60vh]' : 'min-h-[400px] h-auto'} shadow-2xl`}>
            {/* MAP VIEW OVERLAY */}
            {showMap && !isTreadmill && (
                <div id={mapContainerId} className="absolute inset-0 z-0"></div>
            )}

            <CardContent className={`relative z-10 flex flex-col items-center text-center p-6 ${showMap ? 'bg-gradient-to-t from-[#1a1a20] via-transparent to-transparent mt-auto w-full' : 'justify-center h-full'}`}>
              <AnimatePresence mode="wait">
                {countdown !== null ? (
                  <motion.div key="countdown" initial={{ scale: 0 }} animate={{ scale: 1.5 }} exit={{ scale: 4, opacity: 0 }} className="text-8xl font-black italic text-[#00f5d4]">{countdown}</motion.div>
                ) : (
                  <div className="w-full space-y-6">
                    <div className="space-y-1">
                        <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${showMap ? 'text-white' : 'text-gray-500'}`}>Durée</p>
                        <h2 className={`text-5xl sm:text-7xl font-black italic font-mono tracking-tighter text-white`}>{formatTime(time)}</h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <RunMetricItem label="Distance" value={distance.toFixed(2)} unit="KM" color="text-[#00f5d4]" />
                        <RunMetricItem label="Calories" value={Math.round(calories)} unit="KCAL" color="text-[#ff7675]" />
                        {!showMap && (
                            <>
                                <RunMetricItem label="Rythme" value={bpm || '--'} unit="BPM" color="text-[#ff0055]" />
                                <RunMetricItem label="Cadence" value={avgCadence || '--'} unit="SPM" color="text-[#7b2cbf]" />
                            </>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-4 pt-2">
                        {isRunning && !isTreadmill && (
                            <Button
                                variant="ghost"
                                onClick={() => setShowMap(!showMap)}
                                className={`rounded-full h-10 px-4 text-[10px] font-black uppercase italic gap-2 ${showMap ? 'bg-[#00f5d4] text-black' : 'bg-white/5 text-white'}`}
                            >
                                {showMap ? <EyeOff size={14}/> : <MapIcon size={14}/>} {showMap ? "Masquer Map" : "Voir Parcours"}
                            </Button>
                        )}

                        <div className="flex justify-center gap-6">
                            {!isRunning ? (
                                <Button onClick={handleStart} className="size-20 rounded-full bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20 active:scale-95 transition-all"><Play fill="currentColor" size={28}/></Button>
                            ) : (
                                <>
                                    <Button onClick={() => setIsPaused(!isPaused)} className="size-16 rounded-full bg-white/5 border border-white/10 text-white active:scale-95 transition-all">{isPaused ? <Play fill="currentColor" size={20}/> : <Pause fill="currentColor" size={20}/>}</Button>
                                    <Button onClick={() => setShowConfirmStop(true)} className="size-16 rounded-full bg-red-500/20 border border-red-500/50 text-red-500 active:scale-95 transition-all"><Square fill="currentColor" size={20}/></Button>
                                </>
                            )}
                        </div>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
      </div>

      {/* CONFIRM STOP MODAL */}
      <Dialog open={showConfirmStop} onOpenChange={setShowConfirmStop}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl w-[90vw] max-w-sm p-6">
          <DialogHeader><DialogTitle className="text-xl font-black italic uppercase text-center text-[#ff7675]">ARRÊTER ?</DialogTitle></DialogHeader>
          <div className="flex gap-3 mt-6">
            <Button onClick={() => setShowConfirmStop(false)} variant="outline" className="flex-1 border-gray-700 h-11 rounded-xl text-[10px] font-black uppercase">REPRENDRE</Button>
            <Button onClick={confirmStop} className="flex-1 bg-red-500 text-white h-11 rounded-xl font-black text-[10px] uppercase">STOP</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SUMMARY MODAL */}
      <Dialog open={showSummary} onOpenChange={(open) => { if(!open) resetSession(); }}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-full h-screen sm:h-auto rounded-none sm:rounded-[2rem] p-0 overflow-hidden fixed bottom-0">
            <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-6">
                <div className="size-16 rounded-full bg-[#00f5d4]/10 flex items-center justify-center border border-[#00f5d4]/30"><Trophy size={32} className="text-[#00f5d4]"/></div>
                <div className="space-y-1">
                    <h2 className="text-2xl font-black italic uppercase text-white">BRAVO !</h2>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Session enregistrée dans Health Connect</p>
                </div>

                <div className="w-full h-40 bg-white/5 rounded-2xl overflow-hidden border border-white/5 relative">
                   {/* Summary Map Static Placeholder */}
                   <div className="absolute inset-0 flex items-center justify-center opacity-20"><MapPin size={40}/></div>
                   <div className="absolute bottom-4 left-0 right-0 text-[10px] font-bold text-gray-500">PARCOURS ENREGISTRÉ</div>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-left">
                        <p className="text-[8px] text-gray-500 font-black uppercase mb-1">Distance</p>
                        <p className="text-2xl font-black text-white italic">{distance.toFixed(2)} <span className="text-[10px]">KM</span></p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-left">
                        <p className="text-[8px] text-gray-500 font-black uppercase mb-1">Temps</p>
                        <p className="text-2xl font-black text-[#00f5d4] italic">{formatTime(time)}</p>
                    </div>
                </div>
                <Button onClick={resetSession} className="w-full bg-[#00f5d4] text-black font-black h-14 rounded-xl text-md uppercase italic">RETOUR AU DASHBOARD</Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunMetricItem({ label, value, unit, color }) {
    return (
        <div className="bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/5 text-center flex flex-col justify-center items-center">
            <p className="text-[7px] text-gray-400 font-black uppercase mb-0.5 tracking-wider">{label}</p>
            <p className={`text-base font-black ${color} italic leading-none`}>{value}</p>
            <p className="text-[6px] text-gray-600 font-bold uppercase mt-0.5">{unit}</p>
        </div>
    );
}
