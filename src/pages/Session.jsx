import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { 
  Timer, CheckCircle, ChevronDown, ChevronUp, 
  Play, RotateCcw, Dumbbell, AlertCircle, ArrowRight, XCircle, Save, 
  Trophy, Scale, Camera, Activity
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';

export default function Session() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // --- ÉTATS ---
  const [workout, setWorkout] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [isSessionStarted, setIsSessionStarted] = useState(false); 
  const [isSaving, setIsSaving] = useState(false);

  const [seconds, setSeconds] = useState(0);
  const [expandedExo, setExpandedExo] = useState(null);
  const [sessionLogs, setSessionLogs] = useState({});
  const [activeRest, setActiveRest] = useState({ exoIdx: null, timeLeft: 0 });

  // --- ÉTATS POUR LES MODALES (REMPLACEMENT DES ALERTS) ---
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [sessionStats, setSessionStats] = useState({ volume: 0, sets: 0, time: 0 });

  // Son de fin de repos
  const playEndRestSound = () => {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gainNode.gain.setValueAtTime(0.1, context.currentTime);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.5);
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    } catch (e) { console.error("Audio bloqué", e); }
  };

  // --- CHARGEMENT ---
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      if (location.state?.workout) {
        setWorkout(location.state.workout);
      } else if (location.state?.sessionData) {
        setWorkout({ name: "Séance Personnalisée", exercises: location.state.sessionData });
      } else {
        setWorkout(null);
      }
      setLoading(false);
    };
    loadData();
  }, [currentUser, location]);

  // Chrono Global
  useEffect(() => {
    let interval = null;
    if (isSessionStarted && !showSummaryModal) {
      interval = setInterval(() => setSeconds(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionStarted, showSummaryModal]);

  // Chrono Repos
  useEffect(() => {
    let timer = null;
    if (activeRest.timeLeft > 0) {
      timer = setInterval(() => setActiveRest(prev => ({ ...prev, timeLeft: prev.timeLeft - 1 })), 1000);
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

  const handleSetChange = (exoIdx, setIdx, field, value) => {
    const key = `${exoIdx}-${setIdx}`;
    setSessionLogs(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const toggleSetComplete = (exoIdx, setIdx) => {
    const key = `${exoIdx}-${setIdx}`;
    setSessionLogs(prev => ({ ...prev, [key]: { ...prev[key], done: !prev[key]?.done } }));
  };

  // --- PRÉPARATION DU RÉSUMÉ (AVANT SAUVEGARDE) ---
  const handleOpenSummary = () => {
    let totalVolume = 0;
    let totalSets = 0;

    Object.values(sessionLogs).forEach(log => {
        if (log.done) {
            totalSets++;
            totalVolume += (parseFloat(log.weight || 0) * parseFloat(log.reps || 0));
        }
    });

    setSessionStats({
        volume: totalVolume,
        sets: totalSets,
        time: seconds
    });
    setShowSummaryModal(true);
  };

  // --- SAUVEGARDE RÉELLE DANS FIREBASE ---
  const confirmSaveSession = async () => {
    if (!currentUser || !workout) return;
    setIsSaving(true);

    try {
        const historyItem = {
            id: Date.now().toString(),
            name: workout.name || "Séance Libre",
            date: new Date().toISOString(),
            duration: sessionStats.time,
            volume: sessionStats.volume,
            totalSets: sessionStats.sets,
            type: 'workout', 
            logs: sessionLogs 
        };

        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            history: arrayUnion(historyItem),
            workoutsCompleted: increment(1),
            points: increment(sessionStats.sets * 10),
            totalVolume: increment(sessionStats.volume)
        });

        navigate('/dashboard'); 

    } catch (e) {
        console.error("Erreur sauvegarde session:", e);
        alert("Erreur réseau. Réessaie.");
    } finally {
        setIsSaving(false);
    }
  };

  const confirmCancelSession = () => {
      navigate('/dashboard');
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">{t('loading')}</div>;

  // --- ÉTAT : PAS DE SÉANCE ACTIVE ---
  if (!workout) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-8 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="relative z-10 w-full max-w-2xl text-center">
            <div className="mb-12 text-center opacity-50">
                <h2 className="text-2xl font-bold uppercase">{t('no_active_session')}</h2>
            </div>
            <Link to="/exercises">
                <Button className="bg-[#7b2cbf] hover:bg-[#9d4edd] gap-2 py-6 px-10 rounded-2xl font-black italic">
                    {t('go_catalog')} <ArrowRight size={20} />
                </Button>
            </Link>
        </div>
      </div>
    );
  }

  // --- ÉTAT : SÉANCE ACTIVE ---
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 lg:p-8 pb-32">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-800 pb-8">
          <div className="flex-1">
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase italic tracking-tighter leading-none">
              {workout.name}
            </h1>
            <div className="flex items-center gap-4 mt-4 text-gray-500">
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                <Dumbbell size={14} className="text-[#00f5d4]" /> {workout.exercises?.length} {t('exercises').toUpperCase()}
              </span>
              <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                <Timer size={14} className="text-[#7b2cbf]" /> {formatTime(seconds)}
              </span>
            </div>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            {!isSessionStarted ? (
                <Button 
                onClick={() => setIsSessionStarted(true)}
                className="flex-1 md:flex-none bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black py-6 px-8 text-xl rounded-2xl shadow-[0_0_20px_rgba(0,245,212,0.3)] hover:scale-105 transition-transform italic"
                >
                <Play className="mr-2 fill-black" /> {t('lets_go')}
                </Button>
            ) : (
                <Button variant="outline" onClick={() => setShowCancelModal(true)} className="border-red-500/50 text-red-500 hover:bg-red-500/10">
                    <XCircle className="mr-2"/> Effacer
                </Button>
            )}
          </div>
        </div>

        {/* Liste des Exercices */}
        <div className="space-y-4">
          {workout.exercises?.map((exo, idx) => {
            const isExpanded = expandedExo === idx;
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
                      <img src={exo.imageUrl} alt={exo.name} className="w-full h-full object-cover opacity-80" onError={(e) => e.target.src = "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg truncate">{exo.name}</h3>
                      <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                        {exo.sets || 3} {t('sets')} • {exo.reps || 10} Reps
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
                    
                    <div className="space-y-3">
                      {Array.from({ length: parseInt(exo.sets || 3) }).map((_, i) => {
                        const key = `${idx}-${i}`;
                        const log = sessionLogs[key] || {};
                        const isDone = log.done;

                        return (
                          <div 
                            key={i} 
                            className={`grid grid-cols-12 gap-3 items-center p-3 rounded-2xl transition-all border ${
                              isDone ? 'bg-[#00f5d4]/10 border-[#00f5d4]/30' : 'bg-black/20 border-transparent'
                            }`}
                          >
                            <div className="col-span-2 text-center">
                              <span className={`text-sm font-black ${isDone ? 'text-[#00f5d4]' : 'text-gray-600'}`}>
                                SET {i + 1}
                              </span>
                            </div>
                            
                            <div className="col-span-4">
                                <Input 
                                  type="number"
                                  placeholder={t('weight_kg')} 
                                  className={`bg-black border-gray-800 text-center font-bold text-white h-12 rounded-xl ${isDone ? 'text-[#00f5d4]' : ''}`}
                                  onChange={(e) => handleSetChange(idx, i, 'weight', e.target.value)}
                                  value={log.weight || ''}
                                />
                            </div>

                            <div className="col-span-4">
                                <Input 
                                  type="number"
                                  placeholder="Reps" 
                                  className={`bg-black border-gray-800 text-center font-bold text-white h-12 rounded-xl ${isDone ? 'text-[#00f5d4]' : ''}`}
                                  onChange={(e) => handleSetChange(idx, i, 'reps', e.target.value)}
                                  value={log.reps || ''}
                                />
                            </div>

                            <div className="col-span-2 flex justify-center">
                              <button 
                                onClick={() => toggleSetComplete(idx, i)}
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
                         {isResting ? `${t('rest_active')} : ${activeRest.timeLeft}s` : `${t('start_rest')} (${exo.rest || 90}s)`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- FOOTER FLOTTANT (FINIR / ANNULER) --- */}
      {isSessionStarted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0a0a0f]/90 backdrop-blur-xl border-t border-gray-800 lg:left-64 z-50">
          <div className="max-w-3xl mx-auto flex gap-4">
            <Button 
              variant="outline"
              className="py-8 border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold rounded-2xl flex-1"
              onClick={() => setShowCancelModal(true)}
            >
              <XCircle className="mr-2"/> {t('cancel')}
            </Button>

            <Button 
              className="py-8 bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] text-black font-black text-xl rounded-2xl shadow-[0_0_30px_rgba(123,44,191,0.3)] hover:scale-[1.02] transition-transform italic flex-[2]"
              onClick={handleOpenSummary}
              disabled={isSaving}
            >
              {isSaving ? "Sauvegarde..." : <><Save className="mr-2"/> {t('end_session')}</>}
            </Button>
          </div>
        </div>
      )}

      {/* --- MODALE 1: CONFIRMATION D'ANNULATION --- */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="bg-[#1a1a20] border-red-500/30 text-white rounded-3xl max-w-sm">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black text-red-500 italic uppercase flex items-center gap-2">
                    <AlertCircle /> Attention
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-lg">
                    Voulez-vous vraiment abandonner ?<br/>
                    <span className="text-xs text-gray-500">Aucune donnée ne sera sauvegardée.</span>
                </DialogDescription>
            </DialogHeader>
            <DialogFooter className="grid grid-cols-2 gap-4 mt-4">
                <Button variant="outline" onClick={() => setShowCancelModal(false)} className="h-12 rounded-xl border-gray-700">Retour</Button>
                <Button onClick={confirmCancelSession} className="h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold">Effacer</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- MODALE 2: RÉSUMÉ DE SESSION & RAPPELS --- */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="bg-[#0a0a0f] border-[#7b2cbf]/50 text-white rounded-3xl max-w-md p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] p-6 text-center">
                <Trophy className="mx-auto text-black mb-2 w-12 h-12 drop-shadow-lg" />
                <DialogTitle className="text-3xl font-black text-black italic uppercase">SESSION TERMINÉE !</DialogTitle>
                <p className="text-black/70 font-bold text-sm">Beau travail, continue comme ça.</p>
            </div>
            
            <div className="p-6 space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#1a1a20] p-3 rounded-xl border border-gray-800 text-center">
                        <Activity className="mx-auto text-[#00f5d4] w-5 h-5 mb-1" />
                        <p className="text-lg font-black text-white">{sessionStats.sets}</p>
                        <p className="text-[10px] text-gray-500 uppercase font-bold">Séries</p>
                    </div>
                    <div className="bg-[#1a1a20] p-3 rounded-xl border border-gray-800 text-center">
                        <Dumbbell className="mx-auto text-[#7b2cbf] w-5 h-5 mb-1" />
                        <p className="text-lg font-black text-white">{(sessionStats.volume / 1000).toFixed(1)}T</p>
                        <p className="text-[10px] text-gray-500 uppercase font-bold">Volume</p>
                    </div>
                    <div className="bg-[#1a1a20] p-3 rounded-xl border border-gray-800 text-center">
                        <Timer className="mx-auto text-white w-5 h-5 mb-1" />
                        <p className="text-lg font-black text-white">{Math.floor(sessionStats.time / 60)}</p>
                        <p className="text-[10px] text-gray-500 uppercase font-bold">Minutes</p>
                    </div>
                </div>

                {/* Rappels Visuels */}
                <div className="space-y-3">
                    <div className="bg-[#1a1a20] p-4 rounded-xl border border-gray-800 flex items-center gap-4">
                        <div className="p-3 bg-[#00f5d4]/10 rounded-full text-[#00f5d4]"><Scale size={20}/></div>
                        <div>
                            <p className="font-bold text-sm text-white">Suivi du Poids</p>
                            <p className="text-xs text-gray-500">N'oublie pas de te peser demain matin à jeun.</p>
                        </div>
                    </div>
                    <div className="bg-[#1a1a20] p-4 rounded-xl border border-gray-800 flex items-center gap-4">
                        <div className="p-3 bg-[#7b2cbf]/10 rounded-full text-[#7b2cbf]"><Camera size={20}/></div>
                        <div>
                            <p className="font-bold text-sm text-white">Progression Visuelle</p>
                            <p className="text-xs text-gray-500">Prends une photo pour voir tes progrès !</p>
                        </div>
                    </div>
                </div>

                <Button onClick={confirmSaveSession} className="w-full h-14 text-lg font-black bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black rounded-2xl shadow-[0_0_20px_rgba(0,245,212,0.3)]">
                    {isSaving ? "Sauvegarde..." : "ENREGISTRER & QUITTER"}
                </Button>
            </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}