import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage, auth } from '@/lib/firebase'; // Assure-toi d'exporter auth depuis ton fichier firebase
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  onSnapshot, orderBy, doc, limit, serverTimestamp, setDoc 
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
  Image as ImageIcon, Paperclip, Loader2, RefreshCw, Smartphone, Facebook
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Messages() {
  const { currentUser } = useAuth();
  
  // États de Navigation & Données
  const [activeTab, setActiveTab] = useState('friends');
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  
  // États Recherche & Amis
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friendList, setFriendList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  
  // États Sync & Médias
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false); // Modal pour demander l'accès contacts
  const [galleryItems, setGalleryItems] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const messagesEndRef = useRef(null);

  // --- 1. GESTION DES AMIS ET REQUÊTES (REALTIME) ---
  useEffect(() => {
    if (!currentUser) return;

    // A. Écouter les demandes d'amis (reçues)
    const qRequests = query(
      collection(db, "friend_requests"),
      where("toId", "==", currentUser.uid),
      where("status", "==", "pending")
    );

    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setFriendRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // B. Écouter la liste d'amis (acceptés)
    const handleFriendsUpdate = async () => {
      // Amis où j'ai envoyé la demande
      const q1 = query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"));
      // Amis où j'ai reçu la demande
      const q2 = query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted"));

      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const friends = [];
      
      snap1.forEach(doc => {
        const d = doc.data();
        friends.push({ uid: d.toId, email: d.toEmail, name: d.toName, avatar: d.toAvatar, chatId: doc.id });
      });
      snap2.forEach(doc => {
        const d = doc.data();
        friends.push({ uid: d.fromId, email: d.fromEmail, name: d.fromName, avatar: d.fromAvatar, chatId: doc.id });
      });

      // Dédoublonnage
      const uniqueFriends = friends.filter((v,i,a)=>a.findIndex(t=>(t.uid===v.uid))===i);
      setFriendList(uniqueFriends);
    };

    handleFriendsUpdate();
    const interval = setInterval(handleFriendsUpdate, 10000); 

    return () => { unsubRequests(); clearInterval(interval); };
  }, [currentUser]);

  // --- 2. GESTION DU CHAT (REALTIME) ---
  useEffect(() => {
    if (!selectedFriend || !currentUser) return;

    const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');
    const qMessages = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => unsubMessages();
  }, [selectedFriend, currentUser]);

  // --- 3. SYNCHRONISATION CONTACTS & FACEBOOK ---

  const processSyncedContacts = async (contactsFound) => {
    // contactsFound = liste d'emails ou téléphones trouvés
    if (contactsFound.length === 0) return 0;

    // 1. Chercher ces utilisateurs dans notre DB
    // Note: Firestore 'in' query est limité à 10 items. On boucle ou on fait autrement pour de grandes listes.
    // Ici on simplifie pour l'exemple avec une boucle.
    let addedCount = 0;
    
    for (const contactIdentifier of contactsFound) {
      // Chercher par email
      const qUser = query(collection(db, "users"), where("email", "==", contactIdentifier));
      const userSnap = await getDocs(qUser);

      if (!userSnap.empty) {
        const targetUser = userSnap.docs[0].data();
        const targetUserId = userSnap.docs[0].id;

        // Vérifier si déjà ami
        if (targetUserId !== currentUser.uid && !friendList.some(f => f.uid === targetUserId)) {
           // AJOUT DIRECT (Auto-Accept)
           await addDoc(collection(db, "friend_requests"), {
             fromId: currentUser.uid,
             fromEmail: currentUser.email,
             fromName: currentUser.displayName || "Moi",
             toId: targetUserId,
             toEmail: targetUser.email,
             toName: targetUser.name || "Ami Contact",
             status: "accepted", // Statut directement accepté
             source: "contact_sync",
             createdAt: serverTimestamp()
           });
           addedCount++;
        }
      }
    }
    return addedCount;
  };

  const syncPhoneContacts = async () => {
    setIsSyncing(true);
    try {
      // Vérifier si l'API Contacts est supportée (Chrome Android, iOS Safari récents)
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const props = ['name', 'email', 'tel'];
        const opts = { multiple: true };
        
        const contacts = await navigator.contacts.select(props, opts);
        
        // Extraire les emails et numéros pour la recherche
        const identifiers = [];
        contacts.forEach(c => {
          if (c.email) c.email.forEach(e => identifiers.push(e));
          // Note: Il faudrait formater les numéros de téléphone ici pour matcher la DB
          // if (c.tel) c.tel.forEach(t => identifiers.push(t)); 
        });

        const count = await processSyncedContacts(identifiers);
        alert(`${count} amis trouvés et ajoutés depuis vos contacts !`);
        
      } else {
        alert("Cette fonctionnalité n'est disponible que sur les appareils mobiles compatibles.");
      }
    } catch (ex) {
      console.error(ex);
      // Gérer le cas où l'utilisateur refuse l'accès
    } finally {
      setIsSyncing(false);
      setIsSyncModalOpen(false);
    }
  };

  const syncFacebookFriends = async () => {
    setIsSyncing(true);
    try {
      const provider = new FacebookAuthProvider();
      // On lie le compte Facebook à l'utilisateur actuel
      await linkWithPopup(auth.currentUser, provider);
      
      // NOTE: L'API Facebook ne donne plus la liste de TOUS les amis depuis 2015.
      // Elle ne donne que les amis QUI UTILISENT AUSSI L'APPLICATION.
      // Dans une vraie implémentation, on appellerait ici notre backend avec le token FB
      // pour récupérer ces IDs et faire le matching.
      
      // Simulation pour l'expérience utilisateur :
      alert("Compte Facebook lié ! Recherche des amis utilisant Kaybee...");
      
      // Ici, on ferait le processSyncedContacts avec les emails des amis FB retournés par l'API Graph.
      // Pour l'instant, on notifie juste le succès de la liaison.
      
    } catch (error) {
      if (error.code === 'auth/credential-already-in-use') {
        alert("Ce compte Facebook est déjà lié à un autre utilisateur.");
      } else {
        console.error("Erreur FB Sync", error);
        alert("Erreur lors de la connexion Facebook.");
      }
    } finally {
      setIsSyncing(false);
      setIsSyncModalOpen(false);
    }
  };

  // --- 4. ACTIONS UTILISATEUR CLASSIQUES ---

  const handleSearch = async () => {
    if (searchTerm.length < 3) return;
    const q = query(
      collection(db, "users"),
      where("email", ">=", searchTerm),
      where("email", "<=", searchTerm + '\uf8ff'),
      limit(5)
    );
    const snap = await getDocs(q);
    const existingFriendIds = friendList.map(f => f.uid);
    setSearchResults(snap.docs
      .map(d => ({uid: d.id, ...d.data()}))
      .filter(u => u.uid !== currentUser.uid && !existingFriendIds.includes(u.uid))
    );
    setActiveTab('search');
  };

  const sendFriendRequest = async (targetUser) => {
    await addDoc(collection(db, "friend_requests"), {
      fromId: currentUser.uid,
      fromEmail: currentUser.email,
      fromName: currentUser.displayName || "Athlète",
      toId: targetUser.uid,
      toEmail: targetUser.email,
      toName: targetUser.name || targetUser.email.split('@')[0],
      status: "pending",
      createdAt: serverTimestamp()
    });
    alert("Demande envoyée !");
    setSearchResults(prev => prev.filter(u => u.uid !== targetUser.uid));
  };

  const acceptRequest = async (requestId) => {
    await updateDoc(doc(db, "friend_requests", requestId), { status: "accepted" });
    alert("Vous êtes maintenant amis ! 🎉");
  };

  const sendMessage = async (txt = messageText, img = null) => {
    if ((!txt.trim() && !img) || !selectedFriend) return;
    const conversationId = [currentUser.uid, selectedFriend.uid].sort().join('_');
    await addDoc(collection(db, "messages"), {
      conversationId,
      senderId: currentUser.uid,
      text: txt,
      mediaUrl: img,
      createdAt: serverTimestamp(),
      read: false
    });
    setMessageText('');
    setIsMediaModalOpen(false);
  };

  // --- 5. GESTION MÉDIAS ---
  
  const loadMyGallery = async () => {
    const q = query(collection(db, "posts"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setGalleryItems(snap.docs.map(d => d.data()));
  };

  const handleDirectUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `chat/${currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      sendMessage("📷 Image envoyée", url);
    } catch (err) {
      console.error(err);
    }
    setIsUploading(false);
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6 pb-6">
      
      {/* SIDEBAR : CONTACTS & RECHERCHE */}
      <Card className="kb-card w-full md:w-96 flex flex-col bg-[#1a1a20] border-gray-800">
        <div className="p-4 border-b border-gray-800">
           <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2">
               <Users className="text-[#9d4edd]"/> Communauté
             </h2>
             {/* BOUTON DE SYNCHRONISATION */}
             <Button variant="ghost" size="icon" onClick={() => setIsSyncModalOpen(true)} className="text-[#00f5d4] hover:bg-[#00f5d4]/20" title="Synchroniser contacts">
               <RefreshCw size={18} />
             </Button>
           </div>
           
           {/* Barre de Recherche Globale */}
           <div className="relative flex gap-2">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
               <Input 
                 placeholder="Chercher un athlète..." 
                 className="pl-10 bg-black/50 border-gray-700 h-10 text-white"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
               />
             </div>
             <Button size="icon" className="bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80" onClick={handleSearch}>
               <Search size={18}/>
             </Button>
           </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="bg-black/20 mx-4 mt-2">
            <TabsTrigger value="friends" className="flex-1">Amis ({friendList.length})</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 relative">
              Demandes
              {friendRequests.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"/>}
            </TabsTrigger>
          </TabsList>

          {/* LISTE D'AMIS */}
          <TabsContent value="friends" className="flex-1 overflow-y-auto p-2 space-y-2">
            {friendList.map(friend => (
              <div 
                key={friend.uid}
                onClick={() => setSelectedFriend(friend)}
                className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${selectedFriend?.uid === friend.uid ? 'bg-[#7b2cbf]/20 border border-[#7b2cbf]' : 'hover:bg-white/5 border border-transparent'}`}
              >
                <Avatar><AvatarFallback>{friend.email[0].toUpperCase()}</AvatarFallback></Avatar>
                <div className="overflow-hidden">
                  <p className="font-bold text-white truncate">{friend.name || friend.email.split('@')[0]}</p>
                  <p className="text-xs text-[#00f5d4]">En ligne</p>
                </div>
              </div>
            ))}
            {friendList.length === 0 && <p className="text-gray-500 text-center text-sm mt-10">Aucun ami pour l'instant.</p>}
          </TabsContent>

          {/* LISTE DES DEMANDES */}
          <TabsContent value="requests" className="flex-1 overflow-y-auto p-2 space-y-2">
            {friendRequests.map(req => (
              <div key={req.id} className="p-3 bg-black/40 rounded-xl border border-gray-700">
                <p className="text-sm text-white mb-2"><span className="font-bold text-[#9d4edd]">{req.fromName}</span> veut vous ajouter.</p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80" onClick={() => acceptRequest(req.id)}>Accepter</Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300">Refuser</Button>
                </div>
              </div>
            ))}
            {friendRequests.length === 0 && <p className="text-gray-500 text-center text-sm mt-10">Aucune demande en attente.</p>}
          </TabsContent>

          {/* RÉSULTATS RECHERCHE */}
          <TabsContent value="search" className="flex-1 overflow-y-auto p-2 space-y-2">
            {searchResults.map(user => (
              <div key={user.uid} className="p-3 bg-black/40 rounded-xl border border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white">{user.email[0]}</div>
                  <div>
                    <p className="text-sm font-bold text-white">{user.name || "Athlète"}</p>
                    <p className="text-[10px] text-gray-400 truncate w-24">{user.email}</p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="text-[#00f5d4] hover:bg-[#00f5d4]/20" onClick={() => sendFriendRequest(user)}>
                  <UserPlus size={18}/>
                </Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </Card>

      {/* ZONE DE CHAT */}
      <Card className="kb-card flex-1 flex flex-col bg-[#1a1a20] border-gray-800 overflow-hidden">
        {selectedFriend ? (
          <>
            {/* Header Chat */}
            <div className="p-4 border-b border-gray-800 flex items-center gap-3 bg-black/20">
              <Avatar className="h-10 w-10 border border-[#00f5d4]">
                <AvatarFallback className="bg-[#7b2cbf] text-white">{selectedFriend.email[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-black text-white">{selectedFriend.name || selectedFriend.email.split('@')[0]}</h3>
                <p className="text-xs text-gray-400">Discussion sécurisée</p>
              </div>
            </div>

            {/* Liste Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#1a1a20] to-black/50">
              {messages.map((msg) => {
                const isMe = msg.senderId === currentUser.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl p-3 ${isMe ? 'bg-[#7b2cbf] text-white rounded-tr-none' : 'bg-gray-800 text-gray-200 rounded-tl-none'}`}>
                      {msg.mediaUrl && (
                        <img src={msg.mediaUrl} alt="attachment" className="rounded-lg mb-2 max-h-60 object-cover border border-white/10" />
                      )}
                      {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                      <p className="text-[10px] opacity-50 mt-1 text-right">
                        {msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Zone */}
            <div className="p-4 bg-black/20 border-t border-gray-800 flex items-end gap-2">
              <div className="flex gap-2">
                 <Button 
                   size="icon" variant="ghost" 
                   className="text-gray-400 hover:text-[#00f5d4]"
                   onClick={() => { setIsMediaModalOpen(true); loadMyGallery(); }}
                 >
                   <ImageIcon size={20} />
                 </Button>
              </div>
              
              <Input 
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Écrivez un message..."
                className="bg-black/50 border-gray-700 rounded-xl text-white"
              />
              
              <Button onClick={() => sendMessage()} className="bg-[#00f5d4] text-black hover:scale-105 transition-transform rounded-xl">
                <Send size={18} />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageCircle size={64} className="mb-4 text-[#7b2cbf] opacity-50"/>
            <p className="text-lg font-bold text-white">Sélectionnez un ami</p>
            <p className="text-sm">Ou synchronisez vos contacts pour retrouver vos proches !</p>
          </div>
        )}
      </Card>

      {/* MODAL SÉLECTION MÉDIA */}
      <Dialog open={isMediaModalOpen} onOpenChange={setIsMediaModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="uppercase font-black text-[#00f5d4]">Partager un média</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="gallery">
            <TabsList className="bg-black w-full mb-4">
              <TabsTrigger value="gallery" className="flex-1">Ma Galerie</TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">Nouvel Upload</TabsTrigger>
            </TabsList>
            
            <TabsContent value="gallery" className="h-64 overflow-y-auto">
               <div className="grid grid-cols-3 gap-2">
                 {galleryItems.map(item => (
                   <div key={item.mediaUrl} className="aspect-square relative group cursor-pointer border border-gray-700 rounded-lg overflow-hidden" onClick={() => sendMessage(item.content, item.mediaUrl)}>
                     <img src={item.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                       <Send className="text-white"/>
                     </div>
                   </div>
                 ))}
                 {galleryItems.length === 0 && <p className="col-span-3 text-center text-gray-500 pt-10">Galerie vide.</p>}
               </div>
            </TabsContent>
            
            <TabsContent value="upload" className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-700 rounded-xl">
               {isUploading ? (
                 <Loader2 className="animate-spin text-[#00f5d4]" size={48} />
               ) : (
                 <>
                   <Paperclip size={48} className="text-gray-500 mb-4"/>
                   <p className="text-gray-400 mb-4">Glissez un fichier ou cliquez</p>
                   <Input type="file" accept="image/*" className="hidden" id="chat-upload" onChange={handleDirectUpload}/>
                   <Button variant="outline" onClick={() => document.getElementById('chat-upload').click()}>Sélectionner</Button>
                 </>
               )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* MODAL SYNCHRONISATION CONTACTS */}
      <Dialog open={isSyncModalOpen} onOpenChange={setIsSyncModalOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-center mb-2">Retrouve ta Team 🤜🤛</DialogTitle>
            <DialogDescription className="text-center text-gray-400">
              Synchronise tes contacts pour ajouter automatiquement tes amis qui utilisent déjà Kaybee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Button 
              onClick={syncPhoneContacts} 
              className="w-full h-14 bg-white text-black font-bold text-lg hover:bg-gray-200 flex items-center justify-center gap-3 rounded-2xl"
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="animate-spin"/> : <Smartphone size={24} />}
              Synchroniser Contacts Téléphone
            </Button>
            
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-800"></div>
              <span className="flex-shrink-0 mx-4 text-gray-600 text-xs uppercase">Ou via réseaux</span>
              <div className="flex-grow border-t border-gray-800"></div>
            </div>

            <Button 
              onClick={syncFacebookFriends}
              className="w-full h-14 bg-[#1877F2] text-white font-bold text-lg hover:bg-[#155db2] flex items-center justify-center gap-3 rounded-2xl"
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="animate-spin"/> : <Facebook size={24} fill="white" />}
              Lier avec Facebook
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}