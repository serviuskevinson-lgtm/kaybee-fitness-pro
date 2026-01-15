import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  Timer, CheckCircle, ChevronDown, ChevronUp, 
  Play, RotateCcw, Dumbbell, Calendar, AlertCircle, ArrowRight 
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Session() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // --- ÉTATS ---
  const [workout, setWorkout] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [isSessionStarted, setIsSessionStarted] = useState(false); 

  const [seconds, setSeconds] = useState(0);
  const [expandedExo, setExpandedExo] = useState(null);
  const [completedSets, setCompletedSets] = useState({});
  
  // --- GESTION DU REPOS & SON ---
  const [activeRest, setActiveRest] = useState({ exoIdx: null, timeLeft: 0 });
  const audioContext = useRef(null);

  // Initialisation du son (Beep)
  const playEndRestSound = () => {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime); // Note La
      gainNode.gain.setValueAtTime(0.1, context.currentTime);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.5); // Son de 0.5 secondes

      if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]); // Double vibration
      }
    } catch (e) {
      console.error("Audio blocké par le navigateur", e);
    }
  };

  useEffect(() => {
    const loadSession = async () => {
      setLoading(true);
      if (location.state?.workout) {
        setWorkout(location.state.workout);
      } else if (currentUser) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().workouts?.length > 0) {
            setWorkout(docSnap.data().workouts[0]);
          }
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    };
    loadSession();
  }, [currentUser, location]);

  // Chrono Global
  useEffect(() => {
    let interval = null;
    if (isSessionStarted) {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionStarted]);

  // Chrono Repos
  useEffect(() => {
    let timer = null;
    if (activeRest.timeLeft > 0) {
      timer = setInterval(() => {
        setActiveRest(prev => ({ ...prev, timeLeft: prev.timeLeft - 1 }));
      }, 1000);
    } else if (activeRest.exoIdx !== null && activeRest.timeLeft === 0) {
      playEndRestSound();
      setActiveRest({ exoIdx: null, timeLeft: 0 });
    }
    return () => clearInterval(timer);
  }, [activeRest]);

  const startRest = (exoIdx, restTime) => {
    setActiveRest({ exoIdx, timeLeft: restTime || 90 });
  };

  const formatTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins < 10 && hrs > 0 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const toggleSetComplete = (exoId, setIndex) => {
    const key = `${exoId}-${setIndex}`;
    setCompletedSets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">Chargement...</div>;

  if (!workout) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-8 flex flex-col items-center justify-center text-center">
        <AlertCircle size={64} className="text-red-500 mb-4 opacity-20" />
        <h2 className="text-2xl font-bold mb-2">Aucune séance active</h2>
        <p className="text-gray-400 mb-8 max-w-xs">Vous devez sélectionner ou planifier une séance avant de commencer.</p>
        <Link to="/exercises">
          <Button className="bg-[#7b2cbf] hover:bg-[#9d4edd] gap-2 py-6 px-10 rounded-2xl font-black italic">
            ALLER AU CATALOGUE <ArrowRight size={20} />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 lg:p-8 pb-32">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-800 pb-8">
          <div className="flex-1">
            <h1 className="text-5xl font-black text-white uppercase italic tracking-tighter leading-none">
              {workout.name}
            </h1>
            <div className="flex items-center gap-4 mt-4 text-gray-500">
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                <Dumbbell size={14} className="text-[#00f5d4]" /> {workout.exercises?.length} EXERCICES
              </span>
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                <Timer size={14} className="text-[#7b2cbf]" /> {formatTime(seconds)}
              </span>
            </div>
          </div>

          {!isSessionStarted ? (
            <Button 
              onClick={() => setIsSessionStarted(true)}
              className="w-full md:w-auto bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black py-8 px-12 text-2xl rounded-3xl shadow-[0_0_30px_rgba(0,245,212,0.3)] hover:scale-105 transition-transform italic"
            >
              <Play className="mr-2 fill-black" /> LET'S GO
            </Button>
          ) : (
            <Button className="w-full md:w-auto bg-[#1a1a20] text-[#00f5d4] border border-[#00f5d4]/30 font-black py-8 px-12 text-xl rounded-3xl cursor-default">
               SÉANCE EN COURS...
            </Button>
          )}
        </div>

        {/* Liste des Exercices */}
        <div className="space-y-4">
          {workout.exercises?.map((exo, idx) => {
            const isExpanded = expandedExo === idx;
            const exoId = `exo-${idx}`;
            const isResting = activeRest.exoIdx === idx;

            return (
              <div 
                key={idx} 
                className={`transition-all duration-300 rounded-3xl overflow-hidden border ${
                  isExpanded ? 'bg-[#14141c] border-[#7b2cbf] shadow-xl' : 'bg-[#1a1a20] border-gray-800'
                }`}
              >
                {/* Header Exercice */}
                <div 
                  className="p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedExo(isExpanded ? null : idx)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-black border border-gray-800 overflow-hidden flex-shrink-0">
                      <img src={exo.imageUrl} alt={exo.name} className="w-full h-full object-cover opacity-80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg truncate">{exo.name}</h3>
                      <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                        {exo.sets || 4} Séries • {exo.reps || 12} Reps
                      </p>
                    </div>
                  </div>
                  <div className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-[#7b2cbf] text-white' : 'text-gray-500'}`}>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {/* Détails Exercice */}
                {isExpanded && (
                  <div className="px-5 pb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    
                    <div className="w-full h-64 bg-black rounded-2xl overflow-hidden border border-gray-800 relative group">
                        <img 
                          src={exo.imageUrl} 
                          alt={exo.name} 
                          className="w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-4 left-4">
                             <Badge className="bg-[#7b2cbf] border-none">4K ANATOMY VIEW</Badge>
                        </div>
                    </div>

                    <div className="space-y-3">
                      {Array.from({ length: parseInt(exo.sets || 4) }).map((_, i) => {
                        const isDone = completedSets[`${exoId}-${i}`];
                        return (
                          <div 
                            key={i} 
                            className={`grid grid-cols-12 gap-3 items-center p-3 rounded-2xl transition-all border ${
                              isDone ? 'bg-[#00f5d4]/5 border-[#00f5d4]/20' : 'bg-black/20 border-transparent'
                            }`}
                          >
                            <div className="col-span-2 text-center">
                              <span className={`text-sm font-black ${isDone ? 'text-[#00f5d4]' : 'text-gray-600'}`}>
                                SET {i + 1}
                              </span>
                            </div>
                            
                            <div className="col-span-4">
                                <Input 
                                  placeholder="Poids" 
                                  className="bg-black border-gray-800 text-center font-bold text-white h-12 rounded-xl"
                                />
                            </div>

                            <div className="col-span-4">
                                <Input 
                                  placeholder="Reps" 
                                  className="bg-black border-gray-800 text-center font-bold text-white h-12 rounded-xl"
                                />
                            </div>

                            <div className="col-span-2 flex justify-center">
                              <button 
                                onClick={() => toggleSetComplete(exoId, i)}
                                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                  isDone 
                                  ? 'bg-[#00f5d4] text-black shadow-[0_0_15px_rgba(0,245,212,0.4)]' 
                                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                                }`}
                              >
                                <CheckCircle size={24} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-800 flex justify-center">
                      <Button 
                        variant="outline" 
                        disabled={isResting}
                        onClick={() => startRest(idx, exo.rest)}
                        className={`gap-2 w-full py-7 rounded-2xl text-lg font-bold transition-all ${
                          isResting 
                          ? 'border-[#00f5d4] text-[#00f5d4] bg-[#00f5d4]/10' 
                          : 'border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white'
                        }`}
                      >
                         <RotateCcw size={20} className={isResting ? 'animate-spin' : ''} /> 
                         {isResting ? `REPOS EN COURS : ${activeRest.timeLeft}s` : `LANCER REPOS (${exo.rest || 90}s)`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isSessionStarted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0a0a0f]/80 backdrop-blur-xl border-t border-gray-800 lg:left-64">
          <div className="max-w-3xl mx-auto">
            <Button 
              className="w-full py-8 bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] text-black font-black text-2xl rounded-3xl shadow-[0_0_30px_rgba(123,44,191,0.3)] hover:scale-[1.02] transition-transform italic"
              onClick={() => {
                alert("Séance terminée ! Bien joué.");
                navigate('/dashboard');
              }}
            >
              TERMINER LA SESSION
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}