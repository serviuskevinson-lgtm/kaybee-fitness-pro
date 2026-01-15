import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, increment, serverTimestamp, arrayUnion, limit 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Trophy, Swords, Video, Plus, CheckCircle, 
  Gavel, ThumbsUp, ThumbsDown, Users, Crown, Medal
} from 'lucide-react';

export default function Challenges() {
  const { currentUser } = useAuth();
  
  // --- ÉTATS ---
  const [activeTab, setActiveTab] = useState('active');
  const [challenges, setChallenges] = useState([]);
  const [pendingProofs, setPendingProofs] = useState([]); 
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Modal Création
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState(''); 
  const [newPoints, setNewPoints] = useState(100);

  // Modal Preuve
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- SYSTÈME DE NOTIFICATION (FONCTION D'ENVOI) ---
  // Cette fonction crée une alerte dans la base de données pour l'autre utilisateur
  const notifyUser = async (targetUserId, title, body, type) => {
    if (targetUserId === currentUser.uid) return;
    try {
      await addDoc(collection(db, "notifications"), {
        userId: targetUserId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || "Athlète",
        title: title,
        body: body,
        type: type, // 'challenge', 'vote', 'success'
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (e) { console.error("Erreur notif:", e); }
  };

  // --- 1. CONNEXION DATABASE & ÉCOUTE TEMPS RÉEL ---
  useEffect(() => {
    if (!currentUser) return;

    // A. Écouter les Défis (Mise à jour automatique)
    const qChallenges = query(collection(db, "challenges"), orderBy("createdAt", "desc"));
    const unsubChallenges = onSnapshot(qChallenges, (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // B. Écouter le Tribunal (Preuves à valider)
    const qProofs = query(
      collection(db, "challenge_proofs"), 
      where("status", "==", "pending_validation"),
      orderBy("createdAt", "desc")
    );
    const unsubProofs = onSnapshot(qProofs, (snapshot) => {
      // On filtre pour ne pas afficher ses propres preuves (on ne peut pas se juger soi-même)
      const proofs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => p.userId !== currentUser.uid && !p.voters?.includes(currentUser.uid));
      setPendingProofs(proofs);
    });

    // C. Charger le Classement (Top 10 par points)
    const fetchLeaderboard = async () => {
      const qUsers = query(collection(db, "users"), orderBy("points", "desc"), limit(10));
      // Ici on utilise onSnapshot aussi pour que le classement bouge en direct !
      const unsubLeaderboard = onSnapshot(qUsers, (snapshot) => {
         setLeaderboard(snapshot.docs.map((doc, index) => ({ id: doc.id, rank: index + 1, ...doc.data() })));
      });
      return unsubLeaderboard;
    };
    
    // D. Écouter mes Notifications (Pour afficher une alerte si je suis connecté)
    const qMyNotifs = query(collection(db, "notifications"), where("userId", "==", currentUser.uid), where("read", "==", false), limit(1));
    const unsubNotifs = onSnapshot(qMyNotifs, () => {}); // Garde la connexion active

    // Nettoyage des écoutes quand on quitte la page
    let unsubLB;
    fetchLeaderboard().then(unsub => unsubLB = unsub);
    
    return () => { unsubChallenges(); unsubProofs(); unsubNotifs(); if(unsubLB) unsubLB(); };
  }, [currentUser]);

  // --- 2. ACTIONS UTILISATEUR ---

  // CRÉER UN DÉFI
  const handleCreateChallenge = async () => {
    if (!newTitle || !newTarget) return;
    await addDoc(collection(db, "challenges"), {
      title: newTitle, target: newTarget, points: parseInt(newPoints),
      creatorId: currentUser.uid, creatorName: currentUser.displayName || "Athlète",
      participants: [currentUser.uid], completions: [], type: "user_generated",
      createdAt: serverTimestamp(), status: 'active'
    });
    setIsCreateOpen(false); setNewTitle(''); setNewTarget('');
  };

  // REJOINDRE UN DÉFI
  const joinChallenge = async (challengeId, creatorId, currentParticipants) => {
    if (currentParticipants.includes(currentUser.uid)) return;
    await updateDoc(doc(db, "challenges", challengeId), { participants: arrayUnion(currentUser.uid) });
    // Notifier le créateur
    notifyUser(creatorId, "Nouveau Challenger !", `${currentUser.displayName || "Un ami"} a rejoint ton défi !`, "challenge_join");
  };

  // ENVOYER UNE PREUVE (UPLOAD STORAGE + DB)
  const submitProof = async () => {
    if (!proofFile || !selectedChallenge) return;
    setIsUploading(true);
    try {
      // 1. Upload du fichier vers Firebase Storage
      const storageRef = ref(storage, `proofs/${currentUser.uid}/${Date.now()}_${proofFile.name}`);
      await uploadBytes(storageRef, proofFile);
      const url = await getDownloadURL(storageRef);

      // 2. Création du document de preuve dans Firestore
      await addDoc(collection(db, "challenge_proofs"), {
        challengeId: selectedChallenge.id, challengeTitle: selectedChallenge.title, challengePoints: selectedChallenge.points,
        userId: currentUser.uid, userName: currentUser.displayName || "Athlète",
        mediaUrl: url, type: proofFile.type.startsWith('video') ? 'video' : 'image',
        status: "pending_validation", votes_valid: 0, votes_invalid: 0, voters: [], createdAt: serverTimestamp()
      });

      // Notifier le créateur du défi
      notifyUser(selectedChallenge.creatorId, "Preuve reçue !", `Quelqu'un a relevé ton défi : ${selectedChallenge.title}`, "proof_submitted");
      
      alert("Preuve envoyée au Tribunal !");
      setSelectedChallenge(null); setProofFile(null);
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };

  // VOTER (TRIBUNAL)
  const handleVote = async (proof, verdict) => {
    const proofRef = doc(db, "challenge_proofs", proof.id);
    
    // 1. Enregistrer le vote
    await updateDoc(proofRef, {
      votes_valid: verdict === 'valid' ? increment(1) : increment(0),
      votes_invalid: verdict === 'invalid' ? increment(1) : increment(0),
      voters: arrayUnion(currentUser.uid)
    });
    
    // 2. Récompenser le juge (+5 XP)
    await updateDoc(doc(db, "users", currentUser.uid), { points: increment(5) });
    
    // 3. Notifier le candidat
    notifyUser(proof.userId, "Vote reçu !", `Un juge a évalué ta performance.`, "vote");

    // 4. Vérifier si validé (3 votes positifs)
    if (verdict === 'valid' && (proof.votes_valid + 1) >= 3) {
      await updateDoc(proofRef, { status: 'validated' });
      // Donner les gros points au gagnant
      await updateDoc(doc(db, "users", proof.userId), { points: increment(proof.challengePoints) });
      await updateDoc(doc(db, "challenges", proof.challengeId), { completions: arrayUnion(proof.userId) });
      
      notifyUser(proof.userId, "DÉFI VALIDÉ ! 🏆", `Bravo ! Tu as gagné ${proof.challengePoints} XP.`, "success");
      
    } else if (verdict === 'invalid' && (proof.votes_invalid + 1) >= 3) {
      await updateDoc(proofRef, { status: 'rejected' });
      notifyUser(proof.userId, "Défi refusé ❌", `Ta preuve a été rejetée par le tribunal.`, "fail");
    }
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* HEADER : STATS & BOUTON ACTION */}
      <div className="relative overflow-hidden bg-[#1a1a20] p-8 rounded-3xl border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-[#7b2cbf]/20 to-transparent"></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-black italic uppercase text-white flex items-center gap-3">
            <Swords className="text-[#00f5d4] w-10 h-10"/> Arène des Défis
          </h1>
          <p className="text-gray-400">Prouve ta valeur, juge tes pairs.</p>
        </div>
        <div className="relative z-10 flex gap-4">
           <div className="bg-black/50 p-4 rounded-xl border border-[#ffd700]/30 text-center min-w-[100px]">
              <Trophy className="mx-auto text-[#ffd700] mb-1" size={20}/>
              <p className="text-2xl font-black text-white">{currentUser.points || 0}</p>
              <p className="text-[10px] uppercase text-gray-500">XP Total</p>
           </div>
           <Button onClick={() => setIsCreateOpen(true)} className="h-auto bg-[#00f5d4] text-black font-black hover:scale-105 transition-transform">
             <Plus className="mr-2"/> LANCER DÉFI
           </Button>
        </div>
      </div>

      {/* STRUCTURE PRINCIPALE : 2 COLONNES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLONNE GAUCHE (2/3) : CONTENU PRINCIPAL */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#1a1a20] border-gray-800 p-1 w-full justify-start">
              <TabsTrigger value="active" className="text-white data-[state=active]:bg-[#7b2cbf] flex-1">🔥 Défis Actifs</TabsTrigger>
              <TabsTrigger value="tribunal" className="text-white data-[state=active]:bg-red-600 relative flex-1">
                ⚖️ Tribunal
                {pendingProofs.length > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-[#00f5d4] rounded-full animate-ping"/>}
              </TabsTrigger>
            </TabsList>

            {/* DÉFIS ACTIFS */}
            <TabsContent value="active" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {challenges.map((challenge) => {
                  const isParticipant = challenge.participants?.includes(currentUser.uid);
                  const isCompleted = challenge.completions?.includes(currentUser.uid);
                  return (
                    <Card key={challenge.id} className={`kb-card border-l-4 ${isCompleted ? 'border-l-green-500 opacity-75' : 'border-l-[#00f5d4]'} bg-[#1a1a20]`}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <Badge className="bg-[#7b2cbf] text-white border-none">{challenge.points} XP</Badge>
                          {isCompleted && <CheckCircle className="text-green-500"/>}
                        </div>
                        <CardTitle className="text-lg font-black text-white uppercase italic leading-tight mt-2">{challenge.title}</CardTitle>
                        <p className="text-xs text-gray-400">Cible : <span className="text-white font-bold">{challenge.target}</span></p>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 mb-4 text-[10px] text-gray-500">
                          <Avatar className="w-5 h-5"><AvatarFallback>C</AvatarFallback></Avatar>
                          <span>Par {challenge.creatorName} • {challenge.participants?.length || 0} participants</span>
                        </div>
                        {!isParticipant ? (
                          <Button size="sm" onClick={() => joinChallenge(challenge.id, challenge.creatorId, challenge.participants)} className="w-full bg-white/10 text-white hover:bg-[#00f5d4] hover:text-black font-bold">ACCEPTER</Button>
                        ) : isCompleted ? (
                          <Button size="sm" disabled className="w-full bg-green-500/20 text-green-500 border border-green-500 font-bold">VALIDÉ ✅</Button>
                        ) : (
                          <Button size="sm" onClick={() => setSelectedChallenge(challenge)} className="w-full bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] text-black font-bold">
                            <Video size={14} className="mr-2"/> PREUVE
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* TRIBUNAL (VOTES) */}
            <TabsContent value="tribunal" className="space-y-4 mt-4">
               {pendingProofs.length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {pendingProofs.map((proof) => (
                    <Card key={proof.id} className="kb-card bg-[#1a1a20] border-gray-800">
                      <div className="aspect-video bg-black relative flex items-center justify-center">
                        {proof.type === 'video' ? <video src={proof.mediaUrl} controls className="w-full h-full object-contain"/> : <img src={proof.mediaUrl} className="w-full h-full object-contain"/>}
                        <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-[#00f5d4] font-bold">Réseau de {proof.userName}</div>
                      </div>
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div><h4 className="font-bold text-white text-sm">{proof.userName}</h4><p className="text-[10px] text-gray-400">Défi: {proof.challengeTitle}</p></div>
                          <Badge variant="outline" className="text-[10px]">{proof.challengePoints} XP</Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleVote(proof, 'invalid')} variant="outline" className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white"><ThumbsDown size={14}/></Button>
                          <Button size="sm" onClick={() => handleVote(proof, 'valid')} className="flex-1 bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80"><ThumbsUp size={14}/></Button>
                        </div>
                      </CardContent>
                    </Card>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-10 text-gray-500 bg-[#1a1a20] rounded-xl border border-gray-800 border-dashed">
                   <Gavel size={32} className="mx-auto mb-2 opacity-30"/>
                   <p>Aucune preuve en attente. Tout est jugé !</p>
                 </div>
               )}
            </TabsContent>
          </Tabs>
        </div>

        {/* COLONNE DROITE (1/3) : CLASSEMENT PERMANENT */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <Card className="kb-card bg-[#1a1a20] border-gray-800 shadow-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-b from-[#ffd700]/10 to-transparent pb-4">
                <CardTitle className="text-[#ffd700] uppercase italic flex items-center gap-2">
                  <Crown size={20} className="fill-[#ffd700]"/> Top Élite
                </CardTitle>
                <p className="text-xs text-gray-400">Les rois de l'arène cette semaine</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-800">
                  {leaderboard.map((user, index) => (
                    <div key={user.id} className={`flex items-center justify-between p-3 hover:bg-white/5 transition ${currentUser.uid === user.id ? 'bg-[#7b2cbf]/20' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                          index === 0 ? 'bg-[#ffd700] text-black' : 
                          index === 1 ? 'bg-gray-300 text-black' : 
                          index === 2 ? 'bg-[#cd7f32] text-white' : 'text-gray-500 font-mono'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8 border border-gray-700"><AvatarImage src={user.avatar}/><AvatarFallback className="text-xs bg-gray-900 text-gray-400">{user.email ? user.email[0].toUpperCase() : 'U'}</AvatarFallback></Avatar>
                          <div className="overflow-hidden">
                            <p className={`font-bold text-sm truncate w-24 ${index === 0 ? 'text-[#ffd700]' : 'text-white'}`}>{user.name || "Athlète"}</p>
                            <p className="text-[10px] text-gray-500">Lvl {Math.floor((user.points || 0) / 1000) + 1}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-white text-sm">{user.points || 0}</p>
                        <p className="text-[8px] text-gray-500 uppercase">XP</p>
                      </div>
                    </div>
                  ))}
                </div>
                {!leaderboard.find(u => u.id === currentUser.uid) && (
                  <div className="border-t-2 border-gray-700 bg-[#1a1a20] p-3 flex items-center justify-between mt-2">
                     <p className="text-gray-400 text-xs italic">Vous n'êtes pas encore classé...</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Widget Motivation */}
            <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] text-center">
              <Medal className="mx-auto text-white mb-2 w-8 h-8"/>
              <p className="text-white font-bold text-sm">Prochain palier : Niveau {Math.floor((currentUser.points || 0) / 1000) + 2}</p>
              <div className="w-full bg-black/30 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-white h-full" style={{ width: `${((currentUser.points || 0) % 1000) / 10}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CRÉATION */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader><DialogTitle className="uppercase text-[#00f5d4]">Lancer un défi</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-xs text-gray-500 uppercase font-bold">Titre</label><Input placeholder="ex: 50 Burpees" className="bg-black border-gray-700 mt-1" value={newTitle} onChange={e => setNewTitle(e.target.value)}/></div>
            <div><label className="text-xs text-gray-500 uppercase font-bold">Objectif</label><Input placeholder="ex: Sous 2 min" className="bg-black border-gray-700 mt-1" value={newTarget} onChange={e => setNewTarget(e.target.value)}/></div>
            <div><label className="text-xs text-gray-500 uppercase font-bold">Mise (XP)</label><Input type="number" className="bg-black border-gray-700 mt-1" value={newPoints} onChange={e => setNewPoints(e.target.value)}/></div>
            <Button onClick={handleCreateChallenge} className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] font-black mt-2">PUBLIER</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL PREUVE */}
      <Dialog open={!!selectedChallenge} onOpenChange={() => setSelectedChallenge(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader><DialogTitle className="uppercase text-[#00f5d4]">Preuve Vidéo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center">
               <Video size={32} className="text-gray-500 mb-2"/>
               <p className="text-xs text-gray-400 mb-4">Pour : <span className="text-white font-bold">{selectedChallenge?.title}</span></p>
               <Input type="file" accept="video/*,image/*" className="hidden" id="proof-upload" onChange={(e) => setProofFile(e.target.files[0])}/>
               <Button variant="outline" size="sm" onClick={() => document.getElementById('proof-upload').click()}>{proofFile ? proofFile.name : "Choisir Fichier"}</Button>
            </div>
            <Button onClick={submitProof} disabled={!proofFile || isUploading} className="w-full bg-[#00f5d4] text-black font-black">{isUploading ? "..." : "ENVOYER"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}