import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  MapPin, Search, Star, Globe, Loader2, CheckCircle, ExternalLink,
  Sparkles, Handshake, LayoutGrid, Play, Image as ImageIcon, Upload, Plus, MessageSquare,
  Calendar, Clock, CreditCard, Tag, Percent, User, Users, Laptop, Zap, Heart, Dumbbell, Flame, Activity, Filter, X, Phone
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

// --- SOUS-COMPOSANT : PROFIL COACH ---
const CoachProfile = ({ coachData, isOwner, onHire }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(coachData || {});
  const [posts, setPosts] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  const currency = getCurrencyFromLocation(profile.location);

  useEffect(() => {
    const fetchPublicPosts = async () => {
      if (!profile.id || profile.isExternal) return;
      try {
        const q = query(
          collection(db, "posts"),
          where("userId", "==", profile.id),
          where("isProfileShowcase", "==", true),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) { console.log("Chargement posts..."); }
    };
    fetchPublicPosts();
  }, [profile.id]);

  const displayLocation = typeof profile.location === 'string'
    ? profile.location
    : (profile.location?.formattedAddress || profile.location?.city || "Lieu inconnu");

  return (
    <div className="bg-[#0a0a0f] text-white h-full overflow-y-auto p-4 sm:p-8 custom-scrollbar">
        <div className="flex flex-col items-center sm:items-start sm:flex-row gap-6 mb-8">
            <Avatar className="size-24 sm:size-32 border-4 border-[#1a1a20] ring-2 ring-[#00f5d4] shadow-2xl">
              <AvatarImage src={profile.avatar || profile.coverImage} className="object-cover"/>
              <AvatarFallback className="bg-[#7b2cbf] text-2xl sm:text-4xl font-black">{profile.full_name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="text-center sm:text-left flex-1">
                <h1 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tighter drop-shadow-lg">{profile.full_name}</h1>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <Badge className={`border-none text-[9px] font-black uppercase ${profile.isExternal ? 'bg-blue-600/20 text-blue-400' : 'bg-[#7b2cbf]/20 text-[#00f5d4]'}`}>
                    {profile.isExternal ? 'RÉSULTAT WEB VÉRIFIÉ' : 'KAYBEE ÉLITE COACH'}
                  </Badge>
                  {profile.location && (
                    <div className="flex items-center gap-1 text-gray-400 text-[10px] font-black uppercase bg-black/40 px-2 py-0.5 rounded-lg border border-white/5">
                      <MapPin size={10} className="text-red-500" /> {displayLocation}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-6 justify-center sm:justify-start">
                    {profile.isExternal ? (
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                            {profile.website && (
                                <Button onClick={() => window.open(profile.website, '_blank')} className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase italic h-10 px-8 rounded-xl shadow-lg shadow-blue-600/20">
                                    <ExternalLink size={16} className="mr-2"/> Visiter Site
                                </Button>
                            )}
                            {profile.phone && (
                                <Button onClick={() => window.open(`tel:${profile.phone}`)} variant="outline" className="border-blue-600 text-blue-400 hover:bg-blue-600/10 font-black uppercase italic h-10 px-6 rounded-xl">
                                    <Phone size={16} className="mr-2"/> Appeler
                                </Button>
                            )}
                        </div>
                    ) : isOwner ? (
                       <Button onClick={() => setIsEditing(!isEditing)} className="bg-[#7b2cbf] text-white rounded-xl h-10 text-xs px-6 uppercase font-black shadow-lg shadow-[#7b2cbf]/20">{isEditing ? 'Annuler' : 'Modifier'}</Button>
                    ) : (
                       <Button onClick={onHire} className="bg-[#00f5d4] text-black font-black uppercase italic h-10 px-8 rounded-xl shadow-lg shadow-[#00f5d4]/20"><Handshake size={16} className="mr-2"/> {t('hire')}</Button>
                    )}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
            <div className="lg:col-span-2 space-y-6">
                <section>
                    <h3 className="text-xs font-black uppercase text-gray-500 mb-3 flex items-center gap-2 tracking-widest"><Activity size={14} className="text-[#00f5d4]"/> Description</h3>
                    <div className="bg-[#1a1a20]/60 p-5 sm:p-6 rounded-2xl border border-gray-800 shadow-inner">
                      <p className="text-sm text-gray-300 leading-relaxed italic">{profile.bio || "Aucune description fournie pour cet établissement."}</p>
                    </div>
                </section>

                {profile.isExternal && (
                    <section>
                         <h3 className="text-xs font-black uppercase text-gray-500 mb-3 flex items-center gap-2 tracking-widest"><Globe size={14} className="text-blue-400"/> Localisation & Avis</h3>
                         <div className="bg-blue-500/5 p-6 rounded-2xl border border-blue-500/20 space-y-4">
                             <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl">
                                 <span className="text-[10px] font-black uppercase text-gray-400">Note Google</span>
                                 <div className="flex items-center gap-1 text-[#ffd700] font-black"><Star size={14} className="fill-[#ffd700]"/> {profile.rating} / 5</div>
                             </div>
                             {profile.address && (
                                <div className="space-y-2">
                                    <span className="text-[10px] font-black uppercase text-gray-400">Adresse Exacte</span>
                                    <div className="bg-black/40 p-4 rounded-xl text-xs font-bold text-gray-300 border border-white/5 flex items-start gap-2">
                                        <MapPin size={14} className="text-red-500 shrink-0 mt-0.5"/>
                                        {profile.address}
                                    </div>
                                </div>
                             )}
                         </div>
                    </section>
                )}
            </div>
        </div>
    </div>
  );
};

export default function Community() {
  const { currentUser } = useAuth();
  const { t } = useTranslation(); 

  const [allResults, setAllResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState(null);

  const [userRole, setUserRole] = useState(null);
  const [myProfileData, setMyProfileData] = useState(null);

  // FILTRES
  const [locationObj, setLocationObj] = useState({ city: '', formattedAddress: '' });
  const [budget, setBudget] = useState([150]);
  const [selectedSport, setSelectedSport] = useState('all');
  const [sessionType, setSessionType] = useState('all');

  const placePickerRef = useRef(null);

  const searchCoaches = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "users"), where("role", "==", "coach"));
      const snap = await getDocs(q);
      let internalCoaches = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (selectedSport !== 'all') internalCoaches = internalCoaches.filter(c => c.specialties?.includes(selectedSport));
      if (locationObj.city) {
          internalCoaches = internalCoaches.filter(c =>
            c.location?.city?.toLowerCase().includes(locationObj.city.toLowerCase()) ||
            c.city?.toLowerCase().includes(locationObj.city.toLowerCase())
          );
      }
      internalCoaches = internalCoaches.filter(c => (c.priceStart || 0) <= budget[0]);

      let googleResults = [];
      if (locationObj.city && window.google) {
          try {
              const { PlacesService, PlacesServiceStatus } = await window.google.maps.importLibrary("places");
              const service = new PlacesService(document.createElement('div'));
              const queryStr = `${selectedSport === 'all' ? 'Gym Fitness' : selectedSport} in ${locationObj.city}`;

              googleResults = await new Promise((resolve) => {
                  service.textSearch({ query: queryStr }, (results, status) => {
                      if (status === PlacesServiceStatus.OK && results) {
                          resolve(results.map(p => ({
                              id: p.place_id, placeId: p.place_id, full_name: p.name,
                              location: p.formatted_address, address: p.formatted_address,
                              rating: p.rating || 0, isExternal: true, source: 'Google Maps',
                              coverImage: p.photos?.[0]?.getUrl({maxWidth: 800}) || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
                              avatar: p.icon || "",
                              specialty: selectedSport === 'all' ? 'Fitness' : selectedSport
                          })));
                      } else resolve([]);
                  });
              });
          } catch (e) { console.error(e); }
      }

      const combined = await searchCoachesWithGemini(
          locationObj.city || 'Partout',
          selectedSport === 'all' ? 'Fitness' : selectedSport,
          budget[0],
          sessionType,
          internalCoaches,
          googleResults
      );

      setAllResults(combined);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  }, [locationObj, selectedSport, budget, sessionType]);

  const fetchDetails = async (placeId) => {
    if (!window.google || !placeId) return null;
    const { PlacesService } = await window.google.maps.importLibrary("places");
    const service = new PlacesService(document.createElement('div'));
    return new Promise((resolve) => {
        service.getDetails({ placeId, fields: ['website', 'formatted_phone_number'] }, (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK) {
                resolve({ website: place.website, phone: place.formatted_phone_number });
            } else resolve(null);
        });
    });
  };

  const handleOpenCoach = async (coach) => {
    if (coach.isExternal && coach.placeId) {
        const details = await fetchDetails(coach.placeId);
        setSelectedCoach({ ...coach, ...details });
    } else setSelectedCoach(coach);
  };

  useEffect(() => {
    const init = async () => {
        if (!currentUser) return;
        const userRef = query(collection(db, "users"), where("uid", "==", currentUser.uid));
        const userDoc = await getDocs(userRef);
        if (!userDoc.empty) {
            const data = userDoc.docs[0].data();
            setUserRole(data.role);
            if (data.role === 'coach') setMyProfileData({ id: userDoc.docs[0].id, ...data });
            else searchCoaches();
        }
    };
    init();
  }, [currentUser]);

  useEffect(() => {
    const picker = placePickerRef.current;
    if (picker) {
        const handlePlaceChange = () => {
            const place = picker.value;
            if (place) {
                const city = place.address_components?.find(c => c.types.includes('locality'))?.long_name || '';
                setLocationObj({ city, formattedAddress: place.formatted_address || '' });
            }
        };
        picker.addEventListener('gmpx-placechange', handlePlaceChange);
        return () => picker.removeEventListener('gmpx-placechange', handlePlaceChange);
    }
  }, []);

  if (userRole === 'coach' && myProfileData) return <CoachProfile coachData={myProfileData} isOwner={true} />;

  return (
    <div className="space-y-4 sm:space-y-6 pb-32 p-2 sm:p-0">

      <div className="relative overflow-hidden bg-gradient-to-br from-[#7b2cbf]/30 to-black p-6 sm:p-10 rounded-2xl sm:rounded-3xl border border-white/5 shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Globe size={120} className="text-[#00f5d4]"/></div>
        <h1 className="text-3xl sm:text-5xl font-black italic uppercase text-white flex items-center gap-3 relative z-10">
            EXPLORER <Sparkles className="text-[#00f5d4] size-6 sm:size-8 animate-bounce"/>
        </h1>
        <p className="text-[#00f5d4] text-[10px] sm:text-xs mt-2 uppercase font-black tracking-[0.3em] relative z-10 opacity-80">Recherche de lieux réels boostée par IA</p>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6">

        {/* FILTRES RESPONSIVE */}
        <div className="lg:col-span-1">
            <div className="block lg:hidden mb-4">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button className="w-full h-12 bg-[#1a1a20] border border-[#7b2cbf]/40 text-white font-black uppercase italic rounded-xl shadow-lg flex items-center gap-3">
                            <Filter size={18} className="text-[#00f5d4]"/> Paramètres de Recherche
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="bg-[#0a0a0f] border-t border-[#7b2cbf]/30 rounded-t-3xl p-6 h-[85vh]">
                        <SheetHeader className="pb-4 border-b border-white/5"><SheetTitle className="text-white font-black uppercase italic text-xl">Filtres Experts</SheetTitle></SheetHeader>
                        <div className="space-y-6 py-6 h-full overflow-y-auto pb-32">
                             <div className="space-y-2">
                                <label className="text-[10px] font-black text-[#00f5d4] uppercase tracking-widest">Zone Géographique</label>
                                <gmpx-place-picker ref={placePickerRef} style={{"--gmpx-color-surface": "#1a1a20", "--gmpx-color-on-surface": "#fff", "width": "100%", "borderRadius": "12px"}}></gmpx-place-picker>
                             </div>
                             <div className="space-y-2">
                                <label className="text-[10px] font-black text-[#00f5d4] uppercase tracking-widest">Discipline Sportive</label>
                                <Select value={selectedSport} onValueChange={setSelectedSport}>
                                    <SelectTrigger className="bg-[#1a1a20] border-gray-800 h-12 font-black text-[#00f5d4]">
                                        <SelectValue placeholder="Toutes disciplines"/>
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1a20] text-white font-black uppercase">
                                        <SelectItem value="all">Tout</SelectItem>
                                        {SPORTS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                             </div>
                             <div className="space-y-4">
                                <div className="flex justify-between items-center"><label className="text-[10px] font-black text-[#00f5d4] uppercase">Budget Max</label><span className="text-xl font-black text-white">{budget[0]}$</span></div>
                                <Slider max={500} step={10} value={budget} onValueChange={setBudget} />
                             </div>
                             <Button onClick={searchCoaches} className="w-full bg-[#7b2cbf] text-white font-black h-14 rounded-2xl shadow-xl shadow-[#7b2cbf]/20">APPLIQUER LA RECHERCHE</Button>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            <Card className="hidden lg:block bg-[#1a1a20] border-[#7b2cbf]/30 sticky top-4 shadow-xl">
                <CardHeader className="border-b border-white/5"><CardTitle className="text-white uppercase text-xs font-black italic tracking-widest">CONFIGURATION</CardTitle></CardHeader>
                <CardContent className="p-5 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#00f5d4] uppercase">Localisation</label>
                        <gmpx-place-picker ref={placePickerRef} style={{"--gmpx-color-surface": "#000", "--gmpx-color-on-surface": "#fff", "width": "100%", "borderRadius": "10px"}}></gmpx-place-picker>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#00f5d4] uppercase">Discipline</label>
                        <Select value={selectedSport} onValueChange={setSelectedSport}>
                            <SelectTrigger className="bg-black border-[#7b2cbf]/30 h-10 font-black text-xs text-[#00f5d4]">
                                <SelectValue placeholder="Toutes disciplines"/>
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a20] text-white font-black uppercase border-gray-800">
                                <SelectItem value="all">Toutes disciplines</SelectItem>
                                {SPORTS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-4 pt-2">
                        <div className="flex justify-between items-end"><label className="text-[10px] font-black text-[#00f5d4] uppercase">Budget Max</label><span className="text-lg font-black text-white leading-none">{budget[0]}$</span></div>
                        <Slider max={500} step={10} value={budget} onValueChange={setBudget} />
                    </div>
                    <Button onClick={searchCoaches} className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-black h-12 rounded-xl transition-all shadow-lg" disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin" /> : "RECHERCHER"}</Button>
                </CardContent>
            </Card>
        </div>

        {/* RÉSULTATS HYBRIDES */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
                {allResults.map((item, idx) => (
                    <motion.div key={item.id || idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                        <Card className={`group bg-[#1a1a20] border-gray-800 overflow-hidden cursor-pointer hover:border-[#00f5d4]/40 transition-all active:scale-[0.98] ${item.isExternal ? 'border-blue-500/10' : ''}`} onClick={() => handleOpenCoach(item)}>
                            <div className="h-40 sm:h-48 bg-black relative overflow-hidden flex items-center justify-center">
                                <img
                                    src={item.avatar || item.coverImage || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80"}
                                    className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                                    loading="lazy"
                                />
                                <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
                                    <Badge className={`border-none text-[8px] font-black px-2 py-1 shadow-xl ${item.isExternal ? 'bg-blue-600' : 'bg-[#7b2cbf]'}`}>{item.source}</Badge>
                                    {item.priceStart && <Badge className="bg-black/90 text-[#00f5d4] border-none text-[10px] font-black">DÈS {item.priceStart}$</Badge>}
                                </div>
                                {item.rating > 0 && <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1.5"><Star size={12} className="fill-[#ffd700] text-[#ffd700]"/><span className="text-[12px] font-black text-white">{item.rating}</span></div>}
                            </div>
                            <CardContent className="p-4 sm:p-5">
                                <h3 className="font-black italic uppercase text-lg text-white truncate group-hover:text-[#00f5d4] transition-colors">{item.full_name}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1.5 mt-1.5 truncate">
                                    <MapPin size={12} className="text-red-500"/>
                                    {typeof item.location === 'string' ? item.location : (item.location?.formattedAddress || item.location?.city || "Lieu inconnu")}
                                </p>
                                <div className="flex gap-1.5 mt-4"><Badge variant="outline" className="bg-white/5 border-none text-gray-400 text-[9px] font-black uppercase px-2 py-0.5">{item.specialty || item.specialties?.[0]}</Badge></div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedCoach} onOpenChange={() => setSelectedCoach(null)}>
          <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-full sm:max-w-5xl p-0 h-[92vh] sm:h-[85vh] overflow-hidden rounded-t-[2.5rem] sm:rounded-3xl fixed bottom-0 sm:relative">
            {selectedCoach && (
                <div className="relative h-full flex flex-col">
                    <button onClick={() => setSelectedCoach(null)} className="absolute top-6 right-6 z-50 bg-black/60 p-2 rounded-full border border-white/10 hover:bg-red-500/20 transition-all"><X size={24}/></button>
                    <CoachProfile coachData={selectedCoach} isOwner={false} onHire={() => setSelectedCoach(null)}/>
                </div>
            )}
          </DialogContent>
      </Dialog>
    </div>
  );
}
