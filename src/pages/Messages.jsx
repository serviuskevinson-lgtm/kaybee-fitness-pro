import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, storage, auth, app } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, limit, serverTimestamp, getDoc
} from 'firebase/firestore';
import { getDatabase, ref as dbRef, onValue, set, update } from "firebase/database";
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Send, Search, UserPlus, Users, MessageCircle, 
  Activity, Check, X, Briefcase, RefreshCw, Smartphone, Facebook,
  Image as ImageIcon, Paperclip, Loader2, Sparkles, HelpCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';

export default function Messages() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId } = useClient();
  const { t } = useTranslation();
  const rtdb = getDatabase(app);

  // Interface States
  const [activeTab, setActiveTab] = useState('friends');
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [liveSession, setLiveSession] = useState(null);

  // Data Lists
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friendList, setFriendList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [coachRequests, setCoachRequests] = useState([]);
  const [unknownConversations, setUnknownConversations] = useState([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- LIVE SYNC POUR LE COACH ---
  useEffect(() => {
    if (isCoachView && targetUserId) {
        const sessionRef = dbRef(rtdb, `users/${targetUserId}/live_data/session`);
        return onValue(sessionRef, (snapshot) => {
            if (snapshot.exists()) setLiveSession(snapshot.val());
            else setLiveSession(null);
        });
    }
  }, [isCoachView, targetUserId]);

  // --- 1. RECHERCHE LIVE (ULTRA RÉACTIVE) ---
  useEffect(() => {
    const performSearch = async () => {
      if (searchTerm.trim().length >= 2) {
        const q = query(
          collection(db, "users"),
          where("full_name", ">=", searchTerm),
          where("full_name", "<=", searchTerm + '\uf8ff'),
          limit(10)
        );
        const snap = await getDocs(q);
        const results = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => u.uid !== currentUser.uid);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    };
    const timeoutId = setTimeout(performSearch, 150);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentUser]);

  // --- 2. GESTION DES LISTES ---
  useEffect(() => {
    if (!currentUser) return;

    // Écouter les requêtes d'amis
    const unsubFriendReqs = onSnapshot(query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "pending")), (snap) => {
      setFriendRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Écouter les demandes de coaching
    const unsubCoachReqs = onSnapshot(query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("type", "==", "coach_request"), where("status", "==", "unread")), (snap) => {
      setCoachRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Contacts Update
    const updateAllContacts = async () => {
      try {
        const [s1, s2, sClients, sMe] = await Promise.all([
          getDocs(query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"))),
          getDocs(query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"))),
          getDocs(query(collection(db, "users"), where("coachId", "==", currentUser.uid))),
          getDoc(doc(db, "users", currentUser.uid))
        ]);

        const contacts = [];
        s1.forEach(d => contacts.push({ uid: d.data().toId, name: d.data().toName, avatar: d.data().toAvatar, type: 'friend' }));
        s2.forEach(d => contacts.push({ uid: d.data().fromId, name: d.data().fromName, avatar: d.data().fromAvatar, type: 'friend' }));
        sClients.forEach(d => contacts.push({ uid: d.id, name: d.data().full_name || d.data().firstName, avatar: d.data().avatar, type: 'client' }));

        const myData = sMe.data();
        if (myData?.coachId) {
          const coachSnap = await getDoc(doc(db, "users", myData.coachId));
          contacts.push({ uid: myData.coachId, name: myData.coachName || "Mon Coach", avatar: coachSnap.data()?.avatar, type: 'coach' });
        }

        setFriendList([...new Map(contacts.map(item => [item.uid, item])).values()]);
      } catch (err) { console.error(err); }
    };

    updateAllContacts();
    const unsubMe = onSnapshot(doc(db, "users", currentUser.uid), updateAllContacts);

    // Messages d'inconnus
    const unsubUnknown = onSnapshot(query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      const allMsgs = snap.docs.map(d => d.data());
      const unknown = [];
      allMsgs.forEach(m => {
        if (m.senderId !== currentUser.uid) {
           const isContact = friendList.some(f => f.uid === m.senderId);
           const isReq = friendRequests.some(r => r.fromId === m.senderId);
           if (!isContact && !isReq) {
             unknown.push({ uid: m.senderId, name: m.senderName, avatar: m.senderAvatar, lastMsg: m.text });
           }
        }
      });
      setUnknownConversations([...new Map(unknown.map(item => [item.uid, item])).values()]);
    });

    return () => { unsubFriendReqs(); unsubCoachReqs(); unsubMe(); unsubUnknown(); };
  }, [currentUser, friendList, friendRequests]);

  // --- 3. CHAT REALTIME ---
  useEffect(() => {
    if (!selectedFriend || !currentUser) return;
    const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');
    const q = query(collection(db, "messages"), where("conversationId", "==", conversationId), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }, [selectedFriend, currentUser]);

  // --- ACTIONS ---
  const sendMessage = async (txt = messageText, img = null) => {
    if ((!txt.trim() && !img) || !selectedFriend || !currentUser) return;
    const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');
    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myAvatar = meSnap.data()?.avatar || "";

    await addDoc(collection(db, "messages"), {
      conversationId, senderId: currentUser.uid, senderName: currentUser.displayName || "Moi",
      senderAvatar: myAvatar, text: txt, mediaUrl: img, createdAt: serverTimestamp(), read: false
    });
    await sendNotification(selectedFriend.uid, currentUser.uid, currentUser.displayName || "Moi", "Message 💬", txt.substring(0, 30), "message");
    setMessageText('');
  };

  const handleAddFriend = async (user) => {
    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myAvatar = meSnap.data()?.avatar || "";
    await addDoc(collection(db, "friend_requests"), {
      fromId: currentUser.uid, fromName: currentUser.displayName || "Athlète", fromAvatar: myAvatar,
      toId: user.uid, toName: user.full_name || user.name, toAvatar: user.avatar || "",
      status: "pending", createdAt: serverTimestamp()
    });
    alert("Demande envoyée !");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const storageRef = sRef(storage, `chat/${currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      sendMessage("Image", url);
    } catch (err) { console.error(err); }
    setIsUploading(false);
  };

  const startSync = (type) => {
    setIsSyncing(true);
    setTimeout(() => { setIsSyncing(false); alert(`${type} synchronisé !`); }, 2000);
  };

  const filteredSearch = useMemo(() => {
    return searchResults.filter(res =>
      !friendList.some(f => f.uid === res.uid) &&
      !friendRequests.some(r => r.fromId === res.uid)
    );
  }, [searchResults, friendList, friendRequests]);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6 pb-6 animate-in fade-in duration-700">

      {/* --- SIDEBAR COMMUNAUTÉ --- */}
      <Card className="w-full md:w-96 flex flex-col bg-[#1a1a20]/80 backdrop-blur-xl border-gray-800 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#7b2cbf] to-[#00f5d4]" />

        <div className="p-5 border-b border-gray-800/50 space-y-5 bg-black/20">
           <div className="flex justify-between items-center">
             <h2 className="text-2xl font-black text-white italic uppercase flex items-center gap-3 tracking-tighter">
               <Users className="text-[#00f5d4] animate-pulse" size={24}/> {t('community')}
             </h2>
             <div className="flex gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-white" onClick={() => updateAllContacts()}>
                    <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''}/>
                </Button>
                {isCoachView && <Badge className="bg-[#7b2cbf] text-white text-[10px] px-2 py-0.5 shadow-lg shadow-[#7b2cbf]/30">VUE COACH</Badge>}
             </div>
           </div>

           {isCoachView && liveSession?.active && (
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-3 bg-gradient-to-r from-[#7b2cbf]/30 to-[#00f5d4]/10 border border-[#7b2cbf]/50 rounded-2xl animate-pulse cursor-pointer shadow-lg shadow-[#7b2cbf]/20" onClick={() => window.location.href='/session'}>
                   <div className="flex items-center gap-2 mb-1"><Activity size={14} className="text-[#00f5d4]"/><p className="text-[10px] font-black text-[#00f5d4] uppercase tracking-widest">Séance en cours</p></div>
                   <p className="text-sm font-bold text-white truncate">{liveSession.workoutName}</p>
               </motion.div>
           )}

           <div className="relative">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00f5d4]/50"/>
               <Input
                 placeholder={t('search_athlete')}
                 className="pl-12 bg-black/40 border-gray-700 text-white focus:border-[#00f5d4] h-12 rounded-2xl shadow-inner text-sm font-medium"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
           </div>

           {/* SYNC BUTTONS */}
           <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => startSync('Facebook')} className="h-10 bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl gap-2 text-[10px] font-black uppercase">
                    <Facebook size={14}/> Facebook
                </Button>
                <Button variant="outline" size="sm" onClick={() => startSync('Contacts')} className="h-10 bg-[#00f5d4]/10 border-[#00f5d4]/30 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black rounded-xl gap-2 text-[10px] font-black uppercase">
                    <Smartphone size={14}/> Contacts
                </Button>
           </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="bg-black/40 mx-4 mt-4 p-1 rounded-xl border border-gray-800/50">
            <TabsTrigger value="friends" className="flex-1 rounded-lg data-[state=active]:bg-[#7b2cbf] data-[state=active]:text-white font-black uppercase text-[10px] tracking-widest transition-all">{t('friends')}</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 rounded-lg data-[state=active]:bg-[#00f5d4] data-[state=active]:text-black font-black uppercase text-[10px] tracking-widest transition-all relative">
              {t('requests')}
              {(friendRequests.length + coachRequests.length + unknownConversations.length) > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1a1a20] animate-bounce shadow-lg shadow-red-500/50"/>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <AnimatePresence>
                {searchTerm.length >= 2 && filteredSearch.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mb-6 space-y-2">
                        <p className="text-[10px] font-black text-[#00f5d4] uppercase px-2 mb-3 tracking-[0.2em] flex items-center gap-2">
                            <Sparkles size={12}/> Résultats
                        </p>
                        {filteredSearch.map(user => (
                            <div key={user.uid} className="p-3 bg-gradient-to-br from-white/5 to-transparent border border-white/5 rounded-2xl flex items-center justify-between hover:border-[#00f5d4]/50 transition-all group shadow-lg">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 border-2 border-[#00f5d4]/30">
                                        <AvatarImage src={user.avatar} className="object-cover"/>
                                        <AvatarFallback className="bg-black text-[#00f5d4] text-xs font-black">{user.full_name?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                    <p className="font-black text-white text-sm tracking-tight">{user.full_name}</p>
                                </div>
                                <Button size="icon" variant="ghost" className="h-10 w-10 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black rounded-xl shadow-lg transition-transform hover:scale-110" onClick={() => handleAddFriend(user)}>
                                    <UserPlus size={20}/>
                                </Button>
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <p className="text-[10px] font-black text-gray-500 uppercase px-2 mb-4 tracking-[0.2em]">Mes contacts</p>
            <div className="space-y-3">
                {friendList.map(friend => (
                  <motion.div
                    key={friend.uid}
                    whileHover={{ x: 5 }}
                    onClick={() => setSelectedFriend(friend)}
                    className={`p-4 rounded-2xl flex items-center gap-4 cursor-pointer transition-all border ${selectedFriend?.uid === friend.uid ? 'bg-gradient-to-br from-[#7b2cbf]/30 to-[#7b2cbf]/5 border-[#7b2cbf] shadow-xl shadow-[#7b2cbf]/10' : 'bg-black/20 border-transparent hover:bg-white/5 hover:border-gray-800'}`}
                  >
                    <div className="relative">
                        <Avatar className={`h-12 w-12 border-2 ${selectedFriend?.uid === friend.uid ? 'border-[#7b2cbf]' : 'border-gray-800'}`}>
                            <AvatarImage src={friend.avatar} className="object-cover"/>
                            <AvatarFallback className="bg-black text-white font-black">{friend.name?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#00f5d4] border-2 border-[#1a1a20] rounded-full shadow-lg" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="font-black text-white text-sm truncate uppercase italic tracking-tighter">{friend.name}</p>
                        <Badge variant="outline" className={`text-[8px] uppercase font-black px-1.5 py-0 border-gray-700/50 ${friend.type === 'coach' ? 'text-[#00f5d4] border-[#00f5d4]/30 bg-[#00f5d4]/5' : 'text-gray-500'}`}>
                            {friend.type}
                        </Badge>
                    </div>
                  </motion.div>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {/* MESSAGES D'INCONNUS */}
            {unknownConversations.length > 0 && (
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-orange-500 uppercase px-2 tracking-[0.2em] flex items-center gap-2">
                        <HelpCircle size={12}/> Messages (Inconnus)
                    </p>
                    {unknownConversations.map(m => (
                        <div key={m.uid} className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl flex items-center justify-between group shadow-xl">
                            <div className="cursor-pointer flex-1" onClick={() => setSelectedFriend({ uid: m.uid, name: m.name, avatar: m.avatar, type: 'unknown' })}>
                                <div className="flex items-center gap-3 mb-2">
                                    <Avatar className="h-8 w-8 border border-orange-500/30">
                                        <AvatarImage src={m.avatar}/>
                                        <AvatarFallback className="bg-orange-500 text-white text-[10px] font-black">{m.name?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                    <p className="font-black text-white text-xs uppercase italic">{m.name}</p>
                                </div>
                                <p className="text-[10px] text-orange-200/60 truncate italic leading-relaxed">"{m.lastMsg}"</p>
                            </div>
                            <Button size="icon" variant="ghost" className="text-orange-500 hover:bg-orange-500 hover:text-white rounded-xl shadow-lg" onClick={() => handleAddFriend(m)}>
                                <UserPlus size={18}/>
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* DEMANDES COACHING */}
            {coachRequests.length > 0 && (
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-[#7b2cbf] uppercase px-2 tracking-[0.2em] flex items-center gap-2">
                        <Briefcase size={12}/> Coaching
                    </p>
                    {coachRequests.map(req => (
                        <div key={req.id} className="p-4 bg-[#7b2cbf]/5 border border-[#7b2cbf]/30 rounded-2xl shadow-xl">
                            <p className="text-xs text-white mb-3 font-bold leading-relaxed tracking-tight"><span className="text-[#00f5d4] uppercase font-black italic">{req.senderName}</span> veut rejoindre votre équipe.</p>
                            <div className="flex gap-2">
                                <Button size="sm" className="bg-[#7b2cbf] flex-1 hover:bg-[#9d4edd] font-black uppercase text-[10px] rounded-xl shadow-lg shadow-[#7b2cbf]/20" onClick={() => acceptCoach(req)}>Accepter</Button>
                                <Button size="sm" variant="ghost" className="text-red-400 font-black uppercase text-[10px] rounded-xl">Refuser</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* DEMANDES AMIS */}
            {friendRequests.length > 0 && (
                <div className="space-y-3">
                    <p className="text-[10px] font-black text-[#00f5d4] uppercase px-2 tracking-[0.2em] flex items-center gap-2">
                        <Check size={12}/> Amis
                    </p>
                    {friendRequests.map(req => (
                        <div key={req.id} className="p-4 bg-[#00f5d4]/5 border border-[#00f5d4]/20 rounded-2xl flex items-center justify-between shadow-xl">
                            <div className="flex items-center gap-3">
                                <Avatar className="border border-[#00f5d4]/30 h-10 w-10">
                                    <AvatarImage src={req.fromAvatar}/>
                                    <AvatarFallback className="bg-[#00f5d4] text-black font-black text-xs">{req.fromName?.[0] || '?'}</AvatarFallback>
                                </Avatar>
                                <p className="font-black text-white text-xs uppercase italic tracking-tighter">{req.fromName}</p>
                            </div>
                            <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="text-green-400 hover:bg-green-400/20 rounded-full h-9 w-9" onClick={() => acceptFriend(req.id)}><Check size={20}/></Button>
                                <Button size="icon" variant="ghost" className="text-red-400 hover:bg-red-400/20 rounded-full h-9 w-9"><X size={20}/></Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* --- ZONE DE CHAT ÉLITE --- */}
      <Card className="kb-card flex-1 flex flex-col bg-[#1a1a20]/80 backdrop-blur-xl border-gray-800 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7b2cbf] to-transparent opacity-50" />

        {selectedFriend ? (
          <>
            <div className="p-5 border-b border-gray-800/50 flex items-center justify-between bg-black/20 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <Avatar className="border-2 border-[#00f5d4] h-12 w-12 shadow-lg shadow-[#00f5d4]/10">
                    <AvatarImage src={selectedFriend.avatar} className="object-cover"/>
                    <AvatarFallback className="bg-[#7b2cbf] text-white font-black text-lg">{selectedFriend.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="font-black text-white uppercase italic tracking-widest text-lg">{selectedFriend.name}</h3>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#00f5d4] rounded-full animate-pulse shadow-[0_0_5px_#00f5d4]" />
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Discussion Active</p>
                    </div>
                </div>
              </div>
              <div className="flex gap-3">
                  <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white rounded-xl h-10 w-10 bg-white/5 border border-white/5"><Activity size={18}/></Button>
                  <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white rounded-xl h-10 w-10 bg-white/5 border border-white/5"><Sparkles size={18}/></Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-black/40 custom-scrollbar">
              {messages.map((msg, i) => {
                const isMe = msg.senderId === currentUser.uid;
                const showAvatar = i === 0 || messages[i-1]?.senderId !== msg.senderId;

                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={msg.id} className={`flex items-end gap-3 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && showAvatar && (
                        <Avatar className="h-8 w-8 border border-[#00f5d4]/20 shadow-lg">
                            <AvatarImage src={msg.senderAvatar}/>
                            <AvatarFallback className="bg-gray-800 text-white text-[8px] font-black">{msg.senderName?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                    )}
                    {!isMe && !showAvatar && <div className="w-8" />}

                    <div className={`max-w-[70%] group relative ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-4 rounded-[1.5rem] shadow-2xl transition-all hover:scale-[1.02] ${isMe ? 'bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] text-white rounded-br-none' : 'bg-[#1a1a20] border border-gray-800 text-white rounded-bl-none'}`}>
                          {msg.text && <p className="text-sm font-medium leading-relaxed">{msg.text}</p>}
                          {msg.mediaUrl && (
                              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 shadow-xl group-hover:brightness-110 transition-all cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')}>
                                <img src={msg.mediaUrl} className="max-h-80 w-auto object-cover" alt="Media"/>
                              </div>
                          )}
                          <p className={`text-[8px] mt-2 font-black uppercase opacity-40 tracking-widest ${isMe ? 'text-right' : 'text-left'}`}>
                            {msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}
                          </p>
                        </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-5 border-t border-gray-800/50 bg-black/40 backdrop-blur-md">
              <div className="flex items-center gap-3 bg-[#1a1a20] p-2 rounded-[2rem] border border-gray-700/50 focus-within:border-[#00f5d4] transition-all shadow-inner">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <Button size="icon" variant="ghost" onClick={() => fileInputRef.current.click()} className="h-10 w-10 rounded-full text-gray-500 hover:text-[#00f5d4] hover:bg-[#00f5d4]/10 shrink-0">
                    {isUploading ? <Loader2 size={20} className="animate-spin text-[#00f5d4]"/> : <ImageIcon size={20}/>}
                </Button>
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full text-gray-500 hover:text-[#7b2cbf] hover:bg-[#7b2cbf]/10 shrink-0"><Paperclip size={20}/></Button>

                <input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Explose tes limites... Écris un message..."
                  className="flex-1 bg-transparent border-none text-white focus:ring-0 placeholder:text-gray-600 font-medium px-2 py-3 text-sm focus:outline-none"
                />

                <Button onClick={() => sendMessage()} disabled={!messageText.trim() && !isUploading} className="bg-[#00f5d4] text-black h-12 w-12 rounded-full shadow-[0_0_20px_rgba(0,245,212,0.4)] hover:scale-110 active:scale-95 transition-all shrink-0">
                    <Send size={20} className="ml-1"/>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-6">
             <div className="relative">
                <div className="absolute inset-0 bg-[#7b2cbf] blur-[80px] opacity-20 animate-pulse" />
                <div className="w-32 h-32 bg-gradient-to-tr from-[#7b2cbf] to-[#00f5d4] rounded-[2.5rem] flex items-center justify-center shadow-2xl relative z-10 group-hover:rotate-12 transition-transform duration-500">
                    <MessageCircle size={60} className="text-white fill-white/20"/>
                </div>
             </div>
             <div>
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">Centre de Discussion Kaybee</h3>
                <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-[10px] max-w-xs mx-auto leading-relaxed">Engage la conversation, partage tes progrès et forge ton équipe d'élite.</p>
             </div>
             <Button variant="outline" className="border-[#00f5d4]/30 text-[#00f5d4] font-black uppercase text-[10px] tracking-widest px-8 rounded-full hover:bg-[#00f5d4] hover:text-black transition-all">Démarrer maintenant</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
