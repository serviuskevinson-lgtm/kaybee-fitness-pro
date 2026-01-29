import React, { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Users, Ruler, Weight, Target, AlertCircle,
  Clock, Save, Calendar, Camera, User, Goal
} from 'lucide-react';
import { format } from 'date-fns';

export default function MyTeam() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState({});

  // 1. CHARGER LES CLIENTS DU COACH
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['coachClients', currentUser?.uid],
    queryFn: async () => {
      const q = query(collection(db, "users"), where("coachId", "==", currentUser.uid));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!currentUser
  });

  // 2. MUTATION : SAUVEGARDER UN COMMENTAIRE
  const saveCommentMutation = useMutation({
    mutationFn: async ({ clientId, comment }) => {
      const clientRef = doc(db, "users", clientId);
      const newComment = {
        text: comment,
        createdAt: new Date().toISOString(),
        authorName: currentUser.displayName || "Coach"
      };
      await updateDoc(clientRef, {
        coachComments: arrayUnion(newComment)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['coachClients']);
      alert("Commentaire enregistré !");
    }
  });

  const handleSaveComment = (clientId) => {
    if (!comments[clientId]) return;
    saveCommentMutation.mutate({ clientId, comment: comments[clientId] });
    setComments(prev => ({ ...prev, [clientId]: '' }));
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">Chargement de votre équipe...</div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-3">
        <Users className="w-10 h-10 text-[#9d4edd]" />
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#9d4edd] to-[#00f5d4] uppercase">
          Mon Équipe
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {clients.length === 0 ? (
          <p className="text-gray-500 text-center py-10">Vous n'avez pas encore de clients dans votre équipe.</p>
        ) : (
          clients.map((client) => (
            <Card key={client.id} className="kb-card overflow-hidden border-gray-800 bg-[#1a1a20]">
              <div className="grid grid-cols-1 lg:grid-cols-3">

                {/* INFO DE BASE & PHOTOS */}
                <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-800 bg-black/20">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="w-20 h-20 border-2 border-[#00f5d4]">
                      <AvatarImage src={client.avatar} />
                      <AvatarFallback className="bg-[#7b2cbf] text-white font-bold text-2xl">
                        {client.first_name?.[0] || client.full_name?.[0] || "A"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-black text-white">{client.full_name || `${client.first_name} ${client.last_name}`}</h3>
                      <Badge className="bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/30">Athlète</Badge>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                       <Camera size={14} className="text-[#9d4edd]" /> Photo "Pour Coach"
                    </p>
                    <div className="aspect-[4/5] bg-black rounded-xl overflow-hidden border border-gray-800 flex items-center justify-center">
                       {client.coachUpdatePhoto ? (
                           <img src={client.coachUpdatePhoto} className="w-full h-full object-cover" alt="Evolution" />
                       ) : (
                           <p className="text-[10px] text-gray-600 italic">Aucune photo envoyée</p>
                       )}
                    </div>
                  </div>
                </div>

                {/* DÉTAILS PHYSIQUES & BUTS */}
                <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-800">
                  <h4 className="text-sm font-bold text-[#00f5d4] uppercase mb-4 flex items-center gap-2">
                    <Target size={16} /> Profil Athlétique
                  </h4>

                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <div className="bg-black/40 p-2 rounded-lg border border-gray-800 text-center">
                      <p className="text-[9px] text-gray-500 uppercase">Taille</p>
                      <p className="text-sm font-bold text-white">{client.height || '--'} cm</p>
                    </div>
                    <div className="bg-black/40 p-2 rounded-lg border border-gray-800 text-center">
                      <p className="text-[9px] text-gray-500 uppercase">Poids</p>
                      <p className="text-sm font-bold text-white">{client.weight || '--'} {client.weightUnit || 'kg'}</p>
                    </div>
                    <div className="bg-black/40 p-2 rounded-lg border border-[#9d4edd]/30 text-center">
                      <p className="text-[9px] text-[#9d4edd] uppercase">Cible</p>
                      <p className="text-sm font-bold text-white">{client.targetWeight || '--'} {client.weightUnit || 'kg'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-1">Objectifs</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {client.selectedGoals?.map((g, i) => (
                          <Badge key={i} className="text-[9px] bg-[#7b2cbf]/20 border-[#7b2cbf]/40">{g}</Badge>
                        ))}
                      </div>
                      <p className="text-sm text-gray-300 italic leading-snug">"{client.goals || 'Non spécifié'}"</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-1">Disponibilités</p>
                      <div className="flex gap-1">
                        {client.availabilityDays?.map((day, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-black/60 border border-gray-800 rounded text-[#00f5d4] font-bold">{day}</span>
                        )) || <span className="text-xs text-gray-500 italic">Non défini</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-red-400 uppercase mb-1 flex items-center gap-1">
                        <AlertCircle size={12} /> Santé / Blessures
                      </p>
                      <p className="text-xs text-gray-400 leading-tight">{client.injuries || 'Aucune blessure signalée'}</p>
                    </div>
                  </div>
                </div>

                {/* COMMENTAIRES DU COACH */}
                <div className="p-6 flex flex-col h-full">
                  <h4 className="text-sm font-bold text-[#9d4edd] uppercase mb-4 flex items-center gap-2">
                    <Clock size={16} /> Suivi & Commentaires
                  </h4>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[200px] mb-4 pr-2 custom-scrollbar">
                    {client.coachComments?.length > 0 ? (
                      [...client.coachComments].reverse().map((c, idx) => (
                        <div key={idx} className="bg-black/30 p-2 rounded border-l-2 border-[#7b2cbf]">
                          <p className="text-xs text-gray-300">{c.text}</p>
                          <p className="text-[9px] text-gray-600 mt-1">{format(new Date(c.createdAt), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-gray-600 italic">Aucun commentaire pour le moment.</p>
                    )}
                  </div>

                  <div className="space-y-2 mt-auto">
                    <Textarea
                      placeholder="Ajouter une observation..."
                      className="bg-black border-gray-800 text-xs min-h-[60px]"
                      value={comments[client.id] || ''}
                      onChange={(e) => setComments(prev => ({ ...prev, [client.id]: e.target.value }))}
                    />
                    <Button
                      onClick={() => handleSaveComment(client.id)}
                      disabled={saveCommentMutation.isPending}
                      className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] text-xs h-8 font-bold"
                    >
                      <Save size={14} className="mr-2" /> Enregistrer
                    </Button>
                  </div>
                </div>

              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
