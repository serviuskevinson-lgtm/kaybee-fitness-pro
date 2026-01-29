import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp
} from 'firebase/firestore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search, Heart, MessageSquare, Share2, MoreVertical, UserPlus, LayoutGrid, Loader2, AlertTriangle, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { sendNotification } from '@/lib/notifications';

/**
 * COMPOSANT : PROFIL UTILISATEUR (Instagram Style)
 */
export const UserProfileModal = ({ userData, onClose, currentUser }) => {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserPosts = async () => {
      if (!userData?.uid && !userData?.id) return;
      const uid = userData.uid || userData.id;
      try {
        const q = query(
          collection(db, "posts"),
          where("userId", "==", uid),
          where("privacy", "==", "Public"),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error("Error fetching user posts:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserPosts();
  }, [userData]);

  const handleAddFriend = async () => {
    try {
      await sendNotification(
        userData.uid || userData.id,
        currentUser.uid,
        currentUser.displayName || "Un utilisateur",
        "Demande d'ami 🤝",
        `${currentUser.displayName || 'Quelqu\'un'} souhaite devenir votre ami sur Kaybee.`,
        "friend_request"
      );
      alert("Demande d'ami envoyée !");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-[#0a0a0f] text-white h-full overflow-y-auto custom-scrollbar p-6">
      <div className="flex flex-col items-center mb-8">
        <Avatar className="w-24 h-24 border-4 border-[#1a1a20] ring-2 ring-[#00f5d4] mb-4">
          <AvatarImage src={userData?.avatar} className="object-cover"/>
          <AvatarFallback className="bg-[#7b2cbf] text-2xl font-black">
            {userData?.full_name ? userData.full_name[0] : (userData?.firstName ? userData.firstName[0] : '?')}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-black uppercase italic tracking-tighter">{userData?.full_name || userData?.username}</h2>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
          {userData?.role === 'coach' ? 'Coach Élite' : 'Athlète Kaybee'}
        </p>

        <div className="flex gap-4 mt-6">
          <div className="text-center">
            <p className="font-black text-white">{posts.length}</p>
            <p className="text-[10px] text-gray-500 uppercase font-bold">Posts</p>
          </div>
          <div className="text-center">
            <p className="font-black text-white">{userData?.points || 0}</p>
            <p className="text-[10px] text-gray-500 uppercase font-bold">Points</p>
          </div>
          <div className="text-center">
            <p className="font-black text-white">{userData?.level || 1}</p>
            <p className="text-[10px] text-gray-500 uppercase font-bold">Niveau</p>
          </div>
        </div>

        {currentUser?.uid !== (userData?.uid || userData?.id) && (
          <div className="flex gap-2 mt-6 w-full max-w-xs">
            <Button onClick={handleAddFriend} className="flex-1 bg-[#00f5d4] text-black font-black uppercase italic h-10 rounded-xl">
              <UserPlus size={16} className="mr-2"/> Suivre
            </Button>
            <Button variant="outline" className="flex-1 border-gray-800 text-white font-black uppercase italic h-10 rounded-xl">
              Message
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 pt-6">
        <p className="text-sm text-gray-300 text-center mb-8 italic">
          {userData?.bio || "Aucune bio disponible."}
        </p>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-1">
            {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-square bg-gray-900 animate-pulse"></div>)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {posts.map(post => (
              <div key={post.id} className="aspect-square bg-gray-900 relative group overflow-hidden cursor-pointer">
                {post.type === 'video' ? (
                  <video src={post.mediaUrl} className="w-full h-full object-cover" />
                ) : (
                  <img src={post.mediaUrl} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <div className="flex items-center text-white font-bold"><Heart size={16} fill="white" className="mr-1"/> {post.likes || 0}</div>
                  <div className="flex items-center text-white font-bold"><MessageSquare size={16} fill="white" className="mr-1"/> {post.comments?.length || 0}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * COMPOSANT : POST CARD (Instagram Style)
 */
const PostCard = ({ post, onUserClick, currentUser }) => {
  const [liked, setLiked] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleReport = async (reason) => {
    try {
      await addDoc(collection(db, "reports"), {
        postId: post.id,
        authorId: post.authorId,
        reporterId: currentUser?.uid,
        reason: reason,
        createdAt: serverTimestamp(),
        status: "pending"
      });
      alert("Signalement envoyé. Notre équipe modérera ce contenu rapidement.");
      setIsReportOpen(false);
    } catch (e) { console.error(e); }
  };

  return (
    <Card className="bg-transparent border-none shadow-none mb-8 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onUserClick(post.authorId)}>
          <Avatar className="w-10 h-10 border border-[#00f5d4]/30">
            <AvatarFallback className="bg-[#7b2cbf] text-white font-black">{post.authorName ? post.authorName[0] : '?'}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-black text-white">{post.authorName}</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
              {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: fr }) : 'Récemment'}
            </p>
          </div>
        </div>

        {/* REPORT ACTION */}
        <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
          <button onClick={() => setIsReportOpen(true)} className="text-gray-600 hover:text-red-500 transition-colors p-2">
            <ShieldAlert size={20} />
          </button>
          <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl p-6">
            <h3 className="text-xl font-black uppercase italic text-red-500 mb-4 flex items-center gap-2">
              <AlertTriangle size={24}/> Signaler ce contenu
            </h3>
            <div className="space-y-3">
              {[
                "Filmage sans consentement",
                "Contenu inapproprié / Nudité",
                "Harcèlement / Intimidation",
                "Informations mensongères",
                "Spam / Publicité abusive"
              ].map(reason => (
                <Button
                  key={reason}
                  variant="outline"
                  className="w-full justify-start border-gray-800 hover:bg-red-500/10 hover:text-red-500 font-bold"
                  onClick={() => handleReport(reason)}
                >
                  {reason}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="aspect-square bg-black rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
        {post.type === 'video' ? (
          <video src={post.mediaUrl} controls className="w-full h-full object-cover" />
        ) : (
          <img src={post.mediaUrl} className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button onClick={() => setLiked(!liked)} className={`${liked ? 'text-red-500' : 'text-white'} transition-colors`}>
              <Heart size={26} fill={liked ? "currentColor" : "none"} />
            </button>
            <button className="text-white">
              <MessageSquare size={26} />
            </button>
            <button className="text-white">
              <Share2 size={26} />
            </button>
          </div>
          <button className="text-white">
            <LayoutGrid size={26} />
          </button>
        </div>

        <p className="text-sm font-black text-white mb-1">{post.likes || 0} j'aime</p>
        <p className="text-sm text-gray-300">
          <span className="font-black mr-2 text-white">{post.authorName}</span>
          {post.caption || "Elite performance state. 🚀"}
        </p>
        <button className="text-xs text-gray-500 font-bold mt-2 uppercase tracking-widest">
          Voir les {post.comments?.length || 0} commentaires
        </button>
      </div>
    </Card>
  );
};

/**
 * COMPOSANT PRINCIPAL : KAYBEE SOCIAL (Sous-vue)
 */
export default function KaybeeSocial({ currentUser }) {
  const [feedPosts, setFeedPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [tickerPosts, setTickerPosts] = useState([]);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const q = query(
          collection(db, "posts"),
          where("privacy", "==", "Public"),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const snapshot = await getDocs(q);
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFeedPosts(posts);
        setTickerPosts(posts.slice(0, 10));
      } catch (e) {
        console.error("Error fetching feed:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFeed();
  }, []);

  const handleSearch = async (val) => {
    setSearchQuery(val);
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const q = query(
        collection(db, "users"),
        where("username", ">=", val.toLowerCase()),
        where("username", "<=", val.toLowerCase() + '\uf8ff'),
        limit(5)
      );
      const snap = await getDocs(q);
      setSearchResults(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  const openUserProfile = async (userId) => {
    try {
      const userDoc = await getDocs(query(collection(db, "users"), where("uid", "==", userId)));
      if (!userDoc.empty) {
        setSelectedUser(userDoc.docs[0].data());
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-black min-h-screen text-white pb-32 pt-4">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-900 p-4 rounded-3xl mb-6">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <h1 className="text-xl font-black italic uppercase tracking-tighter text-[#00f5d4]">Kaybee <span className="text-white">Social</span></h1>
          <div className="relative flex-1 max-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-[#1a1a20] border-none h-9 pl-9 text-xs rounded-full"
            />
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-11 left-0 right-0 bg-[#1a1a20] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden"
                >
                  {searchResults.map(user => (
                    <button
                      key={user.id}
                      onClick={() => { setSelectedUser(user); setSearchResults([]); setSearchQuery(''); }}
                      className="w-full p-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-[#7b2cbf] text-[10px] font-black">{user.username ? user.username[0] : (user.full_name ? user.full_name[0] : '?')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-black text-white">@{user.username || 'user'}</p>
                        <p className="text-[8px] text-gray-500 uppercase font-bold">{user.role}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-900 py-4 mb-8">
        <div className="flex gap-4 px-4 overflow-x-auto no-scrollbar">
          {tickerPosts.map((post) => (
            <motion.div
              key={post.id}
              whileTap={{ scale: 0.9 }}
              className="flex-shrink-0 flex flex-col items-center gap-1 cursor-pointer"
              onClick={() => openUserProfile(post.authorId)}
            >
              <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-[#7b2cbf] via-[#9d4edd] to-[#00f5d4]">
                <div className="w-full h-full rounded-full border-2 border-black overflow-hidden bg-gray-900">
                  <img src={post.mediaUrl} className="w-full h-full object-cover" />
                </div>
              </div>
              <span className="text-[10px] text-gray-400 font-bold truncate w-16 text-center">{post.authorName}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-2">
        {isLoading ? (
          <div className="space-y-12 py-8">
            {[1,2,3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="flex gap-3 mb-4"><div className="w-10 h-10 rounded-full bg-gray-800"></div><div className="h-4 w-32 bg-gray-800 rounded mt-2"></div></div>
                <div className="aspect-square bg-gray-900 rounded-xl"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4">
            {feedPosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onUserClick={openUserProfile}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="bg-transparent border-none p-0 max-w-lg h-[90vh] overflow-hidden rounded-[2.5rem] shadow-2xl">
          {selectedUser && (
            <UserProfileModal
              userData={selectedUser}
              currentUser={currentUser}
              onClose={() => setSelectedUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
