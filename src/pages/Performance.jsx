import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { doc, getDoc } from "firebase/firestore";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, Activity, Dumbbell, ArrowUpRight,
  Scale, Timer, Target, Zap,
  X, Footprints, Flame, Droplets, Utensils, Trophy, ChevronRight, Info, Heart
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

// --- CONSTANTES & CONFIGURATION ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a20] border border-gray-700 p-3 rounded-xl shadow-2xl backdrop-blur-md">
        <p className="text-white font-bold text-[10px] mb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-[9px]">
            <div className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-400 capitalize">{entry.name}:</span>
            <span className="font-mono font-black text-white">
              {entry.value} {entry.name === 'weight' ? 'LBS' : entry.unit || ''}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const KPICard = ({ title, value, unit, icon: Icon, trend, color, description }) => {
  const isPositive = trend > 0;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full">
      <Card className="bg-[#1a1a20] border-gray-800 h-full relative overflow-hidden rounded-2xl shadow-lg">
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: color }} />
        <CardContent className="p-4 sm:p-6 flex flex-col justify-between h-full">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15`, color: color }}>
              <Icon size={20} />
            </div>
            {trend !== undefined && trend !== 0 && (
              <Badge variant="outline" className={`border-none px-1.5 py-0.5 rounded-lg text-[9px] font-black ${isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {isPositive ? <ArrowUpRight size={10} className="mr-1"/> : <X size={10} className="mr-1"/>}
                {Math.abs(trend)}%
              </Badge>
            )}
          </div>
          <div>
            <p className="text-gray-500 text-[8px] sm:text-[10px] font-black uppercase tracking-widest mb-0.5">{title}</p>
            <div className="flex items-baseline gap-1">
              <h3 className="text-xl sm:text-2xl font-black text-white">{value}</h3>
              <span className="text-[10px] text-gray-500 font-bold">{unit}</span>
            </div>
            {description && <p className="text-[8px] text-gray-600 mt-1 font-bold italic line-clamp-1">{description}</p>}
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
        avgCadence: runLogs.length > 0 ? Math.round(runLogs.reduce((acc, curr) => acc + (curr.avgCadence || 0), 0) / runLogs.length) : 0,
        avgRunBpm: runLogs.length > 0 ? Math.round(runLogs.reduce((acc, curr) => acc + (curr.avgBpm || curr.avgHeartRate || 0), 0) / runLogs.length) : 0
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

  if (loading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-[#00f5d4] font-black uppercase animate-pulse">Sync Stats...</div>;

  return (
    <div className="p-2 sm:p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white pb-32 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#1a1a20] p-4 sm:p-6 rounded-2xl border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] rounded-xl">
              <Activity className="text-white size-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter">PERFORMANCE</h1>
          </div>

          <div className="flex bg-black/40 p-1 rounded-xl border border-gray-800 w-full sm:w-auto">
            {['week', 'month', 'year'].map((range) => (
              <button key={range} onClick={() => setTimeRange(range)} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${timeRange === range ? 'bg-[#00f5d4] text-black' : 'text-gray-500'}`}>
                {range}
              </button>
            ))}
          </div>
        </header>

        {/* ENERGY BALANCE COMPACT */}
        <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden relative shadow-2xl">
            <div className="p-4 sm:p-6 flex flex-col md:flex-row items-center gap-6">
                <div className="relative size-32 sm:size-40 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={[{value: stats.avgConsumed}, {value: stats.avgBurned}]} innerRadius={45} outerRadius={60} paddingAngle={5} dataKey="value">
                                <Cell fill="#00f5d4" />
                                <Cell fill="#ff7675" />
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl sm:text-2xl font-black ${stats.energyBalance > 0 ? 'text-[#00f5d4]' : 'text-[#ff7675]'}`}>{stats.energyBalance > 0 ? '+' : ''}{stats.energyBalance}</span>
                        <span className="text-[7px] font-bold text-gray-500 uppercase">Balance</span>
                    </div>
                </div>
                <div className="flex-1 w-full space-y-3">
                    <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-2"><Zap size={12} className="text-yellow-500"/> Balance Énergétique</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-black/40 p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] text-gray-500 uppercase font-black mb-1">Moy. Consommée</p>
                            <p className="text-lg font-black text-[#00f5d4]">{stats.avgConsumed} <span className="text-[8px] opacity-50">kcal</span></p>
                        </div>
                        <div className="bg-black/40 p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] text-gray-500 uppercase font-black mb-1">Moy. Brûlée</p>
                            <p className="text-lg font-black text-[#ff7675]">{stats.avgBurned} <span className="text-[8px] opacity-50">kcal</span></p>
                        </div>
                    </div>
                </div>
            </div>
        </Card>

        {/* METRICS GRID - 2 COLUMNS ON MOBILE */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            <KPICard title="Derniers Pas" value={stats.steps.toLocaleString()} unit="Pas" icon={Footprints} color="#00f5d4" trend={stats.stepsTrend} description={`${stats.avgSteps} moy.`} />
            <KPICard title="Kcal Hier" value={stats.cals} unit="Kcal" icon={Utensils} color="#ff7675" trend={stats.calsTrend} />
            <KPICard title="Muscu Sess." value={stats.totalSessions} unit="Sessions" icon={Dumbbell} color="#7b2cbf" description={`${stats.avgIntensity}/10 Int.`} />
            <KPICard title="Volume" value={(stats.volume / 1000).toFixed(1)} unit="T" icon={Trophy} color="#a29bfe" />
        </div>

        {/* PERFORMANCE SECTIONS */}
        <div className="space-y-6">
            <h3 className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2 px-2"><Dumbbell size={14} className="text-[#7b2cbf]"/> Performance Musculaire</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard title="Sess. Totales" value={stats.totalSessions} unit="Sess." icon={Dumbbell} color="#7b2cbf" />
                <KPICard title="Volume Cumulé" value={(stats.volume / 1000).toFixed(1)} unit="Tonnes" icon={Trophy} color="#a29bfe" />
                <KPICard title="Temps Effort" value={Math.floor(stats.duration / 60)} unit="min" icon={Timer} color="#fab1a0" />
                <KPICard title="Intensité Moy." value={stats.avgIntensity} unit="/10" icon={Zap} color="#e17055" />
            </div>
        </div>

        <div className="space-y-6">
            <h3 className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2 px-2"><Activity size={14} className="text-[#00f5d4]"/> Performance Cardiovasculaire</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard title="Cadence Moy." value={stats.avgCadence} unit="SPM" icon={Activity} color="#00f5d4" />
                <KPICard title="Dist. Totale" value={stats.totalDistance.toFixed(2)} unit="Km" icon={Target} color="#74b9ff" />
                <KPICard title="Effort Cardio" value={stats.avgRunBpm} unit="BPM" icon={Heart} color="#ff7675" />
                <KPICard title="Volume Course" value={Math.floor(stats.totalRunDuration / 60)} unit="Min" icon={Timer} color="#fdcb6e" />
            </div>
        </div>

        {/* CHART SECTION ADAPTED */}
        <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <CardTitle className="text-lg font-black italic uppercase tracking-tighter">ÉVOLUTION</CardTitle>
                <CardDescription className="text-[10px] uppercase font-bold text-gray-500">Biométrie & Activité</CardDescription>
              </div>
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger className="w-full sm:w-[160px] bg-black border-gray-800 text-white h-10 text-[10px] font-black uppercase rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
                  <SelectItem value="steps" className="text-[10px] font-bold uppercase">Pas (Daily)</SelectItem>
                  <SelectItem value="calories" className="text-[10px] font-bold uppercase">Consommées</SelectItem>
                  <SelectItem value="burned" className="text-[10px] font-bold uppercase">Brûlées</SelectItem>
                  <SelectItem value="weight" className="text-[10px] font-bold uppercase">Poids (LBS)</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="h-[250px] sm:h-[350px] p-2 sm:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00f5d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="date" stroke="#444" tick={{fill: '#666', fontSize: 9}} axisLine={false} tickLine={false} />
                  <YAxis stroke="#444" tick={{fill: '#666', fontSize: 9}} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey={selectedMetric} stroke="#00f5d4" strokeWidth={2} fillOpacity={1} fill="url(#colorMetric)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* HISTORY LIST COMPACT */}
        <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl p-4 sm:p-6 shadow-2xl">
            <h3 className="text-white font-black italic uppercase text-sm sm:text-lg mb-4 sm:mb-6 flex items-center gap-2 tracking-tighter"><Trophy className="text-yellow-500" size={18}/> HISTORIQUE RECENT</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {history.length > 0 ? history.map((h, i) => (
                    <div key={i} className="bg-black/20 p-3 rounded-xl border border-white/5 flex items-center justify-between transition-all active:bg-white/5">
                        <div className="min-w-0 flex-1">
                            <p className="text-white font-black uppercase text-[10px] sm:text-xs truncate italic">{h.name || (h.type === 'run' ? "Course" : "Activité")}</p>
                            <p className="text-gray-600 text-[8px] sm:text-[9px] uppercase font-bold">{format(new Date(h.date), 'dd MMM yyyy', { locale: fr })}</p>
                        </div>
                        <div className="text-right shrink-0">
                            {h.type === 'run' ? (
                                <p className="text-[#00f5d4] font-black text-[10px] sm:text-xs">{h.distance?.toFixed(2)} <span className="text-[8px] opacity-50">KM</span></p>
                            ) : (
                                h.calories ? <p className="text-[#ff7675] font-black text-[10px] sm:text-xs">{h.calories} <span className="text-[8px] opacity-50">KCAL</span></p> : null
                            )}
                        </div>
                    </div>
                )) : <p className="text-gray-600 text-center py-10 text-[10px] uppercase font-bold italic tracking-widest opacity-50">Vide</p>}
            </div>
        </Card>
      </div>
    </div>
  );
}
