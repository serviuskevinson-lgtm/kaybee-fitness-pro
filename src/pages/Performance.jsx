import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, Dumbbell, Award, Target, Scale, Cake } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, subDays, startOfWeek, endOfWeek, differenceInYears, differenceInDays, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Performance() {
  const [timeRange, setTimeRange] = useState('week');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', user?.email],
    queryFn: async () => {
      const profiles = await base44.entities.User.filter({ email: user.email });
      return profiles.length > 0 ? profiles[0] : null;
    },
    enabled: !!user
  });

  const { data: workoutLogs, isLoading } = useQuery({
    queryKey: ['workoutLogs', user?.email],
    queryFn: () => base44.entities.WorkoutLog.filter({ created_by: user.email }, '-created_date'),
    initialData: [],
    enabled: !!user
  });

  const { data: challenges } = useQuery({
    queryKey: ['challengeProgress', user?.email],
    queryFn: () => base44.entities.ChallengeProgress.filter({ created_by: user.email }),
    initialData: [],
    enabled: !!user
  });

  // Check for birthday
  const isBirthdayToday = () => {
    if (!userProfile?.birthday) return false;
    const today = new Date();
    const birthday = new Date(userProfile.birthday);
    return today.getMonth() === birthday.getMonth() && today.getDate() === birthday.getDate();
  };

  const getAge = () => {
    if (!userProfile?.birthday) return null;
    return differenceInYears(new Date(), new Date(userProfile.birthday));
  };

  // Calculate stats
  const getFilteredLogs = () => {
    const now = new Date();
    let cutoffDate;

    switch (timeRange) {
      case 'week':
        cutoffDate = subDays(now, 7);
        break;
      case 'month':
        cutoffDate = subDays(now, 30);
        break;
      case 'all':
        cutoffDate = new Date(0);
        break;
      default:
        cutoffDate = subDays(now, 7);
    }

    return workoutLogs.filter(log => new Date(log.date) >= cutoffDate);
  };

  const filteredLogs = getFilteredLogs();

  const stats = {
    totalWorkouts: filteredLogs.length,
    totalSets: filteredLogs.reduce((sum, log) => sum + (log.sets?.length || 0), 0),
    totalVolume: filteredLogs.reduce((sum, log) => {
      return sum + (log.sets?.reduce((s, set) => s + (set.weight * set.reps), 0) || 0);
    }, 0),
    avgDuration: filteredLogs.length > 0
      ? Math.round(filteredLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0) / filteredLogs.length)
      : 0,
    completedChallenges: challenges.filter(c => c.completed).length
  };

  // Get exercise frequency
  const exerciseFrequency = {};
  filteredLogs.forEach(log => {
    exerciseFrequency[log.exercise_name] = (exerciseFrequency[log.exercise_name] || 0) + 1;
  });

  const topExercises = Object.entries(exerciseFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Personal Records
  const getPersonalRecords = () => {
    const records = {};
    
    workoutLogs.forEach(log => {
      log.sets?.forEach(set => {
        const current = records[log.exercise_name];
        if (!current || set.weight > current.weight) {
          records[log.exercise_name] = {
            weight: set.weight,
            reps: set.reps,
            date: log.date
          };
        }
      });
    });

    return Object.entries(records)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 5);
  };

  const personalRecords = getPersonalRecords();

  // Weekly volume chart data
  const getWeeklyVolumeData = () => {
    const weeks = {};
    
    workoutLogs.forEach(log => {
      const weekStart = startOfWeek(new Date(log.date), { locale: fr });
      const weekKey = format(weekStart, 'dd MMM', { locale: fr });
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = 0;
      }
      
      const logVolume = log.sets?.reduce((sum, set) => sum + (set.weight * set.reps), 0) || 0;
      weeks[weekKey] += logVolume;
    });

    return Object.entries(weeks)
      .slice(-8)
      .map(([week, volume]) => ({
        week,
        volume: Math.round(volume)
      }));
  };

  // Monthly exercise frequency
  const getMonthlyExerciseFrequency = () => {
    const frequency = {};
    const thirtyDaysAgo = subDays(new Date(), 30);
    
    workoutLogs
      .filter(log => new Date(log.date) >= thirtyDaysAgo)
      .forEach(log => {
        frequency[log.exercise_name] = (frequency[log.exercise_name] || 0) + 1;
      });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([exercise, count]) => ({
        exercise: exercise.substring(0, 20),
        count
      }));
  };

  // Weight evolution chart (last 3 months)
  const getWeightEvolutionData = () => {
    if (!userProfile?.weight_history || userProfile.weight_history.length === 0) {
      return [];
    }

    const threeMonthsAgo = subMonths(new Date(), 3);
    
    return userProfile.weight_history
      .filter(entry => new Date(entry.date) >= threeMonthsAgo)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(entry => ({
        date: format(new Date(entry.date), 'dd MMM', { locale: fr }),
        poids: entry.weight
      }));
  };

  // Weekly activity
  const getWeeklyActivity = () => {
    const weekStart = startOfWeek(new Date(), { locale: fr });
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return {
        date,
        count: workoutLogs.filter(log => {
          const logDate = new Date(log.date);
          return logDate.toDateString() === date.toDateString();
        }).length
      };
    });
    return days;
  };

  const weeklyActivity = getWeeklyActivity();
  const weeklyVolumeData = getWeeklyVolumeData();
  const monthlyFrequencyData = getMonthlyExerciseFrequency();
  const weightEvolutionData = getWeightEvolutionData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Birthday Banner */}
      {isBirthdayToday() && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-[#fdcb6e] via-[#00f5d4] to-[#9d4edd] p-6 rounded-2xl text-center"
        >
          <Cake className="w-12 h-12 mx-auto mb-3 text-white" />
          <h2 className="text-3xl font-black text-white mb-2">
            🎂 Joyeux Anniversaire {user?.full_name?.split(' ')[0]} ! 🎂
          </h2>
          <p className="text-white font-bold text-lg">
            {getAge()} ans aujourd'hui ! Continue à écraser tes objectifs ! 💪
          </p>
        </motion.div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase mb-2">
          Performance & Statistiques
        </h1>
        <p className="text-gray-400">Analysez vos progrès et dépassez vos limites</p>
      </div>

      {/* Time Range Filter */}
      <Tabs value={timeRange} onValueChange={setTimeRange}>
        <TabsList className="bg-[#1a1a20] border border-gray-800">
          <TabsTrigger value="week">7 Jours</TabsTrigger>
          <TabsTrigger value="month">30 Jours</TabsTrigger>
          <TabsTrigger value="all">Tout</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="kb-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Dumbbell className="w-10 h-10 text-[#00f5d4]" />
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-4xl font-black text-[#00f5d4] mb-1">{stats.totalWorkouts}</p>
              <p className="text-sm text-gray-400 uppercase tracking-wider">Séances</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="kb-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Target className="w-10 h-10 text-[#9d4edd]" />
              </div>
              <p className="text-4xl font-black text-[#9d4edd] mb-1">{stats.totalSets}</p>
              <p className="text-sm text-gray-400 uppercase tracking-wider">Séries Totales</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="kb-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Award className="w-10 h-10 text-[#fdcb6e]" />
              </div>
              <p className="text-4xl font-black text-[#fdcb6e] mb-1">
                {Math.round(stats.totalVolume / 1000)}k
              </p>
              <p className="text-sm text-gray-400 uppercase tracking-wider">kg Soulevés</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="kb-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Calendar className="w-10 h-10 text-white" />
              </div>
              <p className="text-4xl font-black text-white mb-1">{stats.avgDuration}</p>
              <p className="text-sm text-gray-400 uppercase tracking-wider">Min Moyenne</p>
            </CardContent>
          </Card>
        </motion.div>

        {userProfile?.initial_weight && userProfile?.current_weight && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="kb-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Scale className="w-10 h-10 text-[#00f5d4]" />
                </div>
                <p className="text-4xl font-black text-[#00f5d4] mb-1">
                  {(userProfile.current_weight - userProfile.initial_weight).toFixed(1)}
                </p>
                <p className="text-sm text-gray-400 uppercase tracking-wider">
                  kg {userProfile.current_weight < userProfile.initial_weight ? 'Perdus' : 'Gagnés'}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Volume Chart */}
        {weeklyVolumeData.length > 0 && (
          <Card className="kb-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#9d4edd]" />
                Volume Par Semaine
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyVolumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="week" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a20', border: '1px solid #333' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="volume" fill="#9d4edd" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Exercise Frequency */}
        {monthlyFrequencyData.length > 0 && (
          <Card className="kb-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-[#00f5d4]" />
                Fréquence Exercices (30j)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyFrequencyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" stroke="#888" />
                  <YAxis dataKey="exercise" type="category" width={120} stroke="#888" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a20', border: '1px solid #333' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="count" fill="#00f5d4" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weight Evolution Chart */}
      {weightEvolutionData.length > 0 && (
        <Card className="kb-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-[#fdcb6e]" />
              Évolution du Poids (3 derniers mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weightEvolutionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" />
                <YAxis stroke="#888" domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a20', border: '1px solid #333' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="poids" 
                  stroke="#fdcb6e" 
                  strokeWidth={3}
                  dot={{ fill: '#fdcb6e', r: 6 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity */}
        <Card className="kb-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#9d4edd]" />
              Activité Hebdomadaire
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {weeklyActivity.map((day, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-16 text-sm text-gray-400">
                    {format(day.date, 'EEE', { locale: fr })}
                  </div>
                  <div className="flex-1">
                    <div className="h-8 bg-gray-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] transition-all duration-500 flex items-center justify-end pr-3"
                        style={{ width: `${Math.min((day.count / 3) * 100, 100)}%` }}
                      >
                        {day.count > 0 && (
                          <span className="text-xs font-bold">{day.count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Exercises */}
        <Card className="kb-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#00f5d4]" />
              Exercices Favoris
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topExercises.map(([exercise, count], index) => (
                <div key={exercise} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-500 text-black' :
                    index === 1 ? 'bg-gray-400 text-black' :
                    index === 2 ? 'bg-orange-700 text-white' :
                    'bg-gray-800 text-gray-300'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-white">{exercise}</p>
                  </div>
                  <Badge className="bg-[#7b2cbf]/20 text-[#9d4edd] border-[#7b2cbf]">
                    {count}x
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Personal Records */}
        <Card className="kb-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-[#fdcb6e]" />
              Records Personnels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {personalRecords.map(([exercise, record]) => (
                <div key={exercise} className="bg-black/30 p-4 rounded-lg border border-gray-800">
                  <p className="font-bold text-white mb-2 truncate">{exercise}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-[#fdcb6e]">{record.weight}</span>
                    <span className="text-sm text-gray-400">kg</span>
                    <span className="text-gray-600">×</span>
                    <span className="text-lg font-bold text-[#00f5d4]">{record.reps}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {format(new Date(record.date), 'dd/MM/yyyy')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Workouts */}
      <Card className="kb-card">
        <CardHeader>
          <CardTitle>Historique Récent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredLogs.slice(0, 10).map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-4 bg-black/30 rounded-lg border border-gray-800 hover:border-[#7b2cbf] transition"
              >
                <div className="flex-1">
                  <p className="font-bold text-white mb-1">{log.exercise_name}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(log.date), 'PPP à HH:mm', { locale: fr })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">{log.sets?.length || 0} séries</p>
                  <p className="text-lg font-bold text-[#00f5d4]">
                    {log.duration_minutes} min
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}