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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trophy, Swords, Video, Plus, Gavel, ThumbsUp, ThumbsDown, Crown, Medal, Users, Globe, Trash2, Clock, X, Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';

export default function Challenges() {
  const { currentUser, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  
  const [arenaMode, setArenaMode] = useState('friends');
  const [activeTab, setActiveTab] = useState('active');
  const [challenges, setChallenges] = useState([]);
  const [pendingProofs, setPendingProofs] = useState([]); 
  const [leaderboard, setLeaderboard] = useState([]); 
  const [friendIds, setFriendIds] = useState([]); 
  const [currentTime, setCurrentTime] = useState(Date.now());

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState(''); 
  const [newPoints, setNewPoints] = useState(100);
  const [newScope, setNewScope] = useState('friends'); 

  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (authLoading || !currentUser?.uid) return;

    const fetchFriends = async () => {
        try {
            const qSent = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"));
            const qReceived = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"));
            const [sentSnap, receivedSnap] = await Promise.all([getDocs(qSent), getDocs(qReceived)]);

            const ids = new Set();
            sentSnap.forEach(doc => ids.add(doc.data().toId));
            receivedSnap.forEach(doc => ids.add(doc.data().fromId));
            ids.add(currentUser.uid);
            setFriendIds(Array.from(ids));
        } catch (e) { console.error(e); }
    };
    fetchFriends();

    const qChallenges = query(collection(db, "challenges"), orderBy("createdAt", "desc"), limit(50));
    const unsubChallenges = onSnapshot(qChallenges, (snapshot) => {
      setChallenges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qProofs = query(
      collection(db, "challenge_proofs"), 
      where("status", "==", "pending_validation"),
      orderBy("createdAt", "desc")
    );
    const unsubProofs = onSnapshot(qProofs, (snapshot) => {
      setPendingProofs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubChallenges(); unsubProofs(); };
  }, [currentUser?.uid, authLoading]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
      if (friendIds.length === 0) {
          setLeaderboard([]);
          return;
      }
      const fetchLeaderboard = async () => {
          try {
              const qUsers = query(collection(db, "users"), where("uid", "in", friendIds.slice(0, 10)));
              const userSnap = await getDocs(qUsers);
              let friendsData = userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
              friendsData.sort((a, b) => (b.points || 0) - (a.points || 0));
              setLeaderboard(friendsData.map((u, i) => ({...u, rank: i + 1})));
          } catch (e) { console.error(e); }
      };
      fetchLeaderboard();
  }, [friendIds]);

  const getUserIdentity = async () => {
      if (!currentUser?.uid) return "Athlète";
      try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
              const d = userDoc.data();
              if (d.username) return `@${d.username}`;
              return d.first_name || d.firstName || "Athlète";
          }
      } catch (e) {}
      return "Athlète";
  };

  const getRemainingTime = (timestamp) => {
      if (!timestamp) return "7j";
      const createdAt = new Date(timestamp.seconds * 1000);
      const expiresAt = new Date(createdAt.getTime() + (7 * 24 * 60 * 60 * 1000));
      const diff = expiresAt.getTime() - currentTime;
      if (diff <= 0) return "Fini";
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      return `${days}j`;
  };

  if (authLoading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-[#00f5d4] font-black uppercase animate-pulse">Chargement Arène...</div>;
  if (!currentUser) return null;

  const filteredChallenges = challenges.filter(c => {
      if (arenaMode === 'public') return c.scope === 'public';
      return (c.scope === 'friends' && friendIds.includes(c.creatorId)) || c.creatorId === currentUser.uid;
  });

  const filteredProofs = pendingProofs.filter(p => {
      if (arenaMode === 'public') return true; 
      return friendIds.includes(p.userId);
  });

  const handleCreateChallenge = async () => {
    if (!newTitle || !newTarget) return;
    const realName = await getUserIdentity();
    await addDoc(collection(db, "challenges"), {
      title: newTitle, target: newTarget, points: parseInt(newPoints),
      creatorId: currentUser.uid, creatorName: realName, 
      participants: [currentUser.uid], completions: [], type: "user_generated",
      scope: newScope, createdAt: serverTimestamp(), status: 'active'
    });
    setIsCreateOpen(false); setNewTitle(''); setNewTarget('');
  };

  const joinChallenge = async (challengeId, creatorId, currentParticipants) => {
    if (currentParticipants.includes(currentUser.uid)) return;
    await updateDoc(doc(db, "challenges", challengeId), { participants: arrayUnion(currentUser.uid) });
    const realName = await getUserIdentity();
    try {
        await sendNotification(creatorId, currentUser.uid, realName, "Nouveau défi !", `${realName} participe à ton défi.`, "challenge");
    } catch(e) {}
  };

  const submitProof = async () => {
    if (!proofFile || !selectedChallenge) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `proofs/${currentUser.uid}/${Date.now()}_${proofFile.name}`);
      await uploadBytes(storageRef, proofFile);
      const url = await getDownloadURL(storageRef);
      const realName = await getUserIdentity();
      await addDoc(collection(db, "challenge_proofs"), {
        challengeId: selectedChallenge.id, challengeTitle: selectedChallenge.title, challengePoints: selectedChallenge.points,
        userId: currentUser.uid, userName: realName, mediaUrl: url, type: proofFile.type.startsWith('video') ? 'video' : 'image',
        status: "pending_validation", votes_valid: 0, votes_invalid: 0, voters: [], createdAt: serverTimestamp()
      });
      alert("Performance envoyée au tribunal !"); setSelectedChallenge(null); setProofFile(null);
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };

  const handleVote = async (proof, verdict) => {
    if (proof.userId === currentUser.uid || proof.voters?.includes(currentUser.uid)) return;
    const proofRef = doc(db, "challenge_proofs", proof.id);
    await updateDoc(proofRef, {
      votes_valid: verdict === 'valid' ? increment(1) : increment(0),
      votes_invalid: verdict === 'invalid' ? increment(1) : increment(0),
      voters: arrayUnion(currentUser.uid)
    });
    if (verdict === 'valid' && (proof.votes_valid + 1) >= 3) {
      await updateDoc(proofRef, { status: 'validated' });
      await updateDoc(doc(db, "users", proof.userId), { points: increment(proof.challengePoints) });
      await updateDoc(doc(db, "challenges", proof.challengeId), { completions: arrayUnion(proof.userId) });
    }
  };

  return (
    <div className="p-2 sm:p-4 bg-[#0a0a0f] min-h-screen text-white pb-32 overflow-x-hidden">
      <div className="relative overflow-hidden bg-[#1a1a20] p-5 rounded-2xl border border-gray-800 flex flex-col gap-4 mb-6 shadow-xl">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Swords className="text-[#00f5d4] size-6"/>
            <h1 className="text-xl font-black italic uppercase tracking-tighter">ARÈNE</h1>
          </div>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="bg-[#00f5d4] text-black font-black uppercase text-[10px] h-8 rounded-lg px-4 shadow-lg shadow-[#00f5d4]/20 active:scale-95 transition-all"><Plus size={14} className="mr-1"/> CRÉER</Button>
        </div>
        <div className="flex bg-black/40 p-1 rounded-xl border border-gray-800">
            <button onClick={() => setArenaMode('friends')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${arenaMode === 'friends' ? 'bg-[#7b2cbf] text-white shadow-lg' : 'text-gray-500'}`}><Users size={12} /> Amis</button>
            <button onClick={() => setArenaMode('public')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${arenaMode === 'public' ? 'bg-[#00f5d4] text-black shadow-lg' : 'text-gray-500'}`}><Globe size={12} /> Public</button>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-black/40 border border-gray-800 p-1 w-full flex rounded-xl">
              <TabsTrigger value="active" className="flex-1 rounded-lg data-[state=active]:bg-[#7b2cbf] text-[10px] font-black uppercase">DÉFIS</TabsTrigger>
              <TabsTrigger value="tribunal" className="flex-1 rounded-lg data-[state=active]:bg-red-600 text-[10px] font-black uppercase relative">
                TRIBUNAL
                {filteredProofs.length > 0 && <span className="absolute -top-1 -right-1 size-3 bg-[#00f5d4] rounded-full animate-pulse border-2 border-[#0a0a0f]"/>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {filteredChallenges.map((challenge) => {
                  const isParticipant = challenge.participants?.includes(currentUser.uid);
                  const isCompleted = challenge.completions?.includes(currentUser.uid);
                  return (
                    <Card key={challenge.id} className={`bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden flex flex-col relative transition-all ${isCompleted ? 'opacity-60 grayscale' : 'border-l-4 border-l-[#00f5d4]'}`}>
                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start mb-2">
                          <Badge className="bg-[#7b2cbf] text-[8px] font-black px-1.5 py-0.5">{challenge.points} XP</Badge>
                          <p className="text-[8px] text-yellow-500 font-bold uppercase flex items-center gap-1"><Clock size={8}/> {getRemainingTime(challenge.createdAt)}</p>
                        </div>
                        <CardTitle className="text-sm font-black text-white uppercase italic truncate">{challenge.title}</CardTitle>
                        <p className="text-[9px] text-gray-500 mt-1 uppercase font-bold tracking-widest">{challenge.target}</p>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 mt-auto">
                        <div className="flex items-center gap-2 mb-4">
                          <Avatar className="size-5 border border-gray-800"><AvatarFallback className="text-[7px] font-black uppercase">{(challenge.creatorName || "?")[0]}</AvatarFallback></Avatar>
                          <span className="text-[8px] text-gray-600 font-bold uppercase truncate max-w-[150px]">{challenge.creatorName || "Athlete"} • {challenge.participants?.length || 0} PARTICIPANTS</span>
                        </div>
                        {!isParticipant ? (
                          <Button size="sm" onClick={() => joinChallenge(challenge.id, challenge.creatorId, challenge.participants)} className="w-full bg-white/5 text-white h-8 text-[9px] font-black uppercase border border-white/10 hover:bg-[#00f5d4] hover:text-black">REJOINDRE</Button>
                        ) : isCompleted ? (
                          <div className="w-full bg-green-500/10 text-green-500 border border-green-500/30 text-[9px] font-black py-2 rounded-lg text-center italic">VALIDÉ ✅</div>
                        ) : (
                          <Button size="sm" onClick={() => setSelectedChallenge(challenge)} className="w-full bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf] text-black h-8 text-[9px] font-black uppercase italic shadow-lg shadow-[#00f5d4]/20"><Video size={12} className="mr-1.5"/> ENVOYER PREUVE</Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </TabsContent>

            <TabsContent value="tribunal" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                   {filteredProofs.map((proof) => {
                     const isMyProof = proof.userId === currentUser.uid;
                     const hasVoted = proof.voters?.includes(currentUser.uid);
                     return (
                      <Card key={proof.id} className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden flex flex-col relative group">
                        <div className="aspect-[4/3] bg-black relative flex items-center justify-center">
                          {proof.type === 'video' ? <video src={proof.mediaUrl} controls className="w-full h-full object-cover"/> : <img src={proof.mediaUrl} className="w-full h-full object-cover" loading="lazy"/>}
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                          <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end">
                             <div className="min-w-0 flex-1"><p className="text-white font-black text-[10px] uppercase italic leading-tight truncate">{proof.userName || "Athlete"}</p><p className="text-[8px] text-gray-400 font-bold truncate">{proof.challengeTitle}</p></div>
                             <Badge variant="outline" className="text-[8px] border-white/20 text-white bg-black/40 shrink-0">{proof.challengePoints} XP</Badge>
                          </div>
                        </div>
                        <CardContent className="p-3">
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleVote(proof, 'invalid')} disabled={isMyProof || hasVoted} variant="ghost" className="flex-1 h-9 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20"><ThumbsDown size={14}/></Button>
                            <Button size="sm" onClick={() => handleVote(proof, 'valid')} disabled={isMyProof || hasVoted} variant="ghost" className="flex-1 h-9 rounded-lg bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/20"><ThumbsUp size={14}/></Button>
                          </div>
                        </CardContent>
                      </Card>
                     );
                   })}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <CardHeader className="bg-gradient-to-br from-[#ffd700]/10 to-transparent p-4 border-b border-white/5">
                <CardTitle className="text-sm font-black italic uppercase text-[#ffd700] flex items-center gap-2 tracking-widest"><Crown size={16} className="fill-[#ffd700]"/> TOP ATHLÈTES</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {leaderboard.map((user, index) => (
                  <div key={user.id} className={`flex items-center justify-between p-3 border-b border-white/5 last:border-0 ${currentUser.uid === user.id ? 'bg-[#00f5d4]/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-black italic w-4 ${index === 0 ? 'text-[#ffd700]' : 'text-gray-600'}`}>{index + 1}</span>
                      <Avatar className="size-8 border border-gray-800"><AvatarImage src={user.avatar} className="object-cover"/><AvatarFallback className="text-[10px] bg-black text-white font-black">{(user.full_name || user.username || "?")[0]}</AvatarFallback></Avatar>
                      <div className="min-w-0"><p className={`text-[11px] font-black uppercase italic truncate max-w-[80px] ${index === 0 ? 'text-[#ffd700]' : 'text-white'}`}>{user.full_name || user.username || "Athlete"}</p><p className="text-[8px] text-gray-600 font-bold uppercase">Lvl {Math.floor((user.points || 0) / 1000) + 1}</p></div>
                    </div>
                    <div className="text-right shrink-0"><p className="text-xs font-black text-white">{user.points || 0}</p><p className="text-[7px] text-gray-600 uppercase font-black">PTS</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>
        </div>
      </div>

      {/* CREATE MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl w-[95vw] sm:max-w-md p-6 shadow-3xl">
          <DialogHeader><DialogTitle className="text-lg font-black italic uppercase text-[#00f5d4] tracking-tighter">NOUVEAU DÉFI</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label className="text-[10px] font-black text-gray-500 uppercase">Titre</Label><Input placeholder="Ex: 50 Pompes" className="bg-black border-gray-800 text-xs h-10" value={newTitle} onChange={e => setNewTitle(e.target.value)}/></div>
            <div className="space-y-1"><Label className="text-[10px] font-black text-gray-500 uppercase">Objectif</Label><Input placeholder="Ex: En moins de 1min" className="bg-black border-gray-800 text-xs h-10" value={newTarget} onChange={e => setNewTarget(e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label className="text-[10px] font-black text-gray-500 uppercase">Points XP</Label><Input type="number" className="bg-black border-gray-800 text-xs h-10" value={newPoints} onChange={e => setNewPoints(e.target.value)}/></div>
                <div className="space-y-1"><Label className="text-[10px] font-black text-gray-500 uppercase">Portée</Label><Select value={newScope} onValueChange={setNewScope}><SelectTrigger className="bg-black border-gray-800 h-10 text-[10px]"><SelectValue /></SelectTrigger><SelectContent className="bg-[#1a1a20] border-gray-800 text-white"><SelectItem value="friends" className="text-xs">Amis</SelectItem><SelectItem value="public" className="text-xs">Public</SelectItem></SelectContent></Select></div>
            </div>
            <Button onClick={handleCreateChallenge} className="w-full bg-[#7b2cbf] text-white font-black uppercase text-xs h-12 rounded-xl mt-4 italic">LANCER 🔥</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PROOF MODAL */}
      <Dialog open={!!selectedChallenge} onOpenChange={() => setSelectedChallenge(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl w-[95vw] sm:max-w-sm p-6 shadow-3xl">
          <DialogHeader><DialogTitle className="text-lg font-black italic uppercase text-center tracking-tighter">ENVOYER PREUVE</DialogTitle></DialogHeader>
          <div className="space-y-6 py-2 text-center">
            <div className="border-2 border-dashed border-gray-800 rounded-2xl p-8 flex flex-col items-center justify-center bg-black/20 relative cursor-pointer">
               <Video size={40} className="text-gray-700 mb-2"/>
               <p className="text-[10px] text-gray-500 font-bold uppercase mb-4 italic">Vidéo ou Photo</p>
               <input type="file" accept="video/*,image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setProofFile(e.target.files[0])}/>
               <Button variant="outline" className={`h-10 text-[10px] uppercase font-black rounded-xl ${proofFile ? 'border-[#00f5d4] text-[#00f5d4]' : 'border-gray-700'}`}>{proofFile ? proofFile.name.slice(0, 15) + '...' : "CHOISIR"}</Button>
            </div>
            <Button onClick={submitProof} disabled={!proofFile || isUploading} className="w-full bg-[#00f5d4] text-black font-black uppercase italic h-12 rounded-xl text-xs">{isUploading ? <Loader2 className="animate-spin" size={18}/> : "VALIDER"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
