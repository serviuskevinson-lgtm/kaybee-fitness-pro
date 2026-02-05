import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, ReferenceLine, PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, Calendar, Trophy, Activity, Dumbbell, ArrowUpRight, 
  Users, Scale, Timer, Target, Zap, 
  Download, Trash2, AlertTriangle, X, Footprints, Flame, Droplets, ZapOff, Utensils
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
              {entry.value} {entry.name === 'weight' ? 'LBS' : entry.unit || ''}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const PerformanceSkeleton = () => (
  <div className="space-y-6 animate-pulse p-8">
    <div className="flex justify-between items-center mb-8">
      <Skeleton className="h-10 w-64 bg-gray-800" />
      <Skeleton className="h-10 w-32 bg-gray-800" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-32 bg-gray-800 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Skeleton className="h-80 bg-gray-800 rounded-2xl" />
      <Skeleton className="h-80 bg-gray-800 rounded-2xl" />
    </div>
  </div>
);

const KPICard = ({ title, value, unit, icon: Icon, trend, color, description }) => {
  const isPositive = trend > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -5 }} className="h-full">
      <Card className="bg-[#1a1a20] border-gray-800 hover:border-gray-700 transition-all h-full overflow-hidden relative group rounded-2xl shadow-lg">
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: color }} />
        <CardContent className="p-6 flex flex-col justify-between h-full relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-opacity-10" style={{ backgroundColor: `${color}20`, color: color }}>
              <Icon size={24} />
            </div>
            {trend !== undefined && trend !== 0 && (
              <Badge variant="outline" className={`border-none px-2 py-0.5 rounded-lg text-xs font-bold ${isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {isPositive ? <ArrowUpRight size={12} className="mr-1"/> : <X size={12} className="mr-1"/>}
                {Math.abs(trend)}%
              </Badge>
            )}
          </div>
          <div>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-1">{title}</p>
            <div className="flex items-baseline gap-1">
              <h3 className="text-3xl font-black text-white">{value}</h3>
              <span className="text-sm text-gray-500 font-bold">{unit}</span>
            </div>
            {description && <p className="text-[10px] text-gray-600 mt-2 font-medium">{description}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default function Performance() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId } = useClient();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [timeRange, setTimeRange] = useState("month");
  const [selectedMetric, setSelectedMetric] = useState("steps");

  useEffect(() => {
    const fetchData = async () => {
      const targetId = targetUserId || currentUser?.uid;
      if (!targetId) return;
      try {
        const snap = await getDoc(doc(db, "users", targetId));
        if (snap.exists()) {
          const data = snap.data();
          setUserProfile(data);
          setHistory((data.history || []).sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [targetUserId, currentUser]);

  const filteredHistory = useMemo(() => {
    const now = new Date();
    let cutoff = subDays(now, timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365);
    if (timeRange === 'all') cutoff = new Date(0);
    return history.filter(h => new Date(h.date) >= cutoff).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [history, timeRange]);

  const stats = useMemo(() => {
    const dailyLogs = filteredHistory.filter(h => h.type === 'daily_summary');
    const workoutLogs = filteredHistory.filter(h => h.type === 'workout' || (!h.type && h.duration && h.type !== 'run'));
    const runLogs = filteredHistory.filter(h => h.type === 'run');

    const lastDaily = dailyLogs[dailyLogs.length - 1];
    const prevDaily = dailyLogs.length > 1 ? dailyLogs[dailyLogs.length - 2] : null;

    const calcTrend = (curr, old) => {
        if (!old || old === 0) return 0;
        return Math.round(((curr - old) / old) * 100);
    };

    // Energy Balance
    const avgConsumed = dailyLogs.length > 0 ? dailyLogs.reduce((acc, curr) => acc + (curr.calories || 0), 0) / dailyLogs.length : 0;
    const avgBurned = dailyLogs.length > 0 ? dailyLogs.reduce((acc, curr) => acc + (curr.burned || 0), 0) / dailyLogs.length : 0;
    const balance = avgConsumed - avgBurned;

    return {
        steps: lastDaily?.steps || 0,
        cals: Math.round(lastDaily?.calories || 0),
        burned: Math.round(lastDaily?.burned || 0),
        water: lastDaily?.water || 0,
        stepsTrend: calcTrend(lastDaily?.steps, prevDaily?.steps),
        calsTrend: calcTrend(lastDaily?.calories, prevDaily?.calories),
        avgSteps: dailyLogs.length > 0 ? Math.round(dailyLogs.reduce((acc, curr) => acc + (curr.steps || 0), 0) / dailyLogs.length) : 0,
        energyBalance: Math.round(balance),
        avgConsumed: Math.round(avgConsumed),
        avgBurned: Math.round(avgBurned),

        totalSessions: workoutLogs.length,
        volume: workoutLogs.reduce((acc, curr) => acc + (curr.volume || curr.totalLoad || 0), 0),
        duration: workoutLogs.reduce((acc, curr) => acc + (curr.duration || 0), 0),
        avgDuration: Math.round(workoutLogs.reduce((acc, curr) => acc + (curr.duration || 0), 0) / (workoutLogs.length || 1)),
        avgIntensity: (workoutLogs.reduce((acc, curr) => acc + (curr.intensity || 0), 0) / (workoutLogs.length || 1)).toFixed(1),
        weight: lastDaily?.weight || userProfile?.weight || 0,

        totalRuns: runLogs.length,
        totalDistance: runLogs.reduce((acc, curr) => acc + (curr.distance || 0), 0),
        totalRunDuration: runLogs.reduce((acc, curr) => acc + (curr.duration || 0), 0),
        avgCadence: runLogs.length > 0 ? runLogs.reduce((acc, curr) => acc + (curr.avgCadence || 0), 0) / runLogs.length : 0,
        avgRunBpm: runLogs.length > 0 ? runLogs.reduce((acc, curr) => acc + (curr.avgHeartRate || 0), 0) / runLogs.length : 0
    };
  }, [filteredHistory, userProfile]);

  const chartData = useMemo(() => {
    return filteredHistory.filter(h => h.type === 'daily_summary').map(h => ({
        date: format(new Date(h.date), 'dd/MM'),
        steps: h.steps || 0,
        calories: Math.round(h.calories || 0),
        burned: Math.round(h.burned || 0),
        water: h.water || 0,
        weight: h.weight || 0
    }));
  }, [filteredHistory]);

  if (loading) return <PerformanceSkeleton />;

  return (
    <div className="p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white pb-24 font-sans">
      <div className="max-w-7xl mx-auto space-y-12">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] rounded-2xl shadow-xl">
              <Activity className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black italic uppercase text-white tracking-tighter">ANALYSE PERFORMANCE</h1>
              <p className="text-gray-500 text-sm font-bold">Suivez vos progrès et votre constance.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#1a1a20] p-1.5 rounded-xl border border-gray-800">
            {['week', 'month', 'year'].map((range) => (
              <button key={range} onClick={() => setTimeRange(range)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${timeRange === range ? 'bg-[#00f5d4] text-black shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                {range}
              </button>
            ))}
          </div>
        </header>

        {/* --- ENERGY BALANCE ROW --- */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-[#fdcb6e] opacity-80">
            <Zap size={20} />
            <h2 className="text-xl font-black italic uppercase tracking-tighter">Balance Énergétique</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-2 bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 flex flex-col md:flex-row items-center gap-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#fdcb6e]/5 to-transparent pointer-events-none"></div>
                <div className="relative w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={[{value: stats.avgConsumed}, {value: stats.avgBurned}]} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                                <Cell fill="#00f5d4" />
                                <Cell fill="#ff7675" />
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-2xl font-black ${stats.energyBalance > 0 ? 'text-[#00f5d4]' : 'text-[#ff7675]'}`}>{stats.energyBalance > 0 ? '+' : ''}{stats.energyBalance}</span>
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Balance</span>
                    </div>
                </div>
                <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#00f5d4]"></div><span className="text-xs font-bold text-gray-400 uppercase">Moy. Consommée</span></div>
                        <span className="font-black text-white">{stats.avgConsumed} Kcal</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#ff7675]"></div><span className="text-xs font-bold text-gray-400 uppercase">Moy. Brûlée</span></div>
                        <span className="font-black text-white">{stats.avgBurned} Kcal</span>
                    </div>
                    <div className="pt-2 border-t border-gray-800">
                        <p className="text-[10px] text-gray-500 font-medium italic leading-relaxed">
                            {stats.energyBalance > 200 ? "Vous êtes en surplus calorique, idéal pour la prise de masse." :
                             stats.energyBalance < -200 ? "Vous êtes en déficit calorique, favorable à la perte de gras." :
                             "Votre balance est équilibrée, parfait pour la maintenance."}
                        </p>
                    </div>
                </div>
            </div>
            <KPICard title="Déficit/Surplus" value={stats.energyBalance} unit="Kcal/j" icon={stats.energyBalance < 0 ? Flame : Activity} color={stats.energyBalance < 0 ? "#00f5d4" : "#ff7675"} description="Moyenne sur la période" />
            <KPICard title="Métabolisme Est." value={stats.avgBurned} unit="Kcal" icon={TrendingUp} color="#a29bfe" description="Dépense quotidienne moy." />
          </div>
        </div>

        {/* --- ROW 1 : DAILY HEALTH WIDGETS --- */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-[#00f5d4] opacity-80">
            <Activity size={20} />
            <h2 className="text-xl font-black italic uppercase tracking-tighter">Santé & Activité Quotidienne</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard title="Derniers Pas" value={stats.steps.toLocaleString()} unit="Pas" icon={Footprints} color="#00f5d4" trend={stats.stepsTrend} description={`Moyenne: ${stats.avgSteps} pas`} />
            <KPICard title="Calories Consommées" value={stats.cals} unit="Kcal" icon={Utensils} color="#ff7675" trend={stats.calsTrend} description="Hier vs Avant-hier" />
            <KPICard title="Hydratation" value={stats.water.toFixed(1)} unit="L" icon={Droplets} color="#74b9ff" description="Total journalier" />
            <KPICard title="Poids Actuel" value={stats.weight} unit="LBS" icon={Scale} color="#fdcb6e" description="Dernière pesée" />
          </div>
        </div>

        {/* --- ROW 2 : TRAINING PERFORMANCE WIDGETS --- */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-[#7b2cbf] opacity-80">
            <Dumbbell size={20} />
            <h2 className="text-xl font-black italic uppercase tracking-tighter">Performance Musculation</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard title={t('total_sessions')} value={stats.totalSessions} unit="Sess." icon={Dumbbell} color="#7b2cbf" description={t('selected_period')} />
            <KPICard title={t('total_volume')} value={(stats.volume / 1000).toFixed(1)} unit="Tonnes" icon={Trophy} color="#a29bfe" description={t('cumulative_load')} />
            <KPICard title={t('effort_time')} value={Math.floor(stats.duration / 60)} unit="min" icon={Timer} color="#fab1a0" description={`${stats.avgDuration} sec / sess`} />
            <KPICard title={t('avg_intensity')} value={stats.avgIntensity} unit="/ 10" icon={Zap} color="#e17055" description="Moyenne RPE" />
          </div>
        </div>

        {/* --- ROW 3 : CARDIO PERFORMANCE WIDGETS --- */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-[#00f5d4] opacity-80">
            <Zap size={20} />
            <h2 className="text-xl font-black italic uppercase tracking-tighter">Performance Cardiovasculaire</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard title="Cadence Moyenne" value={Math.round(stats.avgCadence)} unit="SPM" icon={Activity} color="#00f5d4" description="Pas par minute" />
            <KPICard title="Distance Totale" value={stats.totalDistance.toFixed(2)} unit="Km" icon={Target} color="#74b9ff" description="Sur la période" />
            <KPICard title="Effort Moyen" value={Math.round(stats.avgRunBpm)} unit="BPM" icon={Flame} color="#ff7675" description="Intensité cardiaque" />
            <KPICard title="Temps de Course" value={Math.floor(stats.totalRunDuration / 60)} unit="Min" icon={Timer} color="#fdcb6e" description="Volume total" />
          </div>
        </div>

        {/* --- CHART & HISTORY SECTION --- */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white font-black italic flex items-center gap-2 uppercase tracking-tighter"><TrendingUp className="text-[#00f5d4]"/> Évolution Activité</CardTitle>
                <CardDescription className="text-gray-500 text-xs uppercase font-bold">Analyse des données biométriques</CardDescription>
              </div>
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger className="w-[140px] bg-black border-gray-800 text-white h-9 text-[10px] font-black uppercase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
                  <SelectItem value="steps">Pas (Daily)</SelectItem>
                  <SelectItem value="calories">Consommées (Kcal)</SelectItem>
                  <SelectItem value="burned">Brûlées (Kcal)</SelectItem>
                  <SelectItem value="water">Eau (Litre)</SelectItem>
                  <SelectItem value="weight">Poids (LBS)</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="h-[350px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00f5d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="date" stroke="#444" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} />
                  <YAxis stroke="#444" tick={{fill: '#666', fontSize: 10}} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey={selectedMetric} stroke="#00f5d4" strokeWidth={3} fillOpacity={1} fill="url(#colorMetric)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl shadow-2xl p-6">
              <h3 className="text-white font-black italic uppercase text-lg mb-6 flex items-center gap-2"><Trophy className="text-[#ffd700]"/> Historique Activité</h3>
              <ScrollArea className="h-[350px] pr-4">
                  <div className="space-y-4">
                      {history.length > 0 ? history.map((h, i) => (
                          <div key={i} className="bg-black/40 p-3 rounded-xl border border-white/5 flex items-center justify-between group hover:border-[#00f5d4]/30 transition-all">
                              <div>
                                  <p className="text-white font-bold text-sm uppercase">{h.name || (h.type === 'run' ? "Course" : "Activité")}</p>
                                  <p className="text-gray-500 text-[10px] uppercase font-bold">{format(new Date(h.date), 'dd MMMM yyyy', { locale: fr })}</p>
                              </div>
                              <div className="text-right">
                                  {h.type === 'run' ? (
                                      <>
                                        <p className="text-[#00f5d4] font-black text-xs">{h.distance?.toFixed(2)} <span className="text-[8px] text-gray-600">KM</span></p>
                                        <p className="text-gray-500 text-[8px] font-bold">{Math.floor((h.duration || 0) / 60)} MIN</p>
                                      </>
                                  ) : (
                                      <>
                                        {h.steps ? <p className="text-[#00f5d4] font-black text-xs">{h.steps} <span className="text-[8px] text-gray-600">PAS</span></p> : null}
                                        {h.calories ? <p className="text-[#ff7675] font-black text-xs">{h.calories} <span className="text-[8px] text-gray-600">KCAL</span></p> : null}
                                      </>
                                  )}
                              </div>
                          </div>
                      )) : <p className="text-gray-500 text-center py-10 italic">Aucune donnée enregistrée.</p>}
                  </div>
              </ScrollArea>
          </Card>
        </section>
      </div>
    </div>
  );
}
