import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutGrid, Settings, UserCheck, Users, Heart, Camera, Loader2, MessageCircle, UserPlus, UserMinus } from 'lucide-react';

// Main component
export default function UserProfile() {
  const { userId } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0, likes: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isMyProfile = currentUser?.uid === userId;

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!userId) return;
      setIsLoading(true);
      try {
        // Fetch user profile
        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists()) {
          navigate('/kaybeesocial');
          return;
        }
        const userData = userDoc.data();
        setProfile({ uid: userDoc.id, ...userData });

        // Check if current user is following this profile
        if (currentUser && !isMyProfile) {
            const followDoc = await getDoc(doc(db, "followers", userId, "userFollowers", currentUser.uid));
            setIsFollowing(followDoc.exists());
        }

        // Fetch followers/following counts
        const followersSnap = await getDocs(collection(db, "followers", userId, "userFollowers"));
        const followingSnap = await getDocs(collection(db, "following", userId, "userFollowing"));

        // Fetch user posts
        const postsQuery = query(
          collection(db, "posts"),
          where("userId", "==", userId),
          where("privacy", "in", ["Public", "Amis"]),
          orderBy("createdAt", "desc")
        );
        const postsSnapshot = await getDocs(postsQuery);
        const userPosts = postsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(userPosts);

        const totalLikes = userPosts.reduce((acc, post) => acc + (post.likes?.length || 0), 0);
        setStats({
            posts: userPosts.length,
            followers: followersSnap.size,
            following: followingSnap.size,
            likes: totalLikes
        });

      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [userId, navigate, currentUser, isMyProfile]);

  const handleFollow = async () => {
    if (!currentUser || isMyProfile || followLoading) return;
    setFollowLoading(true);

    try {
        const followersRef = doc(db, "followers", userId, "userFollowers", currentUser.uid);
        const followingRef = doc(db, "following", currentUser.uid, "userFollowing", userId);

        if (isFollowing) {
            // Unfollow
            await updateDoc(doc(db, "users", userId), { followersCount: (profile.followersCount || 1) - 1 });
            await updateDoc(doc(db, "users", currentUser.uid), { followingCount: (currentUser.followingCount || 1) - 1 });
            // For now using subcollections for easier querying of lists
            const { deleteDoc } = await import('firebase/firestore');
            await deleteDoc(followersRef);
            await deleteDoc(followingRef);
            setIsFollowing(false);
            setStats(prev => ({ ...prev, followers: prev.followers - 1 }));
        } else {
            // Follow
            // Initialize if not exist, or update
            await updateDoc(doc(db, "users", userId), { followersCount: (profile.followersCount || 0) + 1 });
            await updateDoc(doc(db, "users", currentUser.uid), { followingCount: (currentUser.followingCount || 0) + 1 });

            await setDoc(followersRef, { timestamp: serverTimestamp() });
            await setDoc(followingRef, { timestamp: serverTimestamp() });
            setIsFollowing(true);
            setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
        }
    } catch (e) {
        console.error("Error toggling follow:", e);
    } finally {
        setFollowLoading(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen bg-[#0a0a0f]"><Loader2 className="w-12 h-12 text-[#9d4edd] animate-spin" /></div>;
  }

  if (!profile) {
    return <div className="text-center py-20 text-white">Profil non trouvé.</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-12">
          <Avatar className="w-32 h-32 md:w-40 md:h-40 border-4 border-[#7b2cbf] shadow-2xl">
            <AvatarImage src={profile.avatar} className="object-cover" />
            <AvatarFallback className="bg-[#1a1a20] text-5xl font-black text-[#7b2cbf]">
              {profile.full_name?.[0] || profile.username?.[0] || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-4 mb-4">
              <h1 className="text-3xl font-black italic tracking-tighter">{profile.username || 'Athlète'}</h1>
              {isMyProfile ? (
                <Button onClick={() => setIsEditModalOpen(true)} className="bg-white/10 border border-gray-800 hover:bg-white/20 h-9 rounded-lg font-bold text-xs"><Settings size={14} className="mr-2"/> Modifier le Profil</Button>
              ) : (
                <Button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`h-9 rounded-lg font-bold text-xs ${isFollowing ? 'bg-white/10 border border-gray-800 hover:bg-red-500/20 hover:text-red-500' : 'bg-[#7b2cbf] hover:bg-[#9d4edd]'}`}
                >
                    {followLoading ? <Loader2 size={14} className="animate-spin" /> : isFollowing ? <><UserMinus size={14} className="mr-2"/> Se désabonner</> : <><UserPlus size={14} className="mr-2"/> S'abonner</>}
                </Button>
              )}
            </div>

            <div className="flex justify-center md:justify-start gap-8 mb-4">
              <div className="text-center"><p className="font-black text-2xl">{stats.posts}</p><p className="text-xs text-gray-500 uppercase font-bold">Posts</p></div>
              <div className="text-center cursor-pointer hover:opacity-80 transition-opacity"><p className="font-black text-2xl">{stats.followers}</p><p className="text-xs text-gray-500 uppercase font-bold">Abonnés</p></div>
              <div className="text-center cursor-pointer hover:opacity-80 transition-opacity"><p className="font-black text-2xl">{stats.following}</p><p className="text-xs text-gray-500 uppercase font-bold">Abonnements</p></div>
            </div>

            <p className="font-bold text-sm">{profile.full_name}</p>
            <p className="text-gray-400 text-sm whitespace-pre-wrap">{profile.bio || 'Aucune biographie.'}</p>
          </div>
        </header>

        <Tabs defaultValue="grid" className="w-full">
          <TabsList className="grid w-full grid-cols-1 bg-[#1a1a20] border border-gray-800 rounded-2xl p-1 mb-6">
            <TabsTrigger value="grid" className="data-[state=active]:bg-[#7b2cbf]/50 rounded-xl h-10 font-black text-xs uppercase flex items-center gap-2">
              <LayoutGrid size={16} /> Publications
            </TabsTrigger>
          </TabsList>
          <TabsContent value="grid">
            <div className="grid grid-cols-3 gap-1 md:gap-4">
              {posts.map(post => (
                <div key={post.id} className="relative aspect-square bg-[#1a1a20] rounded-xl overflow-hidden group cursor-pointer" onClick={() => navigate(`/gallery?postId=${post.id}`)}>
                  <img src={post.mediaUrl} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" alt="post" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                      <div className="flex items-center gap-1"><Heart size={16}/> {post.likes?.length || 0}</div>
                      <div className="flex items-center gap-1"><MessageCircle size={16}/> {post.comments?.length || 0}</div>
                  </div>
                </div>
              ))}
            </div>
             {posts.length === 0 && <p className="text-center text-gray-600 py-10">Aucune publication.</p>}
          </TabsContent>
        </Tabs>

      </div>

      {isMyProfile && <EditProfileModal isOpen={isEditModalOpen} setIsOpen={setIsEditModalOpen} profile={profile} setProfile={setProfile} />}
    </div>
  );
}

function EditProfileModal({ isOpen, setIsOpen, profile, setProfile }) {
    const [formData, setFormData] = useState({
        full_name: profile.full_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
    });
    const [avatarFile, setAvatarFile] = useState(null);
    const [previewAvatar, setPreviewAvatar] = useState(profile.avatar);
    const [isSaving, setIsSaving] = useState(false);
    const avatarInputRef = useRef(null);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAvatarChange = (e) => {
        if (e.target.files[0]) {
            setAvatarFile(e.target.files[0]);
            setPreviewAvatar(URL.createObjectURL(e.target.files[0]));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let avatarUrl = profile.avatar;
            if (avatarFile) {
                const storageRef = ref(storage, `avatars/${profile.uid}/${avatarFile.name}`);
                await uploadBytes(storageRef, avatarFile);
                avatarUrl = await getDownloadURL(storageRef);
            }

            const userRef = doc(db, "users", profile.uid);
            const updatedData = {
                ...formData,
                avatar: avatarUrl,
            };
            await updateDoc(userRef, updatedData);

            setProfile(prev => ({ ...prev, ...updatedData }));
            setIsOpen(false);
        } catch (error) {
            console.error("Error updating profile:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-md p-6">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black italic">Modifier le profil</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-6">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            <Avatar className="w-24 h-24 border-4 border-[#7b2cbf]">
                                <AvatarImage src={previewAvatar} className="object-cover" />
                                <AvatarFallback>{formData.full_name?.[0]}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1 bg-[#00f5d4] p-2 rounded-full border-2 border-[#1a1a20] cursor-pointer hover:scale-110 transition-transform" onClick={() => avatarInputRef.current.click()}>
                                <Camera size={14} className="text-black" />
                            </div>
                        </div>
                        <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                        <Button variant="ghost" onClick={() => avatarInputRef.current.click()} className="text-[#00f5d4] font-bold text-sm">Changer la photo</Button>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase px-1">Nom Complet</label>
                            <Input name="full_name" value={formData.full_name} onChange={handleChange} placeholder="Nom complet" className="bg-black/40 border-gray-700 h-12 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase px-1">Nom d'utilisateur</label>
                            <Input name="username" value={formData.username} onChange={handleChange} placeholder="Nom d'utilisateur" className="bg-black/40 border-gray-700 h-12 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase px-1">Bio</label>
                            <Textarea name="bio" value={formData.bio} onChange={handleChange} placeholder="Biographie" className="bg-black/40 border-gray-700 rounded-lg min-h-[100px]" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isSaving} className="w-full bg-[#00f5d4] text-black h-12 rounded-lg font-black uppercase shadow-lg shadow-[#00f5d4]/20">
                        {isSaving ? <Loader2 className="animate-spin" /> : 'Enregistrer les modifications'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
