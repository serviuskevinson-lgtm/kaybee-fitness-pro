import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, storage, auth, app } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, limit, serverTimestamp, getDoc
} from 'firebase/firestore';
import { getDatabase, ref as dbRef, onValue, set, update } from "firebase/database";
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Send, Search, UserPlus, Users, MessageCircle, 
  Activity, Check, X, Briefcase
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';

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

  const messagesEndRef = useRef(null);

  // --- LIVE SYNC FOR COACH VIEW ---
  useEffect(() => {
    if (isCoachView && targetUserId) {
        const sessionRef = dbRef(rtdb, `users/${targetUserId}/live_data/session`);
        return onValue(sessionRef, (snapshot) => {
            if (snapshot.exists()) setLiveSession(snapshot.val());
            else setLiveSession(null);
        });
    }
  }, [isCoachView, targetUserId]);

  // --- 1. LIVE SEARCH (DYNAMIC) ---
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
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, currentUser]);

  // --- 2. REALTIME LISTS SYNC ---
  useEffect(() => {
    if (!currentUser) return;

    // Incoming friend requests
    const unsubFriendReqs = onSnapshot(query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "pending")), (snap) => {
      setFriendRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Coaching notifications
    const unsubCoachReqs = onSnapshot(query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("type", "==", "coach_request"), where("status", "==", "unread")), (snap) => {
      setCoachRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Contacts Update (Accepted Friends + Clients + Coach)
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

        const uniqueContacts = [...new Map(contacts.map(item => [item.uid, item])).values()];
        setFriendList(uniqueContacts);
      } catch (err) {
        console.error("Error updating contacts:", err);
      }
    };

    updateAllContacts();
    const unsubMe = onSnapshot(doc(db, "users", currentUser.uid), updateAllContacts);

    // Detect messages from strangers (not in friend list)
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

    return () => {
      unsubFriendReqs(); unsubCoachReqs(); unsubMe(); unsubUnknown();
    };
  }, [currentUser, friendList, friendRequests]);

  // --- 3. CHAT SYNC ---
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
  const sendMessage = async (txt = messageText) => {
    if (!txt.trim() || !selectedFriend || !currentUser) return;
    const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');

    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myAvatar = meSnap.data()?.avatar || "";

    await addDoc(collection(db, "messages"), {
      conversationId, senderId: currentUser.uid, senderName: currentUser.displayName || "Moi",
      senderAvatar: myAvatar,
      text: txt, createdAt: serverTimestamp(), read: false
    });
    await sendNotification(selectedFriend.uid, currentUser.uid, currentUser.displayName || "Moi", "Message 💬", txt.substring(0, 30), "message");
    setMessageText('');
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
    } catch (err) {
      console.error(err);
    }
  };

  const acceptFriend = async (id) => {
    await updateDoc(doc(db, "friend_requests", id), { status: "accepted" });
  };

  const acceptCoach = async (req) => {
    await updateDoc(doc(db, "users", req.senderId), {
      coachId: currentUser.uid, coachName: currentUser.displayName || "Coach", joinedCoachAt: new Date().toISOString()
    });
    await updateDoc(doc(db, "notifications", req.id), { status: "accepted" });
    alert("Client ajouté !");
  };

  const filteredSearch = useMemo(() => {
    return searchResults.filter(res =>
      !friendList.some(f => f.uid === res.uid) &&
      !friendRequests.some(r => r.fromId === res.uid)
    );
  }, [searchResults, friendList, friendRequests]);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6 pb-6">

      {/* SIDEBAR */}
      <Card className="kb-card w-full md:w-96 flex flex-col bg-[#1a1a20] border-gray-800">
        <div className="p-4 border-b border-gray-800 space-y-4">
           <div className="flex justify-between items-center">
             <h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2">
               <Users className="text-[#9d4edd]"/> {t('community')}
             </h2>
             {isCoachView && <Badge className="bg-[#7b2cbf] text-white">VUE COACH</Badge>}
           </div>

           {isCoachView && liveSession?.active && (
               <div className="p-3 bg-[#7b2cbf]/20 border border-[#7b2cbf] rounded-xl animate-pulse cursor-pointer" onClick={() => window.location.href='/session'}>
                   <div className="flex items-center gap-2 mb-1"><Activity size={14} className="text-[#00f5d4]"/><p className="text-[10px] font-black text-[#00f5d4] uppercase">Séance en cours</p></div>
                   <p className="text-sm font-bold text-white truncate">{liveSession.workoutName}</p>
               </div>
           )}

           <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
               <input
                 placeholder={t('search_athlete')}
                 className="w-full pl-10 pr-4 h-10 bg-black/50 border border-gray-700 text-white rounded-xl focus:outline-none focus:border-[#00f5d4] transition-colors"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
           </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="bg-black/20 mx-4 mt-2">
            <TabsTrigger value="friends" className="flex-1">{t('friends')}</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 relative">
              {t('requests')}
              {(friendRequests.length + coachRequests.length + unknownConversations.length) > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"/>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 overflow-y-auto p-2">
            {searchTerm.length >= 2 && filteredSearch.length > 0 && (
                <div className="mb-4 bg-[#00f5d4]/5 rounded-xl p-2 border border-[#00f5d4]/20 animate-in fade-in zoom-in duration-300">
                    <p className="text-[10px] font-black text-[#00f5d4] uppercase px-2 mb-2 tracking-widest">Résultats</p>
                    {filteredSearch.map(user => (
                        <div key={user.uid} className="p-2 flex items-center justify-between hover:bg-white/5 rounded-lg transition-colors group">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-[#00f5d4]/30">
                                    <AvatarImage src={user.avatar}/>
                                    <AvatarFallback className="bg-[#1a1a20] text-white text-[10px] font-black">{user.full_name?.[0] || '?'}</AvatarFallback>
                                </Avatar>
                                <p className="font-bold text-white text-xs">{user.full_name}</p>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black transition-all" onClick={() => handleAddFriend(user)}><UserPlus size={16}/></Button>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-[10px] font-black text-gray-500 uppercase px-2 mb-2 tracking-widest">Mes contacts</p>
            {friendList.map(friend => (
              <div key={friend.uid} onClick={() => setSelectedFriend(friend)} className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${selectedFriend?.uid === friend.uid ? 'bg-[#7b2cbf]/20 border border-[#7b2cbf]' : 'hover:bg-white/5 border border-transparent'}`}>
                <Avatar className="border border-white/10">
                    <AvatarImage src={friend.avatar} className="object-cover"/>
                    <AvatarFallback className="bg-[#7b2cbf] text-white font-black">{friend.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div>
                    <p className="font-bold text-white text-sm">{friend.name}</p>
                    <Badge variant="outline" className="text-[8px] uppercase border-gray-700 text-gray-500 tracking-tighter">{friend.type}</Badge>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="requests" className="flex-1 overflow-y-auto p-2 space-y-4">
            {unknownConversations.length > 0 && (
                <div>
                    <p className="text-[10px] font-black text-orange-500 uppercase px-2 mb-2 tracking-widest">Messages (Inconnus)</p>
                    {unknownConversations.map(m => (
                        <div key={m.uid} className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl mb-2 flex items-center justify-between group">
                            <div className="cursor-pointer flex-1" onClick={() => setSelectedFriend({ uid: m.uid, name: m.name, avatar: m.avatar, type: 'unknown' })}>
                                <div className="flex items-center gap-2 mb-1">
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={m.avatar}/>
                                        <AvatarFallback className="bg-orange-500 text-white text-[10px] font-black">{m.name?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                    <p className="font-bold text-white text-sm">{m.name}</p>
                                </div>
                                <p className="text-[10px] text-gray-400 truncate w-32">{m.lastMsg}</p>
                            </div>
                            <Button size="sm" variant="ghost" className="text-orange-500 hover:bg-orange-500 hover:text-white" onClick={() => handleAddFriend(m)}><UserPlus size={16}/></Button>
                        </div>
                    ))}
                </div>
            )}

            {coachRequests.length > 0 && (
                <div>
                    <p className="text-[10px] font-black text-[#7b2cbf] uppercase px-2 mb-2 tracking-widest">Coaching</p>
                    {coachRequests.map(req => (
                        <div key={req.id} className="p-3 bg-[#7b2cbf]/10 border border-[#7b2cbf]/30 rounded-xl mb-2">
                            <p className="text-sm text-white mb-2 font-bold">{req.senderName} veut rejoindre votre équipe.</p>
                            <div className="flex gap-2">
                                <Button size="sm" className="bg-[#7b2cbf] flex-1 hover:bg-[#9d4edd]" onClick={() => acceptCoach(req)}>Accepter</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {friendRequests.length > 0 && (
                <div>
                    <p className="text-[10px] font-black text-[#00f5d4] uppercase px-2 mb-2 tracking-widest">Demandes d'amis</p>
                    {friendRequests.map(req => (
                        <div key={req.id} className="p-3 bg-[#00f5d4]/10 border border-[#00f5d4]/30 rounded-xl flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <Avatar className="border border-[#00f5d4]/20">
                                    <AvatarImage src={req.fromAvatar}/>
                                    <AvatarFallback className="bg-[#00f5d4] text-black font-black">{req.fromName?.[0] || '?'}</AvatarFallback>
                                </Avatar>
                                <p className="font-bold text-white text-sm">{req.fromName}</p>
                            </div>
                            <Button size="icon" variant="ghost" className="text-green-400 hover:bg-green-400 hover:text-black rounded-full" onClick={() => acceptFriend(req.id)}><Check size={18}/></Button>
                        </div>
                    ))}
                </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* CHAT ZONE */}
      <Card className="kb-card flex-1 flex flex-col bg-[#1a1a20] border-gray-800 overflow-hidden">
        {selectedFriend ? (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center gap-3 bg-black/20">
              <Avatar className="border border-[#00f5d4]/30">
                <AvatarImage src={selectedFriend.avatar} className="object-cover"/>
                <AvatarFallback className="bg-[#7b2cbf] text-white font-black">{selectedFriend.name?.[0] || '?'}</AvatarFallback>
              </Avatar>
              <h3 className="font-black text-white uppercase italic tracking-widest">{selectedFriend.name}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#1a1a20] to-black/40">
              {messages.map((msg) => {
                const isMe = msg.senderId === currentUser.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-3 rounded-2xl ${isMe ? 'bg-[#7b2cbf] text-white rounded-tr-none shadow-[0_5px_15px_rgba(123,44,191,0.2)]' : 'bg-gray-800 text-white rounded-tl-none'}`}>
                      {msg.text && <p className="text-sm">{msg.text}</p>}
                      <p className="text-[8px] opacity-40 text-right mt-1">{msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-800 flex gap-2 bg-black/20">
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Écrire un message..."
                className="bg-black/50 border-gray-700 text-white focus:border-[#00f5d4] h-12 rounded-xl"
              />
              <Button onClick={() => sendMessage()} className="bg-[#00f5d4] text-black h-12 w-12 rounded-xl hover:scale-105 transition-transform"><Send size={20}/></Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 opacity-20 animate-pulse">
            <MessageCircle size={100} className="mb-4"/>
            <p className="font-black italic uppercase tracking-tighter">Messagerie Kaybee</p>
          </div>
        )}
      </Card>
    </div>
  );
}
