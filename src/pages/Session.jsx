import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Play, StopCircle, Plus, Check, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Session() {
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [todayExercises, setTodayExercises] = useState([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sets, setSets] = useState([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: workoutHistory } = useQuery({
    queryKey: ['workoutHistory', user?.email],
    queryFn: () => base44.entities.WorkoutLog.filter({ created_by: user.email }, '-created_date', 20),
    initialData: [],
    enabled: !!user
  });

  const saveWorkoutMutation = useMutation({
    mutationFn: (data) => base44.entities.WorkoutLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['workoutHistory']);
    }
  });

  // Timer effect
  useEffect(() => {
    let interval;
    if (sessionActive && sessionStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sessionActive, sessionStartTime]);

  // Load today's plan
  useEffect(() => {
    loadTodaysPlan();
  }, [user]);

  const loadTodaysPlan = async () => {
    if (!user) return;

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil((((now - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
    
    const plans = await base44.entities.WeeklyPlan.filter({
      week_number: week,
      year: now.getFullYear(),
      created_by: user.email
    });

    if (plans.length > 0) {
      const plan = plans[0];
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = days[now.getDay()];
      const todayData = plan[today];
      
      if (todayData && todayData.exercises) {
        setTodayExercises(todayData.exercises);
      }
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const startSession = () => {
    setSessionActive(true);
    setSessionStartTime(Date.now());
    setSets([{ set_number: 1, weight: '', reps: '', notes: '' }]);
  };

  const endSession = async () => {
    if (currentExercise && sets.some(s => s.weight && s.reps)) {
      await saveWorkoutMutation.mutateAsync({
        exercise_name: currentExercise.name,
        date: new Date().toISOString(),
        sets: sets.filter(s => s.weight && s.reps).map(s => ({
          ...s,
          weight: parseFloat(s.weight),
          reps: parseInt(s.reps)
        })),
        duration_minutes: Math.floor(elapsedTime / 60),
        notes: sessionNotes
      });
    }

    setSessionActive(false);
    setSessionStartTime(null);
    setElapsedTime(0);
    setCurrentExerciseIndex(0);
    setSets([]);
    setSessionNotes('');
  };

  const addSet = () => {
    setSets([...sets, { set_number: sets.length + 1, weight: '', reps: '', notes: '' }]);
  };

  const updateSet = (index, field, value) => {
    const newSets = [...sets];
    newSets[index][field] = value;
    setSets(newSets);
  };

  const nextExercise = async () => {
    if (currentExercise && sets.some(s => s.weight && s.reps)) {
      await saveWorkoutMutation.mutateAsync({
        exercise_name: currentExercise.name,
        date: new Date().toISOString(),
        sets: sets.filter(s => s.weight && s.reps).map(s => ({
          ...s,
          weight: parseFloat(s.weight),
          reps: parseInt(s.reps)
        })),
        duration_minutes: Math.floor(elapsedTime / 60),
        notes: sessionNotes
      });
    }

    if (currentExerciseIndex < todayExercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      setSets([{ set_number: 1, weight: '', reps: '', notes: '' }]);
      setSessionNotes('');
    }
  };

  const currentExercise = todayExercises[currentExerciseIndex];

  if (showHistory) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            onClick={() => setShowHistory(false)}
            variant="outline"
            className="border-gray-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase">
            Historique des Séances
          </h2>
        </div>

        <div className="space-y-4">
          {workoutHistory.map((workout, index) => (
            <motion.div
              key={workout.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="kb-card">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-black text-[#00f5d4] mb-1">
                        {workout.exercise_name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {format(new Date(workout.date), 'PPP à HH:mm', { locale: fr })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Durée</p>
                      <p className="text-lg font-bold">{workout.duration_minutes} min</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-400 uppercase">Séries</p>
                    {workout.sets?.map((set, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-black/30 rounded">
                        <span className="font-bold text-gray-400">Set {set.set_number}</span>
                        <div className="flex gap-4">
                          <span className="text-[#fdcb6e] font-bold">{set.weight} kg</span>
                          <span className="text-[#00f5d4] font-bold">{set.reps} reps</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {workout.notes && (
                    <div className="mt-4 p-3 bg-[#7b2cbf]/10 border border-[#7b2cbf]/30 rounded">
                      <p className="text-xs text-gray-400 mb-1">Notes:</p>
                      <p className="text-sm text-gray-300">{workout.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center relative">
        <div className="absolute top-0 right-0">
          <Button
            onClick={() => setShowHistory(true)}
            variant="outline"
            className="border-gray-800"
          >
            📊 Historique
          </Button>
        </div>

        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase mb-2">
          Session d'Entraînement
        </h1>
        <p className="text-gray-400">
          {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
        </p>

        {/* Timer */}
        {sessionActive && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="mt-6 inline-block"
          >
            <div className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] px-8 py-4 rounded-full">
              <p className="text-5xl font-mono font-black tracking-wider">
                {formatTime(elapsedTime)}
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Session Content */}
      {!sessionActive ? (
        <Card className="kb-card">
          <CardContent className="p-12 text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] mx-auto mb-6 flex items-center justify-center">
              <Play className="w-12 h-12" />
            </div>

            <h2 className="text-2xl font-black mb-4">Prêt à vous surpasser ?</h2>
            
            {todayExercises.length > 0 ? (
              <>
                <p className="text-gray-400 mb-6">
                  {todayExercises.length} exercice(s) programmé(s) aujourd'hui
                </p>
                <div className="flex flex-wrap gap-2 justify-center mb-8">
                  {todayExercises.map((ex, idx) => (
                    <span key={idx} className="px-3 py-1 bg-[#7b2cbf]/20 border border-[#7b2cbf] rounded-full text-sm">
                      {ex.name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-400 mb-6">Aucun exercice programmé • Session libre</p>
            )}

            <Button
              onClick={startSession}
              className="bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] font-black text-lg px-12 py-6 uppercase tracking-wider"
            >
              <Play className="w-6 h-6 mr-3" />
              Commencer la Session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Current Exercise */}
          {currentExercise && (
            <Card className="kb-card border-[#00f5d4]">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">
                      Exercice {currentExerciseIndex + 1} / {todayExercises.length}
                    </p>
                    <h2 className="text-3xl font-black text-[#00f5d4]">
                      {currentExercise.name}
                    </h2>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">Temps écoulé</p>
                    <p className="text-2xl font-mono font-bold">{formatTime(elapsedTime)}</p>
                  </div>
                </div>

                {/* Sets Table */}
                <div className="space-y-3 mb-6">
                  <div className="grid grid-cols-4 gap-3 text-xs font-bold text-gray-400 uppercase pb-2 border-b border-gray-800">
                    <div>Set</div>
                    <div>Poids (kg)</div>
                    <div>Reps</div>
                    <div>Validé</div>
                  </div>

                  {sets.map((set, index) => (
                    <div key={index} className="grid grid-cols-4 gap-3 items-center">
                      <div className="font-bold text-lg text-gray-300">{set.set_number}</div>
                      <Input
                        type="number"
                        value={set.weight}
                        onChange={(e) => updateSet(index, 'weight', e.target.value)}
                        placeholder="0"
                        className="bg-black border-gray-800 text-center font-bold text-lg"
                      />
                      <Input
                        type="number"
                        value={set.reps}
                        onChange={(e) => updateSet(index, 'reps', e.target.value)}
                        placeholder="0"
                        className="bg-black border-gray-800 text-center font-bold text-lg"
                      />
                      <div className="flex justify-center">
                        {set.weight && set.reps ? (
                          <Check className="w-6 h-6 text-green-500" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-gray-700" />
                        )}
                      </div>
                    </div>
                  ))}

                  <Button
                    onClick={addSet}
                    variant="outline"
                    className="w-full border-dashed border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une série
                  </Button>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm font-bold text-gray-400 mb-2 block">
                    Notes de séance
                  </label>
                  <Textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Comment vous sentez-vous ? Difficulté, forme, etc."
                    className="bg-black border-gray-800 text-white min-h-[80px]"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <Button
              onClick={endSession}
              variant="outline"
              className="flex-1 border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-bold py-6"
            >
              <StopCircle className="w-5 h-5 mr-2" />
              Terminer la Session
            </Button>
            {currentExerciseIndex < todayExercises.length - 1 && (
              <Button
                onClick={nextExercise}
                className="flex-1 bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold py-6"
              >
                Exercice Suivant
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}