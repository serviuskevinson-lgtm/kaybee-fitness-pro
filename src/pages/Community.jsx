import React, { useState, useEffect, useCallback } from 'react';
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
  Sparkles, Handshake, LayoutGrid, Play, Image as ImageIcon, Upload, Plus, MessageSquare,
  Calendar, Clock, CreditCard, Tag, Percent, User, Users, Laptop, Zap, Heart, Dumbbell, Flame, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next'; 
import { sendNotification } from '@/lib/notifications';
import { calculateDiscountedPrice, getCurrencyFromLocation } from '@/lib/coachPrice';
import { SERVICE_CATEGORIES, DAYS } from './Profile';

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

  const currency = getCurrencyFromLocation(profile.location);

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
        <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <Avatar className="w-32 h-32 border-4 border-[#1a1a20] ring-2 ring-[#00f5d4] shadow-[0_0_30px_rgba(0,245,212,0.2)]">
              <AvatarImage src={profile.avatar} className="object-cover"/>
              <AvatarFallback className="bg-[#7b2cbf] text-4xl font-black">{profile.full_name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left flex-1">
                <h1 className="text-4xl font-black uppercase italic tracking-tighter">{profile.full_name}</h1>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-2">
                  <Badge className="bg-[#7b2cbf]/20 text-[#00f5d4] border-[#7b2cbf]/50 font-black">COACH ÉLITE</Badge>
                  {profile.location?.city && (
                    <div className="flex items-center gap-1 text-gray-400 text-xs font-bold uppercase">
                      <MapPin size={12} className="text-red-500" /> {profile.location.city}, {profile.location.district}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-6 justify-center md:justify-start">
                    {isOwner ? (
                       <Button onClick={() => setIsEditing(!isEditing)} className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white rounded-full px-6 transition-all duration-300 h-10">{isEditing ? 'Annuler' : 'Modifier'}</Button>
                    ) : (
                       <Button onClick={onHire} className="bg-[#00f5d4] text-black font-black uppercase italic px-8 h-10 rounded-full hover:scale-105 transition shadow-[0_0_20px_rgba(0,245,212,0.3)]"><Handshake size={18} className="mr-2"/> {t('hire')}</Button>
                    )}
                    {isOwner && (
                        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                            <DialogTrigger asChild><Button size="sm" className="bg-white/10 hover:bg-white/20 text-white h-10 px-6 rounded-full font-bold"><Plus size={18} className="mr-2"/> Nouveau Post</Button></DialogTrigger>
                            <DialogContent className="bg-[#1a1a20] border-gray-800 text-white shadow-2xl rounded-3xl"><DialogHeader><DialogTitle className="text-2xl font-black italic uppercase tracking-tighter">{t('new_post')}</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4"><div className="border-2 border-dashed border-gray-700 rounded-2xl p-8 text-center cursor-pointer relative hover:border-[#00f5d4]/50 transition-colors"><input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setUploadFile(e.target.files[0])} /><Upload className="mx-auto mb-2 text-gray-500"/><p className="text-sm text-gray-400 font-bold uppercase tracking-widest">{uploadFile ? uploadFile.name : t('drag_drop_media')}</p></div><Input placeholder={t('caption_placeholder')} value={caption} onChange={(e) => setCaption(e.target.value)} className="bg-black/50 border-gray-700 rounded-xl h-12"/><Button onClick={handleDirectUpload} disabled={!uploadFile || isUploading} className="w-full bg-[#00f5d4] text-black font-black uppercase italic h-12 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.2)]">{isUploading ? <Loader2 className="animate-spin" /> : t('publish')}</Button></div>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>
        </div>
        
        {/* Zone Edition */}
        {isEditing && isOwner && (
            <div className="mb-8 p-6 bg-[#1a1a20]/60 rounded-3xl space-y-4 border border-gray-800 shadow-xl">
                <label className="text-[10px] text-gray-500 uppercase font-black">Bio Professionnelle</label>
                <Textarea value={editBio} onChange={e => setEditBio(e.target.value)} className="bg-black/40 border-gray-800 text-white rounded-xl min-h-[100px]" placeholder="Présentez-vous..."/>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase font-black">Spécialités (séparées par virgules)</label>
                      <Input value={editSpecialties} onChange={e => setEditSpecialties(e.target.value)} className="bg-black/40 border-gray-800 text-white rounded-xl h-12" placeholder="Musculation, Perte de poids..."/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase font-black">Prix d'appel ({currency})</label>
                      <Input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="bg-black/40 border-gray-800 text-white rounded-xl h-12" placeholder="Ex: 50"/>
                    </div>
                </div>
                <Button onClick={handleSaveProfile} className="w-full bg-[#00f5d4] text-black font-black uppercase italic h-12 rounded-xl">Sauvegarder les modifications</Button>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* BIO */}
                <section>
                    <h3 className="text-lg font-black italic uppercase text-gray-400 mb-4 flex items-center gap-2"><Activity size={18} className="text-[#00f5d4]"/> À propos</h3>
                    <div className="bg-[#1a1a20]/40 p-6 rounded-3xl border border-gray-800">
                      <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{profile.bio || "Pas de description."}</p>
                    </div>
                </section>

                {/* TARIFS DÉTAILLÉS */}
                {profile.pricing && profile.pricing.length > 0 && (
                  <section>
                    <h3 className="text-lg font-black italic uppercase text-gray-400 mb-4 flex items-center gap-2"><CreditCard size={18} className="text-[#00f5d4]"/> Tarifs & Services</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {profile.pricing.map((tier) => (
                        <div key={tier.id} className="p-5 bg-[#1a1a20]/40 rounded-3xl border border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 group hover:border-[#00f5d4]/30 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-[#00f5d4]/10 rounded-2xl flex items-center justify-center shrink-0">
                              {SERVICE_CATEGORIES.find(c => c.id === tier.category)?.icon ?
                                React.createElement(SERVICE_CATEGORIES.find(c => c.id === tier.category).icon, { size: 20, className: "text-[#00f5d4]" }) :
                                <Zap size={20} className="text-[#00f5d4]"/>
                              }
                            </div>
                            <div>
                              <p className="font-black uppercase italic tracking-tighter text-white">{tier.description || "Offre Personnalisée"}</p>
                              <div className="flex gap-2 mt-1">
                                <Badge variant="outline" className="text-[9px] uppercase font-black border-[#00f5d4]/20 text-[#00f5d4] bg-[#00f5d4]/5">
                                  {SERVICE_CATEGORIES.find(c => c.id === tier.category)?.label || tier.category}
                                </Badge>
                                <Badge variant="outline" className="text-[9px] uppercase font-black border-gray-700 text-gray-400">
                                  {tier.type === 'subscription' ? 'Mensuel' : 'Séance'}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-right">
                            {tier.discount?.value > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="text-gray-600 line-through text-xs font-bold">{tier.price}{currency}</span>
                                <span className="text-[#00f5d4] font-black text-2xl tracking-tighter">
                                  {calculateDiscountedPrice(tier.price, tier.discount).toFixed(2)}{currency}
                                </span>
                              </div>
                            ) : (
                              <span className="text-white font-black text-2xl tracking-tighter">{tier.price}{currency}</span>
                            )}
                            <div className="h-10 w-px bg-gray-800 hidden md:block" />
                            <Button size="sm" variant="ghost" className="text-xs font-black uppercase text-gray-500 hover:text-[#00f5d4] hover:bg-transparent">Détails</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* SHOWCASE POSTS */}
                <section>
                    <h3 className="text-lg font-black italic uppercase text-gray-400 mb-4 flex items-center gap-2"><ImageIcon size={18} className="text-[#00f5d4]"/> Galerie Pro</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {posts.map(post => (
                            <div key={post.id} className="aspect-[3/4] bg-[#1a1a20] rounded-2xl overflow-hidden relative group border border-gray-800 shadow-xl">
                                {post.type === 'video' ? <video src={post.mediaUrl} className="w-full h-full object-cover"/> : <img src={post.mediaUrl} className="w-full h-full object-cover" loading="lazy" />}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                  <p className="text-xs text-white font-medium line-clamp-2">{post.caption}</p>
                                </div>
                            </div>
                        ))}
                        {posts.length === 0 && (
                          <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-800 rounded-3xl opacity-30">
                            <ImageIcon size={40} className="mx-auto mb-2"/>
                            <p className="text-xs uppercase font-black">Aucun post public</p>
                          </div>
                        )}
                    </div>
                </section>
            </div>

            <div className="space-y-8">
              {/* DISPONIBILITÉS */}
              <section>
                <h3 className="text-sm font-black italic uppercase text-gray-500 mb-4 flex items-center gap-2"><Calendar size={16} className="text-[#9d4edd]"/> Disponibilités</h3>
                <div className="bg-[#1a1a20]/40 p-6 rounded-3xl border border-gray-800">
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => {
                      const isAvailable = profile.availabilityDays?.includes(day);
                      return (
                        <div key={day} className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black uppercase border-2 transition-all ${isAvailable ? 'bg-[#9d4edd]/20 border-[#9d4edd] text-white shadow-[0_0_15px_rgba(157,78,221,0.2)]' : 'bg-black/20 border-gray-800 text-gray-700'}`}>
                          {day}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-4 uppercase font-bold tracking-widest text-center">Jours d'entraînement privilégiés</p>
                </div>
              </section>

              {/* LOCALISATION CARD */}
              <section>
                <h3 className="text-sm font-black italic uppercase text-gray-500 mb-4 flex items-center gap-2"><MapPin size={16} className="text-red-500"/> Zone d'activité</h3>
                <div className="bg-[#1a1a20]/40 p-6 rounded-3xl border border-gray-800 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
                        <MapPin size={20} className="text-red-500" />
                      </div>
                      <div>
                        <p className="text-white font-black italic">{profile.location?.city || "Non spécifié"}</p>
                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{profile.location?.district || profile.location?.country}</p>
                      </div>
                    </div>
                    {profile.location?.formattedAddress && (
                      <div className="pt-4 border-t border-gray-800/50">
                        <p className="text-[10px] text-gray-500 leading-relaxed uppercase font-bold">{profile.location.formattedAddress}</p>
                      </div>
                    )}
                </div>
              </section>

              {/* SPECIALTIES */}
              <section>
                <h3 className="text-sm font-black italic uppercase text-gray-500 mb-4 flex items-center gap-2"><Star size={16} className="text-[#fdcb6e]"/> Expertises</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.specialties?.map((s, i) => (
                    <Badge key={i} className="bg-[#7b2cbf]/10 text-[#00f5d4] border border-[#7b2cbf]/30 px-3 py-1 rounded-full text-[10px] font-black uppercase italic tracking-wider">
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>
            </div>
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

  const searchCoaches = useCallback(async () => {
    setIsLoading(true);
    setIsAiLoading(true);
    setRealWorldResults([]);

    try {
      // 1. Recherche Interne Kaybee
      const q = query(collection(db, "users"), where("role", "==", "coach"));
      const snap = await getDocs(q);
      let internalResults = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (selectedSport !== 'all') {
        internalResults = internalResults.filter(c => c.specialties && c.specialties.includes(selectedSport));
      }
      if (location) {
        internalResults = internalResults.filter(c => c.location?.city?.toLowerCase().includes(location.toLowerCase()) || c.city?.toLowerCase().includes(location.toLowerCase()));
      }
      internalResults = internalResults.filter(c => (c.priceStart || 0) <= budget[0]);

      setCoaches(internalResults);

      // 2. Recherche Externe (Google Places via Gemini)
      if (location && location.length > 2) {
        const sportTerm = selectedSport === 'all' ? 'Fitness' : selectedSport;
        const results = await searchCoachesWithGemini(location, sportTerm, budget[0], sessionType, internalResults);

        const externalOnly = results.filter(r => r.isExternal).map((c, i) => ({
          ...c,
          coverImage: c.coverImage || `https://source.unsplash.com/random/800x600?${sportTerm},gym&sig=${i}`
        }));
        setRealWorldResults(externalOnly);
      }

    } catch (e) {
      console.error("Search Error:", e);
    } finally {
      setIsLoading(false);
      setIsAiLoading(false);
    }
  }, [location, selectedSport, budget, sessionType]);

  // Initialisation et vérification du rôle
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
                // Recherche initiale
                searchCoaches();
            }
        }
    };
    init();
  }, [currentUser, searchCoaches]);

  // Recherche automatique avec debounce pour la saisie de localisation
  useEffect(() => {
    if (userRole === 'coach') return;

    const delayDebounceFn = setTimeout(() => {
      if (location.length > 2 || selectedSport !== 'all') {
        searchCoaches();
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [location, selectedSport, budget, sessionType, userRole, searchCoaches]);

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
                      <div className="h-32 bg-gray-800 relative">
                        <img src={coach.coverImage || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80"} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[#00f5d4] font-black text-sm">
                          {coach.priceStart ? `${t('rate_start')} ${coach.priceStart}${getCurrencyFromLocation(coach.location)}` : "Sur devis"}
                        </div>
                      </div>
                      <CardContent className="relative pt-0 px-4 pb-4">
                        <div className="flex justify-between items-end -mt-10 mb-3"><Avatar className="w-20 h-20 border-4 border-[#1a1a20]"><AvatarImage src={coach.avatar} className="object-cover"/><AvatarFallback className="bg-[#7b2cbf] text-white font-black">{coach.full_name?.[0] || "C"}</AvatarFallback></Avatar><div className="flex gap-1 flex-wrap justify-end">{coach.specialties?.slice(0, 2).map(s => (<Badge key={s} className="bg-white/10 text-white hover:bg-[#7b2cbf] border-none text-[10px] uppercase font-black">{s}</Badge>))}</div></div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <h3 className="text-xl font-black italic text-white group-hover:text-[#00f5d4] transition-colors uppercase tracking-tighter">{coach.full_name || coach.name}</h3>
                            <div className="flex items-center text-[#ffd700] text-sm font-bold"><Star size={14} className="fill-[#ffd700] mr-1"/> {coach.rating || "5.0"}</div>
                          </div>
                          <p className="text-gray-400 text-[10px] font-black uppercase flex items-center gap-1 mb-3 tracking-widest"><MapPin size={10} className="text-red-500"/> {coach.location?.city || coach.city || "N/A"}</p>
                          <p className="text-sm text-gray-300 line-clamp-2 italic">{coach.bio || "..."}</p>
                        </div>
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
          <DialogContent className="bg-transparent border-none text-white max-w-5xl p-0 h-[85vh] overflow-hidden rounded-[2.5rem] shadow-2xl">
            {selectedCoach && !selectedCoach.isExternal && (
                <CoachProfile coachData={selectedCoach} isOwner={false} onHire={() => handleHireCoach(selectedCoach)}/>
            )}
          </DialogContent>
      </Dialog>
    </div>
  );
}
