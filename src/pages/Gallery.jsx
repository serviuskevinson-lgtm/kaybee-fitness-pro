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
  History, Clock, Sparkles, Loader2, AlertCircle, ShieldCheck, MapPin, Wand2, Volume2, VolumeX
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
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${config.bg} ${config.color} ${config.border}`}>
              <Icon size={10} /> {config.label}
          </div>
      );
  };

  return (
    <div className="p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white relative pb-40">
      
      {/* --- SWITCHER --- */}
      <div className="max-w-7xl mx-auto mb-12">
        <div className="bg-black/40 p-2 rounded-[2rem] border border-gray-800 shadow-2xl flex gap-2">
            <button
                onClick={() => setActiveTab('gallery')}
                className={`flex-1 h-16 rounded-[1.5rem] font-black uppercase italic tracking-tighter text-xl transition-all duration-500 flex items-center justify-center gap-3 border-2
                    ${activeTab === 'gallery'
                        ? 'bg-[#00f5d4] border-[#00f5d4] text-black shadow-lg shadow-[#00f5d4]/20 scale-[1.02]'
                        : 'bg-transparent border-transparent text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
                <LayoutGrid size={24}/> Private
            </button>
            <button
                onClick={() => setActiveTab('social')}
                className={`flex-1 h-16 rounded-[1.5rem] font-black uppercase italic tracking-tighter text-xl transition-all duration-500 flex items-center justify-center gap-3 border-2
                    ${activeTab === 'social'
                        ? 'bg-[#9d4edd] border-[#9d4edd] text-white shadow-lg shadow-[#9d4edd]/20 scale-[1.02]'
                        : 'bg-transparent border-transparent text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
                <Sparkles size={24}/> KB Social
            </button>
        </div>
      </div>

      {activeTab === 'gallery' ? (
        <div className="max-w-7xl mx-auto space-y-8">
          {/* --- HEADER --- */}
          <div className="flex flex-col md:flex-row justify-between items-end gap-6">
            <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${isCoachView ? 'bg-[#7b2cbf]' : 'bg-[#00f5d4]'}`}>
                    <ImageIcon className="text-black w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-4xl font-black italic uppercase text-white tracking-tighter">
                        {isCoachView ? `Galerie de ${selectedClient?.full_name}` : 'Ma Galerie Privée'}
                    </h1>
                    <p className="text-gray-400 text-sm font-bold uppercase tracking-widest opacity-70">
                        {isCoachView
                            ? `Historique complet de suivi pour ${selectedClient?.full_name || 'votre client'}`
                            : "Gérez vos souvenirs et suivez votre évolution."}
                    </p>
                </div>
            </div>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    className={`font-bold transition-all h-11 px-6 rounded-xl border-2 ${
                        compareMode
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-white/5 border-gray-800 text-white hover:bg-white/10'
                    }`}
                    onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
                >
                    <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                    {compareMode ? 'Annuler' : 'Comparer'}
                </Button>

                <Button
                    className={`font-black uppercase italic h-11 px-8 rounded-xl shadow-xl hover:scale-105 transition-all
                        ${isCoachView ? 'bg-[#7b2cbf] text-white' : 'bg-[#00f5d4] text-black shadow-[#00f5d4]/20'}`}
                    onClick={() => setIsUploadOpen(!isUploadOpen)}
                >
                    <Upload className="mr-2 h-4 w-4" />
                    {isUploadOpen ? 'Annuler' : 'Ajouter'}
                </Button>
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
                    <Card className="bg-[#1a1a20] border border-gray-800 shadow-2xl rounded-3xl overflow-hidden mb-12">
                        <CardContent className="p-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="md:col-span-2 space-y-6">
                                    <div
                                        className="border-2 border-dashed border-gray-700 rounded-3xl flex flex-col items-center justify-center p-8 cursor-pointer hover:border-[#00f5d4] hover:bg-[#00f5d4]/5 transition-all min-h-[300px] group relative overflow-hidden"
                                        onClick={() => fileInputRef.current.click()}
                                    >
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" multiple onChange={handleFileSelect}/>

                                        {uploadFiles.length > 0 ? (
                                            <div className="w-full">
                                                <div className="flex justify-between items-center mb-6">
                                                    <p className="text-[#00f5d4] font-black uppercase italic tracking-tighter text-xl">{uploadFiles.length} MÉDIAS PRÊTS</p>
                                                    <div className="flex gap-2">
                                                        {uploadFiles.some(f => f.type.startsWith('video')) && (
                                                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className={`h-10 w-10 rounded-full ${isMuted ? 'text-red-500 bg-red-500/10' : 'text-[#00f5d4] bg-[#00f5d4]/10'}`}>
                                                                {isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-60 overflow-y-auto custom-scrollbar p-2">
                                                    {uploadFiles.map((file, idx) => (
                                                        <div key={idx} className="relative aspect-square bg-black rounded-2xl overflow-hidden border border-gray-800 group/item" onClick={(e) => e.stopPropagation()}>
                                                            {file.type.startsWith('video') ? (
                                                                <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-900"><Video size={24}/></div>
                                                            ) : (
                                                                <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" style={{ filter: FILTERS.find(f => f.name === selectedFilter)?.filter || 'none' }} />
                                                            )}
                                                            <button onClick={() => removeFile(idx)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover/item:opacity-100 transition-opacity"><X size={14} /></button>
                                                        </div>
                                                    ))}
                                                    <div className="aspect-square flex items-center justify-center bg-gray-900 border-2 border-dashed border-gray-800 rounded-2xl hover:border-[#00f5d4] transition-colors">
                                                        <Plus size={24} className="text-gray-600"/>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center space-y-4">
                                                <div className="w-16 h-16 rounded-3xl bg-gray-800 flex items-center justify-center mx-auto group-hover:bg-[#00f5d4] group-hover:text-black transition-all">
                                                    <Upload size={28} />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-white font-black uppercase italic tracking-tighter text-lg">{t('drag_drop_media')}</p>
                                                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Sélection multiple supportée</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* FILTRES STYLE INSTAGRAM */}
                                    {uploadFiles.length > 0 && !uploadFiles.some(f => f.type.startsWith('video')) && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 px-1">
                                                <Wand2 size={14} className="text-[#7b2cbf]"/>
                                                <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Filtres Créatifs</span>
                                            </div>
                                            <div className="flex gap-3 overflow-x-auto pb-4 px-1 custom-scrollbar">
                                                {FILTERS.map((f) => (
                                                    <button key={f.name} onClick={() => setSelectedFilter(f.name)} className={`flex-shrink-0 flex flex-col items-center gap-2 group transition-all ${selectedFilter === f.name ? 'scale-105' : 'opacity-60 hover:opacity-100'}`}>
                                                        <div className="w-16 h-16 rounded-xl border-2 overflow-hidden shadow-lg transition-all" style={{ borderColor: selectedFilter === f.name ? '#00f5d4' : 'transparent' }}>
                                                            <div className="w-full h-full bg-gray-800" style={{ filter: f.filter }} />
                                                        </div>
                                                        <span className={`text-[9px] font-bold uppercase ${selectedFilter === f.name ? 'text-[#00f5d4]' : 'text-gray-500'}`}>{f.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest px-1">Légende & Hashtags</label>
                                        <Textarea
                                            value={uploadCaption}
                                            onChange={(e) => setUploadCaption(e.target.value)}
                                            placeholder="Ex: Ma séance jambe d'aujourd'hui ! #fitness #legsday #motivation"
                                            className="bg-black/40 border-gray-800 rounded-2xl min-h-[100px] text-sm focus:border-[#00f5d4] transition-all"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-gray-800 hover:border-[#00f5d4]/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${useLocation ? 'bg-[#00f5d4]/20 text-[#00f5d4]' : 'bg-gray-800 text-gray-500'}`}><MapPin size={18}/></div>
                                            <div>
                                                <p className="text-xs font-bold text-white">Ajouter une localisation</p>
                                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">{locationName || "Désactivé"}</p>
                                            </div>
                                        </div>
                                        <Switch checked={useLocation} onCheckedChange={handleLocationToggle} />
                                    </div>

                                    {moderationError && (
                                        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-400">
                                            <AlertCircle size={20} />
                                            <p className="text-sm font-bold">{moderationError}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    <h3 className="font-black italic uppercase text-white tracking-tighter text-xl flex items-center gap-3">
                                        <Camera size={24} className="text-[#00f5d4]"/> Paramètres
                                    </h3>

                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{t('category')}</label>
                                            <Select value={uploadCategory} onValueChange={setUploadCategory}>
                                                <SelectTrigger className="bg-black/40 border-gray-800 text-white h-12 rounded-xl focus:ring-[#00f5d4] shadow-xl"><SelectValue /></SelectTrigger>
                                                <SelectContent className="bg-[#1a1a20] border-gray-800 text-white rounded-xl">
                                                    <SelectItem value="physique" className="uppercase font-bold text-xs">{t('physique')}</SelectItem>
                                                    <SelectItem value="posing" className="uppercase font-bold text-xs">{t('posing')}</SelectItem>
                                                    <SelectItem value="repas" className="uppercase font-bold text-xs">{t('meal')}</SelectItem>
                                                    <SelectItem value="reference" className="uppercase font-bold text-xs">Suivi Coach</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{t('privacy')}</label>
                                            <Select value={uploadPrivacy} onValueChange={(val) => { setUploadPrivacy(val); setModerationError(null); }}>
                                                <SelectTrigger className="bg-black/40 border-gray-800 text-white h-12 rounded-xl focus:ring-[#00f5d4] shadow-xl"><SelectValue /></SelectTrigger>
                                                <SelectContent className="bg-[#1a1a20] border-gray-800 text-white rounded-xl">
                                                    <SelectItem value="Coach" className="uppercase font-bold text-xs">{t('visible_coach')}</SelectItem>
                                                    <SelectItem value="Privé" className="uppercase font-bold text-xs">{t('me_only')}</SelectItem>
                                                    <SelectItem value="Amis" className="uppercase font-bold text-xs">Amis</SelectItem>
                                                    <SelectItem value="Public" className="uppercase font-bold text-xs">{t('visible_community')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {(uploadPrivacy === 'Public' || uploadPrivacy === 'Amis') && (
                                                <p className="text-[9px] text-[#00f5d4] font-black uppercase tracking-tighter flex items-center gap-1 mt-1">
                                                    <ShieldCheck size={10}/> Scan de sécurité IA activé
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {isUploading && (
                                        <div className="space-y-2 pt-4">
                                            <div className="flex justify-between text-[10px] font-black uppercase text-gray-400">
                                                <span>{moderationError ? 'Echec' : 'Progression'}</span>
                                                <span>{uploadProgress}%</span>
                                            </div>
                                            <Progress value={uploadProgress} className="h-1.5 bg-gray-800" />
                                        </div>
                                    )}

                                    <Button
                                        className={`w-full font-black uppercase italic tracking-tighter text-lg h-14 rounded-2xl shadow-xl transition-all ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-[#00f5d4] text-black hover:scale-[1.02]'}`}
                                        disabled={uploadFiles.length === 0 || isUploading}
                                        onClick={handleUpload}
                                    >
                                        {isUploading ? <Loader2 className="animate-spin" /> : `Publier (${uploadFiles.length})`}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}
          </AnimatePresence>

          {/* FILTRES CATEGORIES */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <Tabs value={filterCategory} onValueChange={setFilterCategory} className="w-full md:w-auto">
                  <TabsList className="bg-[#1a1a20] border border-gray-800 h-12 p-1 rounded-2xl shadow-xl">
                      {CATEGORIES.map(cat => (
                          <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-[#00f5d4] data-[state=active]:text-black text-[10px] font-black uppercase italic tracking-widest px-6 h-10 rounded-xl transition-all">
                              <span className="mr-2">{cat.icon}</span> {cat.id === 'all' ? 'Tout' : (cat.id === 'reference' ? 'Suivi' : t(cat.id))}
                          </TabsTrigger>
                      ))}
                  </TabsList>
              </Tabs>

              {compareMode && (
                  <div className="bg-[#00f5d4]/10 border border-[#00f5d4]/40 px-6 py-3 rounded-[1.5rem] flex items-center gap-4 animate-in slide-in-from-right duration-300">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-[#00f5d4] uppercase tracking-widest">SÉLECTION</span>
                        <span className="text-white font-black italic text-lg">{compareSelection.length}/2</span>
                      </div>
                      <div className="flex gap-1.5">
                          {[0, 1].map(i => (
                              <div key={i} className={`w-3 h-3 rounded-full transition-all duration-500 ${i < compareSelection.length ? 'bg-[#00f5d4] shadow-[0_0_10px_#00f5d4]' : 'bg-gray-800'}`}></div>
                          ))}
                      </div>
                      {compareSelection.length === 2 && (
                          <Button size="sm" className="h-10 px-6 bg-[#00f5d4] text-black font-black uppercase italic rounded-xl shadow-[0_0_15px_rgba(0,245,212,0.4)] hover:scale-105" onClick={() => setSelectedMedia('COMPARE')}>
                              Analyser
                          </Button>
                      )}
                  </div>
              )}
          </div>

          {/* GRILLE */}
          {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="aspect-square bg-[#1a1a20]/60 rounded-3xl border border-gray-800 animate-pulse shadow-2xl"></div>)}
              </div>
          ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <AnimatePresence>
                      {filteredMedia.map((media) => {
                          const isSelectedForCompare = compareSelection.find(p => p.id === media.id);

                          return (
                              <motion.div
                                  key={media.id}
                                  layout
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className={`relative group aspect-[4/5] rounded-3xl overflow-hidden bg-[#1a1a20] border-2 cursor-pointer transition-all duration-500
                                      ${isSelectedForCompare ? 'border-[#00f5d4] ring-4 ring-[#00f5d4]/20 scale-95 shadow-[0_0_30px_rgba(0,245,212,0.2)]' : 'border-gray-800/50 hover:border-[#7b2cbf] hover:-translate-y-1'}
                                  `}
                                  onClick={() => {
                                      if (compareMode) toggleCompareSelection(media);
                                      else setSelectedMedia(media);
                                  }}
                              >
                                  {media.type === 'video' ? (
                                      <video src={media.mediaUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                  ) : (
                                      <img src={media.mediaUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" style={{ filter: FILTERS.find(f => f.name === media.filter)?.filter || 'none' }} />
                                  )}

                                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-5">
                                      <div className="flex justify-between items-end">
                                          <div className="space-y-1">
                                              <p className="text-white font-black italic uppercase tracking-tighter text-sm">{format(new Date(media.createdAt), 'dd MMM yyyy', {locale: fr})}</p>
                                              <div className="flex gap-2">
                                                {media.uploadedByCoach && <Badge className="bg-[#7b2cbf] text-white text-[8px] border-none uppercase font-black px-1.5 h-4">REF</Badge>}
                                                <Badge className="bg-white/10 text-white text-[8px] border-none uppercase font-black px-1.5 h-4">{media.category}</Badge>
                                              </div>
                                          </div>
                                          <div className="bg-black/60 p-1.5 rounded-lg border border-white/10 backdrop-blur-sm">
                                            <PrivacyBadge privacy={media.privacy} />
                                          </div>
                                      </div>
                                  </div>

                                  <div className="absolute top-3 right-3">
                                      {media.type === 'video' ? (
                                        <div className="bg-black/60 backdrop-blur-md p-2 rounded-xl text-white shadow-xl border border-white/10"><Play size={14} fill="white"/></div>
                                      ) : (
                                        <div className="bg-black/60 backdrop-blur-md p-2 rounded-xl text-white shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"><ImageIcon size={14}/></div>
                                      )}
                                  </div>

                                  {compareMode && (
                                      <div className={`absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-500 ${isSelectedForCompare ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
                                          {isSelectedForCompare ? (
                                              <div className="bg-[#00f5d4] text-black w-14 h-14 rounded-full font-black italic text-2xl shadow-[0_0_30px_rgba(0,245,212,0.8)] flex items-center justify-center border-4 border-black">
                                                {compareSelection.findIndex(p => p.id === media.id) + 1}
                                              </div>
                                          ) : (
                                              <div className="border-4 border-dashed border-white/30 rounded-full w-14 h-14 flex items-center justify-center text-white/50 font-black italic">SEL</div>
                                          )}
                                      </div>
                                  )}
                              </motion.div>
                          );
                      })}
                  </AnimatePresence>
              </div>
          )}

          {filteredMedia.length === 0 && !isLoading && (
              <div className="text-center py-32 border-2 border-dashed border-gray-800 rounded-[3rem] bg-[#1a1a20]/20 mt-10">
                  <ImageIcon className="mx-auto text-gray-700 w-24 h-24 mb-6 opacity-20" />
                  <p className="text-gray-400 font-black uppercase italic tracking-widest text-xl">{t('no_content')}</p>
                  <p className="text-sm text-gray-600 mt-2 font-bold italic">Commencez l'aventure en ajoutant votre premier média.</p>
              </div>
          )}

          {!isCoachView && activeUserId === currentUser?.uid && myUpdatesTicker.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 h-28 bg-black/60 backdrop-blur-2xl border-t border-white/5 z-50 flex items-center overflow-hidden">
                <div className="px-6 bg-[#00f5d4] text-black font-black text-[10px] uppercase italic py-2 rounded-r-3xl absolute left-0 z-20 shadow-[0_0_30px_rgba(0,245,212,0.4)] flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div> LIVE UPDATES
                </div>
                <motion.div
                    className="flex gap-6 items-center pl-36"
                    animate={{ x: [0, -1500] }}
                    transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
                >
                    {[...myUpdatesTicker, ...myUpdatesTicker].map((post, i) => (
                        <div key={`${post.id}-${i}`} className="w-16 h-20 rounded-2xl border-2 border-gray-800 overflow-hidden flex-shrink-0 cursor-pointer hover:scale-110 transition-all hover:border-[#00f5d4] shadow-2xl relative group" onClick={() => setSelectedMedia(post)}>
                            {post.type === 'video' ? <video src={post.mediaUrl} className="w-full h-full object-cover" /> : <img src={post.mediaUrl} className="w-full h-full object-cover" loading="lazy" />}
                            <div className="absolute inset-0 bg-[#00f5d4]/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                    ))}
                </motion.div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
            <KaybeeSocial currentUser={currentUser} />
        </div>
      )}

      {/* MODAL LIGHTBOX / COMPARE */}
      <Dialog open={!!selectedMedia} onOpenChange={() => { setSelectedMedia(null); if(selectedMedia === 'COMPARE') setCompareSelection([]); }}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-7xl p-0 overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/5">
            {selectedMedia === 'COMPARE' && compareSelection.length === 2 ? (
                <div className="flex flex-col h-[85vh]">
                    <div className="flex-1 grid grid-cols-2 gap-1 bg-black relative">
                        {compareSelection.map((item, idx) => (
                            <div key={idx} className="relative h-full flex items-center justify-center overflow-hidden border-r border-white/5 last:border-none">
                                <img src={item.mediaUrl} className="max-w-full max-h-full object-contain" />
                                <div className="absolute top-6 left-6 bg-black/70 backdrop-blur-xl px-5 py-2 rounded-2xl text-[10px] font-black uppercase italic tracking-widest border border-white/10 shadow-2xl">
                                    {format(new Date(item.createdAt), 'dd MMM yyyy', {locale: fr})}
                                </div>
                            </div>
                        ))}
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-[#00f5d4] shadow-[0_0_30px_#00f5d4] z-10"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black w-20 h-20 rounded-full flex items-center justify-center z-20 shadow-[0_0_50px_rgba(0,0,0,1)]">
                            <div className="bg-[#00f5d4] text-black font-black italic text-3xl rounded-full w-14 h-14 flex items-center justify-center shadow-[0_0_20px_#00f5d4]">VS</div>
                        </div>
                    </div>
                    <div className="p-6 bg-[#1a1a20] flex justify-between items-center border-t border-white/5">
                        <div className="flex items-center gap-4">
                          <History className="text-[#00f5d4]"/>
                          <div>
                            <p className="text-white font-black italic uppercase tracking-tighter">Comparaison Analytique</p>
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Évaluation des progrès physiques</p>
                          </div>
                        </div>
                        <Button onClick={() => setSelectedMedia(null)} className="bg-white/5 hover:bg-white/10 text-white font-black uppercase italic rounded-xl px-8 h-12">Fermer</Button>
                    </div>
                </div>
            ) : (
                selectedMedia && selectedMedia !== 'COMPARE' && (
                    <div className="flex flex-col md:flex-row h-[85vh]">
                        <div className="flex-1 bg-black flex items-center justify-center relative">
                            {selectedMedia.type === 'video' ? (
                                <video src={selectedMedia.mediaUrl} controls autoPlay muted={selectedMedia.isMuted} className="max-w-full max-h-full" />
                            ) : (
                                <img src={selectedMedia.mediaUrl} className="max-w-full max-h-full object-contain shadow-2xl" style={{ filter: FILTERS.find(f => f.name === selectedMedia.filter)?.filter || 'none' }} />
                            )}
                        </div>
                        <div className="w-full md:w-[26rem] bg-[#1a1a20] border-l border-white/5 p-8 flex flex-col shadow-2xl">
                            <div className="flex items-center gap-4 mb-8 p-4 bg-black/20 rounded-3xl border border-white/5">
                                <Avatar className="w-14 h-14 border-2 border-[#7b2cbf] shadow-xl shadow-[#7b2cbf]/20">
                                    <AvatarFallback className="bg-[#7b2cbf] text-white font-black italic text-xl">{selectedMedia.authorName?.[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-black italic uppercase tracking-tighter text-lg text-white">{selectedMedia.authorName}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1"><Clock size={10}/> {format(new Date(selectedMedia.createdAt), 'PPP', {locale: fr})}</p>
                                    {selectedMedia.location && (
                                        <p className="text-[9px] text-[#00f5d4] font-black uppercase flex items-center gap-1 mt-1">
                                            <MapPin size={10}/> {selectedMedia.location}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-8">
                                <div className="p-4 bg-black/20 rounded-2xl border border-white/5 flex flex-col items-center gap-1 text-[8px] text-gray-600 font-black uppercase text-center">
                                  <label className="mb-1 opacity-50">Confidentialité</label>
                                  <PrivacyBadge privacy={selectedMedia.privacy} />
                                </div>
                                <div className="p-4 bg-black/20 rounded-2xl border border-white/5 flex flex-col items-center gap-1 text-center">
                                  <label className="text-[8px] text-gray-600 font-black uppercase opacity-50 mb-1">Catégorie</label>
                                  <Badge variant="outline" className="text-[10px] font-black uppercase border-[#00f5d4]/20 text-[#00f5d4] shadow-lg shadow-[#00f5d4]/10">{selectedMedia.category}</Badge>
                                </div>
                            </div>

                            <div className="flex-1 p-6 bg-black/20 rounded-3xl border border-white/5 italic text-sm text-gray-400 leading-relaxed overflow-y-auto custom-scrollbar shadow-inner">
                              {selectedMedia.caption || "Aucune description pour ce média."}
                            </div>

                            <div className="flex gap-3 mt-8 pt-8 border-t border-white/5">
                                <Button variant="ghost" className="flex-1 h-14 rounded-2xl text-gray-500 hover:text-red-500 font-black uppercase italic hover:bg-red-500/10 transition-all" onClick={() => handleDelete(selectedMedia.id)}>
                                    <Trash2 size={24} className="mr-2" /> Supprimer
                                </Button>
                                <Button variant="ghost" className="flex-1 h-14 rounded-2xl text-gray-500 hover:text-[#00f5d4] font-black uppercase italic hover:bg-[#00f5d4]/10 transition-all">
                                    <Share2 size={24} className="mr-2" /> Partager
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

const PlusIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5V19M5 12H19" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
