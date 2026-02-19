import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, storage } from '@/lib/firebase';
import { 
  collection, addDoc, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Upload, Image as ImageIcon, Video, Trash2, Eye, Users, Lock, Globe, Play, 
  Camera, SplitSquareHorizontal, X, UserCheck, Heart, MessageCircle, Share2, LayoutGrid, FileImage,
  History, Clock, Sparkles, Loader2, AlertCircle, ShieldCheck, MapPin, Wand2, Volume2, VolumeX, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';
import KaybeeSocial from '@/pages/kaybeesocial';
import { moderateImage } from '@/lib/moderation';
import { Geolocation } from '@capacitor/geolocation';

// --- CONSTANTES ---
const CATEGORIES = [
  { id: 'all', icon: <LayoutGrid size={14}/> },
  { id: 'physique', icon: <Users size={14}/> },
  { id: 'posing', icon: <Camera size={14}/> },
  { id: 'repas', icon: <ImageIcon size={14}/> },
  { id: 'reference', icon: <History size={14}/> }
];

const FILTERS = [
  { name: 'Normal', filter: 'none' },
  { name: 'Clair', filter: 'brightness(1.2) contrast(1.1)' },
  { name: 'Chaud', filter: 'sepia(0.3) saturate(1.4)' },
  { name: 'Froid', filter: 'hue-rotate(180deg) saturate(1.2)' },
  { name: 'N&B', filter: 'grayscale(1)' },
  { name: 'Vintage', filter: 'sepia(0.5) contrast(0.9) brightness(0.9)' },
];

export default function Gallery() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  
  // --- MODE HYBRIDE ---
  const clientContext = useClient() || {};
  const { selectedClient, isCoachView, targetUserId } = clientContext;
  const activeUserId = targetUserId || currentUser?.uid;

  // --- ÉTATS ---
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery' ou 'social'
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Données
  const [mediaList, setMediaList] = useState([]);
  const [myUpdatesTicker, setMyUpdatesTicker] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Upload
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadCategory, setUploadCategory] = useState('physique');
  const [uploadPrivacy, setUploadPrivacy] = useState('Coach');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [moderationError, setModerationError] = useState(null);

  // Options Instagram
  const [useLocation, setUseLocation] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('Normal');
  const [isMuted, setIsMuted] = useState(false);

  const fileInputRef = useRef(null);

  // Lightbox & Comparaison
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState([]);

  // --- 1. CHARGEMENT DES DONNÉES ---
  useEffect(() => {
    const fetchData = async () => {
      if (!activeUserId) return;
      setIsLoading(true);
      
      try {
        const postsRef = collection(db, "posts");
        const qUserPosts = query(
          postsRef, 
          where("userId", "==", activeUserId),
          orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(qUserPosts);
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMediaList(posts);

        if (!isCoachView && activeUserId === currentUser?.uid) {
            const qRecent = query(
                postsRef,
                where("userId", "==", currentUser.uid),
                orderBy("createdAt", "desc"),
                limit(10)
            );
            const recentSnap = await getDocs(qRecent);
            setMyUpdatesTicker(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }

      } catch (e) {
        console.error("Erreur chargement galerie:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeUserId, isCoachView, currentUser]);

  // --- GESTION LOCALISATION ---
  const handleLocationToggle = async (checked) => {
    setUseLocation(checked);
    if (checked) {
        try {
            await Geolocation.requestPermissions();
            const position = await Geolocation.getCurrentPosition();
            setLocationName("Position Actuelle");
        } catch (e) {
            console.error("Erreur géo:", e);
            setUseLocation(false);
        }
    } else {
        setLocationName('');
    }
  };

  // --- 2. GESTION UPLOAD ---
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
        const newFiles = Array.from(e.target.files);
        setUploadFiles(prev => [...prev, ...newFiles]);
        setModerationError(null);
    }
  };

  const removeFile = (index) => {
      setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
  });

  const handleUpload = async () => {
    if (uploadFiles.length === 0 || !currentUser) return;
    setIsUploading(true);
    setUploadProgress(0);
    setModerationError(null);

    const newPosts = [];
    let processedCount = 0;

    try {
        const hashtags = uploadCaption.match(/#\w+/g) || [];

        for (const file of uploadFiles) {
            if (uploadPrivacy === 'Public' || uploadPrivacy === 'Amis') {
                if (file.type.startsWith('image')) {
                    const base64 = await toBase64(file);
                    const modResult = await moderateImage(base64);
                    if (!modResult.isSafe) {
                        setModerationError(`L'image "${file.name}" a été rejetée : ${modResult.reason || "Non conforme."}`);
                        setIsUploading(false);
                        return;
                    }
                }
            }

            const fileName = `${Date.now()}_${file.name}`;
            const storagePath = `gallery/${activeUserId}/${fileName}`;
            const storageRef = ref(storage, storagePath);
            
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            const newPost = {
                userId: activeUserId,
                authorId: currentUser.uid,
                authorName: isCoachView ? "Coach" : (currentUser.displayName || "Moi"),
                authorAvatar: currentUser.photoURL || "",
                mediaUrl: downloadURL,
                type: file.type.startsWith('video') ? 'video' : 'image',
                category: isCoachView ? 'reference' : uploadCategory,
                privacy: uploadPrivacy,
                caption: uploadCaption,
                hashtags: hashtags,
                location: locationName,
                filter: selectedFilter,
                isMuted: file.type.startsWith('video') ? isMuted : false,
                uploadedByCoach: isCoachView,
                createdAt: new Date().toISOString(),
                likes: [],
                comments: []
            };

            const docRef = await addDoc(collection(db, "posts"), newPost);
            newPosts.push({ id: docRef.id, ...newPost });

            processedCount++;
            setUploadProgress(Math.round((processedCount / uploadFiles.length) * 100));
        }

        setMediaList(prev => [...newPosts, ...prev]);
        if (!isCoachView) setMyUpdatesTicker(prev => [...newPosts, ...prev].slice(0, 10));

        setTimeout(() => {
            setIsUploadOpen(false);
            setUploadFiles([]);
            setUploadCaption('');
            setUploadProgress(0);
            setIsUploading(false);
            setUseLocation(false);
            setLocationName('');
            setSelectedFilter('Normal');
            setIsMuted(false);
        }, 500);

    } catch (e) {
        console.error("Erreur upload", e);
        setIsUploading(false);
        alert(t('error'));
    }
  };

  const handleDelete = async (postId) => {
    if(!window.confirm(t('confirm_delete'))) return;
    try {
        await deleteDoc(doc(db, "posts", postId));
        setMediaList(mediaList.filter(p => p.id !== postId));
        setMyUpdatesTicker(myUpdatesTicker.filter(p => p.id !== postId));
        if (selectedMedia?.id === postId) setSelectedMedia(null);
    } catch (e) {
        console.error(e);
    }
  };

  const toggleCompareSelection = (post) => {
    if (compareSelection.find(p => p.id === post.id)) {
        setCompareSelection(compareSelection.filter(p => p.id !== post.id));
    } else {
        if (compareSelection.length < 2) {
            setCompareSelection([...compareSelection, post]);
        }
    }
  };

  const filteredMedia = mediaList.filter(m => {
      if (filterCategory === 'all') return true;
      return m.category === filterCategory;
  });

  const PrivacyBadge = ({ privacy }) => {
      const config = {
          'Public': { icon: Globe, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', label: t('visible_community') },
          'Amis': { icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: "Amis" },
          'Coach': { icon: UserCheck, color: 'text-[#9d4edd]', bg: 'bg-[#9d4edd]/10', border: 'border-[#9d4edd]/20', label: t('visible_coach') },
          'Privé': { icon: Lock, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', label: t('me_only') },
      }[privacy] || { icon: Lock, color: 'text-gray-400', bg: 'bg-gray-400/10', border: '', label: privacy };

      const Icon = config.icon;
      return (
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] uppercase font-bold border ${config.bg} ${config.color} ${config.border}`}>
              <Icon size={9} /> {config.label}
          </div>
      );
  };

  return (
    <div className="p-3 sm:p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white relative pb-32 max-w-full overflow-x-hidden">
      
      {/* --- SWITCHER --- */}
      <div className="max-w-7xl mx-auto mb-5 sm:mb-6">
        <div className="bg-black/40 p-1 rounded-2xl border border-gray-800 shadow-2xl flex gap-1">
            <button
                onClick={() => setActiveTab('gallery')}
                className={`flex-1 h-11 sm:h-12 rounded-xl font-black uppercase italic tracking-tighter text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 border
                    ${activeTab === 'gallery'
                        ? 'bg-[#00f5d4] border-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20'
                        : 'bg-transparent border-transparent text-gray-500 hover:text-white'}`}
            >
                <LayoutGrid size={16}/> {t('gallery')}
            </button>
            <button
                onClick={() => setActiveTab('social')}
                className={`flex-1 h-11 sm:h-12 rounded-xl font-black uppercase italic tracking-tighter text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 border
                    ${activeTab === 'social'
                        ? 'bg-[#9d4edd] border-[#9d4edd] text-white shadow-lg shadow-[#9d4edd]/20'
                        : 'bg-transparent border-transparent text-gray-500 hover:text-white'}`}
            >
                <Sparkles size={16}/> Social
            </button>
        </div>
      </div>

      {activeTab === 'gallery' ? (
        <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
          {/* --- HEADER --- */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`p-2 sm:p-2.5 rounded-xl ${isCoachView ? 'bg-[#7b2cbf]' : 'bg-[#00f5d4]'}`}>
                        <ImageIcon className="text-black w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black italic uppercase text-white tracking-tighter truncate max-w-[150px] sm:max-w-none">
                        {isCoachView ? t('client_gallery') : t('my_gallery')}
                    </h1>
                </div>

                <div className="flex gap-1.5 sm:gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className={`transition-all h-9 w-9 sm:h-10 sm:w-10 rounded-xl border-2 ${
                            compareMode
                            ? 'bg-red-500 border-red-500 text-white'
                            : 'bg-white/5 border-gray-800 text-white'
                        }`}
                        onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
                    >
                        <SplitSquareHorizontal size={16} />
                    </Button>

                    <Button
                        size="icon"
                        className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl shadow-xl transition-all
                            ${isCoachView ? 'bg-[#7b2cbf] text-white' : 'bg-[#00f5d4] text-black shadow-[#00f5d4]/20'}`}
                        onClick={() => setIsUploadOpen(!isUploadOpen)}
                    >
                        {isUploadOpen ? <X size={18}/> : <Upload size={18} />}
                    </Button>
                </div>
            </div>
          </div>

          {/* ZONE D'UPLOAD */}
          <AnimatePresence>
            {isUploadOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    <Card className="bg-[#1a1a20] border border-gray-800 shadow-2xl rounded-2xl overflow-hidden mb-6">
                        <CardContent className="p-3 sm:p-4 space-y-4">
                            <div
                                className="border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center p-4 sm:p-6 cursor-pointer hover:border-[#00f5d4] hover:bg-[#00f5d4]/5 transition-all min-h-[150px] sm:min-h-[180px] group relative overflow-hidden"
                                onClick={() => fileInputRef.current.click()}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" multiple onChange={handleFileSelect}/>

                                {uploadFiles.length > 0 ? (
                                    <div className="w-full">
                                        <div className="flex justify-between items-center mb-3">
                                            <p className="text-[#00f5d4] font-black uppercase italic tracking-tighter text-[10px] sm:text-sm">{uploadFiles.length} MÉDIAS PRÊTS</p>
                                            <div className="flex gap-2">
                                                {uploadFiles.some(f => f.type.startsWith('video')) && (
                                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full ${isMuted ? 'text-red-500 bg-red-500/10' : 'text-[#00f5d4] bg-[#00f5d4]/10'}`}>
                                                        {isMuted ? <VolumeX size={14}/> : <Volume2 size={14}/>}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                            {uploadFiles.map((file, idx) => (
                                                <div key={idx} className="relative aspect-square bg-black rounded-xl overflow-hidden border border-gray-800" onClick={(e) => e.stopPropagation()}>
                                                    {file.type.startsWith('video') ? (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-900"><Video size={16}/></div>
                                                    ) : (
                                                        <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" style={{ filter: FILTERS.find(f => f.name === selectedFilter)?.filter || 'none' }} />
                                                    )}
                                                    <button onClick={() => removeFile(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 shadow-lg"><X size={10} /></button>
                                                </div>
                                            ))}
                                            <div className="aspect-square flex items-center justify-center bg-gray-900 border-2 border-dashed border-gray-800 rounded-xl">
                                                <Plus size={16} className="text-gray-600"/>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center space-y-2">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-800 flex items-center justify-center mx-auto group-hover:bg-[#00f5d4] group-hover:text-black transition-all">
                                            <Upload size={18} />
                                        </div>
                                        <p className="text-white font-black uppercase italic tracking-tighter text-[9px] sm:text-xs">{t('click_to_upload')}</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <Textarea
                                    value={uploadCaption}
                                    onChange={(e) => setUploadCaption(e.target.value)}
                                    placeholder="Légende..."
                                    className="bg-black/40 border-gray-800 rounded-xl min-h-[70px] sm:min-h-[80px] text-xs sm:text-sm focus:border-[#00f5d4] transition-all focus-visible:ring-0"
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    <Select value={uploadCategory} onValueChange={setUploadCategory}>
                                        <SelectTrigger className="bg-black/40 border-gray-800 text-white h-9 sm:h-10 rounded-xl text-[10px] sm:text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white rounded-xl">
                                            <SelectItem value="physique" className="uppercase font-bold text-[9px] sm:text-[10px]">{t('physique')}</SelectItem>
                                            <SelectItem value="posing" className="uppercase font-bold text-[9px] sm:text-[10px]">{t('posing')}</SelectItem>
                                            <SelectItem value="repas" className="uppercase font-bold text-[9px] sm:text-[10px]">{t('meal')}</SelectItem>
                                            <SelectItem value="reference" className="uppercase font-bold text-[9px] sm:text-[10px]">Suivi</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={uploadPrivacy} onValueChange={(val) => { setUploadPrivacy(val); setModerationError(null); }}>
                                        <SelectTrigger className="bg-black/40 border-gray-800 text-white h-9 sm:h-10 rounded-xl text-[10px] sm:text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white rounded-xl">
                                            <SelectItem value="Coach" className="uppercase font-bold text-[9px] sm:text-[10px]">{t('visible_coach')}</SelectItem>
                                            <SelectItem value="Privé" className="uppercase font-bold text-[9px] sm:text-[10px]">{t('me_only')}</SelectItem>
                                            <SelectItem value="Public" className="uppercase font-bold text-[9px] sm:text-[10px]">{t('visible_community')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    className={`w-full font-black uppercase italic tracking-tighter text-sm sm:text-md h-11 sm:h-12 rounded-xl shadow-xl transition-all ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-[#00f5d4] text-black'}`}
                                    disabled={uploadFiles.length === 0 || isUploading}
                                    onClick={handleUpload}
                                >
                                    {isUploading ? <Loader2 className="animate-spin" /> : `Publier (${uploadFiles.length})`}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}
          </AnimatePresence>

          {/* FILTRES CATEGORIES */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
              {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategory(cat.id)}
                    className={`flex-shrink-0 h-8 sm:h-9 px-3 sm:px-4 rounded-full text-[9px] sm:text-[10px] font-black uppercase italic tracking-widest transition-all border flex items-center gap-1.5 sm:gap-2
                        ${filterCategory === cat.id
                            ? 'bg-[#00f5d4] border-[#00f5d4] text-black'
                            : 'bg-[#1a1a20] border-gray-800 text-gray-400'}`}
                  >
                      {cat.icon} {cat.id === 'all' ? 'Tout' : (cat.id === 'reference' ? 'Suivi' : t(cat.id))}
                  </button>
              ))}
          </div>

          {compareMode && (
              <div className="bg-[#00f5d4]/10 border border-[#00f5d4]/40 px-3 sm:px-4 py-2 rounded-xl flex items-center justify-between animate-in slide-in-from-top">
                  <span className="text-[9px] sm:text-[10px] font-black text-[#00f5d4] uppercase tracking-widest">Comparer: {compareSelection.length}/2</span>
                  {compareSelection.length === 2 && (
                      <Button size="sm" className="h-7 sm:h-8 px-3 sm:px-4 bg-[#00f5d4] text-black font-black uppercase italic rounded-lg text-[9px] sm:text-xs" onClick={() => setSelectedMedia('COMPARE')}>
                          Analyser
                      </Button>
                  )}
              </div>
          )}

          {/* GRILLE */}
          {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {[1,2,3,4].map(i => <div key={i} className="aspect-[4/5] bg-[#1a1a20]/60 rounded-2xl border border-gray-800 animate-pulse"></div>)}
              </div>
          ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <AnimatePresence>
                      {filteredMedia.map((media) => {
                          const isSelectedForCompare = compareSelection.find(p => p.id === media.id);

                          return (
                              <motion.div
                                  key={media.id}
                                  layout
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`relative group aspect-[4/5] rounded-2xl overflow-hidden bg-[#1a1a20] border-2 cursor-pointer transition-all
                                      ${isSelectedForCompare ? 'border-[#00f5d4] ring-2 ring-[#00f5d4]/20' : 'border-gray-800/50'}
                                  `}
                                  onClick={() => {
                                      if (compareMode) toggleCompareSelection(media);
                                      else setSelectedMedia(media);
                                  }}
                              >
                                  {media.type === 'video' ? (
                                      <video src={media.mediaUrl} className="w-full h-full object-cover" />
                                  ) : (
                                      <img src={media.mediaUrl} className="w-full h-full object-cover" loading="lazy" style={{ filter: FILTERS.find(f => f.name === media.filter)?.filter || 'none' }} />
                                  )}

                                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                                  <div className="absolute bottom-1.5 sm:bottom-2 left-2 right-2 flex justify-between items-end">
                                      <p className="text-white font-black italic uppercase tracking-tighter text-[8px] sm:text-[9px]">{format(new Date(media.createdAt), 'dd MMM', {locale: fr})}</p>
                                      {media.type === 'video' && <Play size={9} fill="white" className="text-white"/>}
                                  </div>

                                  {compareMode && isSelectedForCompare && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                                          <div className="bg-[#00f5d4] text-black w-8 h-8 sm:w-10 sm:h-10 rounded-full font-black italic text-base sm:text-lg flex items-center justify-center border-2 border-black shadow-lg">
                                            {compareSelection.findIndex(p => p.id === media.id) + 1}
                                          </div>
                                      </div>
                                  )}
                              </motion.div>
                          );
                      })}
                  </AnimatePresence>
              </div>
          )}
        </div>
      ) : (
        <KaybeeSocial currentUser={currentUser} />
      )}

      {/* MODAL LIGHTBOX / COMPARE */}
      <Dialog open={!!selectedMedia} onOpenChange={() => { setSelectedMedia(null); if(selectedMedia === 'COMPARE') setCompareSelection([]); }}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-full p-0 overflow-hidden rounded-t-[2rem] md:rounded-[2rem] bottom-0 md:bottom-auto fixed md:relative max-h-[95vh] border-0 sm:border">
            {selectedMedia === 'COMPARE' ? (
                <div className="flex flex-col h-full">
                    <div className="flex-1 grid grid-cols-2 gap-0.5 bg-black relative">
                        {compareSelection.map((item, idx) => (
                            <div key={idx} className="relative h-full flex items-center justify-center overflow-hidden border-r border-white/5 last:border-none">
                                <img src={item.mediaUrl} className="w-full h-full object-cover" />
                                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-lg px-2 sm:px-3 py-1 rounded-lg text-[7px] sm:text-[8px] font-black uppercase italic tracking-widest border border-white/10">
                                    {format(new Date(item.createdAt), 'dd MMM yyyy', {locale: fr})}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 bg-[#1a1a20] flex justify-between items-center border-t border-white/5 shrink-0">
                        <p className="text-white font-black italic uppercase tracking-tighter text-xs sm:text-sm">VS</p>
                        <Button onClick={() => setSelectedMedia(null)} className="bg-white/5 text-white font-black uppercase italic rounded-xl px-5 sm:px-6 h-10 text-[10px] sm:text-xs">Fermer</Button>
                    </div>
                </div>
            ) : (
                selectedMedia && selectedMedia !== 'COMPARE' && (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 bg-black flex items-center justify-center relative min-h-[40vh]">
                            {selectedMedia.type === 'video' ? (
                                <video src={selectedMedia.mediaUrl} controls autoPlay className="max-w-full max-h-full" />
                            ) : (
                                <img src={selectedMedia.mediaUrl} className="max-w-full max-h-full object-contain" style={{ filter: FILTERS.find(f => f.name === selectedMedia.filter)?.filter || 'none' }} />
                            )}
                        </div>
                        <div className="p-5 sm:p-6 bg-[#1a1a20] space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <Avatar className="w-9 h-9 sm:w-10 sm:h-10 border border-[#7b2cbf]">
                                        <AvatarFallback className="bg-[#7b2cbf] text-white font-black italic text-xs sm:text-sm">{selectedMedia.authorName?.[0]}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-black italic uppercase tracking-tighter text-xs sm:text-sm text-white truncate max-w-[120px] sm:max-w-none">{selectedMedia.authorName}</p>
                                        <p className="text-[7px] sm:text-[8px] text-gray-500 font-bold uppercase tracking-widest">{format(new Date(selectedMedia.createdAt), 'dd MMMM yyyy', {locale: fr})}</p>
                                    </div>
                                </div>
                                <PrivacyBadge privacy={selectedMedia.privacy} />
                            </div>

                            <p className="text-[11px] sm:text-xs text-gray-400 italic leading-relaxed bg-black/20 p-3 sm:p-4 rounded-2xl border border-white/5">
                              {selectedMedia.caption || "Aucune description."}
                            </p>

                            <div className="flex gap-2 pt-2">
                                <Button variant="ghost" className="flex-1 h-11 sm:h-12 rounded-xl text-gray-500 hover:text-red-500 font-black uppercase italic hover:bg-red-500/10 text-[10px] sm:text-xs" onClick={() => handleDelete(selectedMedia.id)}>
                                    <Trash2 size={16} className="mr-2" /> Supprimer
                                </Button>
                                <Button variant="ghost" className="flex-1 h-11 sm:h-12 rounded-xl text-gray-500 hover:text-[#00f5d4] font-black uppercase italic hover:bg-[#00f5d4]/10 text-[10px] sm:text-xs">
                                    <Share2 size={16} className="mr-2" /> Partager
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
