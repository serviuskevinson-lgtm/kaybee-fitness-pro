import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trophy, Target, Users, TrendingUp, Medal, 
  Award, Flame, CheckCircle, Crown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Challenges() {
  const [activeTab, setActiveTab] = useState('active');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: challenges, isLoading } = useQuery({
    queryKey: ['challenges', activeTab],
    queryFn: async () => {
      const all = await base44.entities.Challenge.list('-created_date');
      if (activeTab === 'active') {
        return all.filter(c => c.is_active && new Date(c.end_date) > new Date());
      }
      return all;
    },
    initialData: []
  });

  const { data: myProgress } = useQuery({
    queryKey: ['challengeProgress', user?.email],
    queryFn: () => base44.entities.ChallengeProgress.filter({ created_by: user.email }),
    initialData: [],
    enabled: !!user
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      const users = await base44.entities.User.list();
      return users.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    },
    initialData: []
  });

  const joinChallengeMutation = useMutation({
    mutationFn: async (challenge) => {
      return base44.entities.ChallengeProgress.create({
        challenge_id: challenge.id,
        challenge_title: challenge.title,
        target_value: challenge.target_value,
        current_value: 0,
        completed: false
      });
    },
    onSuccess: async (data, challenge) => {
      await base44.entities.Challenge.update(challenge.id, {
        participants_count: (challenge.participants_count || 0) + 1
      });
      queryClient.invalidateQueries(['challengeProgress']);
      queryClient.invalidateQueries(['challenges']);
    }
  });

  const updateProgressMutation = useMutation({
    mutationFn: async ({ progressId, newValue, targetValue }) => {
      const completed = newValue >= targetValue;
      const updateData = {
        current_value: newValue,
        completed: completed
      };
      
      if (completed && !updateData.completion_date) {
        updateData.completion_date = new Date().toISOString();
      }
      
      return base44.entities.ChallengeProgress.update(progressId, updateData);
    },
    onSuccess: async (data, variables) => {
      if (data.completed) {
        const userProfile = await base44.entities.User.filter({ email: user.email });
        if (userProfile.length > 0) {
          const profile = userProfile[0];
          await base44.entities.User.update(profile.id, {
            total_points: (profile.total_points || 0) + 100,
            level: Math.floor(((profile.total_points || 0) + 100) / 500) + 1
          });
        }
      }
      queryClient.invalidateQueries(['challengeProgress']);
      queryClient.invalidateQueries(['allUsers']);
    }
  });

  const isJoined = (challengeId) => {
    return myProgress.some(p => p.challenge_id === challengeId);
  };

  const getProgress = (challengeId) => {
    return myProgress.find(p => p.challenge_id === challengeId);
  };

  const getDaysRemaining = (endDate) => {
    return differenceInDays(new Date(endDate), new Date());
  };

  const getChallengeIcon = (type) => {
    switch(type) {
      case 'Répétitions': return <Target className="w-6 h-6" />;
      case 'Poids total': return <TrendingUp className="w-6 h-6" />;
      case 'Endurance': return <Flame className="w-6 h-6" />;
      case 'Jours consécutifs': return <CheckCircle className="w-6 h-6" />;
      default: return <Trophy className="w-6 h-6" />;
    }
  };

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
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#fdcb6e] to-[#00f5d4] uppercase mb-2">
          Défis & Classements
        </h1>
        <p className="text-gray-400">Dépassez vos limites et montez dans le classement</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Challenges Section */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#1a1a20] border border-gray-800">
              <TabsTrigger value="active">🔥 Actifs</TabsTrigger>
              <TabsTrigger value="all">📋 Tous</TabsTrigger>
              <TabsTrigger value="completed">✅ Complétés</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-4">
            {challenges.map((challenge, index) => {
              const joined = isJoined(challenge.id);
              const progress = getProgress(challenge.id);
              const daysLeft = getDaysRemaining(challenge.end_date);
              const progressPercent = progress ? (progress.current_value / progress.target_value) * 100 : 0;

              return (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={`kb-card ${joined ? 'border-[#00f5d4]' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] flex items-center justify-center flex-shrink-0">
                          {getChallengeIcon(challenge.type)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="text-xl font-black">{challenge.title}</h3>
                              <p className="text-sm text-gray-400">{challenge.description}</p>
                            </div>
                            {joined && progress?.completed && (
                              <Badge className="bg-green-500 text-white">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Complété
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 mb-4">
                            <Badge className="bg-[#7b2cbf]/20 text-[#9d4edd] border-[#7b2cbf]">
                              {challenge.type}
                            </Badge>
                            <Badge variant="outline" className="text-gray-400">
                              <Users className="w-3 h-3 mr-1" />
                              {challenge.participants_count || 0} participants
                            </Badge>
                            <Badge variant="outline" className={daysLeft < 7 ? 'text-red-400' : 'text-gray-400'}>
                              ⏱️ {daysLeft} jours restants
                            </Badge>
                          </div>

                          {joined && progress && (
                            <div className="mb-4">
                              <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Progression</span>
                                <span className="font-bold text-[#00f5d4]">
                                  {progress.current_value} / {progress.target_value} {challenge.unit}
                                </span>
                              </div>
                              <Progress value={progressPercent} className="h-2 bg-gray-800" />
                            </div>
                          )}

                          <div className="flex gap-3">
                            {!joined ? (
                              <Button
                                onClick={() => joinChallengeMutation.mutate(challenge)}
                                disabled={joinChallengeMutation.isPending}
                                className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold"
                              >
                                Rejoindre le défi
                              </Button>
                            ) : (
                              !progress?.completed && (
                                <Button
                                  onClick={() => {
                                    const newValue = prompt(
                                      `Entrez votre progression (actuel: ${progress.current_value}/${progress.target_value}):`
                                    );
                                    if (newValue && !isNaN(newValue)) {
                                      updateProgressMutation.mutate({
                                        progressId: progress.id,
                                        newValue: parseFloat(newValue),
                                        targetValue: progress.target_value
                                      });
                                    }
                                  }}
                                  variant="outline"
                                  className="border-[#00f5d4] text-[#00f5d4]"
                                >
                                  Mettre à jour
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}

            {challenges.length === 0 && (
              <Card className="kb-card">
                <CardContent className="p-12 text-center">
                  <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">Aucun défi disponible pour le moment</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <Card className="kb-card sticky top-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[#fdcb6e]">
                <Crown className="w-5 h-5" />
                Classement Élite
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allUsers.slice(0, 10).map((u, index) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    u.email === user?.email 
                      ? 'bg-[#7b2cbf]/20 border border-[#7b2cbf]' 
                      : 'bg-black/30'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                    index === 0 ? 'bg-yellow-500 text-black' :
                    index === 1 ? 'bg-gray-400 text-black' :
                    index === 2 ? 'bg-orange-700 text-white' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    {index + 1}
                  </div>

                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {u.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'KB'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{u.full_name || u.email?.split('@')[0]}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#fdcb6e]/20 text-[#fdcb6e] text-[10px] px-2 py-0">
                        Niv. {u.level || 1}
                      </Badge>
                      <span className="text-xs text-gray-500">{u.total_points || 0} pts</span>
                    </div>
                  </div>

                  {index < 3 && (
                    <Medal className={`w-5 h-5 ${
                      index === 0 ? 'text-yellow-500' :
                      index === 1 ? 'text-gray-400' :
                      'text-orange-700'
                    }`} />
                  )}
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}