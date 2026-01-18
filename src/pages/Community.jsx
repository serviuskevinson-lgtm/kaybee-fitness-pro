import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, updateDoc, addDoc, orderBy 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  MapPin, Search, Star, Globe, Loader2, CheckCircle, ExternalLink, 
  Sparkles, Handshake, LayoutGrid, Play, Image as ImageIcon, Upload, Plus, MessageSquare
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next'; 

// --- CONFIGURATION API ---
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const SPORTS_LIST = [
  "Musculation", "CrossFit", "Yoga", "Pilates", "Boxe", "MMA",
  "Running", "Powerlifting", "Calisthenics", "Perte de poids", "Réhabilitation"
];

// --- SOUS-COMPOSANT : PROFIL COACH ---
const CoachProfile = ({ coachData, isOwner, onHire }) => {
  const { t } = useTranslation(); 
  const [profile, setProfile] = useState(coachData || {});
  const [posts, setPosts] = useState([]);
  const [privateGallery, setPrivateGallery] = useState([]);
  
  // États d'édition
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState(profile.bio || "");
  const [editSpecialties, setEditSpecialties] = useState(profile.specialties?.join(', ') || "");
  const [editPrice, setEditPrice] = useState(profile.priceStart || "");

  // États Upload
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // --- CHARGEMENT DES POSTS PUBLICS ---
  useEffect(() => {
    const fetchPublicPosts = async () => {
      if (!profile.id) return;
      try {
        const q = query(
          collection(db, "posts"),
          where("userId", "==", profile.id),
          where("isProfileShowcase", "==", true),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.log("Chargement posts standard...");
      }
    };
    fetchPublicPosts();
  }, [profile.id]);

  // --- CHARGEMENT GALERIE PRIVÉE ---
  const fetchPrivateGallery = async () => {
    if (!profile.id) return;
    const q = query(collection(db, "posts"), where("userId", "==", profile.id), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    setPrivateGallery(snapshot.docs.map(d => ({id: d.id, ...d.data()})).filter(p => !p.isProfileShowcase));
  };

  // --- ACTIONS ---
  const handleSaveProfile = async () => {
    try {
      const userRef = doc(db, "users", profile.id);
      const updates = {
        bio: editBio,
        priceStart: parseInt(editPrice),
        specialties: editSpecialties.split(',').map(s => s.trim())
      };
      await updateDoc(userRef, updates);
      setProfile({ ...profile, ...updates });
      setIsEditing(false);
    } catch (e) { console.error(e); }
  };

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
        isProfileShowcase: true,
        createdAt: new Date().toISOString(),
        likes: 0
      };

      const docRef = await addDoc(collection(db, "posts"), newPost);
      setPosts([ { id: docRef.id, ...newPost }, ...posts ]);
      setIsUploadOpen(false);
      setUploadFile(null);
      setCaption("");
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };

  const handleImportFromGallery = async (post) => {
    try {
      const postRef = doc(db, "posts", post.id);
      await updateDoc(postRef, {
        privacy: "Public",
        isProfileShowcase: true,
        caption: caption || post.caption
      });
      setPosts([ { ...post, privacy: "Public", isProfileShowcase: true, caption: caption || post.caption }, ...posts ]);
      setIsUploadOpen(false);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="bg-[#0a0a0f] text-white h-full overflow-y-auto custom-scrollbar">
      
      {/* --- HEADER PROFIL --- */}
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          
          {/* Avatar */}
          <div className="relative group shrink-0">
            <Avatar className="w-32 h-32 md:w-40 md:h-40 border-4 border-[#1a1a20] ring-2 ring-[#00f5d4]">
              <AvatarImage src={profile.avatar} className="object-cover" />
              <AvatarFallback className="bg-[#7b2cbf] text-3xl font-black">{profile.full_name?.[0]}</AvatarFallback>
            </Avatar>
            {isOwner && (
                <div className="absolute bottom-0 right-0 bg-[#00f5d4] text-black p-2 rounded-full cursor-pointer hover:scale-110 transition border-4 border-[#0a0a0f]" onClick={() => setIsUploadOpen(true)}>
                    <Plus size={20} />
                </div>
            )}
          </div>

          {/* Infos */}
          <div className="flex-1 text-center md:text-left space-y-4 w-full">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <h1 className="text-2xl md:text-3xl font-black italic uppercase">{profile.full_name || "Nom du Coach"}</h1>
              
              {isOwner ? (
                <div className="flex gap-2">
                    {/* --- CHANGEMENT COULEUR BOUTON MODIFIER --- */}
                    <Button variant="default" size="sm" onClick={() => setIsEditing(!isEditing)} className="bg-[#7b2cbf] text-white hover:bg-[#9d4edd] h-8 text-xs font-bold border-none transition-colors">
                        {isEditing ? t('cancel') : t('edit_profile')}
                    </Button>
                    
                    <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80 h-8 text-xs font-bold" onClick={() => fetchPrivateGallery()}>
                                <Upload size={14} className="mr-2"/> Post
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                            <DialogHeader><DialogTitle>{t('new_post')}</DialogTitle></DialogHeader>
                            <Tabs defaultValue="upload">
                                <TabsList className="bg-black w-full">
                                    <TabsTrigger value="upload" className="flex-1">{t('new_file')}</TabsTrigger>
                                    <TabsTrigger value="gallery" className="flex-1">{t('from_gallery')}</TabsTrigger>
                                </TabsList>
                                <TabsContent value="upload" className="space-y-4 py-4">
                                    <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-[#00f5d4] relative">
                                        <input type="file" className="absolute inset-0 opacity-0" onChange={(e) => setUploadFile(e.target.files[0])} />
                                        <Upload className="mx-auto mb-2 text-gray-500"/>
                                        <p className="text-sm text-gray-400">{uploadFile ? uploadFile.name : t('drag_drop_media')}</p>
                                    </div>
                                    <Input placeholder={t('caption_placeholder')} value={caption} onChange={(e) => setCaption(e.target.value)} className="bg-black border-gray-700"/>
                                    <Button onClick={handleDirectUpload} disabled={!uploadFile || isUploading} className="w-full bg-[#00f5d4] text-black font-bold">{t('publish')}</Button>
                                </TabsContent>
                                <TabsContent value="gallery" className="space-y-4 py-4">
                                    <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                                        {privateGallery.map(media => (
                                            <div key={media.id} onClick={() => handleImportFromGallery(media)} className="aspect-square bg-gray-800 rounded overflow-hidden cursor-pointer hover:opacity-80 border border-transparent hover:border-[#00f5d4]">
                                                {media.type === 'video' ? <video src={media.mediaUrl} className="w-full h-full object-cover"/> : <img src={media.mediaUrl} className="w-full h-full object-cover"/>}
                                            </div>
                                        ))}
                                        {privateGallery.length === 0 && <p className="col-span-3 text-center text-sm text-gray-500">{t('no_content')}</p>}
                                    </div>
                                    <Input placeholder={t('caption_placeholder')} value={caption} onChange={(e) => setCaption(e.target.value)} className="bg-black border-gray-700"/>
                                </TabsContent>
                            </Tabs>
                        </DialogContent>
                    </Dialog>
                </div>
              ) : (
                <div className="flex gap-2">
                    <Button onClick={onHire} className="bg-[#00f5d4] text-black font-bold h-8 text-xs hover:scale-105 transition">
                        <Handshake size={14} className="mr-2"/> {t('hire')}
                    </Button>
                    <Button variant="outline" className="border-gray-700 h-8 text-xs text-white">
                        <MessageSquare size={14} className="mr-2"/> {t('messages')}
                    </Button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex justify-center md:justify-start gap-8 text-sm border-y border-gray-800 py-3 my-4 md:border-none md:py-0 md:my-0">
                <div className="text-center md:text-left"><span className="font-bold text-white block md:inline">{posts.length}</span> <span className="text-gray-500">posts</span></div>
                <div className="text-center md:text-left"><span className="font-bold text-white block md:inline">{profile.rating || "5.0"}</span> <span className="text-gray-500">{t('rating')}</span></div>
                <div className="text-center md:text-left"><span className="font-bold text-white block md:inline">{profile.priceStart || "???"}$</span> <span className="text-gray-500">{t('rate_start')}</span></div>
            </div>

            {/* Bio & Edit */}
            <div className="max-w-2xl text-left">
                {isEditing ? (
                    <div className="space-y-3 bg-black/30 p-4 rounded-xl border border-gray-800">
                        <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">{t('coach_bio')}</label>
                            <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} className="bg-black border-gray-700 text-white h-24"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase text-gray-500 font-bold">{t('specialties')}</label>
                                <Input value={editSpecialties} onChange={(e) => setEditSpecialties(e.target.value)} className="bg-black border-gray-700"/>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-gray-500 font-bold">{t('rate_price')}</label>
                                <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="bg-black border-gray-700"/>
                            </div>
                        </div>
                        <Button onClick={handleSaveProfile} className="bg-white text-black w-full h-8 font-bold">{t('save')}</Button>
                    </div>
                ) : (
                    <>
                        <p className="text-white font-medium text-sm leading-relaxed whitespace-pre-wrap">{profile.bio || t('coach_bio_placeholder')}</p>
                        <div className="flex flex-wrap gap-1 mt-3">
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
      </div>

      {/* --- GRILLE DE CONTENU --- */}
      <div className="border-t border-gray-800 mt-2">
        <div className="max-w-5xl mx-auto">
            
            <div className="flex justify-center gap-12 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                <div className="flex items-center gap-2 text-white border-t-2 border-white pt-1 -mt-4"><LayoutGrid size={12}/> FEED</div>
                <div className="flex items-center gap-2 pt-1 -mt-4 cursor-pointer hover:text-gray-300"><Play size={12}/> REELS</div>
            </div>

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
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        {post.type === 'video' && <Play className="text-white fill-white" size={32}/>}
                                        <div className="absolute bottom-2 left-2 text-white text-xs font-bold truncate w-11/12">{post.caption}</div>
                                    </div>
                                </div>
                            </DialogTrigger>
                            <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-5xl p-0 overflow-hidden flex flex-col md:flex-row h-[80vh] md:h-[700px]">
                                <div className="flex-1 bg-black flex items-center justify-center relative">
                                    {post.type === 'video' ? <video src={post.mediaUrl} controls className="max-h-full max-w-full"/> : <img src={post.mediaUrl} className="max-h-full max-w-full object-contain"/>}
                                </div>
                                <div className="w-full md:w-96 p-6 bg-[#1a1a20] flex flex-col border-l border-gray-800">
                                    <div className="flex items-center gap-3 mb-6">
                                        <Avatar className="w-10 h-10 ring-2 ring-[#00f5d4]"><AvatarImage src={profile.avatar}/><AvatarFallback>C</AvatarFallback></Avatar>
                                        <span className="font-bold text-sm">{profile.full_name}</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        <p className="text-sm text-gray-300 leading-relaxed">{post.caption || "Pas de description."}</p>
                                    </div>
                                    <div className="pt-4 border-t border-gray-800 text-xs text-gray-500 mt-4">
                                        Posté le {new Date(post.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    ))}
                </div>
            ) : (
                <div className="py-20 text-center">
                    <div className="w-16 h-16 rounded-full border-2 border-gray-700 text-gray-700 flex items-center justify-center mx-auto mb-4">
                        <ImageIcon size={32}/>
                    </div>
                    <h3 className="text-xl font-bold text-white uppercase italic">{t('no_content')}</h3>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL : COMMUNITY ---
export default function Community() {
  const { currentUser } = useAuth();
  const { t } = useTranslation(); 
  
  // --- ÉTATS ---
  const [coaches, setCoaches] = useState([]);
  const [realWorldResults, setRealWorldResults] = useState([]); 
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [isHiring, setIsHiring] = useState(false);
  
  // États Coach
  const [userRole, setUserRole] = useState(null);
  const [myProfileData, setMyProfileData] = useState(null);

  // --- FILTRES ---
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState([150]); 
  const [selectedSport, setSelectedSport] = useState('all');
  const [sessionType, setSessionType] = useState('all'); 

  // --- 1. CHARGEMENT INITIAL ---
  useEffect(() => {
    const init = async () => {
        if (!currentUser) return;
        const q = query(collection(db, "users"), where("uid", "==", currentUser.uid));
        const userDoc = await getDocs(q);
        if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            setUserRole(userData.role);
            if (userData.role === 'coach') {
                setMyProfileData({ id: userDoc.docs[0].id, ...userData });
            } else {
                searchCoaches();
            }
        }
    };
    init();
  }, [currentUser]);

  // *** AFFICHER MON PROFIL SI COACH ***
  if (userRole === 'coach' && myProfileData) {
      return <CoachProfile coachData={myProfileData} isOwner={true} />;
  }

  // *** SINON : RECHERCHE ***
  const searchCoaches = async () => {
    setIsLoading(true);
    setRealWorldResults([]); 

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("role", "==", "coach")); 
      const snap = await getDocs(q);
      
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (selectedSport !== 'all') {
        results = results.filter(c => c.specialties && c.specialties.includes(selectedSport));
      }
      if (location) {
        results = results.filter(c => c.city && c.city.toLowerCase().includes(location.toLowerCase()));
      }
      results = results.filter(c => (c.priceStart || 0) <= budget[0]);

      setCoaches(results);

      if (location && location.length > 2) {
        await searchRealPlacesWithAI(location, selectedSport);
      }

    } catch (e) {
      console.error("Erreur recherche coachs", e);
    } finally {
      setIsLoading(false);
    }
  };

  const searchRealPlacesWithAI = async (loc, sport) => {
    if (!OPENAI_API_KEY) {
        console.warn("Clé API OpenAI manquante.");
        return;
    }

    setIsAiLoading(true);
    const sportTerm = sport === 'all' ? 'Fitness Gyms' : sport;
    
    // --- MODIFICATION ICI : PROMPT AMÉLIORÉ POUR LES QUARTIERS ---
    const prompt = `Tu es un expert local en fitness à ${loc}.
    1. Si la ville est grande (ex: Paris, Montréal), divise impérativement les résultats par QUARTIERS différents (ex: Plateau, Griffintown, Mile-End).
    2. Trouve 3 à 5 VRAIS studios ou gyms existants spécialisés en : ${sportTerm}.
    3. Dans le nom du lieu, ajoute le quartier entre parenthèses. Ex: "Gym du Plateau (Mont-Royal)".
    
    Réponds en JSON STRICT format :
    {
      "results": [
        {
          "name": "Nom du lieu (Quartier)",
          "bio": "Description courte",
          "address": "Adresse précise",
          "rating": 4.8,
          "specialties": ["Tag1", "Tag2"],
          "estimated_price": 50
        }
      ]
    }`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{role: "user", content: prompt}],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0]) {
        const parsed = JSON.parse(data.choices[0].message.content);
        const enrichedResults = parsed.results.map((place, index) => ({
          ...place,
          id: `ai_real_${index}`,
          isExternal: true,
          avatar: `https://source.unsplash.com/random/200x200?gym,logo&sig=${index}`,
          coverImage: `https://source.unsplash.com/random/800x600?gym,interior&sig=${index}`,
        }));
        setRealWorldResults(enrichedResults);
      }
    } catch (error) {
      console.error("Erreur IA:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- LOGIQUE DEMANDE D'AJOUT ---
  const handleHireCoach = async (coachToHire) => {
    if (!currentUser) return;
    const target = coachToHire || selectedCoach; 
    
    if(!window.confirm(t('confirm_hire', { name: target.full_name || target.name }))) return;

    setIsHiring(true);
    try {
        // Envoi d'une Notification de demande
        await addDoc(collection(db, "notifications"), {
            recipientId: target.id, 
            senderId: currentUser.uid,
            senderName: myProfileData?.full_name || currentUser.email,
            type: "coach_request", 
            title: "Nouvelle demande de coaching",
            message: `${myProfileData?.full_name || "Un utilisateur"} souhaite vous engager.`,
            status: "unread",
            createdAt: new Date().toISOString(),
            actionRequired: true 
        });

        alert(t('request_sent')); // "Demande envoyée"
        setSelectedCoach(null);
        
    } catch (e) {
        console.error("Erreur hiring", e);
        alert(t('error'));
    }
    setIsHiring(false);
  };

  const handleGeolocation = () => {
    if ("geolocation" in navigator) {
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
        setTimeout(() => {
          setLocation("Montréal"); 
          setIsLoading(false);
          alert(t('geo_simulated'));
        }, 800);
      }, () => {
        alert(t('error'));
        setIsLoading(false);
      });
    } else {
      alert("N/A");
    }
  };

  return (
    <div className="space-y-6 pb-20 min-h-screen">
      
      {/* HEADER */}
      <div className="relative overflow-hidden bg-[#1a1a20] p-8 rounded-3xl border border-gray-800">
        <div className="relative z-10">
          <h1 className="text-4xl font-black italic uppercase text-white flex items-center gap-3">
            <Globe className="text-[#00f5d4] w-10 h-10"/> {t('find a coach')}
          </h1>
          <p className="text-gray-400 mt-2 max-w-xl">
            {t('Best place to find your coach')}
          </p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/20 to-transparent pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* --- SIDEBAR FILTRES --- */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="kb-card bg-[#1a1a20] border-gray-800 sticky top-4">
            <CardHeader><CardTitle className="text-white uppercase text-sm font-black">{t('search_filters')}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              
              {/* Localisation */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{t('city')}</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="ex: Paris, Montreal..." 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="bg-black border-gray-700 text-white"
                  />
                  <Button size="icon" onClick={handleGeolocation} className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white border-none transition-colors">
                    <MapPin size={18}/>
                  </Button>
                </div>
              </div>

              {/* Sport */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{t('discipline')}</label>
                <Select value={selectedSport} onValueChange={setSelectedSport}>
                  <SelectTrigger className="bg-black border-gray-700 text-white">
                    <SelectValue placeholder={t('discipline')} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a20] text-white border-gray-700">
                    <SelectItem value="all">Tous</SelectItem>
                    {SPORTS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Budget */}
              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t('max_budget')}</label>
                  <span className="text-xs font-bold text-[#00f5d4]">{budget[0]}$</span>
                </div>
                <Slider defaultValue={[150]} max={300} step={10} value={budget} onValueChange={setBudget} className="py-4" />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{t('format')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {['private', 'semi', 'group', 'remote'].map(type => (
                    <Button 
                      key={type}
                      variant={sessionType === type ? 'default' : 'outline'} 
                      onClick={() => setSessionType(type)} 
                      className={`text-xs ${sessionType === type 
                        ? 'bg-[#7b2cbf] text-white border-none' 
                        : 'bg-[#7b2cbf]/20 text-white border border-[#7b2cbf]/50 hover:bg-[#7b2cbf]/40'}`}
                    >
                      {t(type)}
                    </Button>
                  ))}
                </div>
              </div>

              <Button onClick={searchCoaches} className="w-full bg-[#7b2cbf] text-white font-black hover:bg-[#9d4edd] hover:scale-105 transition-transform" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin mr-2"/> : <Search className="mr-2" size={18}/>}
                {t('search_btn')}
              </Button>

            </CardContent>
          </Card>
        </div>

        {/* --- RÉSULTATS --- */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Section Coachs Kaybee */}
          {coaches.length > 0 && (
            <div>
              <h2 className="text-2xl font-black text-white italic uppercase mb-4 flex items-center gap-2">
                <CheckCircle className="text-[#00f5d4]"/> {t('certified_coaches')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {coaches.map((coach) => (
                  <motion.div key={coach.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-[#7b2cbf] transition-all cursor-pointer group overflow-hidden h-full" onClick={() => setSelectedCoach(coach)}>
                      <div className="h-32 bg-gray-800 relative">
                        <img src={coach.coverImage || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80"} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[#00f5d4] font-black text-sm">
                          {coach.priceStart ? `${t('rate_start')} ${coach.priceStart}$` : "Sur devis"}
                        </div>
                      </div>
                      <CardContent className="relative pt-0 px-4 pb-4">
                        <div className="flex justify-between items-end -mt-10 mb-3">
                           <Avatar className="w-20 h-20 border-4 border-[#1a1a20]">
                             <AvatarImage src={coach.avatar} />
                             <AvatarFallback className="bg-[#7b2cbf] text-white font-black">{coach.full_name?.[0] || coach.name?.[0] || "C"}</AvatarFallback>
                           </Avatar>
                           <div className="flex gap-1 flex-wrap justify-end">
                              {coach.specialties?.slice(0, 2).map(s => (<Badge key={s} className="bg-white/10 text-white hover:bg-[#7b2cbf] border-none">{s}</Badge>))}
                           </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <h3 className="text-xl font-bold text-white group-hover:text-[#00f5d4] transition-colors">{coach.full_name || coach.name}</h3>
                            <div className="flex items-center text-[#ffd700] text-sm font-bold"><Star size={14} className="fill-[#ffd700] mr-1"/> {coach.rating || "5.0"}</div>
                          </div>
                          <p className="text-gray-400 text-xs flex items-center gap-1 mb-3"><MapPin size={12}/> {coach.city || "N/A"}</p>
                          <p className="text-sm text-gray-300 line-clamp-2">{coach.bio || "..."}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Section Résultats IA */}
          {(realWorldResults.length > 0 || isAiLoading) && (
            <div className={coaches.length > 0 ? "pt-8 border-t border-gray-800" : ""}>
               <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2">
                    <Sparkles className="text-[#9d4edd]"/> {t('ai_discoveries')}
                  </h2>
                  <Badge variant="outline" className="text-xs text-gray-500 border-gray-700">Recherche Web</Badge>
               </div>
               
               {isAiLoading ? (
                 <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="animate-spin text-[#9d4edd] w-8 h-8 mb-2"/>
                    <p className="text-gray-400 text-sm">{t('loading')}</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {realWorldResults.map((result) => (
                     <motion.div key={result.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                       <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-[#9d4edd] transition-all cursor-pointer group h-full" onClick={() => setSelectedCoach(result)}>
                          <div className="flex h-full">
                             <div className="w-1/3 bg-gray-900 relative">
                               <img src={result.coverImage} className="w-full h-full object-cover opacity-80" />
                             </div>
                             <div className="flex-1 p-4 flex flex-col justify-between">
                                <div>
                                  <div className="flex justify-between items-start">
                                    <h4 className="text-white font-bold group-hover:text-[#9d4edd] transition-colors line-clamp-1">{result.name}</h4>
                                    <span className="text-[#ffd700] text-xs font-bold flex items-center shrink-0"><Star size={10} className="fill-[#ffd700] mr-1"/>{result.rating}</span>
                                  </div>
                                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><MapPin size={10}/> {result.address}</p>
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {result.specialties?.slice(0, 2).map(s => <span key={s} className="text-[10px] bg-white/5 text-gray-300 px-1.5 py-0.5 rounded">{s}</span>)}
                                  </div>
                                </div>
                                <div className="flex justify-between items-end mt-2">
                                     <div>
                                        <p className="text-[10px] text-gray-500">Est.</p>
                                        <p className="text-white font-black">~{result.estimated_price}$</p>
                                     </div>
                                     <Button size="sm" variant="outline" className="h-7 text-xs border-gray-600 hover:bg-[#9d4edd] hover:text-white hover:border-[#9d4edd]">
                                       <ExternalLink size={12} className="mr-1"/> Info
                                     </Button>
                                </div>
                             </div>
                          </div>
                       </Card>
                     </motion.div>
                   ))}
                 </div>
               )}
            </div>
          )}

          {/* État vide total */}
          {coaches.length === 0 && realWorldResults.length === 0 && !isLoading && !isAiLoading && (
            <div className="p-12 text-center text-gray-500 bg-black/20 rounded-xl border border-dashed border-gray-800">
              <Search className="mx-auto mb-4 opacity-20" size={48} />
              <p>{t('search_prompt')}</p>
            </div>
          )}

        </div>
      </div>

      {/* MODAL PROFIL COACH */}
      <Dialog open={!!selectedCoach} onOpenChange={() => setSelectedCoach(null)}>
        <DialogContent className="bg-transparent border-none text-white max-w-5xl p-0 h-[85vh] overflow-hidden rounded-3xl">
            {selectedCoach && (
                <CoachProfile 
                    coachData={selectedCoach} 
                    isOwner={false} 
                    onHire={() => handleHireCoach(selectedCoach)}
                />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}