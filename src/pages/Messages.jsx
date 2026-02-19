import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { useNavigate } from 'react-router-dom';
import { db, storage, app } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, limit, serverTimestamp, getDoc, arrayUnion
} from 'firebase/firestore';
import { getDatabase } from "firebase/database";
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Send, Search, UserPlus, Users, MessageCircle, 
  Check, X, RefreshCw,
  Image as ImageIcon, Paperclip, Loader2,
  Dumbbell, Utensils, Plus, Calendar as CalendarIcon,
  Users2, Camera, Menu, ChevronLeft, Info, Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';
import { motion, AnimatePresence } from 'framer-motion';

// --- Group Mosaic Component ---
const GroupAvatar = ({ members, customAvatar, groupMessages = [] }) => {
  const [displayAvatars, setDisplayAvatars] = useState([]);

  useEffect(() => {
    if (customAvatar) return;

    const fetchAvatars = async () => {
      let speakers = [];
      const seen = new Set();

      if (groupMessages && groupMessages.length > 0) {
        for (let i = groupMessages.length - 1; i >= 0 && speakers.length < 4; i--) {
          const m = groupMessages[i];
          if (!seen.has(m.senderId)) {
            seen.add(m.senderId);
            speakers.push({ avatar: m.senderAvatar, name: m.senderName || '?' });
          }
        }
      }

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
  }, [members, customAvatar, groupMessages.length]);

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

// Sidebar Component moved OUTSIDE to avoid losing focus on re-render
const Sidebar = ({
  searchTerm,
  setSearchTerm,
  setIsGroupModalOpen,
  navigate,
  activeTab,
  setActiveTab,
  filteredSearch,
  handleAddFriend,
  friendList,
  setSelectedFriend,
  setIsSidebarOpen,
  selectedFriend,
  messages,
  unknownConversations,
  coachRequests,
  acceptCoach,
  friendRequests,
  acceptFriend,
  t
}) => (
  <div className="flex flex-col h-full bg-[#1a1a20] border-r border-gray-800">
      <div className="p-4 border-b border-gray-800/50 space-y-4 bg-black/20">
         <div className="flex justify-between items-center">
           <h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2"><MessageCircle className="text-[#00f5d4]"/> CHATS</h2>
           <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setIsGroupModalOpen(true)} className="h-8 w-8 bg-white/5 rounded-full text-white"><Users2 size={16}/></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500" onClick={() => navigate(0)}><RefreshCw size={16}/></Button>
           </div>
         </div>
         <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
             <Input placeholder="Rechercher..." className="pl-10 bg-black/40 border-gray-800 text-white h-10 rounded-xl text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
         </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="bg-black/40 mx-4 mt-4 p-1 rounded-xl border border-gray-800/50 shrink-0">
          <TabsTrigger value="friends" className="flex-1 rounded-lg data-[state=active]:bg-[#7b2cbf] text-[9px] uppercase font-black">ATHLÈTES</TabsTrigger>
          <TabsTrigger value="requests" className="flex-1 rounded-lg data-[state=active]:bg-[#00f5d4] text-[9px] uppercase font-black relative">
            REQUÊTES
            {(friendRequests.length + coachRequests.length + unknownConversations.length) > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1a1a20]"/>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
          <AnimatePresence>
              {searchTerm.length >= 2 && filteredSearch.length > 0 && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-6 space-y-2">
                      {filteredSearch.map(user => (
                          <div key={user.uid} className="p-2.5 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8"><AvatarFallback className="bg-black text-[#00f5d4] text-[10px] font-black">{user.full_name?.[0]}</AvatarFallback></Avatar>
                                  <div className="overflow-hidden"><p className="font-black text-white text-[10px] uppercase italic truncate">{user.full_name}</p></div>
                              </div>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-[#00f5d4]" onClick={() => handleAddFriend(user)}><UserPlus size={16}/></Button>
                          </div>
                      ))}
                  </motion.div>
              )}
          </AnimatePresence>
          <div className="space-y-2">
              {friendList.map(friend => (
                <div key={friend.uid} onClick={() => { setSelectedFriend(friend); setIsSidebarOpen(false); }} className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all border ${selectedFriend?.uid === friend.uid ? 'bg-[#7b2cbf]/20 border-[#7b2cbf]' : 'bg-black/20 border-transparent hover:bg-white/5'}`}>
                  <div className="relative shrink-0">
                      <Avatar className="h-10 w-10 border border-gray-800">
                          {friend.isGroup ? <GroupAvatar members={friend.memberIds} customAvatar={friend.avatar} groupMessages={messages} /> : (
                              <AvatarFallback className="bg-[#7b2cbf] text-white font-black text-xs">{friend.name?.[0]}</AvatarFallback>
                          )}
                      </Avatar>
                      {!friend.isGroup && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#00f5d4] border-2 border-[#1a1a20] rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-xs truncate uppercase italic">{friend.name}</p>
                      <p className="text-[8px] text-gray-500 uppercase font-bold">{friend.type}</p>
                  </div>
                </div>
              ))}
          </div>
        </TabsContent>
        <TabsContent value="requests" className="flex-1 overflow-y-auto px-3 py-4 space-y-4 custom-scrollbar">
          {unknownConversations.length > 0 && (
              <div className="space-y-2">
                  <p className="text-[9px] font-black text-orange-500 uppercase px-1">Nouveaux</p>
                  {unknownConversations.map(m => (
                      <div key={m.uid} className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl flex items-center justify-between">
                          <div className="cursor-pointer flex-1" onClick={() => { setSelectedFriend({ uid: m.uid, name: m.name, avatar: m.avatar, type: 'unknown' }); setIsSidebarOpen(false); }}>
                              <p className="font-black text-white text-[10px] uppercase italic mb-1">{m.name}</p>
                              <p className="text-[9px] text-orange-200/50 truncate italic">"{m.lastMsg}"</p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-orange-500" onClick={() => handleAddFriend(m)}><UserPlus size={18}/></Button>
                      </div>
                  ))}
              </div>
          )}
          {coachRequests.map(req => (
              <div key={req.id} className="p-3 bg-[#7b2cbf]/5 border border-[#7b2cbf]/20 rounded-xl">
                  <p className="text-[10px] text-white mb-2 font-bold">{req.senderName} veut rejoindre la team.</p>
                  <div className="flex gap-2">
                      <Button size="sm" className="bg-[#7b2cbf] flex-1 text-[8px] h-8" onClick={() => acceptCoach(req)}>Engager</Button>
                      <Button size="sm" variant="ghost" className="text-red-400 text-[8px] h-8">Refuser</Button>
                  </div>
              </div>
          ))}
          {friendRequests.map((req) => (
           <div key={req.id} className="p-3 bg-[#00f5d4]/5 border border-[#00f5d4]/20 rounded-xl flex items-center justify-between">
               <p className="font-black text-white text-[10px] uppercase italic">{req.fromName}</p>
               <Button size="icon" variant="ghost" className="text-green-400 h-8 w-8" onClick={() => acceptFriend(req.id)}><Check size={18} /></Button>
           </div>
          ))}
        </TabsContent>
      </Tabs>
      <button onClick={() => setIsSidebarOpen(false)} className="absolute top-4 right-4 md:hidden bg-white/5 p-2 rounded-lg text-white"><X size={20}/></button>
  </div>
);

export default function Messages() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('friends');
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friendList, setFriendList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [coachRequests, setCoachRequests] = useState([]);
  const [unknownConversations, setUnknownConversations] = useState([]);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupAvatar, setGroupAvatar] = useState('');
  const groupAvatarInputRef = useRef(null);

  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [isNutritionMenuOpen, setIsNutritionMenuOpen] = useState(false);
  const [myWorkouts, setMyWorkouts] = useState([]);
  const [myNutritionPlans, setMyNutritionPlans] = useState([]);

  const [itemToSave, setItemToSave] = useState(null);
  const [selectedDates, setSelectedDates] = useState([]);
  const [currentDateInput, setCurrentDateInput] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [viewingDetail, setViewingDetail] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

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
          const uniqueResults = [...new Map(results.map(u => [u.uid, u])).values()].filter(u => u.uid !== currentUser.uid);
          setSearchResults(uniqueResults);
        } catch (err) { console.error(err); }
      } else { setSearchResults([]); }
    };
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentUser]);

  const filteredSearch = useMemo(() => {
    return searchResults.filter(res => !friendList.some(f => f.uid === res.uid) && !friendRequests.some(r => r.fromId === res.uid));
  }, [searchResults, friendList, friendRequests]);

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
            contacts.push({ uid: d.id, name: gData.name, avatar: gData.avatar || null, memberIds: gData.memberIds, type: 'group', isGroup: true });
        }
        const myData = sMe.data();
        if (myData) {
            setMyWorkouts(myData.workouts || []); setMyNutritionPlans(myData.nutritionalPlans || []);
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
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubUnknown = onSnapshot(query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
      const allMsgs = snap.docs.map(d => d.data());
      const unknown = [];
      allMsgs.forEach(m => {
        if (m.senderId !== currentUser.uid) {
           const isContact = friendList.some(f => f.uid === m.senderId);
           const isReq = friendRequests.some(r => r.fromId === m.senderId);
           if (!isContact && !isReq) unknown.push({ uid: m.senderId, name: m.senderName, avatar: m.senderAvatar, lastMsg: m.text });
        }
      });
      setUnknownConversations([...new Map(unknown.map(item => [item.uid, item])).values()]);
    });
    return () => unsubUnknown();
  }, [currentUser, friendList, friendRequests]);

  useEffect(() => {
    if (!selectedFriend || !currentUser) return;
    const conversationId = selectedFriend.isGroup ? selectedFriend.uid : [currentUser.uid, selectedFriend.uid].sort().join('_');
    const q = query(collection(db, "messages"), where("conversationId", "==", conversationId), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }, [selectedFriend, currentUser]);

  const sendMessage = async (txt = messageText, img = null, file = null, sharedItem = null) => {
    if ((!txt.trim() && !img && !file && !sharedItem) || !selectedFriend || !currentUser) return;
    const conversationId = selectedFriend.isGroup ? selectedFriend.uid : [currentUser.uid, selectedFriend.uid].sort().join('_');
    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myAvatar = meSnap.data()?.avatar || "";
    await addDoc(collection(db, "messages"), { conversationId, senderId: currentUser.uid, senderName: currentUser.displayName || "Moi", senderAvatar: myAvatar, text: txt, mediaUrl: img, fileUrl: file, sharedItem: sharedItem || null, createdAt: serverTimestamp(), read: false });
    if (!selectedFriend.isGroup) await sendNotification(selectedFriend.uid, currentUser.uid, currentUser.displayName || "Moi", "Message 💬", txt.substring(0, 30), "message");
    setMessageText(''); setIsSessionMenuOpen(false); setIsNutritionMenuOpen(false);
  };

  const handleAddFriend = async (user) => {
    try {
      const meSnap = await getDoc(doc(db, "users", currentUser.uid));
      const myAvatar = meSnap.data()?.avatar || "";
      await addDoc(collection(db, "friend_requests"), { fromId: currentUser.uid, fromName: currentUser.displayName || "Athlète", fromAvatar: myAvatar, toId: user.uid, toName: user.full_name || user.name, toAvatar: user.avatar || "", status: "pending", createdAt: serverTimestamp() });
      alert("Demande envoyée !");
    } catch (err) { console.error(err); }
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

  const shareWorkout = (workout) => sendMessage(`Je te partage une séance : ${workout.name}`, null, null, { type: 'workout', data: workout });
  const shareNutrition = (plan) => sendMessage(`Je te partage un plan nutritif : ${plan.name}`, null, null, { type: 'nutrition', data: plan });
  const acceptFriend = async (id) => await updateDoc(doc(db, "friend_requests", id), { status: "accepted" });
  const acceptCoach = async (req) => {
    await updateDoc(doc(db, "users", req.senderId), { coachId: currentUser.uid, coachName: currentUser.displayName || "Coach", joinedCoachAt: new Date().toISOString() });
    await updateDoc(doc(db, "notifications", req.id), { status: "accepted" });
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

  const createGroup = async () => {
    if (!groupName || selectedMembers.length === 0) return;
    try {
        await addDoc(collection(db, "groups"), { name: groupName, creatorId: currentUser.uid, memberIds: [currentUser.uid, ...selectedMembers], avatar: groupAvatar || null, createdAt: serverTimestamp() });
        setIsGroupModalOpen(false); setGroupName(''); setSelectedMembers([]); setGroupAvatar('');
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

  return (
    <div className="h-[calc(100vh-4rem)] sm:h-[calc(100vh-6.5rem)] flex overflow-hidden bg-[#0a0a0f] relative">

      {/* SIDEBAR : ABSOLUTE ON MOBILE, RELATIVE ON DESKTOP */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} className="absolute md:relative z-50 w-full sm:w-[300px] h-full shadow-2xl flex flex-col">
            <Sidebar
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              setIsGroupModalOpen={setIsGroupModalOpen}
              navigate={navigate}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              filteredSearch={filteredSearch}
              handleAddFriend={handleAddFriend}
              friendList={friendList}
              setSelectedFriend={setSelectedFriend}
              setIsSidebarOpen={setIsSidebarOpen}
              selectedFriend={selectedFriend}
              messages={messages}
              unknownConversations={unknownConversations}
              coachRequests={coachRequests}
              acceptCoach={acceptCoach}
              friendRequests={friendRequests}
              acceptFriend={acceptFriend}
              t={t}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 bg-[#1a1a20]/20 relative">
        {/* OPEN SIDEBAR BUTTON */}
        {!isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-4 z-30 bg-black/40 p-2.5 rounded-xl border border-white/10 text-[#00f5d4] shadow-lg">
            <Menu size={20} />
          </button>
        )}

        {selectedFriend ? (
          <>
            <div className={`p-4 sm:p-6 border-b border-gray-800/50 flex items-center justify-between bg-black/40 backdrop-blur-md sticky top-0 z-20 ${!isSidebarOpen ? 'pl-16 sm:pl-20' : ''}`}>
              <div className="flex items-center gap-3">
                <Avatar className="border-2 border-[#00f5d4] h-10 w-10 sm:h-12 sm:w-12 shadow-lg overflow-hidden shrink-0">
                    {selectedFriend.isGroup ? <GroupAvatar members={selectedFriend.memberIds} customAvatar={selectedFriend.avatar} groupMessages={messages} /> : (
                        <AvatarFallback className="bg-[#7b2cbf] text-white font-black text-lg">{selectedFriend.name?.[0]}</AvatarFallback>
                    )}
                </Avatar>
                <div className="min-w-0">
                    <h3 className="font-black text-white uppercase italic tracking-widest text-sm sm:text-lg truncate">{selectedFriend.name}</h3>
                    <p className="text-[8px] text-[#00f5d4] font-black uppercase tracking-widest">ACTIF</p>
                </div>
              </div>
              <div className="flex gap-1 sm:gap-2">
                  <div className="relative">
                    <Button variant="ghost" size="icon" onClick={() => setIsSessionMenuOpen(!isSessionMenuOpen)} className={`h-9 w-9 sm:h-10 sm:w-10 bg-white/5 border rounded-xl ${isSessionMenuOpen ? 'border-[#00f5d4] text-[#00f5d4]' : 'border-white/10 text-gray-500'}`}><Dumbbell size={18}/></Button>
                    {isSessionMenuOpen && (
                        <div className="absolute top-11 right-0 w-48 bg-[#1a1a20] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                            <div className="max-h-40 overflow-y-auto p-1">
                                {myWorkouts.map((w, idx) => (<div key={idx} onClick={() => shareWorkout(w)} className="p-2.5 hover:bg-[#00f5d4]/10 rounded-lg cursor-pointer text-[10px] font-bold text-white uppercase italic truncate">{w.name}</div>))}
                            </div>
                        </div>
                    )}
                  </div>
                  <div className="relative">
                    <Button variant="ghost" size="icon" onClick={() => setIsNutritionMenuOpen(!isNutritionMenuOpen)} className={`h-9 w-9 sm:h-10 sm:w-10 bg-white/5 border rounded-xl ${isNutritionMenuOpen ? 'border-[#7b2cbf] text-[#7b2cbf]' : 'border-white/10 text-gray-500'}`}><Utensils size={18}/></Button>
                    {isNutritionMenuOpen && (
                        <div className="absolute top-11 right-0 w-48 bg-[#1a1a20] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                            <div className="max-h-40 overflow-y-auto p-1">
                                {myNutritionPlans.map((p, idx) => (<div key={idx} onClick={() => shareNutrition(p)} className="p-2.5 hover:bg-[#7b2cbf]/10 rounded-lg cursor-pointer text-[10px] font-bold text-white uppercase italic truncate">{p.name}</div>))}
                            </div>
                        </div>
                    )}
                  </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar bg-black/10">
              {messages.map((msg, i) => {
                const isMe = msg.senderId === currentUser.uid;
                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-3 sm:p-4 rounded-2xl shadow-lg ${isMe ? 'bg-[#7b2cbf] text-white rounded-tr-none' : 'bg-[#1a1a20] border border-gray-800 text-white rounded-tl-none'}`}>
                          {msg.sharedItem ? (
                              <div className="space-y-2 min-w-[140px]">
                                  <div className="flex items-center gap-2">
                                      <div className={`p-1.5 rounded-lg ${msg.sharedItem.type === 'workout' ? 'bg-[#00f5d4]/20 text-[#00f5d4]' : 'bg-[#7b2cbf]/20 text-[#7b2cbf]'}`}>
                                          {msg.sharedItem.type === 'workout' ? <Dumbbell size={12}/> : <Utensils size={12}/>}
                                      </div>
                                      <p className="text-[10px] font-black italic uppercase truncate flex-1">{msg.sharedItem.data.name}</p>
                                  </div>
                                  <div className="flex gap-1.5">
                                      <Button onClick={() => setViewingDetail(msg.sharedItem)} variant="ghost" className="h-8 px-2 bg-white/5 hover:bg-white/10 text-white rounded-lg"><Eye size={14}/></Button>
                                      <Button onClick={() => setItemToSave(msg.sharedItem)} className={`flex-1 h-8 font-black uppercase text-[8px] rounded-lg shadow-lg ${msg.sharedItem.type === 'workout' ? 'bg-[#00f5d4] text-black' : 'bg-white text-black'}`}><Plus size={10}/> Ajouter</Button>
                                  </div>
                              </div>
                          ) : (
                              <>
                                {msg.text && <p className="text-[13px] leading-snug">{msg.text}</p>}
                                {msg.mediaUrl && <div className="mt-2 overflow-hidden rounded-xl border border-white/5" onClick={() => window.open(msg.mediaUrl, '_blank')}><img src={msg.mediaUrl} className="max-h-[250px] w-full object-cover" alt=""/></div>}
                                {msg.fileUrl && <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 p-2 bg-black/40 rounded-lg border border-white/5"><Paperclip size={14} className="text-[#00f5d4]"/><span className="text-[9px] font-bold text-gray-400 truncate">Fichier</span></a>}
                              </>
                          )}
                          <p className="text-[7px] mt-1.5 font-black uppercase opacity-30 text-right">{msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}</p>
                        </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 sm:p-4 border-t border-gray-800/50 bg-black/40 backdrop-blur-xl">
              <div className="flex items-center gap-2 bg-[#1a1a20] p-1.5 rounded-2xl border border-gray-800">
                <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
                <Button size="icon" variant="ghost" onClick={() => imageInputRef.current.click()} className="h-9 w-9 rounded-xl text-gray-500 hover:text-[#00f5d4]">{isUploading ? <Loader2 size={18} className="animate-spin"/> : <ImageIcon size={18}/>}</Button>
                <input value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Message..." className="flex-1 bg-transparent border-none text-white focus:ring-0 placeholder:text-gray-700 font-bold px-2 text-xs sm:text-sm focus:outline-none" />
                <Button onClick={() => sendMessage()} disabled={(!messageText.trim() && !isUploading)} className="bg-[#00f5d4] text-black h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-[#00f5d4]/20"><Send size={18}/></Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
             <div className="w-24 h-24 bg-gradient-to-tr from-[#7b2cbf] to-[#00f5d4] rounded-[2rem] flex items-center justify-center shadow-2xl"><MessageCircle size={40} className="text-white"/></div>
             <div className="space-y-1"><h3 className="text-2xl font-black text-white uppercase italic">MESSAGERIE</h3><p className="text-gray-600 font-black uppercase tracking-widest text-[9px]">Sélectionnez une conversation</p></div>
          </div>
        )}
      </div>

      {/* DIALOGS FOR MOBILE */}
      <Dialog open={!!viewingDetail} onOpenChange={() => setViewingDetail(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-t-[2rem] sm:rounded-[2rem] max-w-full sm:max-w-md p-0 overflow-hidden bottom-0 sm:bottom-auto fixed sm:relative max-h-[85vh]">
            {viewingDetail && (
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="p-4 bg-black/40 border-b border-gray-800 flex items-center justify-between">
                        <h3 className="font-black uppercase italic text-sm">{viewingDetail.data.name}</h3>
                        <button onClick={() => setViewingDetail(null)} className="text-gray-500"><X size={18}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {(viewingDetail.type === 'workout' ? viewingDetail.data.exercises : viewingDetail.data.meals)?.map((item, idx) => (
                            <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/5 flex gap-3">
                                <img src={item.imageUrl} className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0" alt=""/>
                                <div className="flex-1 min-w-0">
                                    <p className="font-black text-white uppercase italic text-[11px] truncate">{item.name}</p>
                                    <p className="text-[9px] text-gray-500 line-clamp-2 mt-1">{item.description || item.instructions}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-gray-800 bg-black/40">
                        <Button onClick={() => { setItemToSave(viewingDetail); setViewingDetail(null); }} className={`w-full h-12 font-black uppercase rounded-xl text-xs ${viewingDetail.type === 'workout' ? 'bg-[#00f5d4] text-black' : 'bg-[#7b2cbf] text-white'}`}>Programmer maintenant</Button>
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemToSave} onOpenChange={() => setItemToSave(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-[90vw] sm:max-w-sm p-6">
            <DialogHeader><DialogTitle className="text-lg font-black italic uppercase text-[#00f5d4] text-center">PLANIFIER</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
                <Input type="date" value={currentDateInput} onChange={(e) => setCurrentDateInput(e.target.value)} className="bg-black border-gray-800 h-10 text-xs" />
                <Button onClick={() => toggleDate(currentDateInput)} className="w-full bg-white/5 border-2 border-dashed border-[#00f5d4]/30 text-[#00f5d4] font-black uppercase text-[10px] h-10 rounded-xl">+ Ajouter une date</Button>
                <div className="flex flex-wrap gap-1.5">{selectedDates.map(d => (<Badge key={d} className="bg-[#00f5d4] text-black text-[8px] font-black">{d} <X size={8} className="ml-1" onClick={() => toggleDate(d)}/></Badge>))}</div>
            </div>
            <div className="flex gap-2"><Button onClick={() => setItemToSave(null)} variant="ghost" className="flex-1 text-[10px] uppercase font-black">Annuler</Button><Button onClick={handleSaveToAgendaMulti} disabled={selectedDates.length === 0} className="flex-1 bg-[#00f5d4] text-black font-black uppercase text-[10px]">Confirmer</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-[90vw] sm:max-w-sm p-6">
            <DialogHeader><DialogTitle className="text-lg font-black italic uppercase text-center">NOUVELLE TEAM</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="flex justify-center">
                    <div className="relative size-16 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center bg-black/40 overflow-hidden cursor-pointer" onClick={() => groupAvatarInputRef.current.click()}>
                        {groupAvatar ? <img src={groupAvatar} className="w-full h-full object-cover" alt=""/> : <Camera size={20} className="text-gray-700"/>}
                        <input type="file" ref={groupAvatarInputRef} className="hidden" accept="image/*" onChange={(e) => handleAvatarUpload(e, setGroupAvatar)} />
                    </div>
                </div>
                <Input placeholder="NOM DE LA TEAM" className="bg-black border-gray-800 font-black text-center h-10 text-xs" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1 p-2 bg-black/20 rounded-xl">
                    {friendList.filter(f => !f.isGroup).map(friend => (
                        <div key={friend.uid} onClick={() => setSelectedMembers(prev => prev.includes(friend.uid) ? prev.filter(id => id !== friend.uid) : [...prev, friend.uid])} className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer border ${selectedMembers.includes(friend.uid) ? 'border-[#7b2cbf] bg-[#7b2cbf]/10' : 'border-transparent'}`}>
                            <Avatar className="size-5"><AvatarFallback className="text-[7px]">{friend.name?.[0]}</AvatarFallback></Avatar>
                            <span className="text-[9px] font-black uppercase">{friend.name}</span>
                        </div>
                    ))}
                </div>
            </div>
            <Button onClick={createGroup} disabled={!groupName || selectedMembers.length === 0} className="w-full bg-[#7b2cbf] font-black uppercase text-[10px] h-12 rounded-xl">CRÉER</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
