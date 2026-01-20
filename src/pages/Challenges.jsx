import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, getDoc,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  Trophy, Swords, Video, Plus, CheckCircle, 
  Gavel, ThumbsUp, ThumbsDown, Crown, Medal, Users, Globe, Trash2, Clock
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Challenges() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  
  // --- ÉTATS ---
  const [arenaMode, setArenaMode] = useState('friends'); // 'friends' ou 'public'
  const [activeTab, setActiveTab] = useState('active');
  const [challenges, setChallenges] = useState([]);
  const [pendingProofs, setPendingProofs] = useState([]); 
  const [leaderboard, setLeaderboard] = useState([]); 
  const [friendIds, setFriendIds] = useState([]); // Liste des IDs des amis
  
  // Modal Création
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState(''); 
  const [newPoints, setNewPoints] = useState(100);
  const [newScope, setNewScope] = useState('friends'); // Portée du nouveau défi

  // Modal Preuve
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- NOTIFICATION UTILS ---
  const notifyUser = async (targetUserId, title, body, type) => {
    if (targetUserId === currentUser.uid) return;
    try {
      await addDoc(collection(db, "notifications"), {
        recipientId: targetUserId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || "Ami",
        title: title,
        message: body,
        type: type,
        status: "unread",
        createdAt: new Date().toISOString()
      });
    } catch (e) { console.error("Erreur notif:", e); }
  };

  // --- 1. CHARGEMENT AMIS & LISTES ---
  useEffect(() => {
    if (!currentUser) return;

    // A. Charger la liste d'amis (Pour filtrer l'arène "Amis")
    const fetchFriends = async () => {
        const qSent = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"));
        const qReceived = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"));
        const [sentSnap, receivedSnap] = await Promise.all([getDocs(qSent), getDocs(qReceived)]);
        
        const ids = new Set();
        sentSnap.forEach(doc => ids.add(doc.data().toId));
        receivedSnap.forEach(doc => ids.add(doc.data().fromId));
        ids.add(currentUser.uid); // S'inclure soi-même
        setFriendIds(Array.from(ids));
    };
    fetchFriends();

    // B. Écouter les Défis (Filtrage dynamique selon le mode)
    // Note: Firestore a des limites sur les filtres "OR". On charge les défis récents et on filtre en JS pour l'affichage complexe.
    const qChallenges = query(collection(db, "challenges"), orderBy("createdAt", "desc"), limit(50));
    const unsubChallenges = onSnapshot(qChallenges, (snapshot) => {
      const allChallenges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChallenges(allChallenges);
    });

    // C. Tribunal
    const qProofs = query(
      collection(db, "challenge_proofs"), 
      where("status", "==", "pending_validation"),
      orderBy("createdAt", "desc")
    );
    const unsubProofs = onSnapshot(qProofs, (snapshot) => {
      setPendingProofs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubChallenges(); unsubProofs(); };
  }, [currentUser]);

  // --- 2. GESTION DU CLASSEMENT (TOP ÉLITE - AMIS) ---
  useEffect(() => {
      if (friendIds.length === 0) {
          setLeaderboard([]);
          return;
      }
      const fetchLeaderboard = async () => {
          // On récupère les profils des amis
          const qUsers = query(collection(db, "users"), where("uid", "in", friendIds.slice(0, 10))); // Limit Firestore 'in'
          const userSnap = await getDocs(qUsers);
          let friendsData = userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Tri par points
          friendsData.sort((a, b) => (b.points || 0) - (a.points || 0));
          setLeaderboard(friendsData.map((u, i) => ({...u, rank: i + 1})));
      };
      fetchLeaderboard();
  }, [friendIds]);

  // --- FONCTIONS UTILITAIRES ---
  
  // Récupérer le vrai prénom depuis la DB User
  const getUserFirstName = async () => {
      try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
              return userDoc.data().first_name || userDoc.data().firstName || "Athlète";
          }
      } catch (e) { console.error(e); }
      return "Athlète";
  };

  const getRemainingTime = (timestamp) => {
      if (!timestamp) return "Infini";
      const end = new Date(timestamp.seconds * 1000);
      const now = new Date();
      const diff = end - now;
      
      if (diff <= 0) return "Terminé";
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      if (days > 0) return `${days}j ${hours}h`;
      return `${hours}h rest.`;
  };

  // --- FILTRAGE DE L'AFFICHAGE ---
  const filteredChallenges = challenges.filter(c => {
      // Si mode Public : Voir les défis marqués "public"
      if (arenaMode === 'public') return c.scope === 'public';
      // Si mode Amis : Voir défis "friends" de mes amis OU mes propres défis
      return (c.scope === 'friends' && friendIds.includes(c.creatorId)) || c.creatorId === currentUser.uid;
  });

  const filteredProofs = pendingProofs.filter(p => {
      // Filtrer le tribunal selon si le défi d'origine est visible ou non
      // (Simplification: On filtre si l'auteur de la preuve est un ami en mode amis)
      if (arenaMode === 'public') return true; 
      return friendIds.includes(p.userId);
  });

  // --- ACTIONS ---

  const handleCreateChallenge = async () => {
    if (!newTitle || !newTarget) return;
    
    const realName = await getUserFirstName();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // + 7 jours

    await addDoc(collection(db, "challenges"), {
      title: newTitle, 
      target: newTarget, 
      points: parseInt(newPoints),
      creatorId: currentUser.uid, 
      creatorName: realName, // Vrai Prénom
      participants: [currentUser.uid], 
      completions: [], 
      type: "user_generated",
      scope: newScope, // 'public' ou 'friends'
      expiresAt: expirationDate, // Timer
      createdAt: serverTimestamp(), 
      status: 'active'
    });
    setIsCreateOpen(false); setNewTitle(''); setNewTarget('');
  };

  const joinChallenge = async (challengeId, creatorId, currentParticipants) => {
    if (currentParticipants.includes(currentUser.uid)) return;
    await updateDoc(doc(db, "challenges", challengeId), { participants: arrayUnion(currentUser.uid) });
    const realName = await getUserFirstName();
    notifyUser(creatorId, t('notif_new_challenger'), `${realName} ${t('notif_joined_challenge')}`, "challenge_join");
  };

  const submitProof = async () => {
    if (!proofFile || !selectedChallenge) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `proofs/${currentUser.uid}/${Date.now()}_${proofFile.name}`);
      await uploadBytes(storageRef, proofFile);
      const url = await getDownloadURL(storageRef);

      const realName = await getUserFirstName();

      await addDoc(collection(db, "challenge_proofs"), {
        challengeId: selectedChallenge.id, 
        challengeTitle: selectedChallenge.title, 
        challengePoints: selectedChallenge.points,
        userId: currentUser.uid, 
        userName: realName, // Vrai Prénom
        mediaUrl: url, 
        type: proofFile.type.startsWith('video') ? 'video' : 'image',
        status: "pending_validation", 
        votes_valid: 0, 
        votes_invalid: 0, 
        voters: [], 
        createdAt: serverTimestamp()
      });

      notifyUser(selectedChallenge.creatorId, t('notif_proof_received'), `${realName} a envoyé une preuve.`, "proof_submitted");
      
      alert(t('success'));
      setSelectedChallenge(null); setProofFile(null);
      setActiveTab('tribunal'); 
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };

  const deleteProof = async (proofId) => {
      if(!window.confirm("Supprimer cette preuve ?")) return;
      try {
          await deleteDoc(doc(db, "challenge_proofs", proofId));
      } catch (e) { console.error(e); }
  };

  const handleVote = async (proof, verdict) => {
    if (proof.userId === currentUser.uid) { alert("Pas de vote pour soi-même !"); return; }
    if (proof.voters?.includes(currentUser.uid)) { alert("Déjà voté !"); return; }

    const proofRef = doc(db, "challenge_proofs", proof.id);
    await updateDoc(proofRef, {
      votes_valid: verdict === 'valid' ? increment(1) : increment(0),
      votes_invalid: verdict === 'invalid' ? increment(1) : increment(0),
      voters: arrayUnion(currentUser.uid)
    });
    
    await updateDoc(doc(db, "users", currentUser.uid), { points: increment(5) });

    if (verdict === 'valid' && (proof.votes_valid + 1) >= 3) {
      await updateDoc(proofRef, { status: 'validated' });
      await updateDoc(doc(db, "users", proof.userId), { points: increment(proof.challengePoints) });
      await updateDoc(doc(db, "challenges", proof.challengeId), { completions: arrayUnion(proof.userId) });
      notifyUser(proof.userId, t('notif_challenge_validated'), `Victoire ! +${proof.challengePoints} XP.`, "success");
    } else if (verdict === 'invalid' && (proof.votes_invalid + 1) >= 3) {
      await updateDoc(proofRef, { status: 'rejected' });
      notifyUser(proof.userId, t('notif_challenge_rejected'), "Preuve rejetée par le tribunal.", "fail");
    }
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* HEADER AVEC TOGGLE ARÈNE */}
      <div className="relative overflow-hidden bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-[#7b2cbf]/20 to-transparent pointer-events-none"></div>
        
        {/* Titre */}
        <div className="relative z-10 text-center md:text-left">
          <h1 className="text-3xl font-black italic uppercase text-white flex items-center justify-center md:justify-start gap-3">
            <Swords className="text-[#00f5d4] w-8 h-8"/> {t('challenges_arena')}
          </h1>
          <p className="text-gray-400 text-sm mt-1">{t('challenges_subtitle')}</p>
        </div>

        {/* --- TOGGLE SWITCH (AMIS / PUBLIC) --- */}
        <div className="relative z-10 bg-black/40 p-1.5 rounded-full border border-gray-700 flex">
            <button 
                onClick={() => setArenaMode('friends')}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${arenaMode === 'friends' ? 'bg-[#7b2cbf] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
                <Users size={14} /> Amis
            </button>
            <button 
                onClick={() => setArenaMode('public')}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${arenaMode === 'public' ? 'bg-[#00f5d4] text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
                <Globe size={14} /> Public
            </button>
        </div>

        {/* Bouton Lancer */}
        <div className="relative z-10">
           <Button onClick={() => setIsCreateOpen(true)} className="bg-[#00f5d4] text-black font-black hover:scale-105 transition-transform shadow-[0_0_15px_rgba(0,245,212,0.3)]">
             <Plus className="mr-2 h-5 w-5"/> {t('launch_challenge')}
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLONNE GAUCHE (Défis + Tribunal) */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#1a1a20] border-gray-800 p-1 w-full justify-start">
              <TabsTrigger value="active" className="text-white data-[state=active]:bg-[#7b2cbf] flex-1">🔥 {t('active_challenges')}</TabsTrigger>
              <TabsTrigger value="tribunal" className="text-white data-[state=active]:bg-red-600 relative flex-1">
                ⚖️ {t('tribunal')}
                {filteredProofs.length > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-[#00f5d4] rounded-full animate-ping"/>}
              </TabsTrigger>
            </TabsList>

            {/* DÉFIS ACTIFS */}
            <TabsContent value="active" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredChallenges.map((challenge) => {
                  const isParticipant = challenge.participants?.includes(currentUser.uid);
                  const isCompleted = challenge.completions?.includes(currentUser.uid);
                  const creatorFirstName = challenge.creatorName?.split(' ')[0] || t('unknown');

                  return (
                    <Card key={challenge.id} className={`kb-card border-l-4 ${isCompleted ? 'border-l-green-500 opacity-75' : 'border-l-[#00f5d4]'} bg-[#1a1a20]`}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <Badge className="bg-[#7b2cbf] text-white border-none">{challenge.points} XP</Badge>
                          {/* TIMER */}
                          <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30 bg-yellow-500/10 flex items-center gap-1">
                              <Clock size={10}/> {getRemainingTime(challenge.expiresAt)}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg font-black text-white uppercase italic leading-tight mt-2">{challenge.title}</CardTitle>
                        <p className="text-xs text-gray-400">{t('target')} : <span className="text-white font-bold">{challenge.target}</span></p>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 mb-4 text-[10px] text-gray-500">
                          <Avatar className="w-5 h-5"><AvatarFallback>{creatorFirstName[0]}</AvatarFallback></Avatar>
                          <span>{t('by')} {creatorFirstName} • {challenge.participants?.length || 0} {t('participants')}</span>
                        </div>
                        {!isParticipant ? (
                          <Button size="sm" onClick={() => joinChallenge(challenge.id, challenge.creatorId, challenge.participants)} className="w-full bg-white/10 text-white hover:bg-[#00f5d4] hover:text-black font-bold">{t('accept')}</Button>
                        ) : isCompleted ? (
                          <Button size="sm" disabled className="w-full bg-green-500/20 text-green-500 border border-green-500 font-bold">{t('validated')} ✅</Button>
                        ) : (
                          <Button size="sm" onClick={() => setSelectedChallenge(challenge)} className="w-full bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] text-black font-bold">
                            <Video size={14} className="mr-2"/> {t('proof')}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {filteredChallenges.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-[#1a1a20] rounded-xl border border-dashed border-gray-800">
                        <Swords size={40} className="mx-auto mb-2 opacity-20"/>
                        <p>Aucun défi dans l'arène {arenaMode === 'public' ? 'Publique' : 'Amis'}.</p>
                    </div>
                )}
              </div>
            </TabsContent>

            {/* TRIBUNAL */}
            <TabsContent value="tribunal" className="space-y-4 mt-4">
               {filteredProofs.length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {filteredProofs.map((proof) => {
                     const proofUserName = proof.userName?.split(' ')[0] || t('unknown');
                     const isMyProof = proof.userId === currentUser.uid;

                     return (
                      <Card key={proof.id} className="kb-card bg-[#1a1a20] border-gray-800 relative group">
                        {/* BOUTON SUPPRESSION (Si c'est ma preuve) */}
                        {isMyProof && (
                            <button 
                                onClick={() => deleteProof(proof.id)}
                                className="absolute top-2 right-2 z-20 bg-red-600/80 p-1.5 rounded-full text-white hover:bg-red-500 transition opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={14}/>
                            </button>
                        )}

                        <div className="aspect-video bg-black relative flex items-center justify-center">
                          {proof.type === 'video' ? <video src={proof.mediaUrl} controls className="w-full h-full object-contain"/> : <img src={proof.mediaUrl} className="w-full h-full object-contain"/>}
                        </div>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-white text-sm">{proofUserName}</h4>
                                <p className="text-[10px] text-gray-400">{t('challenge')}: {proof.challengeTitle}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px]">{proof.challengePoints} XP</Badge>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleVote(proof, 'invalid')} disabled={isMyProof} variant="outline" className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50"><ThumbsDown size={14}/></Button>
                            <Button size="sm" onClick={() => handleVote(proof, 'valid')} disabled={isMyProof} className="flex-1 bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80 disabled:opacity-50"><ThumbsUp size={14}/></Button>
                          </div>
                        </CardContent>
                      </Card>
                     );
                   })}
                 </div>
               ) : (
                 <div className="text-center py-10 text-gray-500 bg-[#1a1a20] rounded-xl border border-gray-800 border-dashed">
                   <Gavel size={32} className="mx-auto mb-2 opacity-30"/>
                   <p>{t('no_proofs')}</p>
                 </div>
               )}
            </TabsContent>
          </Tabs>
        </div>

        {/* COLONNE DROITE : CLASSEMENT */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <Card className="kb-card bg-[#1a1a20] border-gray-800 shadow-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-b from-[#ffd700]/10 to-transparent pb-4">
                <CardTitle className="text-[#ffd700] uppercase italic flex items-center gap-2">
                  <Crown size={20} className="fill-[#ffd700]"/> {t('top_elite')} ({arenaMode === 'public' ? 'Monde' : 'Amis'})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leaderboard.length > 0 ? (
                    <div className="divide-y divide-gray-800">
                      {leaderboard.map((user, index) => {
                        const userFirstName = user.first_name || user.firstName || user.name?.split(' ')[0] || t('unknown');
                        const initial = userFirstName[0]?.toUpperCase() || 'U';

                        return (
                        <div key={user.id} className={`flex items-center justify-between p-3 hover:bg-white/5 transition ${currentUser.uid === user.id ? 'bg-[#7b2cbf]/20' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                              index === 0 ? 'bg-[#ffd700] text-black' : 
                              index === 1 ? 'bg-gray-300 text-black' : 
                              index === 2 ? 'bg-[#cd7f32] text-white' : 'text-gray-500 font-mono'
                            }`}>
                              {user.rank}
                            </div>
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8 border border-gray-700">
                                <AvatarImage src={user.avatar} objectFit="cover"/>
                                <AvatarFallback className="text-xs bg-gray-900 text-gray-400">{initial}</AvatarFallback>
                              </Avatar>
                              <div className="overflow-hidden">
                                <p className={`font-bold text-sm truncate w-24 ${index === 0 ? 'text-[#ffd700]' : 'text-white'}`}>{userFirstName}</p>
                                <p className="text-[10px] text-gray-500">Lvl {Math.floor((user.points || 0) / 1000) + 1}</p>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-white text-sm">{user.points || 0}</p>
                            <p className="text-[8px] text-gray-500 uppercase">XP</p>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-500">
                        <Users className="mx-auto mb-2 opacity-30"/>
                        <p className="text-xs">{t('no_friends_leaderboard')}</p>
                    </div>
                )}
              </CardContent>
            </Card>
            
            <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] text-center">
              <Medal className="mx-auto text-white mb-2 w-8 h-8"/>
              <p className="text-white font-bold text-sm">{t('next_level')} : {Math.floor((currentUser.points || 0) / 1000) + 2}</p>
              <div className="w-full bg-black/30 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-white h-full" style={{ width: `${((currentUser.points || 0) % 1000) / 10}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CRÉATION DÉFI AVEC CHOIX PORTÉE */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader><DialogTitle className="uppercase text-[#00f5d4]">{t('launch_challenge')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder={t('title')} className="bg-black border-gray-700" value={newTitle} onChange={e => setNewTitle(e.target.value)}/>
            <Input placeholder={t('objective')} className="bg-black border-gray-700" value={newTarget} onChange={e => setNewTarget(e.target.value)}/>
            <Input type="number" placeholder="XP" className="bg-black border-gray-700" value={newPoints} onChange={e => setNewPoints(e.target.value)}/>
            
            {/* CHOIX PORTÉE */}
            <div className="bg-black/30 p-4 rounded-lg border border-gray-700">
                <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Visibilité du défi</p>
                <RadioGroup defaultValue="friends" onValueChange={setNewScope} className="flex gap-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="friends" id="r1" className="border-[#00f5d4] text-[#00f5d4]"/>
                        <Label htmlFor="r1" className="text-white cursor-pointer">Amis Seulement</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="public" id="r2" className="border-[#00f5d4] text-[#00f5d4]"/>
                        <Label htmlFor="r2" className="text-white cursor-pointer">Monde Entier</Label>
                    </div>
                </RadioGroup>
            </div>

            <Button onClick={handleCreateChallenge} className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] font-black mt-2">{t('publish')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL UPLOAD PREUVE */}
      <Dialog open={!!selectedChallenge} onOpenChange={() => setSelectedChallenge(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
          <DialogHeader><DialogTitle className="uppercase text-[#00f5d4]">{t('video_proof')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center">
               <Video size={32} className="text-gray-500 mb-2"/>
               <p className="text-xs text-gray-400 mb-4">{t('for')} : <span className="text-white font-bold">{selectedChallenge?.title}</span></p>
               <Input type="file" accept="video/*,image/*" className="hidden" id="proof-upload" onChange={(e) => setProofFile(e.target.files[0])}/>
               <Button variant="outline" size="sm" onClick={() => document.getElementById('proof-upload').click()}>{proofFile ? proofFile.name : t('choose_file')}</Button>
            </div>
            <Button onClick={submitProof} disabled={!proofFile || isUploading} className="w-full bg-[#00f5d4] text-black font-black">{isUploading ? "..." : t('send')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}