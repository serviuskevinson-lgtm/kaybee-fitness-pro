import React, { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Star, Award, Calendar, Users, MessageCircle, 
  CheckCircle, Clock, XCircle 
} from 'lucide-react';
import { motion } from 'framer-motion';
// IMPORT NOTIFICATIONS
import { sendNotification } from '@/lib/notifications';

export default function Coach() {
  const { currentUser } = useAuth();
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [goals, setGoals] = useState('');
  const queryClient = useQueryClient();

  // 1. CHARGER MON PROFIL (Pour voir si j'ai déjà un coach)
  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.uid],
    queryFn: async () => {
      if (!currentUser) return null;
      const docSnap = await getDoc(doc(db, "users", currentUser.uid));
      return docSnap.exists() ? docSnap.data() : null;
    },
    enabled: !!currentUser
  });

  // 2. CHARGER LES COACHS DISPONIBLES (Firebase)
  const { data: coaches = [], isLoading } = useQuery({
    queryKey: ['coaches'],
    queryFn: async () => {
      const q = query(collection(db, "users"), where("role", "==", "coach"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  // 3. CHARGER MES REQUÊTES EN ATTENTE (Firebase)
  const { data: myRequests = [] } = useQuery({
    queryKey: ['coachRequests', currentUser?.uid],
    queryFn: async () => {
      if(!currentUser) return [];
      const q = query(
          collection(db, "notifications"), 
          where("senderId", "==", currentUser.uid), 
          where("type", "==", "coach_request")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!currentUser
  });

  // 4. MUTATION : ENVOYER LA DEMANDE
  const requestCoachMutation = useMutation({
    mutationFn: async () => {
      // Envoi de la notification au coach
      await sendNotification(
          selectedCoach.id, // ID du coach
          currentUser.uid, // Mon ID
          currentUser.displayName || userProfile?.first_name || "Athlète", // Mon Nom
          "Nouvelle Demande 🚀", // Titre
          `${goals} - ${requestMessage}`, // Message combiné
          "coach_request" // Type
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['coachRequests']);
      setShowRequestModal(false);
      setRequestMessage('');
      setGoals('');
      setSelectedCoach(null);
      alert("Demande envoyée !");
    },
    onError: (error) => {
        console.error("Erreur demande:", error);
        alert("Erreur lors de l'envoi de la demande.");
    }
  });

  const handleRequestCoach = () => {
    if (!selectedCoach || !requestMessage || !goals) return alert('Merci de remplir vos objectifs et le message.');
    requestCoachMutation.mutate();
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'accepted': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'accepted': return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Recherche des coachs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase mb-2">
          Trouvez Votre Coach Élite
        </h1>
        <p className="text-gray-400">Connectez-vous avec des entraîneurs certifiés et atteignez vos objectifs</p>
      </div>

      {/* AFFICHER MON COACH ACTUEL (Si j'en ai un) */}
      {userProfile?.coachId && (
        <Card className="kb-card border-[#00f5d4]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#00f5d4]">
              <Award className="w-5 h-5" />
              Votre Coach Actuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300">Coach: <span className="font-bold text-white">{userProfile.coachName || "Inconnu"}</span></p>
          </CardContent>
        </Card>
      )}

      {/* MES DEMANDES EN COURS */}
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
                    {/* On essaie d'afficher le nom du coach si possible, sinon 'Demande envoyée' */}
                    <p className="font-bold text-white">Demande de Coaching</p>
                    <p className="text-xs text-gray-400">{request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'Récemment'}</p>
                  </div>
                  <Badge className={`${getStatusColor(request.status)} border flex items-center gap-1`}>
                    {getStatusIcon(request.status)}
                    {request.status === 'unread' ? 'En attente' : request.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GRILLE DES COACHS */}
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
                  {coach.avatar ? (
                    <img src={coach.avatar} alt={coach.full_name} className="w-full h-full object-cover" />
                  ) : (
                    (coach.full_name || coach.name || "C")[0].toUpperCase()
                  )}
                </div>

                {/* Info */}
                <h3 className="text-xl font-black text-center mb-1 text-white">{coach.full_name || coach.name}</h3>
                
                {/* Rating */}
                <div className="flex items-center justify-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < (coach.rating || 5) ? 'text-[#fdcb6e] fill-[#fdcb6e]' : 'text-gray-600'}`}
                    />
                  ))}
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
                    <p className="font-bold text-gray-300">{coach.experience || '5+'} ans</p>
                  </div>
                  <div className="bg-black/50 p-2 rounded">
                    <Users className="w-4 h-4 mx-auto mb-1 text-[#00f5d4]" />
                    <p className="font-bold text-gray-300">{coach.clientCount || '10+'} clients</p>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-xs text-gray-400 text-center mb-4 line-clamp-2 min-h-[2.5em]">
                  {coach.bio || 'Coach professionnel certifié prêt à vous aider.'}
                </p>

                {/* Price & CTA */}
                <div className="text-center mb-3">
                  <p className="text-2xl font-black text-[#fdcb6e]">
                    {coach.priceStart || 50}€
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
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {coaches.length === 0 && !isLoading && (
            <div className="col-span-full text-center text-gray-500 py-10">
                Aucun coach disponible pour le moment.
            </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && selectedCoach && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <Card className="kb-card w-full max-w-lg bg-[#1a1a20] border-gray-700">
            <CardHeader>
              <CardTitle className="text-2xl font-black text-[#00f5d4]">
                Demander {selectedCoach.full_name || selectedCoach.name}
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
                  className="flex-1 border-gray-600 text-gray-300 hover:text-white"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleRequestCoach}
                  disabled={requestCoachMutation.isPending}
                  className="flex-1 bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-bold text-black"
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