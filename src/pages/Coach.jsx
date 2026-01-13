import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Star, Award, Calendar, Users, MessageCircle, 
  CheckCircle, Clock, XCircle, TrendingUp 
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Coach() {
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [goals, setGoals] = useState('');
  const queryClient = useQueryClient();

  const { data: coaches, isLoading } = useQuery({
    queryKey: ['coaches'],
    queryFn: () => base44.entities.Coach.list('-rating'),
    initialData: []
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

  const { data: myRequests } = useQuery({
    queryKey: ['coachRequests', user?.email],
    queryFn: () => base44.entities.CoachRequest.filter({ created_by: user.email }),
    initialData: [],
    enabled: !!user
  });

  const requestCoachMutation = useMutation({
    mutationFn: async (data) => base44.entities.CoachRequest.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['coachRequests']);
      setShowRequestModal(false);
      setRequestMessage('');
      setGoals('');
      setSelectedCoach(null);
    }
  });

  const handleRequestCoach = () => {
    if (!selectedCoach || !requestMessage || !goals) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    requestCoachMutation.mutate({
      coach_email: selectedCoach.email,
      coach_name: selectedCoach.name,
      message: requestMessage,
      goals: goals,
      status: 'En attente'
    });
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'Acceptée': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'Refusée': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'Annulée': return <XCircle className="w-4 h-4 text-gray-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Acceptée': return 'bg-green-100 text-green-800 border-green-200';
      case 'Refusée': return 'bg-red-100 text-red-800 border-red-200';
      case 'Annulée': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Chargement des coachs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase mb-2">
          Trouvez Votre Coach Élite
        </h1>
        <p className="text-gray-400">Connectez-vous avec des entraîneurs certifiés et atteignez vos objectifs</p>
      </div>

      {/* Current Coach */}
      {userProfile?.coach_email && (
        <Card className="kb-card border-[#00f5d4]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#00f5d4]">
              <Award className="w-5 h-5" />
              Votre Coach Actuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300">Coach: <span className="font-bold">{userProfile.coach_email}</span></p>
          </CardContent>
        </Card>
      )}

      {/* My Requests */}
      {myRequests.length > 0 && (
        <Card className="kb-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#9d4edd]" />
              Mes Demandes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 bg-black/50 rounded border border-gray-800">
                  <div>
                    <p className="font-bold text-white">{request.coach_name}</p>
                    <p className="text-xs text-gray-400">{request.message.substring(0, 50)}...</p>
                  </div>
                  <Badge className={`${getStatusColor(request.status)} border flex items-center gap-1`}>
                    {getStatusIcon(request.status)}
                    {request.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coaches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coaches.map((coach, index) => (
          <motion.div
            key={coach.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="kb-card h-full hover:border-[#9d4edd] transition group">
              <CardContent className="p-6">
                {/* Photo */}
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] flex items-center justify-center text-3xl font-black overflow-hidden">
                  {coach.photo_url ? (
                    <img src={coach.photo_url} alt={coach.name} className="w-full h-full object-cover" />
                  ) : (
                    coach.name.split(' ').map(n => n[0]).join('').toUpperCase()
                  )}
                </div>

                {/* Info */}
                <h3 className="text-xl font-black text-center mb-1">{coach.name}</h3>
                
                {/* Rating */}
                <div className="flex items-center justify-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < (coach.rating || 0) ? 'text-[#fdcb6e] fill-[#fdcb6e]' : 'text-gray-600'}`}
                    />
                  ))}
                  <span className="text-xs text-gray-400 ml-1">({coach.rating || 0})</span>
                </div>

                {/* Specialties */}
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {coach.specialties?.slice(0, 3).map((specialty, idx) => (
                    <Badge key={idx} className="bg-[#7b2cbf]/20 text-[#9d4edd] border-[#7b2cbf] text-[10px]">
                      {specialty}
                    </Badge>
                  ))}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-center text-xs">
                  <div className="bg-black/50 p-2 rounded">
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-[#00f5d4]" />
                    <p className="font-bold">{coach.experience_years || 0} ans</p>
                  </div>
                  <div className="bg-black/50 p-2 rounded">
                    <Users className="w-4 h-4 mx-auto mb-1 text-[#00f5d4]" />
                    <p className="font-bold">{coach.clients_count || 0} clients</p>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-xs text-gray-400 text-center mb-4 line-clamp-2">
                  {coach.bio || 'Coach professionnel certifié'}
                </p>

                {/* Price & CTA */}
                <div className="text-center mb-3">
                  <p className="text-2xl font-black text-[#fdcb6e]">
                    {coach.price_per_month || 0}€
                    <span className="text-xs text-gray-500">/mois</span>
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setSelectedCoach(coach);
                    setShowRequestModal(true);
                  }}
                  disabled={coach.availability === 'Complet'}
                  className={`w-full font-bold uppercase tracking-wider ${
                    coach.availability === 'Complet' 
                      ? 'bg-gray-700 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] hover:from-[#9d4edd] hover:to-[#7b2cbf]'
                  }`}
                >
                  {coach.availability === 'Complet' ? 'Complet' : 'Demander ce coach'}
                </Button>

                {coach.availability === 'Liste d\'attente' && (
                  <p className="text-[10px] text-center text-yellow-500 mt-2">Liste d'attente disponible</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Request Modal */}
      {showRequestModal && selectedCoach && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <Card className="kb-card w-full max-w-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-black text-[#00f5d4]">
                Demander {selectedCoach.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block">
                  Vos Objectifs
                </label>
                <Textarea
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="Ex: Prise de masse, perte de poids, préparation compétition..."
                  className="bg-black border-gray-800 text-white min-h-[100px]"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-gray-400 mb-2 block">
                  Message de Motivation
                </label>
                <Textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Pourquoi voulez-vous travailler avec ce coach ?"
                  className="bg-black border-gray-800 text-white min-h-[120px]"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowRequestModal(false);
                    setSelectedCoach(null);
                    setRequestMessage('');
                    setGoals('');
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleRequestCoach}
                  disabled={requestCoachMutation.isPending}
                  className="flex-1 bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold"
                >
                  {requestCoachMutation.isPending ? 'Envoi...' : 'Envoyer la Demande'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}