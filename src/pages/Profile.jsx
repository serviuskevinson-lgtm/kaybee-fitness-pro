import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Award, Trophy, Target, Heart, TrendingUp, User } from 'lucide-react';

export default function Profile() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    goals: '',
    injuries: '',
    allergies: '',
    birthday: '',
    gender: '',
    height: '',
    initial_weight: '',
    current_weight: ''
  });

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

  const { data: completedChallenges } = useQuery({
    queryKey: ['completedChallenges', user?.email],
    queryFn: async () => {
      const progress = await base44.entities.ChallengeProgress.filter({ 
        created_by: user.email,
        completed: true
      });
      return progress;
    },
    initialData: [],
    enabled: !!user
  });

  const { data: workoutLogs } = useQuery({
    queryKey: ['workoutLogs', user?.email],
    queryFn: () => base44.entities.WorkoutLog.filter({ created_by: user.email }),
    initialData: [],
    enabled: !!user
  });

  useEffect(() => {
    if (userProfile) {
      setFormData({
        goals: userProfile.goals || '',
        injuries: userProfile.injuries || '',
        allergies: userProfile.allergies || '',
        birthday: userProfile.birthday || '',
        gender: userProfile.gender || '',
        height: userProfile.height || '',
        initial_weight: userProfile.initial_weight || '',
        current_weight: userProfile.current_weight || ''
      });
    }
  }, [userProfile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      // Update weight history
      const weightHistoryUpdate = {};
      if (data.current_weight && data.current_weight !== userProfile?.current_weight) {
        const history = userProfile?.weight_history || [];
        weightHistoryUpdate.weight_history = [
          ...history,
          {
            date: new Date().toISOString().split('T')[0],
            weight: parseFloat(data.current_weight)
          }
        ];
      }

      const updateData = {
        ...data,
        ...weightHistoryUpdate,
        height: data.height ? parseFloat(data.height) : undefined,
        initial_weight: data.initial_weight ? parseFloat(data.initial_weight) : undefined,
        current_weight: data.current_weight ? parseFloat(data.current_weight) : undefined
      };

      if (userProfile) {
        return base44.entities.User.update(userProfile.id, updateData);
      } else {
        return base44.entities.User.create({
          email: user.email,
          ...updateData,
          points: 0,
          level: 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['userProfile']);
      alert('Profil mis à jour avec succès !');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const totalWorkouts = workoutLogs.length;
  const level = userProfile?.level || 1;
  const points = userProfile?.total_points || 0;
  const nextLevelPoints = level * 500;
  const progressToNext = ((points % 500) / 500) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] mx-auto mb-4 flex items-center justify-center text-5xl font-black">
          {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'KB'}
        </div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] mb-2">
          {user?.full_name || 'Membre KAYBEE'}
        </h1>
        <p className="text-gray-400">{user?.email}</p>
        
        <div className="flex items-center justify-center gap-4 mt-6">
          <Badge className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white px-4 py-2 text-base">
            <Award className="w-5 h-5 mr-2" />
            Niveau {level}
          </Badge>
          <Badge className="bg-[#fdcb6e]/20 text-[#fdcb6e] border-[#fdcb6e] px-4 py-2 text-base">
            <Trophy className="w-5 h-5 mr-2" />
            {points} Points
          </Badge>
        </div>

        {/* Level Progress */}
        <div className="mt-6 max-w-md mx-auto">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Progression vers Niveau {level + 1}</span>
            <span>{points % 500} / 500 XP</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] transition-all duration-500"
              style={{ width: `${progressToNext}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="kb-card">
          <CardContent className="p-6 text-center">
            <TrendingUp className="w-10 h-10 text-[#00f5d4] mx-auto mb-2" />
            <p className="text-3xl font-black text-[#00f5d4]">{totalWorkouts}</p>
            <p className="text-sm text-gray-400">Séances totales</p>
          </CardContent>
        </Card>

        <Card className="kb-card">
          <CardContent className="p-6 text-center">
            <Trophy className="w-10 h-10 text-[#fdcb6e] mx-auto mb-2" />
            <p className="text-3xl font-black text-[#fdcb6e]">{completedChallenges.length}</p>
            <p className="text-sm text-gray-400">Défis complétés</p>
          </CardContent>
        </Card>

        <Card className="kb-card">
          <CardContent className="p-6 text-center">
            <Target className="w-10 h-10 text-[#9d4edd] mx-auto mb-2" />
            <p className="text-3xl font-black text-[#9d4edd]">{level}</p>
            <p className="text-sm text-gray-400">Niveau actuel</p>
          </CardContent>
        </Card>
      </div>

      {/* Profile Form */}
      <Card className="kb-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#9d4edd]" />
            Informations Personnelles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                  Objectifs Personnels
                </label>
                <Textarea
                  value={formData.goals}
                  onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                  placeholder="Ex: Prise de masse sèche, améliorer l'endurance..."
                  className="bg-black border-gray-800 text-white min-h-[100px]"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                  Allergies Alimentaires
                </label>
                <Textarea
                  value={formData.allergies}
                  onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  placeholder="Ex: Crustacés, lactose..."
                  className="bg-black border-gray-800 text-white min-h-[100px]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                  Blessures Actuelles
                </label>
                <Textarea
                  value={formData.injuries}
                  onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
                  placeholder="Ex: Douleur au genou droit, tendinite épaule..."
                  className="bg-black border-gray-800 text-white min-h-[100px]"
                />
              </div>
            </div>

            <div className="border-t border-gray-800 pt-6">
              <h3 className="text-lg font-bold text-white mb-4">Informations Physiques</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                    Date de naissance
                  </label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                    className="bg-black border-gray-800 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                    Sexe
                  </label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => setFormData({ ...formData, gender: value })}
                  >
                    <SelectTrigger className="bg-black border-gray-800 text-white">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Homme">Homme</SelectItem>
                      <SelectItem value="Femme">Femme</SelectItem>
                      <SelectItem value="Autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                    Taille (cm)
                  </label>
                  <Input
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                    placeholder="175"
                    className="bg-black border-gray-800 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                    Poids initial (kg)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.initial_weight}
                    onChange={(e) => setFormData({ ...formData, initial_weight: e.target.value })}
                    placeholder="80.0"
                    className="bg-black border-gray-800 text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm font-bold text-gray-400 mb-2 block uppercase tracking-wider">
                    Poids actuel (kg)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.current_weight}
                    onChange={(e) => setFormData({ ...formData, current_weight: e.target.value })}
                    placeholder="75.0"
                    className="bg-black border-gray-800 text-white"
                  />
                  {userProfile?.initial_weight && formData.current_weight && (
                    <p className="text-sm mt-2 text-gray-400">
                      Évolution: {(parseFloat(formData.current_weight) - parseFloat(userProfile.initial_weight)).toFixed(1)} kg
                      {parseFloat(formData.current_weight) < parseFloat(userProfile.initial_weight) ? 
                        <span className="text-green-500 ml-2">↓ Perte</span> : 
                        <span className="text-blue-500 ml-2">↑ Gain</span>
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold uppercase tracking-wider py-6"
            >
              {updateProfileMutation.isPending ? 'Mise à jour...' : 'Mettre à jour mon profil'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Achievements */}
      {completedChallenges.length > 0 && (
        <Card className="kb-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#fdcb6e]" />
              Accomplissements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {completedChallenges.map((challenge) => (
                <div key={challenge.id} className="text-center p-4 bg-black/50 rounded-lg border border-gray-800">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#fdcb6e] to-[#00f5d4] mx-auto mb-2 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-black" />
                  </div>
                  <p className="font-bold text-sm">{challenge.challenge_title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(challenge.completion_date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}