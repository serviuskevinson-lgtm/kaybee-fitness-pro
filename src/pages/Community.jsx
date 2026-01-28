import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { searchCoachesWithGemini } from '@/lib/geminicoach';
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
import { sendNotification } from '@/lib/notifications';

const SPORTS_LIST = [
  "Musculation", "CrossFit", "Yoga", "Pilates", "Boxe", "MMA",
  "Running", "Powerlifting", "Calisthenics", "Perte de poids", "Réhabilitation"
];

// --- SOUS-COMPOSANT : PROFIL COACH (Interne Kaybee) ---
const CoachProfile = ({ coachData, isOwner, onHire }) => {
  const { t } = useTranslation(); 
  const [profile, setProfile] = useState(coachData || {});
  const [posts, setPosts] = useState([]);
  
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

  // --- CHARGEMENT DES POSTS ---
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

      await addDoc(collection(db, "posts"), newPost);
      setPosts([ { id: `temp_${Date.now()}`, ...newPost }, ...posts ]);
      setIsUploadOpen(false);
      setUploadFile(null);
      setCaption("");
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };

  return (
    <div className="bg-[#0a0a0f] text-white h-full overflow-y-auto p-8 custom-scrollbar">
        <div className="flex items-center gap-6">
            <Avatar className="w-32 h-32 border-4 border-[#1a1a20] ring-2 ring-[#00f5d4]">
              <AvatarImage src={profile.avatar} className="object-cover"/>
              <AvatarFallback className="bg-[#7b2cbf] text-2xl">{profile.full_name?.[0]}</AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-3xl font-black">{profile.full_name}</h1>
                <p className="text-gray-400">{profile.city || "Ville inconnue"}</p>
                <div className="flex gap-2 mt-4">
                    {isOwner ? (
                       <Button onClick={() => setIsEditing(!isEditing)} className="bg-[#7b2cbf] text-white h-8 text-xs">{isEditing ? 'Annuler' : 'Modifier'}</Button>
                    ) : (
                       <Button onClick={onHire} className="bg-[#00f5d4] text-black font-bold h-8 text-xs hover:scale-105 transition"><Handshake size={14} className="mr-2"/> {t('hire')}</Button>
                    )}
                    {isOwner && (
                        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                            <DialogTrigger asChild><Button size="sm" className="bg-[#00f5d4] text-black h-8 text-xs font-bold"><Upload size={14} className="mr-2"/> Post</Button></DialogTrigger>
                            <DialogContent className="bg-[#1a1a20] border-gray-800 text-white"><DialogHeader><DialogTitle>{t('new_post')}</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4"><div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer relative"><input type="file" className="absolute inset-0 opacity-0" onChange={(e) => setUploadFile(e.target.files[0])} /><Upload className="mx-auto mb-2 text-gray-500"/><p className="text-sm text-gray-400">{uploadFile ? uploadFile.name : t('drag_drop_media')}</p></div><Input placeholder={t('caption_placeholder')} value={caption} onChange={(e) => setCaption(e.target.value)} className="bg-black border-gray-700"/><Button onClick={handleDirectUpload} disabled={!uploadFile || isUploading} className="w-full bg-[#00f5d4] text-black font-bold">{t('publish')}</Button></div>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>
        </div>
        
        {/* Zone Edition */}
        {isEditing && isOwner && (
            <div className="mt-4 p-4 bg-black/30 rounded-xl space-y-4 border border-gray-800">
                <Textarea value={editBio} onChange={e => setEditBio(e.target.value)} className="bg-black text-white" placeholder="Bio..."/>
                <div className="flex gap-4">
                    <Input value={editSpecialties} onChange={e => setEditSpecialties(e.target.value)} className="bg-black text-white" placeholder="Spécialités"/>
                    <Input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="bg-black text-white" placeholder="Prix"/>
                </div>
                <Button onClick={handleSaveProfile} className="w-full bg-[#00f5d4] text-black font-bold">Sauvegarder</Button>
            </div>
        )}

        <div className="mt-8 border-t border-gray-800 pt-8">
            <h3 className="text-lg font-bold mb-2">À propos</h3>
            <p className="text-gray-300 whitespace-pre-wrap">{profile.bio || "Pas de description."}</p>
        </div>
        
        {/* Feed Posts */}
        <div className="mt-8 grid grid-cols-3 gap-2">
            {posts.map(post => (
                <div key={post.id} className="aspect-square bg-gray-900 overflow-hidden relative group">
                    {post.type === 'video' ? <video src={post.mediaUrl} className="w-full h-full object-cover"/> : <img src={post.mediaUrl} className="w-full h-full object-cover"/>}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-xs text-white text-center">{post.caption}</div>
                </div>
            ))}
        </div>
    </div>
  );
};

// --- COMPOSANT PRINCIPAL ---
export default function Community() {
  const { currentUser } = useAuth();
  const { t } = useTranslation(); 
  
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
  const [sessionType, setSessionType] = useState('private'); 

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

  const searchCoaches = async () => {
    setIsLoading(true);
    setRealWorldResults([]); 

    try {
      const q = query(collection(db, "users"), where("role", "==", "coach")); 
      const snap = await getDocs(q);
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (selectedSport !== 'all') results = results.filter(c => c.specialties && c.specialties.includes(selectedSport));
      if (location) results = results.filter(c => c.city && c.city.toLowerCase().includes(location.toLowerCase()));
      results = results.filter(c => (c.priceStart || 0) <= budget[0]);

      setCoaches(results);

      // --- APPEL IA ---
      if (location && location.length > 2) {
        await searchRealPlacesWithAI(location, selectedSport, budget[0], sessionType);
      }

    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const searchRealPlacesWithAI = async (loc, sport, maxPrice, type) => {
    setIsAiLoading(true);
    const sportTerm = sport === 'all' ? 'Fitness' : sport;
    try {
      const results = await searchCoachesWithGemini(loc, sportTerm, maxPrice, type);
      const enriched = results.map((c, i) => ({
          ...c, 
          // Image placeholder réaliste si Gemini n'en fournit pas (rare)
          coverImage: `https://source.unsplash.com/random/800x600?${sportTerm},gym&sig=${i}`
      }));
      setRealWorldResults(enriched);
    } catch (error) { console.error(error); } finally { setIsAiLoading(false); }
  };

  const handleHireCoach = async (coachToHire) => {
    if (!currentUser) return;
    const target = coachToHire || selectedCoach; 
    if(!window.confirm(t('confirm_hire', { name: target.full_name || target.name }))) return;
    setIsHiring(true);
    try {
        await sendNotification(
            target.id, 
            currentUser.uid, 
            myProfileData?.full_name || currentUser.email, 
            "Demande de Coaching 🚀", 
            "Un utilisateur souhaite vous engager.", 
            "coach_request"
        );
        alert(t('request_sent')); setSelectedCoach(null);
    } catch (e) { console.error(e); alert(t('error')); }
    setIsHiring(false);
  };

  const handleGeolocation = () => {
    if ("geolocation" in navigator) {
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
        setTimeout(() => { setLocation("Montréal"); setIsLoading(false); alert(t('geo_simulated')); }, 800);
      }, () => { alert(t('error')); setIsLoading(false); });
    } else { alert("N/A"); }
  };

  // --- FONCTION TEMPORAIRE POUR REMPLIR LA DB (A RETIRER EN PROD) ---
  const addFakeData = async () => {
    // ... (Garde ta fonction existante si tu en as besoin, ou supprime-la)
  };

  if (userRole === 'coach' && myProfileData) return <CoachProfile coachData={myProfileData} isOwner={true} />;

  return (
    <div className="space-y-6 pb-20 min-h-screen">
      <div className="relative overflow-hidden bg-[#1a1a20] p-8 rounded-3xl border border-gray-800">
        <div className="relative z-10">
          <h1 className="text-4xl font-black italic uppercase text-white flex items-center gap-3"><Globe className="text-[#00f5d4] w-10 h-10"/> {t('find a coach')}</h1>
          <p className="text-gray-400 mt-2 max-w-xl">{t('Best place to find your coach')}</p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/20 to-transparent pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="kb-card bg-[#1a1a20] border-gray-800 sticky top-4">
            <CardHeader><CardTitle className="text-white uppercase text-sm font-black">{t('search_filters')}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2"><label className="text-xs font-bold text-gray-500 uppercase">{t('city')}</label><div className="flex gap-2"><Input placeholder="ex: Paris, Montreal..." value={location} onChange={(e) => setLocation(e.target.value)} className="bg-black border-gray-700 text-white"/><Button size="icon" onClick={handleGeolocation} className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white border-none transition-colors"><MapPin size={18}/></Button></div></div>
              <div className="space-y-2"><label className="text-xs font-bold text-gray-500 uppercase">{t('discipline')}</label><Select value={selectedSport} onValueChange={setSelectedSport}><SelectTrigger className="bg-black border-gray-700 text-white"><SelectValue placeholder={t('discipline')} /></SelectTrigger><SelectContent className="bg-[#1a1a20] text-white border-gray-700"><SelectItem value="all">Tous</SelectItem>{SPORTS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-4"><div className="flex justify-between"><label className="text-xs font-bold text-gray-500 uppercase">{t('max_budget')}</label><span className="text-xs font-bold text-[#00f5d4]">{budget[0]}$</span></div><Slider defaultValue={[150]} max={300} step={10} value={budget} onValueChange={setBudget} className="py-4" /></div>
              <div className="space-y-2"><label className="text-xs font-bold text-gray-500 uppercase">{t('format')}</label><div className="grid grid-cols-2 gap-2">{['private', 'semi', 'group', 'remote'].map(type => (<Button key={type} variant={sessionType === type ? 'default' : 'outline'} onClick={() => setSessionType(type)} className={`text-xs ${sessionType === type ? 'bg-[#7b2cbf] text-white border-none' : 'bg-[#7b2cbf]/20 text-white border border-[#7b2cbf]/50 hover:bg-[#7b2cbf]/40'}`}>{t(type)}</Button>))}</div></div>
              <Button onClick={searchCoaches} className="w-full bg-[#7b2cbf] text-white font-black hover:bg-[#9d4edd] hover:scale-105 transition-transform" disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin mr-2"/> : <Search className="mr-2" size={18}/>}{t('search_btn')}</Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-8">
          
          {/* 1. RÉSULTATS KAYBEE (Toujours en premier) */}
          {coaches.length > 0 && (
            <div>
              <h2 className="text-2xl font-black text-white italic uppercase mb-4 flex items-center gap-2"><CheckCircle className="text-[#00f5d4]"/> {t('certified_coaches')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {coaches.map((coach) => (
                  <motion.div key={coach.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-[#7b2cbf] transition-all cursor-pointer group overflow-hidden h-full" onClick={() => setSelectedCoach(coach)}>
                      <div className="h-32 bg-gray-800 relative"><img src={coach.coverImage || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80"} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" /><div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[#00f5d4] font-black text-sm">{coach.priceStart ? `${t('rate_start')} ${coach.priceStart}$` : "Sur devis"}</div></div>
                      <CardContent className="relative pt-0 px-4 pb-4">
                        <div className="flex justify-between items-end -mt-10 mb-3"><Avatar className="w-20 h-20 border-4 border-[#1a1a20]"><AvatarImage src={coach.avatar} /><AvatarFallback className="bg-[#7b2cbf] text-white font-black">{coach.full_name?.[0] || "C"}</AvatarFallback></Avatar><div className="flex gap-1 flex-wrap justify-end">{coach.specialties?.slice(0, 2).map(s => (<Badge key={s} className="bg-white/10 text-white hover:bg-[#7b2cbf] border-none">{s}</Badge>))}</div></div>
                        <div><div className="flex justify-between items-center mb-1"><h3 className="text-xl font-bold text-white group-hover:text-[#00f5d4] transition-colors">{coach.full_name || coach.name}</h3><div className="flex items-center text-[#ffd700] text-sm font-bold"><Star size={14} className="fill-[#ffd700] mr-1"/> {coach.rating || "5.0"}</div></div><p className="text-gray-400 text-xs flex items-center gap-1 mb-3"><MapPin size={12}/> {coach.city || "N/A"}</p><p className="text-sm text-gray-300 line-clamp-2">{coach.bio || "..."}</p></div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* 2. RÉSULTATS IA (REAL WORLD) - Avec lien Web */}
          {(realWorldResults.length > 0 || isAiLoading) && (
            <div className={coaches.length > 0 ? "pt-8 border-t border-gray-800" : ""}>
               <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2"><Sparkles className="text-[#9d4edd]"/> {t('ai_discoveries')}</h2><Badge variant="outline" className="text-xs text-gray-500 border-gray-700">Recherche Web</Badge></div>
               {isAiLoading ? (<div className="flex flex-col items-center justify-center py-12 text-center"><Loader2 className="animate-spin text-[#9d4edd] w-8 h-8 mb-2"/><p className="text-gray-400 text-sm">{t('loading')}</p></div>) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {realWorldResults.map((result) => (
                     <motion.div key={result.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                       <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-[#9d4edd] transition-all group h-full flex flex-col overflow-hidden">
                          <div className="flex h-full">
                              <div className="w-1/3 bg-gray-900 relative">
                                  <img src={result.coverImage} className="w-full h-full object-cover opacity-80" />
                              </div>
                              <div className="flex-1 p-4 flex flex-col justify-between">
                                  <div>
                                      <div className="flex justify-between items-start">
                                          <h4 className="text-white font-bold group-hover:text-[#9d4edd] transition-colors line-clamp-1">{result.full_name}</h4>
                                          <span className="text-[#ffd700] text-xs font-bold flex items-center shrink-0"><Star size={10} className="fill-[#ffd700] mr-1"/>{result.rating}</span>
                                      </div>
                                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><MapPin size={10}/> {result.location}</p>
                                      <p className="text-xs text-gray-500 line-clamp-2">{result.bio}</p>
                                      <div className="flex flex-wrap gap-1 mt-2"><span className="text-[10px] bg-white/5 text-gray-300 px-1.5 py-0.5 rounded">{result.specialty}</span></div>
                                  </div>
                                  
                                  {/* BOUTON SITE WEB AU LIEU DE HIRE */}
                                  <div className="flex justify-between items-end mt-4 pt-3 border-t border-white/5">
                                      <div className="text-left">
                                          <p className="text-[9px] text-gray-500">Tarif est.</p>
                                          <p className="text-[#00f5d4] font-black text-sm">{result.priceStart}$</p>
                                      </div>
                                      {result.website && result.website !== 'N/A' ? (
                                          <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="h-8 text-xs border-[#9d4edd] text-[#9d4edd] hover:bg-[#9d4edd] hover:text-white"
                                            onClick={() => window.open(result.website, '_blank')}
                                          >
                                            <Globe size={12} className="mr-1"/> Site Web
                                          </Button>
                                      ) : (
                                          <Button size="sm" disabled variant="outline" className="h-8 text-xs opacity-50">Pas de site</Button>
                                      )}
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
          
          {coaches.length === 0 && realWorldResults.length === 0 && !isLoading && !isAiLoading && (<div className="p-12 text-center text-gray-500 bg-black/20 rounded-xl border border-dashed border-gray-800"><Search className="mx-auto mb-4 opacity-20" size={48} /><p>{t('search_prompt')}</p></div>)}
        </div>
      </div>
      
      {/* MODAL PROFIL COACH INTERNE SEULEMENT */}
      <Dialog open={!!selectedCoach} onOpenChange={() => setSelectedCoach(null)}>
          <DialogContent className="bg-transparent border-none text-white max-w-5xl p-0 h-[85vh] overflow-hidden rounded-3xl">
            {selectedCoach && !selectedCoach.isExternal && (
                <CoachProfile coachData={selectedCoach} isOwner={false} onHire={() => handleHireCoach(selectedCoach)}/>
            )}
          </DialogContent>
      </Dialog>
    </div>
  );
}