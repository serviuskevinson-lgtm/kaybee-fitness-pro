import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { doc, getDoc, collection, query, getDocs, orderBy, limit } from "firebase/firestore";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, RadarChart, 
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, Calendar, Trophy, Activity, Dumbbell, ArrowUpRight, 
  Users, Scale, Award, Timer, Target, Zap, ChevronDown, ChevronUp, 
  Filter, Download, Share2, Info, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

// --- CONSTANTES & CONFIGURATION ---
const COLORS = ['#00f5d4', '#7b2cbf', '#9d4edd', '#fdcb6e', '#e056fd', '#ff7675'];
const RADAR_COLORS = ['#00f5d4', '#7b2cbf'];

// --- COMPOSANTS UTILITAIRES INTERNES ---

// 1. Tooltip Personnalisé pour les graphiques
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

// 2. Indicateur de Chargement Squelette
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

// 3. Carte KPI (Key Performance Indicator)
const KPICard = ({ title, value, unit, icon: Icon, trend, color, description }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -5 }}
    className="h-full"
  >
    <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-opacity-50 transition-all duration-300 h-full overflow-hidden relative group">
      <div className={`absolute top-0 left-0 w-1 h-full bg-${color}`} style={{ backgroundColor: color }} />
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-5 group-hover:opacity-10 transition-opacity bg-${color}`} style={{ backgroundColor: color }} />
      
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
  // Gestion Hybride : Si Coach, on regarde le client sélectionné
  const { selectedClient, isCoachView, targetUserId } = useClient();
  
  // --- ÉTATS ---
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [timeRange, setTimeRange] = useState("month"); // week, month, year, all
  const [selectedMetric, setSelectedMetric] = useState("volume"); // volume, duration, intensity
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  // --- EFFETS : CHARGEMENT DES DONNÉES ---
  useEffect(() => {
    const fetchData = async () => {
      if (!targetUserId) return;
      setLoading(true);

      try {
        // 1. Récupération du Profil (Poids, Objectifs)
        const userDocRef = doc(db, "users", targetUserId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          setUserProfile(userDocSnap.data());
          
          // 2. Récupération de l'historique réel
          const data = userDocSnap.data();
          let rawHistory = data.history || [];

          // NOTE: J'ai supprimé le générateur de Mock Data ici.
          // Les données sont maintenant "propres" (vides si l'utilisateur est nouveau).
          
          // Tri chronologique inverse pour l'affichage liste, mais normal pour les graphs
          setHistory(rawHistory.sort((a, b) => new Date(b.date) - new Date(a.date)));
        }
      } catch (e) {
        console.error("Erreur fetch performance", e);
      } finally {
        // Petit délai pour l'animation squelette
        setTimeout(() => setLoading(false), 800);
      }
    };
    fetchData();
  }, [targetUserId]);

  // --- CALCULS & TRANSFORMATIONS (MEMOIZED) ---
  
  // 1. Filtrage par date
  const filteredHistory = useMemo(() => {
    const now = new Date();
    let cutoff;
    if (timeRange === 'week') cutoff = subDays(now, 7);
    else if (timeRange === 'month') cutoff = subDays(now, 30);
    else if (timeRange === 'year') cutoff = subDays(now, 365);
    else cutoff = new Date(0); // All time

    return history.filter(h => new Date(h.date) >= cutoff).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [history, timeRange]);

  // 2. Stats Globales (KPIs)
  const stats = useMemo(() => {
    if (filteredHistory.length === 0) return { total: 0, volume: 0, duration: 0, avgIntensity: 0 };
    
    const total = filteredHistory.length;
    const volume = filteredHistory.reduce((acc, curr) => acc + (curr.totalLoad || 0), 0);
    const duration = filteredHistory.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    const avgIntensity = filteredHistory.reduce((acc, curr) => acc + (curr.intensity || 0), 0) / total;

    return {
      total,
      volume,
      duration,
      avgDuration: Math.round(duration / total),
      avgIntensity: avgIntensity.toFixed(1)
    };
  }, [filteredHistory]);

  // 3. Données Graphiques (Chart Data)
  const chartData = useMemo(() => {
    return filteredHistory.map(h => ({
      date: format(new Date(h.date), timeRange === 'week' ? 'EEE' : 'dd/MM'),
      fullDate: format(new Date(h.date), 'PPP', { locale: fr }),
      volume: h.totalLoad,
      duration: h.duration,
      intensity: h.intensity,
      weight: h.bodyWeight || userProfile?.weight // Fallback si pas de poids dans la séance
    }));
  }, [filteredHistory, timeRange, userProfile]);

  // Données Graphique Poids (Ajout Spécifique)
  const weightData = useMemo(() => {
      // On combine l'historique des séances et l'historique de poids du profil s'il existe
      const historyWeights = filteredHistory
        .filter(h => h.bodyWeight)
        .map(h => ({ date: h.date, weight: h.bodyWeight }));
        
      const profileWeights = userProfile?.weightHistory || [];
      
      // Fusion et tri
      const allWeights = [...historyWeights, ...profileWeights]
        .sort((a,b) => new Date(a.date) - new Date(b.date))
        .map(w => ({
            date: format(new Date(w.date), 'dd/MM'),
            weight: parseFloat(w.weight)
        }));

      // Si vide, on met le poids actuel
      if (allWeights.length === 0 && userProfile?.weight) {
          return [{ date: format(new Date(), 'dd/MM'), weight: parseFloat(userProfile.weight) }];
      }
      
      return allWeights;
  }, [filteredHistory, userProfile]);

  // 4. Répartition Musculaire (Simulée pour l'exemple radar - À connecter aux exos réels plus tard)
  const radarData = [
    { subject: 'Pecs', A: 120, fullMark: 150 },
    { subject: 'Dos', A: 98, fullMark: 150 },
    { subject: 'Jambes', A: 86, fullMark: 150 },
    { subject: 'Épaules', A: 99, fullMark: 150 },
    { subject: 'Bras', A: 85, fullMark: 150 },
    { subject: 'Abdos', A: 65, fullMark: 150 },
  ];

  // --- RENDER ---

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
                  {isCoachView ? "Analyse Client" : "Performance"}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  {isCoachView && (
                    <Badge className="bg-[#7b2cbf] text-white border-none px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">
                      <Users size={10} className="mr-1"/> Coach View
                    </Badge>
                  )}
                  <p className="text-gray-400 text-sm font-medium">
                    {isCoachView 
                      ? `Suivi du dossier de ${selectedClient?.full_name || 'Client'}`
                      : "Vos métriques en temps réel."
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
                {range === 'week' ? 'Semaine' : range === 'month' ? 'Mois' : range === 'year' ? 'Année' : 'Tout'}
              </button>
            ))}
          </div>
        </header>

        {/* --- SECTION 1 : KPIs (Indicateurs Clés) --- */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard 
            title="Total Séances" 
            value={stats.total} 
            unit="Sess." 
            icon={Dumbbell} 
            color="#00f5d4" 
            trend={stats.total > 0 ? 100 : 0} // Placeholder trend
            description="Sur la période sélectionnée"
          />
          <KPICard 
            title="Volume Total" 
            value={(stats.volume / 1000).toFixed(1)} 
            unit="Tonnes" 
            icon={Scale} 
            color="#7b2cbf" 
            trend={0}
            description="Charge cumulée soulevée"
          />
          <KPICard 
            title="Temps d'effort" 
            value={Math.floor(stats.duration / 60)} 
            unit="Heures" 
            icon={Timer} 
            color="#fdcb6e"
            description={`${stats.avgDuration} min / séance moy.`} 
          />
          <KPICard 
            title="Intensité Moy." 
            value={stats.avgIntensity} 
            unit="/ 10" 
            icon={Zap} 
            color="#ff7675"
            description="RPE (Effort perçu)" 
          />
        </section>

        {/* --- SECTION 2 : ANALYSE GRAPHIQUE --- */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* GRAPHIQUE PRINCIPAL (Area Chart) */}
          <Card className="lg:col-span-2 kb-card bg-[#1a1a20] border-gray-800 shadow-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-white text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="text-[#00f5d4]" /> Progression
                </CardTitle>
                <CardDescription className="text-gray-500">Analyse de la charge de travail</CardDescription>
              </div>
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger className="w-[140px] bg-black/30 border-gray-700 text-white h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                  <SelectItem value="volume">Volume (kg)</SelectItem>
                  <SelectItem value="duration">Durée (min)</SelectItem>
                  <SelectItem value="intensity">Intensité</SelectItem>
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
                  <XAxis 
                    dataKey="date" 
                    stroke="#666" 
                    tick={{fill: '#666', fontSize: 10}} 
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#666" 
                    tick={{fill: '#666', fontSize: 10}} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#00f5d4', strokeWidth: 1, strokeDasharray: '5 5' }} />
                  <Area 
                    type="monotone" 
                    dataKey={selectedMetric} 
                    stroke="#00f5d4" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorMetric)" 
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* GRAPHIQUE POIDS & OBJECTIF (Remplacement du Radar pour plus d'utilité) */}
          <Card className="kb-card bg-[#1a1a20] border-gray-800 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
                <Target className="text-[#7b2cbf]" /> Objectif Poids
              </CardTitle>
              <CardDescription>
                  Cible : <span className="text-[#00f5d4] font-bold">{userProfile?.targetWeight || "?"} kg</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" stroke="#666" tick={{fill: '#666', fontSize: 10}} tickLine={false} axisLine={false} />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="#666" tick={{fill: '#666', fontSize: 10}} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* LIGNE DE POIDS ACTUEL */}
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    stroke="#7b2cbf" 
                    strokeWidth={3} 
                    dot={{r: 4, fill: '#7b2cbf'}}
                    activeDot={{r: 6}}
                  />
                  
                  {/* LIGNE D'OBJECTIF (TARGET) */}
                  {userProfile?.targetWeight && (
                      <ReferenceLine 
                        y={parseFloat(userProfile.targetWeight)} 
                        stroke="#ff7675" 
                        strokeDasharray="3 3" 
                        label={{ position: 'top', value: 'Objectif', fill: '#ff7675', fontSize: 10 }} 
                      />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </section>

        {/* --- SECTION 3 : HISTORIQUE DÉTAILLÉ (Tableau Interactif) --- */}
        {/* Ajout de la classe mt-16 pour espacer l'historique vers le bas comme demandé */}
        <section className="space-y-4 mt-16">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Calendar className="text-[#fdcb6e]" /> Historique des Séances
              </h2>
              <p className="text-gray-500 text-sm">Liste complète de vos entraînements passés.</p>
            </div>
            
            <Button 
              variant="outline" 
              className="border-gray-700 text-gray-400 hover:text-white hover:border-white hover:bg-transparent"
              onClick={() => setIsExportDialogOpen(true)}
            >
              <Download size={16} className="mr-2"/> Exporter CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence>
              {filteredHistory.length > 0 ? (
                filteredHistory.slice().reverse().map((session, index) => (
                  <motion.div
                    key={session.id || index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="bg-[#111116] border border-gray-800/60 hover:border-[#00f5d4]/50 transition-all duration-300 group overflow-hidden">
                      <div className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        
                        {/* Info Gauche */}
                        <div className="flex items-center gap-4">
                          <div className="bg-[#1a1a20] p-4 rounded-2xl border border-gray-800 group-hover:border-[#00f5d4] transition-colors shadow-inner">
                            <Trophy size={24} className="text-[#ffd700]" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white group-hover:text-[#00f5d4] transition-colors">
                              {session.name || "Séance Libre"}
                            </h3>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                              <span className="flex items-center gap-1"><Calendar size={12}/> {format(new Date(session.date), 'PPP', { locale: fr })}</span>
                              <span className="w-1 h-1 rounded-full bg-gray-700"/>
                              <span className="flex items-center gap-1"><Timer size={12}/> {session.duration} min</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats Milieu (Hidden on mobile) */}
                        <div className="hidden md:flex items-center gap-8">
                          <div className="text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Volume</p>
                            <p className="text-xl font-black text-white">{session.totalLoad} <span className="text-xs font-normal text-gray-600">kg</span></p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Intensité</p>
                            <div className="flex items-center gap-1 justify-center">
                              <span className={`text-xl font-black ${session.intensity >= 8 ? 'text-red-500' : session.intensity >= 6 ? 'text-yellow-500' : 'text-green-500'}`}>
                                {session.intensity}
                              </span>
                              <span className="text-xs text-gray-600">/10</span>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Exos</p>
                            <p className="text-xl font-black text-white">{session.exercisesCount}</p>
                          </div>
                        </div>

                        {/* Bouton Droite */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <Button className="flex-1 md:flex-none bg-[#1a1a20] hover:bg-[#25252d] text-white border border-gray-700 rounded-xl">
                            Détails <ArrowUpRight size={16} className="ml-2"/>
                          </Button>
                        </div>

                      </div>
                      
                      {/* Barre de progression décorative en bas de la carte */}
                      <div className="h-1 w-full bg-gray-900">
                        <div 
                          className="h-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]" 
                          style={{ width: `${Math.min((session.intensity / 10) * 100, 100)}%` }}
                        />
                      </div>
                    </Card>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-20 bg-[#1a1a20] rounded-3xl border border-dashed border-gray-800">
                  <div className="bg-gray-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity className="text-gray-600" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Aucune donnée disponible</h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Il semble que vous n'ayez pas encore enregistré de séance sur cette période. Lancez votre première séance pour voir vos statistiques !
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

      </div>

      {/* --- DIALOGUES --- */}
      
      {/* Dialogue Export (Fake pour l'instant) */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Exporter les données</DialogTitle>
            <DialogDescription>Téléchargez vos performances au format CSV ou PDF.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button variant="outline" className="h-24 flex flex-col gap-2 border-gray-700 hover:bg-gray-800 hover:text-white">
              <span className="text-2xl">📄</span>
              <span className="font-bold">Format CSV</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-2 border-gray-700 hover:bg-gray-800 hover:text-white">
              <span className="text-2xl">📊</span>
              <span className="font-bold">Rapport PDF</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)}>Annuler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}