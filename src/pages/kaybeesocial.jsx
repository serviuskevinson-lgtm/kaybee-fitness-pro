import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, orderBy, getDocs, doc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, limit, getDoc, deleteDoc
} from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from "@/components/ui/card";
import { Heart, MessageCircle, Share2, Repeat, Send, Loader2, X, Search, Users, Globe, Smartphone, Copy, Check, Settings, User, Hash, MoreVertical, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const PostCard = ({ post, currentUser, onPostUpdate, onPostDelete }) => {
  const navigate = useNavigate();
  const likesArray = Array.isArray(post.likes) ? post.likes : [];
  const [isLiked, setIsLiked] = useState(likesArray.includes(currentUser?.uid));
  const [likeCount, setLikeCount] = useState(likesArray.length);

  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(Array.isArray(post.comments) ? post.comments : []);
  const [isCommenting, setIsCommenting] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [friendList, setFriendList] = useState([]);
  const [searchFriend, setSearchFriend] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // État pour la modification
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const isOwner = currentUser?.uid === post.userId;

  useEffect(() => {
    if (!isShareModalOpen || !currentUser) return;
    const fetchFriends = async () => {
        try {
            const [s1, s2] = await Promise.all([
                getDocs(query(collection(db, "friend_requests"), where("fromId", "==", currentUser.uid), where("status", "==", "accepted"))),
                getDocs(query(collection(db, "friend_requests"), where("toId", "==", currentUser.uid), where("status", "==", "accepted")))
            ]);
            const contacts = [];
            s1.forEach(d => contacts.push({ uid: d.data().toId, name: d.data().toName, avatar: d.data().toAvatar }));
            s2.forEach(d => contacts.push({ uid: d.data().fromId, name: d.data().fromName, avatar: d.data().fromAvatar }));
            setFriendList([...new Map(contacts.map(item => [item.uid, item])).values()]);
        } catch (e) { console.error(e); }
    };
    fetchFriends();
  }, [isShareModalOpen, currentUser]);

  const handleLike = async () => {
    if (!currentUser) return;
    const postRef = doc(db, "posts", post.id);
    try {
      if (isLiked) {
        await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
        setLikeCount(prev => prev - 1);
      } else {
        await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
        setLikeCount(prev => prev + 1);
      }
      setIsLiked(!isLiked);
    } catch (e) { console.error("Erreur like:", e); }
  };

  const handleComment = async () => {
    if (!currentUser || !comment) return;
    setIsCommenting(true);
    const postRef = doc(db, "posts", post.id);
    const newComment = {
      userId: currentUser.uid,
      authorName: currentUser.displayName || 'Anonyme',
      authorAvatar: currentUser.photoURL,
      text: comment,
      createdAt: new Date().toISOString(),
    };
    try {
      await updateDoc(postRef, { comments: arrayUnion(newComment) });
      setComments(prev => [...prev, newComment]);
      setComment('');
    } catch (e) { console.error("Erreur commentaire:", e); }
    finally { setIsCommenting(false); }
  };

  const handleSaveEdit = async () => {
    setIsSavingEdit(true);
    try {
        const hashtags = editCaption.match(/#\w+/g) || [];
        await updateDoc(doc(db, "posts", post.id), {
            caption: editCaption,
            hashtags: hashtags
        });
        onPostUpdate(post.id, editCaption, hashtags);
        setIsEditModalOpen(false);
    } catch (e) { console.error(e); }
    finally { setIsSavingEdit(false); }
  };

  const handleDeletePost = async () => {
    if (!window.confirm("Supprimer définitivement ce post ?")) return;
    try {
        await deleteDoc(doc(db, "posts", post.id));
        onPostDelete(post.id);
    } catch (e) { console.error(e); }
  };

  const handleRepost = async () => {
    if (!currentUser || !window.confirm("Reposter sur votre profil ?")) return;
    try {
      await addDoc(collection(db, "posts"), {
        userId: currentUser.uid,
        authorId: currentUser.uid,
        authorName: currentUser.displayName || "Moi",
        authorAvatar: currentUser.photoURL || "",
        createdAt: new Date().toISOString(),
        privacy: 'Public',
        category: 'repost',
        originalPost: {
          id: post.id,
          authorName: post.authorName,
          authorAvatar: post.authorAvatar,
          mediaUrl: post.mediaUrl,
          type: post.type,
        },
        likes: [],
        comments: [],
      });
      alert("Reposté avec succès !");
    } catch (e) { console.error("Erreur repost:", e); }
  };

  const shareToFriend = async (friend) => {
    if (isSending) return;
    setIsSending(true);
    const conversationId = [currentUser.uid, friend.uid].sort().join('_');
    const meSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myAvatar = meSnap.data()?.avatar || "";
    try {
        await addDoc(collection(db, "messages"), {
            conversationId,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || "Moi",
            senderAvatar: myAvatar,
            text: `Je te partage ce post de ${post.authorName}`,
            sharedItem: { type: 'social_post', data: { id: post.id, authorName: post.authorName, mediaUrl: post.mediaUrl, type: post.type } },
            createdAt: serverTimestamp(),
            read: false
        });
        alert(`Partagé avec ${friend.name} !`);
        setIsShareModalOpen(false);
    } catch (e) { console.error(e); }
    finally { setIsSending(false); }
  };

  const handleExternalShare = async () => {
    const shareData = { title: 'Kaybee Fitness Pro', text: `Regarde ce post de ${post.authorName} !`, url: window.location.origin + '/gallery?postId=' + post.id };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch (e) { console.error(e); }
  };

  const renderCaption = (text) => {
    if (!text) return null;
    return text.split(/(\s+)/).map((part, i) => {
      if (part.startsWith('#')) return <span key={i} className="text-[#00f5d4] font-bold cursor-pointer hover:underline">{part}</span>;
      return part;
    });
  };

  return (
    <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden shadow-lg mb-6 group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate(`/profile/${post.userId}`)}>
            <Avatar className="w-12 h-12 border-2 border-[#9d4edd] group-hover:scale-105 transition-transform">
              <AvatarImage src={post.authorAvatar} />
              <AvatarFallback className="bg-[#9d4edd] font-black">{post.authorName?.[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold text-white uppercase italic tracking-tighter">{post.authorName}</p>
              <p className="text-[10px] text-gray-400 font-black uppercase">
                {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: fr }) : '...'}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gray-600 hover:text-white rounded-full h-10 w-10"><MoreVertical size={20}/></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#1a1a20] border-gray-800 text-white rounded-xl">
                {isOwner && (
                    <>
                        <DropdownMenuItem onClick={() => setIsEditModalOpen(true)} className="gap-2 cursor-pointer focus:bg-[#7b2cbf]/20 focus:text-white"><Edit2 size={14}/> Modifier</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDeletePost} className="gap-2 cursor-pointer text-red-400 focus:bg-red-500/10 focus:text-red-400"><Trash2 size={14}/> Supprimer</DropdownMenuItem>
                    </>
                )}
                <DropdownMenuItem className="gap-2 cursor-pointer focus:bg-white/5 focus:text-white"><AlertCircle size={14}/> Signaler</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {post.caption && (
          <div className="mb-4 text-sm text-gray-300 leading-relaxed px-1">
            {renderCaption(post.caption)}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden mb-4 border border-gray-800 bg-black/40">
            {post.type === 'video' ? <video src={post.mediaUrl} controls className="w-full max-h-[500px] object-contain" /> : <img src={post.mediaUrl} className="w-full max-h-[500px] object-contain" alt="post" />}
        </div>

        <div className="flex justify-around items-center border-t border-b border-gray-800/50 py-1 mb-2">
          <Button variant="ghost" onClick={handleLike} className={`flex-1 flex flex-col h-auto py-2 gap-1 font-black uppercase text-[10px] ${isLiked ? 'text-red-500' : 'text-gray-500'}`}><Heart fill={isLiked ? 'currentColor' : 'none'} size={18} /> {likeCount}</Button>
          <Button variant="ghost" onClick={() => setShowComments(!showComments)} className="flex-1 flex flex-col h-auto py-2 gap-1 font-black uppercase text-[10px] text-gray-500"><MessageCircle size={18} /> {comments.length}</Button>
          <Button variant="ghost" onClick={() => setIsShareModalOpen(true)} className="flex-1 flex flex-col h-auto py-2 gap-1 font-black uppercase text-[10px] text-gray-500"><Share2 size={18} /> Partager</Button>
          <Button variant="ghost" onClick={handleRepost} className={`flex-1 flex flex-col h-auto py-2 gap-1 font-black uppercase text-[10px] text-gray-500`}><Repeat size={18} /> Reposter</Button>
        </div>

        <AnimatePresence>
          {showComments && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 space-y-4">
              <div className="max-h-60 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {comments.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                      <Avatar className="w-8 h-8 border border-gray-800 cursor-pointer" onClick={() => navigate(`/profile/${c.userId}`)}><AvatarImage src={c.authorAvatar} /><AvatarFallback>{c.authorName?.[0]}</AvatarFallback></Avatar>
                      <div className="bg-black/30 p-3 rounded-2xl w-full border border-white/5">
                          <p className="font-black text-[10px] text-[#9d4edd] uppercase italic">{c.authorName}</p>
                          <p className="text-sm text-gray-300 font-bold leading-tight mt-1">{c.text}</p>
                      </div>
                  </div>
                  ))}
              </div>
              <div className="flex gap-2 bg-black/20 p-2 rounded-2xl border border-gray-800 focus-within:border-[#9d4edd] transition-all">
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Exprime-toi..." className="bg-transparent border-none text-white focus-visible:ring-0 shadow-none h-10 font-bold" onKeyPress={(e) => e.key === 'Enter' && handleComment()} />
                <Button onClick={handleComment} disabled={isCommenting || !comment.trim()} className="h-10 w-10 p-0 rounded-full bg-[#9d4edd] hover:bg-[#7b2cbf] shrink-0">{isCommenting ? <Loader2 className="animate-spin w-5 h-5" /> : <Send size={18} />}</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      {/* MODAL MODIFICATION */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-md p-6 shadow-2xl">
            <DialogHeader><DialogTitle className="text-2xl font-black italic uppercase italic tracking-tighter">Modifier la légende</DialogTitle></DialogHeader>
            <div className="py-4">
                <Textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="bg-black/40 border-gray-800 rounded-2xl min-h-[150px] text-lg focus:border-[#00f5d4] transition-all"
                    placeholder="Écris ta nouvelle légende ici..."
                />
            </div>
            <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setIsEditModalOpen(false)} className="flex-1 uppercase font-black">Annuler</Button>
                <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="flex-1 bg-[#00f5d4] text-black uppercase font-black h-12 rounded-xl">
                    {isSavingEdit ? <Loader2 className="animate-spin" /> : "Enregistrer"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE PARTAGE */}
      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-sm p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="p-6 bg-black/40 border-b border-gray-800"><DialogTitle className="text-xl font-black italic uppercase flex items-center gap-2"><Share2 className="text-[#00f5d4]" /> Partager le post</DialogTitle></DialogHeader>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                    <Button onClick={handleExternalShare} variant="outline" className="h-14 rounded-2xl border-gray-800 bg-white/5 hover:bg-white/10 flex flex-col gap-1">{copied ? <Check className="text-green-500" /> : <Copy className="text-[#00f5d4]" />}<span className="text-[10px] font-black uppercase">{copied ? 'Copié !' : 'Copier lien'}</span></Button>
                    <Button onClick={handleExternalShare} variant="outline" className="h-14 rounded-2xl border-gray-800 bg-white/5 hover:bg-white/10 flex flex-col gap-1"><Smartphone className="text-[#7b2cbf]" /><span className="text-[10px] font-black uppercase">Plus d'options</span></Button>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between"><p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Amis Kaybee</p><div className="relative w-32"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" /><Input value={searchFriend} onChange={(e) => setSearchFriend(e.target.value)} placeholder="Chercher..." className="h-7 bg-black/40 border-gray-800 text-[10px] pl-7 rounded-lg"/></div></div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {friendList.filter(f => f.name.toLowerCase().includes(searchFriend.toLowerCase())).map(friend => (
                            <div key={friend.uid} className="flex items-center justify-between p-3 bg-black/20 rounded-2xl border border-white/5 hover:border-[#00f5d4]/50 transition-all"><div className="flex items-center gap-3"><Avatar className="h-8 w-8 border border-gray-800"><AvatarImage src={friend.avatar}/><AvatarFallback>{friend.name[0]}</AvatarFallback></Avatar><p className="font-bold text-xs text-white uppercase italic truncate w-24">{friend.name}</p></div><Button size="sm" onClick={() => shareToFriend(friend)} disabled={isSending} className="h-8 bg-[#00f5d4] text-black font-black uppercase text-[9px] rounded-lg px-3">Envoyer</Button></div>
                        ))}
                        {friendList.length === 0 && <p className="text-center text-[10px] text-gray-600 italic py-4">Aucun ami trouvé.</p>}
                    </div>
                </div>
            </div>
            <DialogFooter className="p-4 bg-black/20"><Button onClick={() => setIsShareModalOpen(false)} variant="ghost" className="w-full font-black uppercase italic text-xs text-gray-500">Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default function KaybeeSocial() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, "posts"), where("privacy", "in", ["Public", "Amis"]), orderBy("createdAt", "desc"), limit(50));
        const snapshot = await getDocs(q);
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) { console.error("Erreur chargement posts sociaux:", e); }
      finally { setIsLoading(false); }
    };
    const fetchMyProfile = async () => {
        if (!currentUser) return;
        const d = await getDoc(doc(db, "users", currentUser.uid));
        if (d.exists()) setUserProfile(d.data());
    };
    fetchPosts();
    fetchMyProfile();
  }, [currentUser]);

  const handlePostUpdate = (postId, newCaption, newHashtags) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, caption: newCaption, hashtags: newHashtags } : p));
  };

  const handlePostDelete = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const filteredPosts = posts.filter(post => {
    const search = searchQuery.toLowerCase();
    return (
        post.authorName?.toLowerCase().includes(search) ||
        post.caption?.toLowerCase().includes(search) ||
        post.hashtags?.some(h => h.toLowerCase().includes(search))
    );
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4 pb-32">

      {userProfile && (
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-[#1a1a20] border border-gray-800 p-6 rounded-[2.5rem] shadow-2xl flex items-center justify-between mb-8">
            <div className="flex items-center gap-5 cursor-pointer" onClick={() => navigate(`/profile/${currentUser.uid}`)}>
                <div className="relative">
                    <Avatar className="w-16 h-16 border-4 border-[#7b2cbf] shadow-xl">
                        <AvatarImage src={userProfile.avatar} className="object-cover" />
                        <AvatarFallback className="bg-black text-[#7b2cbf] font-black text-xl">{userProfile.full_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-[#00f5d4] p-1.5 rounded-full border-2 border-[#1a1a20]"><User size={12} className="text-black" /></div>
                </div>
                <div>
                    <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">{userProfile.username || userProfile.full_name}</h2>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">Mon Profil Athlète</p>
                </div>
            </div>
            <div className="flex gap-3">
                <div className="text-center px-4 border-r border-gray-800">
                    <p className="text-lg font-black text-[#00f5d4] leading-none">{userProfile.friends?.length || 0}</p>
                    <p className="text-[8px] text-gray-500 font-bold uppercase mt-1">Amis</p>
                </div>
                <Button onClick={() => navigate(`/profile/${currentUser.uid}`)} variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white/5 hover:bg-[#7b2cbf]/20 text-[#7b2cbf]"><Settings size={20} /></Button>
            </div>
        </motion.div>
      )}

      <div className="relative group mb-10">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] rounded-[2rem] blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
          <div className="relative bg-[#0a0a0f] border border-gray-800 rounded-[2rem] flex items-center px-6 h-16 shadow-2xl">
              <Search className="text-gray-500 group-focus-within:text-[#00f5d4] transition-colors" size={24} />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Chercher un athlète, un post ou un #hashtag..."
                className="bg-transparent border-none text-white focus-visible:ring-0 shadow-none text-lg font-bold placeholder:text-gray-700"
              />
              {searchQuery && <X className="text-gray-500 cursor-pointer hover:text-white" onClick={() => setSearchQuery('')} size={20} />}
          </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-12 h-12 text-[#9d4edd] animate-spin" />
            <p className="text-[10px] font-black text-gray-500 uppercase animate-pulse">Chargement du flux social...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
          <div className="text-center py-20 bg-[#1a1a20]/40 rounded-[3rem] border border-dashed border-gray-800">
              <Globe className="mx-auto text-gray-700 w-16 h-16 mb-4 opacity-20" />
              <p className="text-gray-500 font-black uppercase italic tracking-widest text-lg">{searchQuery ? "Aucun résultat trouvé" : "Le fil est vide"}</p>
              <p className="text-xs text-gray-600 mt-2 font-bold italic">Essayez une autre recherche ou publiez un post !</p>
          </div>
      ) : (
        <div className="space-y-8">
            {filteredPosts.map(post => (
                <PostCard
                    key={post.id}
                    post={post}
                    currentUser={currentUser}
                    onPostUpdate={handlePostUpdate}
                    onPostDelete={handlePostDelete}
                />
            ))}
        </div>
      )}
    </div>
  );
}
