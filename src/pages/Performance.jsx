import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore"; // Ajout de arrayRemove
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, Calendar, Trophy, Activity, Dumbbell, ArrowUpRight, 
  Users, Scale, Timer, Target, Zap, 
  Download, Trash2, AlertTriangle, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

// --- CONSTANTES & CONFIGURATION ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a20] border border-gray-700 p-4 rounded-xl shadow-2xl backdrop-blur-md bg-opacity-90">
        <p className="text-white font-bold text-sm mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-300 capitalize">{entry.name}:</span>
            <span className="font-mono font-bold text-white">
              {entry.value} {entry.unit || ''}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Squelette de chargement
const PerformanceSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex justify-between items-center">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64 bg-gray-800" />
        <Skeleton className="h-4 w-48 bg-gray-800" />
      </div>
      <Skeleton className="h-10 w-32 bg-gray-800" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 bg-gray-800 rounded-xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Skeleton className="h-80 bg-gray-800 rounded-xl" />
      <Skeleton className="h-80 bg-gray-800 rounded-xl" />
    </div>
  </div>
);

// Carte KPI
const KPICard = ({ title, value, unit, icon: Icon, trend, color, description }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -5 }}
    className="h-full"
  >
    <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-opacity-50 transition-all duration-300 h-full overflow-hidden relative group">
      <div className={`absolute top-0 left-0 w-1 h-full`} style={{ backgroundColor: color }} />
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-5 group-hover:opacity-10 transition-opacity`} style={{ backgroundColor: color }} />
      
      <CardContent className="p-6 flex flex-col justify-between h-full relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl bg-opacity-10`} style={{ backgroundColor: `${color}20`, color: color }}>
            <Icon size={24} />
          </div>
          {trend && (
            <Badge variant="outline" className={`border-${trend > 0 ? 'green' : 'red'}-500 text-${trend > 0 ? 'green' : 'red'}-400 bg-transparent`}>
              {trend > 0 ? '+' : ''}{trend}%
            </Badge>
          )}
        </div>
        
        <div>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
          <div className="flex items-baseline gap-1">
            <h3 className="text-3xl font-black text-white">{value}</h3>
            <span className="text-sm text-gray-400 font-medium">{unit}</span>
          </div>
          {description && <p className="text-xs text-gray-600 mt-2">{description}</p>}
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

// --- COMPOSANT PRINCIPAL ---
export default function Performance() {
  const { currentUser } = useAuth();
  const { selectedClient, isCoachView, targetUserId } = useClient();
  const { t } = useTranslation();
  
  // --- ÉTATS ---
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [timeRange, setTimeRange] = useState("month");
  const [selectedMetric, setSelectedMetric] = useState("volume");
  
  // États des Modales
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null); // Pour la suppression
  const [selectedSession, setSelectedSession] = useState(null); // Pour les détails

  // --- EFFETS : CHARGEMENT DES DONNÉES ---
  useEffect(() => {
    const fetchData = async () => {
      if (!targetUserId) return;
      setLoading(true);

      try {
        const userDocRef = doc(db, "users", targetUserId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          setUserProfile(userDocSnap.data());
          const data = userDocSnap.data();
          let rawHistory = data.history || [];
          // Tri chronologique inverse pour l'affichage liste
          setHistory(rawHistory.sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      } catch (e) {
        console.error("Erreur fetch performance", e);
      } finally {
        setTimeout(() => setLoading(false), 800);
      }
    };
    fetchData();
  }, [targetUserId]);

  // --- ACTIONS ---

  // 1. Suppression d'une séance
  const handleDeleteConfirm = async () => {
    if (!sessionToDelete || !targetUserId) return;
    try {
        const userRef = doc(db, "users", targetUserId);
        
        // Suppression dans Firebase (arrayRemove enlève l'objet exact)
        await updateDoc(userRef, {
            history: arrayRemove(sessionToDelete) 
        });

        // Mise à jour locale
        const newHistory = history.filter(h => h.id !== sessionToDelete.id);
        setHistory(newHistory);
        setSessionToDelete(null); // Fermer la modale

    } catch (e) {
        console.error("Erreur suppression", e);
        alert("Erreur lors de la suppression.");
    }
  };

  // --- CALCULS & TRANSFORMATIONS ---
  const filteredHistory = useMemo(() => {
    const now = new Date();
    let cutoff;
    if (timeRange === 'week') cutoff = subDays(now, 7);
    else if (timeRange === 'month') cutoff = subDays(now, 30);
    else if (timeRange === 'year') cutoff = subDays(now, 365);
    else cutoff = new Date(0); 

    return history.filter(h => {
        const d = new Date(h.date);
        return isValid(d) && d >= cutoff;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [history, timeRange]);

  const stats = useMemo(() => {
    if (filteredHistory.length === 0) return { total: 0, volume: 0, duration: 0, avgIntensity: 0 };
    const total = filteredHistory.length;
    const volume = filteredHistory.reduce((acc, curr) => acc + (curr.volume || curr.totalLoad || 0), 0);
    const duration = filteredHistory.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    // On suppose que l'intensité est stockée, sinon 0
    const avgIntensity = filteredHistory.reduce((acc, curr) => acc + (curr.intensity || 0), 0) / (total || 1);

    return {
      total,
      volume,
      duration,
      avgDuration: Math.round(duration / (total || 1)),
      avgIntensity: avgIntensity.toFixed(1)
    };
  }, [filteredHistory]);

  const chartData = useMemo(() => {
    return filteredHistory.map(h => {
        const d = new Date(h.date);
        if (!isValid(d)) return null;
        return {
            date: format(d, timeRange === 'week' ? 'EEE' : 'dd/MM'),
            fullDate: format(d, 'PPP', { locale: fr }),
            volume: h.volume || h.totalLoad || 0,
            duration: h.duration ? Math.round(h.duration / 60) : 0, // En minutes
            intensity: h.intensity || 0,
            weight: h.bodyWeight || userProfile?.weight 
        };
    }).filter(Boolean);
  }, [filteredHistory, timeRange, userProfile]);

  const weightData = useMemo(() => {
      const historyWeights = filteredHistory
        .filter(h => h.bodyWeight)
        .map(h => ({ date: h.date, weight: h.bodyWeight }));
      const profileWeights = userProfile?.weightHistory || [];
      const allWeights = [...historyWeights, ...profileWeights]
        .filter(w => isValid(new Date(w.date)))
        .sort((a,b) => new Date(a.date) - new Date(b.date))
        .map(w => ({
            date: format(new Date(w.date), 'dd/MM'),
            weight: parseFloat(w.weight)
        }));
      if (allWeights.length === 0 && userProfile?.weight) {
          return [{ date: format(new Date(), 'dd/MM'), weight: parseFloat(userProfile.weight) }];
      }
      return allWeights;
  }, [filteredHistory, userProfile]);

  // Helper pour afficher les détails des logs
  const renderSessionDetails = (logs) => {
    if (!logs || Object.keys(logs).length === 0) return <p className="text-gray-500 italic text-center py-4">Détails non disponibles pour cette séance.</p>;

    // Regroupement par index d'exercice (ex: "0-1" -> Exercice 0)
    const groupedLogs = {};
    Object.entries(logs).forEach(([key, val]) => {
        const [exoIdx] = key.split('-');
        if (!groupedLogs[exoIdx]) groupedLogs[exoIdx] = [];
        groupedLogs[exoIdx].push({ ...val });
    });

    return (
        <div className="space-y-4">
            {Object.entries(groupedLogs).map(([exoIdx, sets]) => (
                <div key={exoIdx} className="bg-black/40 p-4 rounded-xl border border-gray-800">
                    <h4 className="text-[#00f5d4] font-bold text-sm mb-3 uppercase flex items-center gap-2">
                        <Dumbbell size={14}/> Exercice #{parseInt(exoIdx) + 1}
                    </h4>
                    <div className="space-y-2">
                        {sets.map((s, i) => (
                            <div key={i} className="flex justify-between text-sm border-b border-gray-800/50 pb-2 last:border-0 last:pb-0">
                                <span className="text-gray-400">Série {i + 1}</span>
                                <span className="font-mono font-bold text-white">
                                    {s.done ? (
                                        <><span className="text-[#7b2cbf]">{s.weight}kg</span> <span className="text-gray-600">x</span> {s.reps}</>
                                    ) : (
                                        <span className="text-gray-600 italic">Non validé</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
  };

  if (loading) return <div className="p-8 bg-[#0a0a0f] min-h-screen"><PerformanceSkeleton /></div>;

  return (
    <div className="p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white pb-24 font-sans selection:bg-[#00f5d4] selection:text-black">
      
      {/* --- EN-TÊTE --- */}
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in slide-in-from-top duration-500">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] rounded-2xl shadow-lg shadow-purple-500/20">
                <Activity className="text-white w-8 h-8" />
              </div>
              <div>
                <h1 className="text-4xl font-black italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                  {isCoachView ? t('client_analysis') : t('performance')}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  {isCoachView && (
                    <Badge className="bg-[#7b2cbf] text-white border-none px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">
                      <Users size={10} className="mr-1"/> Coach View
                    </Badge>
                  )}
                  <p className="text-gray-400 text-sm font-medium">
                    {isCoachView 
                      ? `${t('tracking_folder')} ${selectedClient?.full_name || t('client')}`
                      : t('your_metrics')
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#1a1a20] p-1.5 rounded-xl border border-gray-800">
            {['week', 'month', 'year', 'all'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all duration-300 ${
                  timeRange === range 
                  ? 'bg-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {t(range)}
              </button>
            ))}
          </div>
        </header>

        {/* --- SECTION 1 : KPIs --- */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard 
            title={t('total_sessions')} 
            value={stats.total} 
            unit="Sess." 
            icon={Dumbbell} 
            color="#00f5d4" 
            trend={stats.total > 0 ? 100 : 0} 
            description={t('selected_period')}
          />
          <KPICard 
            title={t('total_volume')} 
            value={(stats.volume / 1000).toFixed(1)} 
            unit="Tonnes" 
            icon={Scale} 
            color="#7b2cbf" 
            trend={0}
            description={t('cumulative_load')}
          />
          <KPICard 
            title={t('effort_time')} 
            value={Math.floor(stats.duration / 60)} 
            unit="min" 
            icon={Timer} 
            color="#fdcb6e"
            description={`${stats.avgDuration} sec / ${t('session_avg')}`} 
          />
          <KPICard 
            title={t('avg_intensity')} 
            value={stats.avgIntensity} 
            unit="/ 10" 
            icon={Zap} 
            color="#ff7675"
            description="RPE" 
          />
        </section>

        {/* --- SECTION 2 : GRAPHIQUES --- */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <Card className="lg:col-span-2 kb-card bg-[#1a1a20] border-gray-800 shadow-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-white text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="text-[#00f5d4]" /> {t('progression')}
                </CardTitle>
                <CardDescription className="text-gray-500">{t('workload_analysis')}</CardDescription>
              </div>
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger className="w-[140px] bg-black/30 border-gray-700 text-white h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                  <SelectItem value="volume">Volume (kg)</SelectItem>
                  <SelectItem value="duration">{t('duration')} (min)</SelectItem>
                  <SelectItem value="intensity">{t('intensity')}</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="h-[350px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00f5d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" stroke="#666" tick={{fill: '#666', fontSize: 10}} tickLine={false} axisLine={false} dy={10}/>
                  <YAxis stroke="#666" tick={{fill: '#666', fontSize: 10}} tickLine={false} axisLine={false}/>
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#00f5d4', strokeWidth: 1, strokeDasharray: '5 5' }} />
                  <Area type="monotone" dataKey={selectedMetric} stroke="#00f5d4" strokeWidth={3} fillOpacity={1} fill="url(#colorMetric)" animationDuration={1500}/>
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="kb-card bg-[#1a1a20] border-gray-800 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
                <Target className="text-[#7b2cbf]" /> {t('weight_goal')}
              </CardTitle>
              <CardDescription>
                  {t('target')} : <span className="text-[#00f5d4] font-bold">{userProfile?.targetWeight || "?"} kg</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" stroke="#666" tick={{fill: '#666', fontSize: 10}} tickLine={false} axisLine={false} />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="#666" tick={{fill: '#666', fontSize: 10}} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="#7b2cbf" strokeWidth={3} dot={{r: 4, fill: '#7b2cbf'}} activeDot={{r: 6}}/>
                  {userProfile?.targetWeight && !isNaN(parseFloat(userProfile.targetWeight)) && (
                      <ReferenceLine y={parseFloat(userProfile.targetWeight)} stroke="#ff7675" strokeDasharray="3 3" label={{ position: 'top', value: 'Objectif', fill: '#ff7675', fontSize: 10 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </section>

        {/* --- SECTION 3 : HISTORIQUE DÉTAILLÉ (AVEC ACTIONS) --- */}
        <section className="space-y-4 mt-16">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Calendar className="text-[#fdcb6e]" /> {t('session_history')}
              </h2>
              <p className="text-gray-500 text-sm">{t('full_list_workouts')}</p>
            </div>
            
            <Button 
              variant="outline" 
              className="border-gray-700 text-gray-400 hover:text-white hover:border-white hover:bg-transparent"
              onClick={() => setIsExportDialogOpen(true)}
            >
              <Download size={16} className="mr-2"/> {t('export_csv')}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence>
              {filteredHistory.length > 0 ? (
                filteredHistory.slice().reverse().map((session, index) => {
                  const sessionDate = new Date(session.date);
                  if (!isValid(sessionDate)) return null;

                  return (
                    <motion.div key={session.id || index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
                      <Card className="bg-[#111116] border border-gray-800/60 hover:border-[#00f5d4]/50 transition-all duration-300 group overflow-hidden">
                        <div className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          
                          <div className="flex items-center gap-4">
                            <div className="bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 group-hover:border-[#00f5d4] transition-colors shadow-inner">
                              <Trophy size={24} className="text-[#ffd700]" />
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-white group-hover:text-[#00f5d4] transition-colors">
                                {session.name || t('free_workout')}
                              </h3>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                <span className="flex items-center gap-1"><Calendar size={12}/> {format(sessionDate, 'PPP', { locale: fr })}</span>
                                <span className="w-1 h-1 rounded-full bg-gray-700"/>
                                <span className="flex items-center gap-1"><Timer size={12}/> {session.duration ? Math.floor(session.duration / 60) : 0} min</span>
                              </div>
                            </div>
                          </div>

                          <div className="hidden md:flex items-center gap-8">
                            <div className="text-center">
                              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Volume</p>
                              <p className="text-xl font-black text-white">{session.volume || session.totalLoad || 0} <span className="text-xs font-normal text-gray-600">kg</span></p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Intensité</p>
                              <div className="flex items-center gap-1 justify-center">
                                <span className={`text-xl font-black ${session.intensity >= 8 ? 'text-red-500' : session.intensity >= 6 ? 'text-yellow-500' : 'text-green-500'}`}>
                                  {session.intensity || '-'}
                                </span>
                                <span className="text-xs text-gray-600">/10</span>
                              </div>
                            </div>
                          </div>

                          {/* --- ACTIONS AJOUTÉES ICI --- */}
                          <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                            <Button 
                                className="flex-1 md:flex-none bg-[#1a1a20] hover:bg-[#25252d] text-white border border-gray-700 rounded-xl"
                                onClick={() => setSelectedSession(session)} // Ouvre les détails
                            >
                              {t('details')} <ArrowUpRight size={16} className="ml-2"/>
                            </Button>
                            
                            <Button 
                                variant="ghost" 
                                size="icon"
                                className="text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                                onClick={() => setSessionToDelete(session)} // Ouvre la confirmation de suppression
                            >
                                <Trash2 size={18} />
                            </Button>
                          </div>

                        </div>
                        <div className="h-1 w-full bg-gray-900">
                          <div className="h-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]" style={{ width: `${Math.min(((session.intensity || 5) / 10) * 100, 100)}%` }}/>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center py-20 bg-[#1a1a20] rounded-3xl border border-dashed border-gray-800">
                  <Activity className="mx-auto mb-4 text-gray-600" size={64}/>
                  <h3 className="text-xl font-bold text-white mb-2">{t('no_data')}</h3>
                  <p className="text-gray-500">{t('start_first_session')}</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

      </div>

      {/* --- DIALOGUE EXPORT --- */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>{t('export_data')}</DialogTitle>
            <DialogDescription>{t('export_desc')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button variant="outline" className="h-24 flex flex-col gap-2 border-gray-700 hover:bg-gray-800 hover:text-white">
              <span className="text-2xl">📄</span><span className="font-bold">Format CSV</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-2 border-gray-700 hover:bg-gray-800 hover:text-white">
              <span className="text-2xl">📊</span><span className="font-bold">Rapport PDF</span>
            </Button>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setIsExportDialogOpen(false)}>{t('cancel')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- DIALOGUE SUPPRESSION (DOUBLE CONFIRMATION) --- */}
      <Dialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <DialogContent className="bg-[#0a0a0f] border-red-500/30 text-white rounded-3xl max-w-sm">
            <div className="text-center pt-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                    <AlertTriangle className="text-red-500 w-8 h-8" />
                </div>
                <DialogTitle className="text-xl font-black text-white uppercase mb-2">
                    Supprimer cette séance ?
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                    Cette action est <span className="text-red-400 font-bold">irréversible</span>.<br/>
                    Toutes les stats (volume, points) liées à cet entraînement seront perdues.
                </DialogDescription>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
                <Button 
                    variant="outline" 
                    onClick={() => setSessionToDelete(null)} 
                    className="bg-white text-black hover:bg-gray-200 border-none font-bold"
                >
                    Annuler
                </Button>
                <Button 
                    onClick={handleDeleteConfirm} 
                    className="h-12 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold border border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                >
                    Confirmer
                </Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* --- DIALOGUE DÉTAILS --- */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-md h-[80vh] flex flex-col">
            <DialogHeader className="border-b border-gray-800 pb-4">
                <DialogTitle className="text-2xl font-black italic uppercase text-[#00f5d4]">
                    {selectedSession?.name}
                </DialogTitle>
                <DialogDescription className="text-gray-400 flex items-center gap-2">
                    <Calendar size={14}/> {selectedSession && format(new Date(selectedSession.date), "PPP", { locale: fr })}
                </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 pr-4 mt-4">
                {selectedSession && renderSessionDetails(selectedSession.logs)}
            </ScrollArea>

            <DialogFooter className="border-t border-gray-800 pt-4">
                <Button onClick={() => setSelectedSession(null)} className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-bold h-12 rounded-xl">
                    Fermer
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}