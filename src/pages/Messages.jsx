import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { useNavigate } from 'react-router-dom';
import { db, storage, auth, app } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, limit, serverTimestamp, getDoc, arrayUnion
} from 'firebase/firestore';
import { getDatabase, ref as dbRef, onValue, set, update } from "firebase/database";
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Send, Search, UserPlus, Users, MessageCircle, 
  Check, X, Briefcase, RefreshCw, Smartphone, Facebook,
  Image as ImageIcon, Paperclip, Loader2, Sparkles, HelpCircle,
  Dumbbell, Utensils, Save, ChevronDown, Plus, Calendar as CalendarIcon,
  Users2, Camera, Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';

// --- Group Mosaic Component (Moved Outside to avoid re-renders and fix loop) ---
const GroupAvatar = ({ members, customAvatar, groupMessages = [] }) => {
  const [displayAvatars, setDisplayAvatars] = useState([]);

  useEffect(() => {
    if (customAvatar) return;

    const fetchAvatars = async () => {
      let speakers = [];
      const seen = new Set();

      // 1. Try to get 4 last speakers from messages
      if (groupMessages && groupMessages.length > 0) {
        for (let i = groupMessages.length - 1; i >= 0 && speakers.length < 4; i--) {
          const m = groupMessages[i];
          if (!seen.has(m.senderId)) {
            seen.add(m.senderId);
            speakers.push({ avatar: m.senderAvatar, name: m.senderName || '?' });
          }
        }
      }

      // 2. If less than 4, fill with members
      if (speakers.length < 4 && members) {
        for (const mid of members) {
          if (speakers.length >= 4) break;
          if (!seen.has(mid)) {
            seen.add(mid);
            const uSnap = await getDoc(doc(db, "users", mid));
            if (uSnap.exists()) {
              const d = uSnap.data();
              speakers.push({ avatar: d.avatar, name: d.first_name || d.full_name || '?' });
            }
          }
        }
      }
      setDisplayAvatars(speakers);
    };

    fetchAvatars();
  }, [members, customAvatar, groupMessages.length]); // Use length to avoid deep compare issues

  if (customAvatar) return <AvatarImage src={customAvatar} className="object-cover" />;

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 bg-[#1a1a20]">
      {displayAvatars.map((s, i) => (
        <div key={i} className="w-full h-full flex items-center justify-center overflow-hidden bg-gray-800 border-[0.5px] border-black/20">
          {s.avatar ? (
            <img src={s.avatar} className="w-full h-full object-cover" alt="" />
          ) : (
            <span className="text-[8px] font-black text-white">{(s.name || "?")[0]}</span>
          )}
        </div>
      ))}
      {displayAvatars.length === 0 && <div className="col-span-2 row-span-2 flex items-center justify-center text-white font-black text-xl">?</div>}
    </div>
  );
};

export default function Messages() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId, setTargetUserId } = useClient();
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  // Group Logic
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupAvatar, setGroupAvatar] = useState('');
  const groupAvatarInputRef = useRef(null);
  const editGroupAvatarInputRef = useRef(null);

  // Share Menus
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [isNutritionMenuOpen, setIsNutritionMenuOpen] = useState(false);
  const [myWorkouts, setMyWorkouts] = useState([]);
  const [myNutritionPlans, setMyNutritionPlans] = useState([]);

  // Multi-date Save Logic
  const [itemToSave, setItemToSave] = useState(null);
  const [selectedDates, setSelectedDates] = useState([]);
  const [currentDateInput, setCurrentDateInput] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- ACTIONS ---
  const openPerformance = () => {
    if (!selectedFriend || selectedFriend.isGroup) return;
    setTargetUserId(selectedFriend.uid);
    navigate('/performance');
  };

  const handleAddFriend = async (user) => {
    try {
      const meSnap = await getDoc(doc(db, "users", currentUser.uid));
      const myAvatar = meSnap.data()?.avatar || "";
      await addDoc(collection(db, "friend_requests"), {
        fromId: currentUser.uid, fromName: currentUser.displayName || "Athlète", fromAvatar: myAvatar,
        toId: user.uid, toName: user.full_name || user.name, toAvatar: user.avatar || "",
        status: "pending", createdAt: serverTimestamp()
      });
      alert("Demande envoyée !");
    } catch (err) { console.error(err); }
  };

  const sendMessage = async (txt = messageText, img = null, file = null, sharedItem = null) => {
    if ((!txt.trim() && !img && !file && !sharedItem) || !selectedFriend || !currentUser) return;
    const conversationId = selectedFriend.isGroup ? selectedFriend.uid : [currentUser.uid, selectedFriend.uid].sort().join('_');
    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myAvatar = meSnap.data()?.avatar || "";

    await addDoc(collection(db, "messages"), {
      conversationId, senderId: currentUser.uid, senderName: currentUser.displayName || "Moi",
      senderAvatar: myAvatar, text: txt, mediaUrl: img, fileUrl: file,
      sharedItem: sharedItem || null,
      createdAt: serverTimestamp(), read: false
    });

    if (!selectedFriend.isGroup) {
        await sendNotification(selectedFriend.uid, currentUser.uid, currentUser.displayName || "Moi", "Message 💬", txt.substring(0, 30), "message");
    }
    setMessageText('');
    setIsSessionMenuOpen(false);
    setIsNutritionMenuOpen(false);
  };

  // --- 1. RECHERCHE LIVE ---
  useEffect(() => {
    const performSearch = async () => {
      const term = searchTerm.trim().toLowerCase();
      if (term.length >= 2) {
        try {
          const capitalized = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();
          const upper = term.toUpperCase();

          const q1 = query(collection(db, "users"), where("full_name", ">=", upper), where("full_name", "<=", upper + '\uf8ff'), limit(5));
          const q2 = query(collection(db, "users"), where("username", ">=", term), where("username", "<=", term + '\uf8ff'), limit(5));
          const q3 = query(collection(db, "users"), where("firstName", ">=", capitalized), where("firstName", "<=", capitalized + '\uf8ff'), limit(5));

          const snapshots = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3)]);
          const results = [];
          snapshots.forEach(snap => snap.forEach(d => results.push({ uid: d.id, ...d.data() })));

          const uniqueResults = [...new Map(results.map(u => [u.uid, u])).values()]
            .filter(u => u.uid !== currentUser.uid);
          setSearchResults(uniqueResults);
        } catch (err) { console.error(err); }
      } else {
        setSearchResults([]);
      }
    };
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentUser]);

  const filteredSearch = useMemo(() => {
    return searchResults.filter(res =>
      !friendList.some(f => f.uid === res.uid) &&
      !friendRequests.some(r => r.fromId === res.uid)
    );
  }, [searchResults, friendList, friendRequests]);

  // --- 2. GESTION DES LISTES & PROFILE (Fixed dependency loop) ---
  useEffect(() => {
    if (!currentUser) return;

    const unsubFriendReqs = onSnapshot(query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "pending")), (snap) => {
      setFriendRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCoachReqs = onSnapshot(query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("type", "==", "coach_request"), where("status", "==", "unread")), (snap) => {
      setCoachRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const updateAllContacts = async () => {
      try {
        const [s1, s2, sClients, sMe, sGroups] = await Promise.all([
          getDocs(query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"))),
          getDocs(query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"))),
          getDocs(query(collection(db, "users"), where("coachId", "==", currentUser.uid))),
          getDoc(doc(db, "users", currentUser.uid)),
          getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", currentUser.uid)))
        ]);

        const contacts = [];
        s1.forEach(d => contacts.push({ uid: d.data().toId, name: d.data().toName, avatar: d.data().toAvatar, type: 'friend' }));
        s2.forEach(d => contacts.push({ uid: d.data().fromId, name: d.data().fromName, avatar: d.data().fromAvatar, type: 'friend' }));
        sClients.forEach(d => contacts.push({ uid: d.id, name: d.data().full_name || d.data().firstName, avatar: d.data().avatar, type: 'client' }));

        for (const d of sGroups.docs) {
            const gData = d.data();
            contacts.push({
                uid: d.id, name: gData.name, avatar: gData.avatar || null,
                memberIds: gData.memberIds, type: 'group', isGroup: true
            });
        }

        const myData = sMe.data();
        if (myData) {
            setMyWorkouts(myData.workouts || []);
            setMyNutritionPlans(myData.nutritionalPlans || []);
            if (myData.coachId) {
                const coachSnap = await getDoc(doc(db, "users", myData.coachId));
                contacts.push({ uid: myData.coachId, name: myData.coachName || "Mon Coach", avatar: coachSnap.data()?.avatar, type: 'coach' });
            }
        }

        setFriendList([...new Map(contacts.map(item => [item.uid, item])).values()]);
      } catch (err) { console.error(err); }
    };

    updateAllContacts();
    const unsubMe = onSnapshot(doc(db, "users", currentUser.uid), updateAllContacts);

    return () => { unsubFriendReqs(); unsubCoachReqs(); unsubMe(); };
  }, [currentUser]); // Removed friendList from dependencies to fix loop

  // --- Separate effect for unknown conversations to avoid loop ---
  useEffect(() => {
    if (!currentUser) return;
    const unsubUnknown = onSnapshot(query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
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
    return () => unsubUnknown();
  }, [currentUser, friendList, friendRequests]);

  // --- 3. CHAT REALTIME ---
  useEffect(() => {
    if (!selectedFriend || !currentUser) return;
    const conversationId = selectedFriend.isGroup ? selectedFriend.uid : [currentUser.uid, selectedFriend.uid].sort().join('_');
    const q = query(collection(db, "messages"), where("conversationId", "==", conversationId), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }, [selectedFriend, currentUser]);

  // --- OTHER ACTIONS ---
  const shareWorkout = (workout) => sendMessage(`Je te partage une séance : ${workout.name}`, null, null, { type: 'workout', data: workout });
  const shareNutrition = (plan) => sendMessage(`Je te partage un plan nutritif : ${plan.name}`, null, null, { type: 'nutrition', data: plan });

  const createGroup = async () => {
    if (!groupName || selectedMembers.length === 0) return;
    try {
        await addDoc(collection(db, "groups"), {
            name: groupName,
            creatorId: currentUser.uid,
            memberIds: [currentUser.uid, ...selectedMembers],
            avatar: groupAvatar || null,
            createdAt: serverTimestamp()
        });
        setIsGroupModalOpen(false); setGroupName(''); setSelectedMembers([]); setGroupAvatar('');
        alert("Team forgée !");
    } catch (e) { console.error(e); }
  };

  const handleAvatarUpload = async (e, setUrl) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const storageRef = sRef(storage, `avatars/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setUrl(url);
    } catch (err) { console.error(err); }
  };

  const updateGroupAvatar = async (e) => {
    if (!selectedFriend?.isGroup) return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      const storageRef = sRef(storage, `group_avatars/${selectedFriend.uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "groups", selectedFriend.uid), { avatar: url });
      setSelectedFriend(prev => ({ ...prev, avatar: url }));
      alert("Photo du groupe mise à jour !");
    } catch (err) { console.error(err); }
  };

  const toggleDate = (date) => setSelectedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);

  const handleSaveToAgendaMulti = async () => {
    if (!currentUser || !itemToSave || selectedDates.length === 0) return;
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const field = itemToSave.type === 'workout' ? 'workouts' : 'nutritionalPlans';
        const meSnap = await getDoc(userRef);
        const list = meSnap.data()[field] || [];
        const newItem = { ...itemToSave.data, id: Date.now(), scheduledDays: selectedDates };
        await updateDoc(userRef, { [field]: [...list, newItem] });
        alert(`${itemToSave.type === 'workout' ? 'Séance' : 'Plan'} ajouté à votre agenda !`);
        setItemToSave(null); setSelectedDates([]);
    } catch (e) { console.error(e); }
  };

  const handleFileUpload = async (e, type = 'image') => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const folder = type === 'image' ? 'chat_images' : 'chat_files';
      const storageRef = sRef(storage, `${folder}/${currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (type === 'image') sendMessage("Image", url);
      else sendMessage(`Fichier: ${file.name}`, null, url);
    } catch (err) { console.error(err); }
    setIsUploading(false);
  };

  const acceptFriend = async (id) => await updateDoc(doc(db, "friend_requests", id), { status: "accepted" });
  const acceptCoach = async (req) => {
    await updateDoc(doc(db, "users", req.senderId), { coachId: currentUser.uid, coachName: currentUser.displayName || "Coach", joinedCoachAt: new Date().toISOString() });
    await updateDoc(doc(db, "notifications", req.id), { status: "accepted" });
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6 pb-6 animate-in fade-in duration-700 font-sans">

      {/* --- SIDEBAR --- */}
      <Card className="w-full md:w-96 flex flex-col bg-[#1a1a20]/90 backdrop-blur-xl border-gray-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#7b2cbf] to-[#00f5d4]" />

        <div className="p-6 border-b border-gray-800/50 space-y-6 bg-black/40">
           <div className="flex justify-between items-center">
             <h2 className="text-2xl font-black text-white italic uppercase flex items-center gap-3"><Users className="text-[#00f5d4] animate-pulse" size={28}/> {t('community')}</h2>
             <div className="flex gap-2">
                <Button size="icon" variant="ghost" onClick={() => setIsGroupModalOpen(true)} className="h-9 w-9 bg-white/5 rounded-full hover:bg-[#7b2cbf]/20 text-white"><Users2 size={18}/></Button>
                <Button size="icon" variant="ghost" className="h-9 w-9 text-gray-500 hover:text-white" onClick={() => navigate(0)}><RefreshCw size={18}/></Button>
             </div>
           </div>

           <div className="relative group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#00f5d4]/50 group-focus-within:text-[#00f5d4] z-10"/>
               <Input placeholder={t('search_athlete')} className="pl-12 bg-black/60 border-gray-700 text-white focus:border-[#00f5d4] h-14 rounded-2xl shadow-2xl text-base font-bold relative z-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>

           <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="sm" onClick={() => setIsSyncing(true)} className="h-12 bg-[#1877F2]/10 border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2] hover:text-white rounded-[1rem] gap-2 text-[11px] font-black uppercase shadow-xl transition-all"><Facebook size={16} fill="currentColor"/> Facebook</Button>
                <Button variant="outline" size="sm" onClick={() => setIsSyncing(true)} className="h-12 bg-[#00f5d4]/10 border-[#00f5d4]/30 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black rounded-[1rem] gap-2 text-[11px] font-black uppercase shadow-xl transition-all"><Smartphone size={16}/> Contacts</Button>
           </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="bg-black/40 mx-6 mt-6 p-1.5 rounded-2xl border border-gray-800/50 shrink-0">
            <TabsTrigger value="friends" className="flex-1 rounded-xl data-[state=active]:bg-[#7b2cbf] data-[state=active]:text-white font-black uppercase text-[11px] tracking-widest">{t('friends')}</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 rounded-xl data-[state=active]:bg-[#00f5d4] data-[state=active]:text-black font-black uppercase text-[11px] tracking-widest relative transition-all">
              {t('requests')}
              {(friendRequests.length + coachRequests.length + unknownConversations.length) > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full border-2 border-[#1a1a20] animate-bounce shadow-lg shadow-red-500/50"/>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
            <AnimatePresence>
                {searchTerm.length >= 2 && filteredSearch.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-8 space-y-3">
                        <p className="text-[11px] font-black text-[#00f5d4] uppercase px-2 mb-4 tracking-[0.3em] flex items-center gap-2"><Sparkles size={14}/> Résultats</p>
                        {filteredSearch.map(user => (
                            <div key={user.uid} className="p-4 bg-gradient-to-br from-white/10 to-transparent border border-white/10 rounded-[1.5rem] flex items-center justify-between hover:border-[#00f5d4]/50 transition-all shadow-2xl">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-12 w-12 border-2 border-[#00f5d4]/30 shadow-lg">
                                        <AvatarFallback className="bg-black text-[#00f5d4] text-sm font-black">{user.full_name?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                    <div className="overflow-hidden"><p className="font-black text-white text-sm truncate uppercase italic">{user.full_name}</p><p className="text-[10px] text-gray-500 font-bold tracking-widest">@{user.username || 'athlete'}</p></div>
                                </div>
                                <Button size="icon" variant="ghost" className="h-11 w-11 text-[#00f5d4] transition-transform hover:scale-110" onClick={() => handleAddFriend(user)}><UserPlus size={24}/></Button>
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <p className="text-[11px] font-black text-gray-500 uppercase px-2 mb-6 tracking-[0.3em]">Flux actif</p>
            <div className="space-y-4">
                {friendList.map(friend => (
                  <motion.div key={friend.uid} whileHover={{ scale: 1.02, x: 5 }} onClick={() => setSelectedFriend(friend)} className={`p-5 rounded-[1.5rem] flex items-center gap-5 cursor-pointer transition-all border-2 ${selectedFriend?.uid === friend.uid ? 'bg-gradient-to-br from-[#7b2cbf]/40 border-[#7b2cbf] shadow-xl' : 'bg-black/20 border-transparent hover:bg-white/5 hover:border-gray-800'}`}>
                    <div className="relative">
                        <Avatar className={`h-14 w-14 border-2 shadow-2xl ${selectedFriend?.uid === friend.uid ? 'border-[#7b2cbf]' : 'border-gray-800'} overflow-hidden`}>
                            {friend.isGroup ? <GroupAvatar members={friend.memberIds} customAvatar={friend.avatar} groupMessages={messages} /> : (
                                <AvatarFallback className="bg-[#7b2cbf] text-white font-black text-lg">{friend.name?.[0] || '?'}</AvatarFallback>
                            )}
                        </Avatar>
                        {!friend.isGroup && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#00f5d4] border-[3px] border-[#1a1a20] rounded-full shadow-[0_0_10px_#00f5d4]" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="font-black text-white text-base truncate uppercase italic tracking-tighter">{friend.name}</p>
                        <Badge variant="outline" className={`text-[9px] uppercase font-black px-2 py-0.5 border-gray-700/50 ${friend.type === 'coach' ? 'text-[#00f5d4] border-[#00f5d4]/30 bg-[#00f5d4]/5' : 'text-gray-500'}`}>{friend.type}</Badge>
                    </div>
                  </motion.div>
                ))}
            </div>
          </TabsContent>
<TabsContent value="requests" className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
            {unknownConversations.length > 0 && (
                <div className="space-y-4">
                    <p className="text-[11px] font-black text-orange-500 uppercase px-2 tracking-[0.3em] flex items-center gap-3"><HelpCircle size={16}/> Nouveaux Messages</p>
                    {unknownConversations.map(m => (
                        <div key={m.uid} className="p-5 bg-orange-500/10 border-2 border-orange-500/20 rounded-[1.5rem] flex items-center justify-between shadow-2xl backdrop-blur-md">
                            <div className="cursor-pointer flex-1" onClick={() => setSelectedFriend({ uid: m.uid, name: m.name, avatar: m.avatar, type: 'unknown' })}>
                                <div className="flex items-center gap-4 mb-3">
                                    <Avatar className="h-10 w-10 border-2 border-orange-500/30 shadow-lg"><AvatarFallback className="bg-orange-500 text-white text-xs font-black">{m.name?.[0] || '?'}</AvatarFallback></Avatar>
                                    <p className="font-black text-white text-sm uppercase italic tracking-wider">{m.name}</p>
                                </div>
                                <p className="text-[11px] text-orange-200/70 truncate italic font-medium bg-black/20 p-2 rounded-xl border border-orange-500/10">"{m.lastMsg}"</p>
                            </div>
                            <Button size="icon" variant="ghost" className="h-12 w-12 text-orange-500 hover:bg-orange-500 hover:text-white rounded-2xl shadow-xl transition-all" onClick={() => handleAddFriend(m)}><UserPlus size={24}/></Button>
                        </div>
                    ))}
                </div>
            )}
            {coachRequests.map(req => (
                <div key={req.id} className="p-5 bg-[#7b2cbf]/10 border-2 border-[#7b2cbf]/20 rounded-[1.5rem] shadow-2xl">
                    <p className="text-sm text-white mb-4 font-bold leading-relaxed tracking-tight"><span className="text-[#00f5d4] uppercase font-black italic tracking-widest">{req.senderName}</span> veut rejoindre votre équipe.</p>
                    <div className="flex gap-3">
                        <Button size="sm" className="bg-[#7b2cbf] flex-1 hover:bg-[#9d4edd] font-black uppercase text-[11px] rounded-xl h-11 shadow-lg shadow-[#7b2cbf]/20 transition-all" onClick={() => acceptCoach(req)}>Engager</Button>
                        <Button size="sm" variant="ghost" className="text-red-400 font-black uppercase text-[11px] rounded-xl h-11 border border-red-400/20">Décliner</Button>
                    </div>
                </div>
            ))}
            {friendRequests.map((req) => (
             <div key={req.id} className="p-5 bg-[#00f5d4]/10 border-2 border-[#00f5d4]/20 rounded-[1.5rem] flex items-center justify-between shadow-2xl">
                 <div className="flex items-center gap-4">
                     <Avatar className="border-2 border-[#00f5d4]/30 h-12 w-12 shadow-lg">
                         <AvatarFallback className="bg-[#00f5d4] text-black font-black text-sm">
                             {req.fromName ? req.fromName[0] : '?'}
                         </AvatarFallback>
                     </Avatar>
                     <p className="font-black text-white text-sm uppercase italic tracking-tighter">{req.fromName}</p>
                 </div>
                 <div className="flex gap-2">
                     <Button
                         size="icon"
                         variant="ghost"
                         className="text-green-400 hover:bg-green-400 hover:text-black rounded-2xl h-11 w-11 shadow-xl transition-all"
                         onClick={() => acceptFriend(req.id)}
                     >
                         <Check size={24} />
                     </Button>
                 </div>
             </div>
            ))}
          </TabsContent>
        </Tabs>
      </Card>
      
      {/* --- CHAT ZONE --- */}
      <Card className="kb-card flex-1 flex flex-col bg-[#1a1a20]/90 backdrop-blur-2xl border-gray-800 overflow-hidden relative shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-[#7b2cbf] to-transparent opacity-70" />

        {selectedFriend ? (
          <>
            <div className="p-6 border-b border-gray-800/50 flex items-center justify-between bg-black/40 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-5">
                <div className="relative group/group-avatar cursor-pointer">
                    <Avatar className="border-2 border-[#00f5d4] h-14 w-14 shadow-xl overflow-hidden">
                        {selectedFriend.isGroup ? (
                            <GroupAvatar members={selectedFriend.memberIds} customAvatar={selectedFriend.avatar} groupMessages={messages} />
                        ) : (
                            <AvatarFallback className="bg-[#7b2cbf] text-white font-black text-xl">{selectedFriend.name?.[0] || '?'}</AvatarFallback>
                        )}
                    </Avatar>
                    {selectedFriend.isGroup && (
                        <div onClick={() => editGroupAvatarInputRef.current.click()} className="absolute inset-0 bg-black/60 opacity-0 group-hover/group-avatar:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                            <Camera size={16} className="text-white"/>
                        </div>
                    )}
                    <input type="file" ref={editGroupAvatarInputRef} className="hidden" accept="image/*" onChange={updateGroupAvatar} />
                </div>
                <div>
                    <h3 className="font-black text-white uppercase italic tracking-widest text-xl drop-shadow-[0_0_10px_#00f5d4]">{selectedFriend.name}</h3>
                    <div className="flex items-center gap-2.5 mt-1">
                        <div className="w-2.5 h-2.5 bg-[#00f5d4] rounded-full animate-ping shadow-[0_0_10px_#00f5d4]" />
                        <p className="text-[11px] text-gray-400 font-black uppercase tracking-[0.2em]">Flux Sécurisé</p>
                    </div>
                </div>
              </div>
              <div className="flex gap-4">
                  <div className="relative">
                    <Button variant="ghost" size="icon" onClick={() => { setIsSessionMenuOpen(!isSessionMenuOpen); setIsNutritionMenuOpen(false); }} className={`text-gray-400 rounded-2xl h-12 w-12 bg-white/5 border border-white/10 transition-all hover:bg-[#00f5d4]/10 hover:border-[#00f5d4]/50 shadow-xl ${isSessionMenuOpen ? 'bg-[#00f5d4]/20 border-[#00f5d4]' : ''}`}><Dumbbell size={24} className={isSessionMenuOpen ? 'text-[#00f5d4]' : ''}/></Button>
                    <AnimatePresence>{isSessionMenuOpen && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-14 right-0 w-64 bg-[#1a1a20]/95 border border-gray-700 rounded-2xl shadow-3xl z-50 overflow-hidden backdrop-blur-xl">
                            <div className="p-3 border-b border-gray-800 bg-black/40 flex items-center justify-between"><span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Partager séance</span><X size={14} className="cursor-pointer" onClick={() => setIsSessionMenuOpen(false)}/></div>
                            <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {myWorkouts.map((w, idx) => (<div key={idx} onClick={() => shareWorkout(w)} className="p-3 hover:bg-[#00f5d4]/10 rounded-xl cursor-pointer flex items-center justify-between group transition-all"><span className="text-sm font-bold text-white truncate uppercase italic">{w.name}</span><Send size={14} className="text-[#00f5d4] opacity-0 group-hover:opacity-100 transition-opacity"/></div>))}
                                {myWorkouts.length === 0 && <p className="text-[10px] text-gray-600 p-4 text-center italic">Aucune séance</p>}
                            </div>
                        </motion.div>
                    )}</AnimatePresence>
                  </div>
                  <div className="relative">
                    <Button variant="ghost" size="icon" onClick={() => { setIsNutritionMenuOpen(!isNutritionMenuOpen); setIsSessionMenuOpen(false); }} className={`text-gray-400 rounded-2xl h-12 w-12 bg-white/5 border border-white/10 transition-all hover:bg-[#7b2cbf]/10 hover:border-[#7b2cbf]/50 shadow-xl ${isNutritionMenuOpen ? 'bg-[#7b2cbf]/20 border-[#7b2cbf]' : ''}`}><Utensils size={24} className={isNutritionMenuOpen ? 'text-[#7b2cbf]' : ''}/></Button>
                    <AnimatePresence>{isNutritionMenuOpen && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-14 right-0 w-64 bg-[#1a1a20]/95 border border-gray-700 rounded-2xl shadow-3xl z-50 overflow-hidden backdrop-blur-xl">
                            <div className="p-3 border-b border-gray-800 bg-black/40 flex items-center justify-between"><span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Partager plan</span><X size={14} className="cursor-pointer" onClick={() => setIsNutritionMenuOpen(false)}/></div>
                            <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {myNutritionPlans.map((p, idx) => (<div key={idx} onClick={() => shareNutrition(p)} className="p-3 hover:bg-[#7b2cbf]/10 rounded-xl cursor-pointer flex items-center justify-between group transition-all"><span className="text-sm font-bold text-white truncate uppercase italic">{p.name}</span><Send size={14} className="text-[#7b2cbf] opacity-0 group-hover:opacity-100 transition-opacity"/></div>))}
                                {myNutritionPlans.length === 0 && <p className="text-[10px] text-gray-600 p-4 text-center italic">Aucun plan</p>}
                            </div>
                        </motion.div>
                    )}</AnimatePresence>
                  </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-b from-transparent to-black/60 custom-scrollbar">
              {messages.map((msg, i) => {
                const isMe = msg.senderId === currentUser.uid;
                const showAvatar = i === 0 || messages[i-1]?.senderId !== msg.senderId;
                const isSharedItem = !!msg.sharedItem;

                return (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={msg.id} className={`flex items-end gap-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && showAvatar && (
                        <Avatar className="h-10 w-10 border-2 border-[#00f5d4]/30 shadow-xl"><AvatarFallback className="bg-gray-800 text-white text-[10px] font-black">{msg.senderName?.[0] || '?'}</AvatarFallback></Avatar>
                    )}
                    {!isMe && !showAvatar && <div className="w-10" />}

                    <div className={`max-w-[70%] group relative flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-5 rounded-[2rem] shadow-2xl transition-all relative overflow-hidden ${isMe ? 'bg-gradient-to-br from-[#7b2cbf] via-[#9d4edd] to-[#7b2cbf] text-white rounded-br-none shadow-[0_10px_30px_rgba(123,44,191,0.3)]' : 'bg-[#1a1a20] border border-gray-800 text-white rounded-bl-none shadow-[0_10px_30px_rgba(0,0,0,0.4)]'}`}>
                          {isSharedItem ? (
                              <div className="space-y-4 min-w-[240px]">
                                  <div className="flex items-center gap-3"><div className={`p-3 rounded-2xl ${msg.sharedItem.type === 'workout' ? 'bg-[#00f5d4]/20 text-[#00f5d4]' : 'bg-[#7b2cbf]/20 text-[#7b2cbf]'}`}>{msg.sharedItem.type === 'workout' ? <Dumbbell size={24}/> : <Utensils size={24}/>}</div><div className="overflow-hidden"><p className="text-[10px] font-black uppercase opacity-60 tracking-widest truncate">{msg.sharedItem.type === 'workout' ? 'Séance partagée' : 'Plan nutritif partagé'}</p><p className="text-lg font-black italic uppercase truncate">{msg.sharedItem.data.name}</p></div></div>
                                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
                                      {msg.sharedItem.type === 'workout'
                                        ? msg.sharedItem.data.exercises?.map((exo, idx) => (<div key={idx} className="w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-black/40"><img src={exo.imageUrl} className="w-full h-full object-cover opacity-80" alt=""/></div>))
                                        : msg.sharedItem.data.meals?.map((meal, idx) => (<div key={idx} className="w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-black/40"><img src={meal.imageUrl} className="w-full h-full object-cover opacity-80" alt=""/></div>))
                                      }
                                  </div>
                                  <Button onClick={() => setItemToSave(msg.sharedItem)} className={`w-full h-11 font-black uppercase text-[10px] rounded-xl gap-2 shadow-lg transition-all ${msg.sharedItem.type === 'workout' ? 'bg-[#00f5d4] text-black shadow-[#00f5d4]/20' : 'bg-[#7b2cbf] text-white shadow-[#7b2cbf]/20'}`}><Plus size={16}/> Ajouter à mon agenda</Button>
                              </div>
                          ) : (
                              <>
                                {msg.text && <p className="text-base font-bold leading-relaxed relative z-10">{msg.text}</p>}
                                {msg.mediaUrl && (<div className="mt-4 overflow-hidden rounded-3xl border-2 border-white/10 shadow-2xl group-hover:brightness-110 transition-all cursor-pointer relative z-10" onClick={() => window.open(msg.mediaUrl, '_blank')}><img src={msg.mediaUrl} className="max-h-[450px] w-auto object-cover" alt="Media Élite"/></div>)}
                                {msg.fileUrl && (<a href={msg.fileUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-4 p-4 bg-black/40 rounded-2xl border border-white/10 hover:bg-black/60 transition-all shadow-inner relative z-10 group/file"><div className="p-3 bg-[#00f5d4]/10 rounded-xl group-hover/file:bg-[#00f5d4] group-hover/file:text-black transition-all"><Paperclip size={20} className="text-[#00f5d4] group-hover/file:text-inherit"/></div><div className="overflow-hidden"><span className="text-[11px] font-black uppercase truncate block text-[#00f5d4] mb-0.5 tracking-widest">Fichier</span><span className="text-xs font-bold text-white/60 truncate block max-w-[200px]">{msg.text.replace('Fichier: ', '')}</span></div></a>)}
                              </>
                          )}
                          <p className={`text-[9px] mt-3 font-black uppercase opacity-40 tracking-[0.2em] relative z-10 ${isMe ? 'text-right' : 'text-left'}`}>{msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}</p>
                        </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-6 border-t border-gray-800/50 bg-black/40 backdrop-blur-xl">
              <div className="flex items-center gap-4 bg-[#1a1a20] p-2.5 rounded-[2.5rem] border border-gray-700/50 focus-within:border-[#00f5d4] transition-all shadow-2xl relative">
                <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />
                <div className="flex gap-1 pl-2"><Button size="icon" variant="ghost" onClick={() => imageInputRef.current.click()} className="h-12 w-12 rounded-full text-gray-500 hover:text-[#00f5d4] hover:bg-[#00f5d4]/10 transition-all">{isUploading ? <Loader2 size={24} className="animate-spin text-[#00f5d4]"/> : <ImageIcon size={24}/>}</Button><Button size="icon" variant="ghost" onClick={() => fileInputRef.current.click()} className="h-12 w-12 rounded-full text-gray-500 hover:text-[#7b2cbf] hover:bg-[#7b2cbf]/10 transition-all"><Paperclip size={24}/></Button></div>
                <input value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Écris ton prochain succès..." className="flex-1 bg-transparent border-none text-white focus:ring-0 placeholder:text-gray-700 font-bold px-4 text-base focus:outline-none" />
                <Button onClick={() => sendMessage()} disabled={(!messageText.trim() && !isUploading)} className="bg-gradient-to-tr from-[#00f5d4] to-[#00d1b5] text-black h-14 w-14 rounded-full shadow-lg transition-all flex items-center justify-center shrink-0"><Send size={28} className="ml-1.5 drop-shadow-lg"/></Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-8 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
             <div className="relative"><div className="absolute inset-0 bg-[#7b2cbf] blur-[120px] opacity-30 animate-pulse" /><div className="w-40 h-40 bg-gradient-to-tr from-[#7b2cbf] via-[#9d4edd] to-[#00f5d4] rounded-[3.5rem] flex items-center justify-center shadow-2xl relative z-10 group hover:rotate-6 transition-transform duration-700"><MessageCircle size={80} className="text-white fill-white/20 drop-shadow-2xl"/></div></div>
             <div className="space-y-3"><h3 className="text-5xl font-black text-white italic uppercase tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">Messagerie Élite</h3><p className="text-gray-500 font-black uppercase tracking-[0.5em] text-xs max-w-sm mx-auto leading-relaxed border-y border-white/5 py-4">Forge ton héritage. Échange avec ta team.</p></div>
          </div>
        )}
      </Card>

      {/* DIALOGS */}
      <Dialog open={!!itemToSave} onOpenChange={() => { setItemToSave(null); setSelectedDates([]); }}>
        <DialogContent className="bg-[#1a1a20] border-[#00f5d4]/30 text-white rounded-[2rem] max-w-sm overflow-hidden p-0 shadow-3xl">
            <div className="p-8 bg-gradient-to-br from-[#00f5d4]/20 to-transparent">
                <DialogHeader><DialogTitle className="text-3xl font-black italic uppercase text-white flex items-center gap-3"><CalendarIcon className="text-[#00f5d4]" size={32}/> Planifier</DialogTitle></DialogHeader>
                <div className="py-8 space-y-6">
                    <p className="text-xs text-gray-400 font-black uppercase tracking-widest leading-relaxed">Saisis les dates pour ajouter "{itemToSave?.data.name}" à ton agenda :</p>
                    <div className="flex flex-col gap-3">
                        <Input type="date" value={currentDateInput} onChange={(e) => setCurrentDateInput(e.target.value)} className="bg-black/60 border-gray-800 h-14 rounded-2xl text-white font-black text-xl focus:border-[#00f5d4]" />
                        <Button variant="outline" onClick={() => toggleDate(currentDateInput)} className="border-dashed border-[#00f5d4]/50 text-[#00f5d4] font-black uppercase text-[10px] h-10 rounded-xl gap-2 hover:bg-[#00f5d4]/10"><Plus size={14}/> Ajouter cette date</Button>
                    </div>
                    {selectedDates.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 bg-black/40 rounded-2xl border border-white/5">
                            {selectedDates.map(d => (
                                <Badge key={d} className="bg-[#00f5d4] text-black font-black uppercase text-[9px] py-1 gap-1">{d} <X size={10} className="cursor-pointer" onClick={() => toggleDate(d)}/></Badge>
                            ))}
                        </div>
                    )}
                </div>
                <DialogFooter className="flex gap-3">
                    <Button onClick={() => { setItemToSave(null); setSelectedDates([]); }} variant="ghost" className="flex-1 rounded-2xl font-black uppercase text-[10px] h-12 text-gray-500 hover:text-white transition-colors">Annuler</Button>
                    <Button onClick={handleSaveToAgendaMulti} disabled={selectedDates.length === 0} className="flex-1 bg-gradient-to-r from-[#00f5d4] to-[#00d1b5] text-black font-black uppercase text-[10px] rounded-2xl h-12 shadow-xl hover:scale-105 transition-all shadow-[#00f5d4]/20">Confirmer ({selectedDates.length})</Button>
                </DialogFooter>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-[#7b2cbf]/30 text-white rounded-[2rem] max-w-md shadow-3xl">
            <DialogHeader><DialogTitle className="text-2xl font-black italic uppercase text-white flex items-center gap-3"><Users2 className="text-[#7b2cbf]"/> Créer un Groupe</DialogTitle><DialogDescription className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">Capacité limitée à 30 athlètes d'élite.</DialogDescription></DialogHeader>
            <div className="py-6 space-y-6">
                <div className="flex justify-center">
                    <div className="relative group/avatar cursor-pointer" onClick={() => groupAvatarInputRef.current.click()}>
                        <div className="w-24 h-24 rounded-3xl border-2 border-dashed border-gray-700 flex items-center justify-center overflow-hidden bg-black/40 group-hover/avatar:border-[#7b2cbf] transition-all">
                            {groupAvatar ? <img src={groupAvatar} className="w-full h-full object-cover" alt=""/> : <Camera size={32} className="text-gray-700"/>}
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-[#7b2cbf] p-1.5 rounded-xl shadow-lg"><Plus size={14}/></div>
                        <input type="file" ref={groupAvatarInputRef} className="hidden" accept="image/*" onChange={(e) => handleAvatarUpload(e, setGroupAvatar)} />
                    </div>
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Nom de la Team</label><Input placeholder="EX: TEAM ALPHA" className="bg-black/60 border-gray-800 h-14 rounded-2xl text-white font-black text-lg focus:border-[#7b2cbf]" value={groupName} onChange={(e) => setGroupName(e.target.value)} /></div>
                <div className="space-y-3"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Membres ({selectedMembers.length}/29)</label>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 p-2 bg-black/20 rounded-2xl border border-white/5">
                        {friendList.filter(f => !f.isGroup).map(friend => (
                            <div key={friend.uid} onClick={() => setSelectedMembers(prev => prev.includes(friend.uid) ? prev.filter(id => id !== friend.uid) : (prev.length < 29 ? [...prev, friend.uid] : prev))} className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedMembers.includes(friend.uid) ? 'bg-[#7b2cbf]/20 border-[#7b2cbf]' : 'bg-transparent border-white/5 hover:bg-white/5'}`}>
                                <Avatar className="h-8 w-8"><AvatarFallback className="bg-gray-800 text-white font-black text-[10px]">{friend.name?.[0]}</AvatarFallback></Avatar>
                                <span className="text-xs font-bold text-white uppercase">{friend.name}</span>
                                {selectedMembers.includes(friend.uid) && <Check size={14} className="ml-auto text-[#00f5d4]"/>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <DialogFooter><Button onClick={createGroup} disabled={!groupName || selectedMembers.length === 0} className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-black uppercase text-xs h-14 rounded-2xl shadow-xl hover:scale-[1.02] transition-all">Forger la Team</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
