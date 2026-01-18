import React, { useState, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import { 
  doc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  MapPin, Star, Grid, Play, Image as ImageIcon, Edit3, Upload, 
  Check, Plus, Globe, Instagram, LayoutGrid 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function CoachProfile({ coachData, isOwner }) {
  const [profile, setProfile] = useState(coachData || {});
  const [posts, setPosts] = useState([]);
  const [privateGallery, setPrivateGallery] = useState([]);
  
  // États d'édition
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState(profile.bio || "");
  const [editSpecialties, setEditSpecialties] = useState(profile.specialties?.join(', ') || "");
  
  // États Upload
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // --- CHARGEMENT DES POSTS PUBLICS (SHOWCASE) ---
  useEffect(() => {
    const fetchPublicPosts = async () => {
      if (!profile.id) return;
      try {
        const q = query(
          collection(db, "posts"),
          where("userId", "==", profile.id),
          where("privacy", "==", "Public"), // Uniquement ce qui est public
          where("isProfileShowcase", "==", true), // Flag spécial pour le profil coach
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error("Erreur chargement posts profil", e);
      }
    };
    fetchPublicPosts();
  }, [profile.id]);

  // --- CHARGEMENT GALERIE PRIVÉE (Pour import) ---
  const fetchPrivateGallery = async () => {
    if (!profile.id) return;
    const q = query(
      collection(db, "posts"),
      where("userId", "==", profile.id),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    // On exclut ceux qui sont déjà sur le profil
    setPrivateGallery(snapshot.docs.map(d => ({id: d.id, ...d.data()})).filter(p => !p.isProfileShowcase));
  };

  // --- ACTIONS : ÉDITION PROFIL ---
  const handleSaveProfile = async () => {
    try {
      const userRef = doc(db, "users", profile.id);
      const updates = {
        bio: editBio,
        specialties: editSpecialties.split(',').map(s => s.trim())
      };
      await updateDoc(userRef, updates);
      setProfile({ ...profile, ...updates });
      setIsEditing(false);
    } catch (e) {
      console.error("Erreur update profil", e);
    }
  };

  // --- ACTIONS : UPLOAD DIRECT ---
  const handleDirectUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `showcase/${profile.id}/${Date.now()}_${uploadFile.name}`);
      await uploadBytes(storageRef, uploadFile);
      const url = await getDownloadURL(storageRef);

      const newPost = {
        userId: profile.id,
        authorName: profile.full_name || "Coach",
        mediaUrl: url,
        type: uploadFile.type.startsWith('video') ? 'video' : 'image',
        caption: caption,
        privacy: "Public",
        isProfileShowcase: true, // IMPORTANT
        createdAt: new Date().toISOString(),
        likes: 0
      };

      const docRef = await addDoc(collection(db, "posts"), newPost);
      setPosts([ { id: docRef.id, ...newPost }, ...posts ]);
      setIsUploadOpen(false);
      setUploadFile(null);
      setCaption("");
    } catch (e) {
      console.error(e);
    }
    setIsUploading(false);
  };

  // --- ACTIONS : IMPORT DEPUIS GALERIE ---
  const handleImportFromGallery = async (post) => {
    try {
      // On met à jour le post existant pour le rendre public et l'afficher sur le profil
      const postRef = doc(db, "posts", post.id);
      await updateDoc(postRef, {
        privacy: "Public",
        isProfileShowcase: true,
        caption: caption || post.caption // Met à jour la légende si nouvelle fournie
      });
      
      setPosts([ { ...post, privacy: "Public", isProfileShowcase: true, caption: caption || post.caption }, ...posts ]);
      setIsUploadOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-[#0a0a0f] min-h-screen text-white">
      
      {/* --- HEADER PROFIL (STYLE INSTAGRAM) --- */}
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          
          {/* Avatar */}
          <div className="relative group">
            <Avatar className="w-32 h-32 md:w-40 md:h-40 border-4 border-[#1a1a20] ring-2 ring-[#00f5d4]">
              <AvatarImage src={profile.avatar} className="object-cover" />
              <AvatarFallback className="bg-[#7b2cbf] text-3xl font-black">
                {profile.full_name?.[0]}
              </AvatarFallback>
            </Avatar>
            {isOwner && (
                <div className="absolute bottom-0 right-0 bg-[#00f5d4] text-black p-2 rounded-full cursor-pointer hover:scale-110 transition">
                    <Plus size={20} />
                </div>
            )}
          </div>

          {/* Infos */}
          <div className="flex-1 text-center md:text-left space-y-4">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <h1 className="text-2xl md:text-3xl font-black italic uppercase">{profile.full_name || "Nom du Coach"}</h1>
              {isOwner ? (
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)} className="border-gray-700 h-8">
                        {isEditing ? "Annuler" : "Modifier Profil"}
                    </Button>
                    <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80 h-8" onClick={() => fetchPrivateGallery()}>
                                <Upload size={14} className="mr-2"/> Ajouter Contenu
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                            <DialogHeader><DialogTitle>Ajouter au Profil Public</DialogTitle></DialogHeader>
                            <Tabs defaultValue="upload">
                                <TabsList className="bg-black w-full">
                                    <TabsTrigger value="upload" className="flex-1">Nouveau Fichier</TabsTrigger>
                                    <TabsTrigger value="gallery" className="flex-1">Depuis Galerie</TabsTrigger>
                                </TabsList>
                                
                                {/* TAB 1: UPLOAD */}
                                <TabsContent value="upload" className="space-y-4 py-4">
                                    <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-[#00f5d4] relative">
                                        <input type="file" className="absolute inset-0 opacity-0" onChange={(e) => setUploadFile(e.target.files[0])} />
                                        <Upload className="mx-auto mb-2 text-gray-500"/>
                                        <p className="text-sm">{uploadFile ? uploadFile.name : "Glisser photo ou vidéo"}</p>
                                    </div>
                                    <Input placeholder="Écrire une légende..." value={caption} onChange={(e) => setCaption(e.target.value)} className="bg-black border-gray-700"/>
                                    <Button onClick={handleDirectUpload} disabled={!uploadFile || isUploading} className="w-full bg-[#00f5d4] text-black">
                                        {isUploading ? "Envoi..." : "Publier"}
                                    </Button>
                                </TabsContent>

                                {/* TAB 2: GALERIE */}
                                <TabsContent value="gallery" className="space-y-4 py-4">
                                    <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                                        {privateGallery.map(media => (
                                            <div key={media.id} onClick={() => handleImportFromGallery(media)} className="aspect-square bg-gray-800 rounded overflow-hidden cursor-pointer hover:opacity-80 border border-transparent hover:border-[#00f5d4]">
                                                {media.type === 'video' ? <video src={media.mediaUrl} className="w-full h-full object-cover"/> : <img src={media.mediaUrl} className="w-full h-full object-cover"/>}
                                            </div>
                                        ))}
                                        {privateGallery.length === 0 && <p className="col-span-3 text-center text-sm text-gray-500">Aucun média privé disponible.</p>}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </DialogContent>
                    </Dialog>
                </div>
              ) : (
                <div className="flex gap-2">
                    <Button className="bg-[#00f5d4] text-black font-bold h-8">Engager</Button>
                    <Button variant="outline" className="border-gray-700 h-8">Message</Button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex justify-center md:justify-start gap-6 text-sm">
                <div><span className="font-bold text-white">{posts.length}</span> <span className="text-gray-500">posts</span></div>
                <div><span className="font-bold text-white">4.9</span> <span className="text-gray-500">note</span></div>
                <div><span className="font-bold text-white">{profile.priceStart || "Sur devis"}</span> <span className="text-gray-500">tarif</span></div>
            </div>

            {/* Bio */}
            <div className="max-w-lg">
                {isEditing ? (
                    <div className="space-y-2">
                        <Textarea 
                            value={editBio} 
                            onChange={(e) => setEditBio(e.target.value)} 
                            className="bg-black/50 border-gray-700 text-white min-h-[100px]"
                            placeholder="Votre biographie..."
                        />
                        <Input 
                            value={editSpecialties} 
                            onChange={(e) => setEditSpecialties(e.target.value)} 
                            className="bg-black/50 border-gray-700" 
                            placeholder="Spécialités (séparées par virgules)"
                        />
                        <Button onClick={handleSaveProfile} className="bg-white text-black w-full h-8">Enregistrer</Button>
                    </div>
                ) : (
                    <>
                        <p className="text-white font-medium">{profile.bio || "Aucune biographie."}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {profile.specialties?.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="bg-[#7b2cbf]/20 text-[#9d4edd] text-[10px] hover:bg-[#7b2cbf]/30">
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    </>
                )}
            </div>
          </div>
        </div>

        {/* Liens Rapides */}
        {!isOwner && profile.isExternal && (
            <div className="mt-6 flex gap-4">
                {profile.googleLink && <a href={profile.googleLink} target="_blank" className="text-xs text-[#00f5d4] flex items-center gap-1"><MapPin size={12}/> Voir Adresse</a>}
                {profile.instagramLink && <a href={profile.instagramLink} target="_blank" className="text-xs text-[#E1306C] flex items-center gap-1"><Instagram size={12}/> Instagram</a>}
            </div>
        )}
      </div>

      {/* --- GRILLE DE CONTENU (WORKOUTS) --- */}
      <div className="border-t border-gray-800 mt-4">
        <div className="max-w-4xl mx-auto">
            
            {/* Tabs Navigation (Posts / Programmes) */}
            <div className="flex justify-center gap-8 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-900">
                <div className="flex items-center gap-2 text-white cursor-pointer"><LayoutGrid size={14}/> Workouts</div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-white transition"><Play size={14}/> Vidéos</div>
            </div>

            {/* Grille */}
            {posts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1 md:gap-4 p-1 md:p-4">
                    {posts.map((post) => (
                        <Dialog key={post.id}>
                            <DialogTrigger asChild>
                                <div className="aspect-square relative group cursor-pointer bg-gray-900 overflow-hidden">
                                    {post.type === 'video' ? (
                                        <video src={post.mediaUrl} className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={post.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
                                    )}
                                    {/* Overlay Hover */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        {post.type === 'video' && <Play className="text-white fill-white" size={32}/>}
                                    </div>
                                </div>
                            </DialogTrigger>
                            <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-4xl p-0 overflow-hidden flex flex-col md:flex-row h-[80vh] md:h-[600px]">
                                <div className="flex-1 bg-black flex items-center justify-center">
                                    {post.type === 'video' ? <video src={post.mediaUrl} controls className="max-h-full max-w-full"/> : <img src={post.mediaUrl} className="max-h-full max-w-full object-contain"/>}
                                </div>
                                <div className="w-full md:w-80 p-6 bg-[#1a1a20] flex flex-col">
                                    <div className="flex items-center gap-3 mb-4">
                                        <Avatar className="w-8 h-8"><AvatarImage src={profile.avatar}/><AvatarFallback>C</AvatarFallback></Avatar>
                                        <span className="font-bold text-sm">{profile.full_name}</span>
                                    </div>
                                    <p className="text-sm text-gray-300 flex-1">{post.caption || "Pas de description."}</p>
                                    <div className="pt-4 border-t border-gray-800 text-xs text-gray-500">
                                        {new Date(post.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    ))}
                </div>
            ) : (
                <div className="py-20 text-center">
                    <div className="w-16 h-16 rounded-full border-2 border-white text-white flex items-center justify-center mx-auto mb-4">
                        <ImageIcon size={32}/>
                    </div>
                    <h3 className="text-2xl font-black uppercase italic">Aucun Workout</h3>
                    <p className="text-gray-500 mt-2">Ce coach n'a pas encore publié de contenu.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}