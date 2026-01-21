import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage, auth } from '@/lib/firebase'; 
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, limit, serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { linkWithPopup, FacebookAuthProvider } from 'firebase/auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Send, Search, UserPlus, Users, MessageCircle, 
  Image as ImageIcon, Paperclip, Loader2, RefreshCw, Smartphone, Facebook, Briefcase
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';

export default function Messages() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  
  // États
  const [activeTab, setActiveTab] = useState('friends');
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friendList, setFriendList] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]); // Reçues
  const [friendRequests, setFriendRequests] = useState([]);
  const [coachRequests, setCoachRequests] = useState([]);
  
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const messagesEndRef = useRef(null);

  // --- 1. RECHERCHE LIVE (TYPE-AHEAD) ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length >= 2) {
        // Recherche combinée Nom + Email
        const qName = query(
            collection(db, "users"), 
            where("full_name", ">=", searchTerm), 
            where("full_name", "<=", searchTerm + '\uf8ff'), 
            limit(5)
        );
        const qEmail = query(
            collection(db, "users"), 
            where("email", ">=", searchTerm), 
            where("email", "<=", searchTerm + '\uf8ff'), 
            limit(5)
        );

        const [snapName, snapEmail] = await Promise.all([getDocs(qName), getDocs(qEmail)]);
        const results = [];
        snapName.forEach(d => results.push({uid: d.id, ...d.data()}));
        snapEmail.forEach(d => results.push({uid: d.id, ...d.data()}));

        // Dédoublonnage et retirer soi-même
        const unique = results
            .filter((v,i,a)=>a.findIndex(t=>(t.uid===v.uid))===i)
            .filter(u => u.uid !== currentUser.uid);

        setSearchResults(unique);
        if(activeTab !== 'search') setActiveTab('search');
      }
    }, 300); // Délai de 300ms

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, currentUser]);


  // --- 2. GESTION REALTIME AMIS/REQUETES ---
  useEffect(() => {
    if (!currentUser) return;

    // A. Demandes d'amis
    const qRequests = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "pending"));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setFriendRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // B. Envoyées (Amis - Pour gérer le Pending/Annuler)
    const qSent = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "pending"));
    const unsubSent = onSnapshot(qSent, (snapshot) => {
      setSentRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // B. Requêtes de Coaching
    const qCoachReqs = query(
        collection(db, "notifications"), 
        where("recipientId", "==", currentUser.uid), 
        where("type", "==", "coach_request"), 
        where("status", "==", "unread")
    );
    const unsubCoachRequests = onSnapshot(qCoachReqs, (snapshot) => {
       setCoachRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // C. Liste d'amis (Acceptés) + Clients
    const handleFriendsUpdate = async () => {
      const q1 = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"));
      const q2 = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"));
      const qClients = query(collection(db, "users"), where("coachId", "==", currentUser.uid));

      const [snap1, snap2, snapClients] = await Promise.all([getDocs(q1), getDocs(q2), getDocs(qClients)]);
      const friends = [];
      
      snap1.forEach(d => friends.push({ uid: d.data().toId, email: d.data().toEmail, name: d.data().toName, type: 'friend' }));
      snap2.forEach(d => friends.push({ uid: d.data().fromId, email: d.data().fromEmail, name: d.data().fromName, type: 'friend' }));
      snapClients.forEach(d => friends.push({ uid: d.id, email: d.data().email, name: d.data().full_name || d.data().firstName, type: 'client' }));

      const unique = friends.filter((v,i,a)=>a.findIndex(t=>(t.uid===v.uid))===i);
      setFriendList(unique);
    };

    handleFriendsUpdate();
    const interval = setInterval(handleFriendsUpdate, 10000); 

    return () => { unsubRequests(); unsubCoachRequests(); clearInterval(interval); };
  }, [currentUser]);

  // --- 3. GESTION DU CHAT ---
  useEffect(() => {
    if (!selectedFriend || !currentUser) return;
    
    // ID unique deterministe
    const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');
    
    const qMessages = query(
        collection(db, "messages"), 
        where("conversationId", "==", conversationId), 
        orderBy("createdAt", "asc")
    );

    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => unsubMessages();
  }, [selectedFriend, currentUser]);

  // --- ACTIONS ---

  const sendMessage = async (txt = messageText, img = null) => {
    if ((!txt.trim() && !img) || !selectedFriend || !currentUser) return;
    
    try {
        const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');
        
        await addDoc(collection(db, "messages"), {
          conversationId, 
          senderId: currentUser.uid, 
          senderName: currentUser.displayName || "Moi",
          text: txt, 
          mediaUrl: img, 
          createdAt: serverTimestamp(), 
          read: false
        });

        await sendNotification(
            selectedFriend.uid, 
            currentUser.uid, 
            currentUser.displayName || "Ami", 
            "Nouveau Message 💬", 
            txt ? `Message: ${txt.substring(0, 30)}...` : "Photo reçue 📷", 
            "message"
        );
        
        setMessageText(''); 
        setIsMediaModalOpen(false);
    } catch (e) {
        console.error("Erreur envoi message:", e);
    }
  };

const setFriendRequest = async (targetUser) => {
    // Vérif Anti-Spam
    const alreadySent = sentRequests.some(req => req.toId === targetUser.uid);
    if (alreadySent) return alert("Demande déjà en attente !");

    await addDoc(collection(db, "friend_requests"), {
      fromId: currentUser.uid, fromEmail: currentUser.email, fromName: currentUser.displayName || "Athlète",
      toId: targetUser.uid, toEmail: targetUser.email, toName: targetUser.full_name || targetUser.name,
      status: "pending", createdAt: serverTimestamp()
    });
    
    await sendNotification(targetUser.uid, currentUser.uid, currentUser.displayName || "Athlète", "Demande d'ami 👋", "Veut t'ajouter en ami.", "friend_request");
    alert(t('request_sent'));
  };

  const acceptFriendRequest = async (requestId) => {
    await updateDoc(doc(db, "friend_requests", requestId), { status: "accepted" });
    alert(t('now_friends'));
  };

  const acceptCoachRequest = async (request) => {
      try {
          await updateDoc(doc(db, "users", request.senderId), {
              coachId: currentUser.uid,
              coachName: currentUser.displayName || "Coach",
              joinedCoachAt: new Date().toISOString()
          });
          await updateDoc(doc(db, "notifications", request.id), { status: "accepted" });
          setSelectedFriend({ uid: request.senderId, name: request.senderName, email: "Client", type: 'client' });
          alert(t('client_added'));
      } catch (e) { console.error(e); }
  };

  const rejectRequest = async (collectionName, id) => {
      await updateDoc(doc(db, collectionName, id), { status: "rejected" });
  };

  const sendFriendRequest = async (targetUser) => {
    await addDoc(collection(db, "friend_requests"), {
      fromId: currentUser.uid, fromEmail: currentUser.email, fromName: currentUser.displayName || "Utilisateur",
      toId: targetUser.uid, toEmail: targetUser.email, toName: targetUser.name || targetUser.full_name,
      status: "pending", createdAt: serverTimestamp()
    });
    alert(t('request_sent'));
  };

  const handleDirectUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const refS = ref(storage, `chat/${currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(refS, file);
      const url = await getDownloadURL(refS);
      sendMessage("Image", url);
    } catch (err) { console.error(err); }
    setIsUploading(false);
  };

  // Sync Dummy Functions
  const syncPhoneContacts = () => alert("Fonctionnalité mobile requise");
  const syncFacebookFriends = () => alert("API Facebook requise");

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6 pb-6">
      
      {/* SIDEBAR */}
      <Card className="kb-card w-full md:w-96 flex flex-col bg-[#1a1a20] border-gray-800">
        <div className="p-4 border-b border-gray-800">
           <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2">
               <Users className="text-[#9d4edd]"/> {t('community')}
             </h2>
             <Button variant="ghost" size="icon" onClick={() => setIsSyncModalOpen(true)} className="text-[#00f5d4]">
               <RefreshCw size={18} />
             </Button>
           </div>
           {/* RECHERCHE LIVE */}
           <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
               <Input 
                 placeholder={t('search_athlete')} 
                 className="pl-10 bg-black/50 border-gray-700 h-10 text-white focus:border-[#00f5d4]" 
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
              {(friendRequests.length + coachRequests.length) > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"/>}
            </TabsTrigger>
            <TabsTrigger value="search" className="hidden">Search</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="flex-1 overflow-y-auto p-2 space-y-2">
            {friendList.map(friend => (
              <div key={friend.uid} onClick={() => setSelectedFriend(friend)} className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${selectedFriend?.uid === friend.uid ? 'bg-[#7b2cbf]/20 border border-[#7b2cbf]' : 'hover:bg-white/5 border border-transparent'}`}>
                <Avatar><AvatarFallback>{friend.email?.[0]}</AvatarFallback></Avatar>
                <div className="overflow-hidden">
                  <p className="font-bold text-white truncate flex items-center gap-2">
                      {friend.name}
                      {friend.type === 'client' && <span className="text-[9px] px-1 bg-[#7b2cbf] rounded text-white">Client</span>}
                  </p>
                  <p className="text-xs text-[#00f5d4]">En ligne</p>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="requests" className="flex-1 overflow-y-auto p-2 space-y-4">
            {/* Requêtes Coach */}
            {coachRequests.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-[#7b2cbf] uppercase mb-2 px-2">Clients Potentiels</p>
                    {coachRequests.map(req => (
                        <div key={req.id} className="p-3 bg-black/40 rounded-xl border border-[#7b2cbf] mb-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Briefcase size={16} className="text-[#7b2cbf]"/>
                                <p className="text-sm text-white"><span className="font-bold">{req.senderName}</span> veut vous engager.</p>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" className="flex-1 bg-[#7b2cbf] text-white" onClick={() => acceptCoachRequest(req)}>{t('accept')}</Button>
                                <Button size="sm" variant="ghost" className="text-red-400" onClick={() => rejectRequest("notifications", req.id)}>{t('refuse')}</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Requêtes Amis */}
            {friendRequests.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-white uppercase mb-2 px-2">Amis</p>
                    {friendRequests.map(req => (
                        <div key={req.id} className="p-3 bg-black/40 rounded-xl border border-gray-700 mb-2">
                            <p className="text-sm text-white mb-2"><span className="font-bold text-[#9d4edd]">{req.fromName}</span> veut être ami.</p>
                            <div className="flex gap-2">
                                <Button size="sm" className="flex-1 bg-[#00f5d4] text-black" onClick={() => acceptFriendRequest(req.id)}>{t('accept')}</Button>
                                <Button size="sm" variant="ghost" className="text-red-400" onClick={() => rejectRequest("friend_requests", req.id)}>{t('refuse')}</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {friendRequests.length === 0 && coachRequests.length === 0 && <p className="text-gray-500 text-center text-sm mt-10">{t('no_requests')}</p>}
          </TabsContent>

          <TabsContent value="search" className="flex-1 overflow-y-auto p-2 space-y-2">
            {searchResults.length > 0 ? searchResults.map(user => (
              <div key={user.uid} className="p-3 bg-black/40 rounded-xl border border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white">{user.email?.[0]}</div>
                  <div><p className="text-sm font-bold text-white">{user.full_name || user.name || "Athlète"}</p></div>
                </div>
                <Button size="icon" variant="ghost" className="text-[#00f5d4]" onClick={() => sendFriendRequest(user)}><UserPlus size={18}/></Button>
              </div>
            )) : (
                <p className="text-gray-500 text-center text-sm mt-4">Aucun résultat trouvé.</p>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* ZONE DE CHAT */}
      <Card className="kb-card flex-1 flex flex-col bg-[#1a1a20] border-gray-800 overflow-hidden">
        {selectedFriend ? (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center gap-3 bg-black/20">
              <Avatar className="h-10 w-10 border border-[#00f5d4]"><AvatarFallback className="bg-[#7b2cbf] text-white">{selectedFriend.email?.[0]}</AvatarFallback></Avatar>
              <div><h3 className="font-black text-white">{selectedFriend.name || "Athlète"}</h3><p className="text-xs text-gray-400">Discussion</p></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#1a1a20] to-black/50">
              {messages.map((msg) => {
                const isMe = msg.senderId === currentUser.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl p-3 ${isMe ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-200'}`}>
                      {msg.mediaUrl && <img src={msg.mediaUrl} className="rounded-lg mb-2 max-h-60 object-cover border border-white/10" />}
                      {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                      <p className="text-[10px] opacity-50 mt-1 text-right">{msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 bg-black/20 border-t border-gray-800 flex items-end gap-2">
              <Button size="icon" variant="ghost" className="text-gray-400 hover:text-[#00f5d4]" onClick={() => setIsMediaModalOpen(true)}><ImageIcon size={20} /></Button>
              <Input value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={t('type_message')} className="bg-black/50 border-gray-700 rounded-xl text-white"/>
              <Button onClick={() => sendMessage()} className="bg-[#00f5d4] text-black hover:scale-105 transition-transform rounded-xl"><Send size={18} /></Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageCircle size={64} className="mb-4 text-[#7b2cbf] opacity-50"/>
            <p className="text-lg font-bold text-white">{t('select_friend')}</p>
          </div>
        )}
      </Card>

      {/* MODAL SÉLECTION MÉDIA */}
      <Dialog open={isMediaModalOpen} onOpenChange={setIsMediaModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white max-w-2xl">
          <DialogHeader><DialogTitle className="uppercase font-black text-[#00f5d4]">{t('share_media')}</DialogTitle></DialogHeader>
          <div className="h-64 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center">
             {isUploading ? <Loader2 className="animate-spin text-[#00f5d4]" size={48} /> : (
                 <>
                   <Paperclip size={48} className="text-gray-500 mb-4"/>
                   <Input type="file" accept="image/*" className="hidden" id="chat-upload" onChange={handleDirectUpload}/>
                   <Button variant="outline" onClick={() => document.getElementById('chat-upload').click()}>{t('choose_file')}</Button>
                 </>
             )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL SYNC */}
      <Dialog open={isSyncModalOpen} onOpenChange={setIsSyncModalOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-center mb-2">Retrouve ta Team 🤜🤛</DialogTitle>
            <DialogDescription className="text-center text-gray-400">
              Synchronise tes contacts pour ajouter automatiquement tes amis qui utilisent déjà Kaybee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Button onClick={syncPhoneContacts} className="w-full h-14 bg-white text-black font-bold text-lg hover:bg-gray-200 flex items-center justify-center gap-3 rounded-2xl" disabled={isSyncing}>
              {isSyncing ? <Loader2 className="animate-spin"/> : <Smartphone size={24} />}
              Synchroniser Contacts Téléphone
            </Button>
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-800"></div><span className="flex-shrink-0 mx-4 text-gray-600 text-xs uppercase">Ou via réseaux</span><div className="flex-grow border-t border-gray-800"></div>
            </div>
            <Button onClick={syncFacebookFriends} className="w-full h-14 bg-[#1877F2] text-white font-bold text-lg hover:bg-[#155db2] flex items-center justify-center gap-3 rounded-2xl" disabled={isSyncing}>
              {isSyncing ? <Loader2 className="animate-spin"/> : <Facebook size={24} fill="white" />}
              Lier avec Facebook
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}