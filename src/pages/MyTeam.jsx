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
  Clock, Save, Camera, User, Goal, ChevronRight, MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';

export default function MyTeam() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState({});

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['coachClients', currentUser?.uid],
    queryFn: async () => {
      const q = query(collection(db, "users"), where("coachId", "==", currentUser.uid));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    enabled: !!currentUser
  });

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

  if (isLoading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-[#9d4edd] font-black uppercase animate-pulse">Sync Team...</div>;

  return (
    <div className="p-2 sm:p-4 bg-[#0a0a0f] min-h-screen text-white pb-32">
      <div className="max-w-7xl mx-auto mb-6 sm:mb-10 bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 shadow-xl">
        <h1 className="text-2xl sm:text-4xl font-black italic uppercase text-[#9d4edd] flex items-center gap-3 tracking-tighter">
          <Users size={32} className="text-[#00f5d4]"/> MON ÉQUIPE
        </h1>
        <p className="text-gray-500 text-[10px] sm:text-sm mt-1 uppercase font-bold tracking-widest">{clients.length} Athlètes sous contrat</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        {clients.length === 0 ? (
          <div className="py-20 text-center text-gray-600 bg-black/20 rounded-2xl border-2 border-dashed border-gray-800">
            <User size={48} className="mx-auto mb-4 opacity-20"/>
            <p className="font-black uppercase italic">Aucun athlète trouvé</p>
          </div>
        ) : (
          clients.map((client) => (
            <Card key={client.id} className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex flex-col lg:grid lg:grid-cols-3">

                {/* INFO & PHOTO EVOLUTION */}
                <div className="p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-gray-800 bg-black/20">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="size-16 sm:size-20 border-2 border-[#00f5d4] shadow-lg shadow-[#00f5d4]/10">
                      <AvatarImage src={client.avatar} className="object-cover"/>
                      <AvatarFallback className="bg-[#7b2cbf] text-white font-black text-xl">{client.first_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h3 className="text-lg sm:text-xl font-black text-white uppercase italic truncate">{client.full_name || client.firstName}</h3>
                      <Badge className="bg-[#00f5d4]/10 text-[#00f5d4] border-none text-[8px] uppercase font-black">ATHLÈTE ACTIF</Badge>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2"><Camera size={12} className="text-[#9d4edd]"/> Évolution Physique</p>
                    <div className="aspect-[4/5] bg-black rounded-xl overflow-hidden border border-gray-800 group relative">
                       {client.coachUpdatePhoto ? (
                           <img src={client.coachUpdatePhoto} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all" alt="Evolution" />
                       ) : (
                           <div className="flex flex-col items-center justify-center h-full opacity-20"><ImageIcon size={32}/><p className="text-[8px] mt-2 font-black">AUCUNE PHOTO</p></div>
                       )}
                    </div>
                  </div>
                </div>

                {/* BIOMETRIE & OBJECTIFS */}
                <div className="p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-gray-800">
                  <h4 className="text-[10px] font-black text-[#00f5d4] uppercase mb-4 flex items-center gap-2 tracking-widest"><Target size={14} /> Profil & Metrics</h4>

                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <MetricBox label="Taille" value={client.height} unit="cm" />
                    <MetricBox label="Poids" value={client.weight} unit={client.weightUnit || 'kg'} />
                    <MetricBox label="Cible" value={client.targetWeight} unit={client.weightUnit || 'kg'} color="text-[#9d4edd]" />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-2">Objectifs Sélectionnés</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {client.selectedGoals?.map((g, i) => (
                          <Badge key={i} className="text-[8px] bg-[#7b2cbf]/10 border-[#7b2cbf]/30 text-[#9d4edd] font-black uppercase">{g}</Badge>
                        )) || <span className="text-[10px] text-gray-600 italic">Standard</span>}
                      </div>
                      <p className="text-[11px] text-gray-400 italic leading-snug bg-black/20 p-3 rounded-lg border border-white/5">"{client.goals || 'Exploser ses limites.'}"</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-red-400 uppercase mb-1 flex items-center gap-1"><AlertCircle size={10} /> Limitations / Santé</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase">{client.injuries || 'Aucune blessure signalée'}</p>
                    </div>
                  </div>
                </div>

                {/* CHAT RAPIDE & COMMENTAIRES */}
                <div className="p-5 sm:p-6 flex flex-col h-full bg-black/10">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black text-[#9d4edd] uppercase flex items-center gap-2 tracking-widest"><Clock size={14} /> Suivi Coach</h4>
                    <Button size="icon" variant="ghost" className="size-8 rounded-full bg-[#00f5d4]/10 text-[#00f5d4]" onClick={() => navigate('/messages')}><MessageSquare size={14}/></Button>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[180px] mb-4 pr-2 custom-scrollbar">
                    {client.coachComments?.length > 0 ? (
                      [...client.coachComments].reverse().map((c, idx) => (
                        <div key={idx} className="bg-black/40 p-3 rounded-xl border-l-2 border-[#7b2cbf]">
                          <p className="text-[11px] text-gray-300 leading-tight italic">{c.text}</p>
                          <p className="text-[8px] text-gray-600 mt-1 font-black uppercase">{format(new Date(c.createdAt), 'dd MMM yyyy')}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-gray-600 italic text-center py-4">Premier commentaire...</p>
                    )}
                  </div>

                  <div className="space-y-2 mt-auto">
                    <Textarea
                      placeholder="Note d'observation..."
                      className="bg-black border-gray-800 text-[11px] min-h-[60px] rounded-xl focus:border-[#7b2cbf]"
                      value={comments[client.id] || ''}
                      onChange={(e) => setComments(prev => ({ ...prev, [client.id]: e.target.value }))}
                    />
                    <Button
                      onClick={() => handleSaveComment(client.id)}
                      disabled={saveCommentMutation.isPending}
                      className="w-full bg-[#7b2cbf] text-white text-[10px] font-black uppercase h-10 rounded-xl"
                    >
                      <Save size={14} className="mr-2" /> ENREGISTRER NOTE
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

function MetricBox({ label, value, unit, color = "text-white" }) {
    return (
        <div className="bg-black/40 p-2 rounded-xl border border-white/5 text-center">
            <p className="text-[8px] text-gray-600 font-black uppercase mb-1">{label}</p>
            <p className={`text-sm font-black ${color}`}>{value || '--'} <span className="text-[8px] opacity-50">{unit}</span></p>
        </div>
    );
}
