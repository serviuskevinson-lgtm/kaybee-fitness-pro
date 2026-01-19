import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, storage } from '@/lib/firebase';
import { 
  collection, addDoc, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, serverTimestamp 
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
import { 
  Upload, Image as ImageIcon, Video, Trash2, Eye, Users, Lock, Globe, Play, 
  Camera, SplitSquareHorizontal, X, UserCheck, Heart, MessageCircle, Share2, LayoutGrid, FileImage
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTranslation } from 'react-i18next';

// --- CONSTANTES ---
const CATEGORIES = [
  { id: 'all', icon: <LayoutGrid size={14}/> },
  { id: 'physique', icon: <Users size={14}/> },
  { id: 'posing', icon: <Camera size={14}/> },
  { id: 'repas', icon: <ImageIcon size={14}/> },
  { id: 'reference', icon: <UserCheck size={14}/> }
];

export default function Gallery() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  
  // --- MODE HYBRIDE ---
  const clientContext = useClient() || {};
  const { selectedClient, isCoachView, targetUserId } = clientContext;
  const activeUserId = targetUserId || currentUser?.uid;

  // --- ÉTATS ---
  const [activeTab, setActiveTab] = useState('gallery');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Données
  const [mediaList, setMediaList] = useState([]);
  const [publicTicker, setPublicTicker] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Upload (MODIFIÉ POUR MULTIPLE)
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]); // Tableau au lieu d'un seul fichier
  const [uploadCategory, setUploadCategory] = useState('physique');
  const [uploadPrivacy, setUploadPrivacy] = useState('Coach');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
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
        // A. Galerie Ciblée
        const postsRef = collection(db, "posts");
        const qUserPosts = query(
          postsRef, 
          where("userId", "==", activeUserId),
          orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(qUserPosts);
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMediaList(posts);

        // B. Données Sociales (Seulement si Client)
        if (!isCoachView) {
            const qPublic = query(
                postsRef, 
                where("privacy", "==", "Public"), 
                orderBy("createdAt", "desc")
            );
            const publicSnap = await getDocs(qPublic);
            setPublicTicker(publicSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, 10));
        }

      } catch (e) {
        console.error("Erreur chargement galerie:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [activeUserId, isCoachView, currentUser]);

  // --- 2. GESTION UPLOAD MULTIPLE ---
  
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
        // Convertir FileList en Array et ajouter aux fichiers existants
        const newFiles = Array.from(e.target.files);
        setUploadFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index) => {
      setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0 || !currentUser) return;
    setIsUploading(true);
    setUploadProgress(0);

    const newPosts = [];
    let processedCount = 0;

    try {
        // Boucle sur chaque fichier
        for (const file of uploadFiles) {
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name}`;
            const storagePath = `gallery/${activeUserId}/${fileName}`;
            const storageRef = ref(storage, storagePath);
            
            // Upload
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            // Création Objet Post
            const newPost = {
                userId: activeUserId,
                authorId: currentUser.uid,
                authorName: isCoachView ? "Coach" : (currentUser.displayName || "Moi"),
                mediaUrl: downloadURL,
                type: file.type.startsWith('video') ? 'video' : 'image',
                category: isCoachView ? 'reference' : uploadCategory,
                privacy: uploadPrivacy,
                uploadedByCoach: isCoachView,
                createdAt: new Date().toISOString(),
                likes: 0,
                comments: []
            };

            // Sauvegarde Firestore
            const docRef = await addDoc(collection(db, "posts"), newPost);
            newPosts.push({ id: docRef.id, ...newPost });

            // Mise à jour progression
            processedCount++;
            setUploadProgress(Math.round((processedCount / uploadFiles.length) * 100));
        }

        // Mise à jour de l'état local (Ajout des nouveaux posts en haut)
        setMediaList(prev => [...newPosts, ...prev]);
        
        // Reset
        setTimeout(() => {
            setIsUploadOpen(false);
            setUploadFiles([]);
            setUploadProgress(0);
            setIsUploading(false);
        }, 500);

    } catch (e) {
        console.error("Erreur upload multiple", e);
        setIsUploading(false);
        alert(t('error'));
    }
  };

  // --- 3. SUPPRESSION ---
  const handleDelete = async (postId) => {
    if(!window.confirm(t('confirm_delete'))) return;
    try {
        await deleteDoc(doc(db, "posts", postId));
        setMediaList(mediaList.filter(p => p.id !== postId));
        if (selectedMedia?.id === postId) setSelectedMedia(null);
    } catch (e) {
        console.error(e);
    }
  };

  // --- 4. LOGIQUE COMPARAISON ---
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

  // --- COMPOSANT AUXILIAIRE : BADGE PRIVACY ---
  const PrivacyBadge = ({ privacy }) => {
      const config = {
          'Public': { icon: Globe, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', label: t('visible_community') },
          'Amis': { icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: "Amis" },
          'Coach': { icon: UserCheck, color: 'text-[#9d4edd]', bg: 'bg-[#9d4edd]/10', border: 'border-[#9d4edd]/20', label: t('visible_coach') },
          'Privé': { icon: Lock, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', label: t('me_only') },
      }[privacy] || { icon: Lock, color: 'text-gray-400', bg: 'bg-gray-400/10', border: '', label: privacy };

// ...
const newPost = {
    // ...
    privacy: uploadPrivacy, // Vérifie que c'est bien "Public", "Amis" ou "Coach"
    // ...
};

      const Icon = config.icon;
      return (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${config.bg} ${config.color} ${config.border}`}>
              <Icon size={10} /> {config.label}
          </div>
      );
  };

  // --- RENDU ---
  return (
    <div className="p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white relative pb-32">
      
      {/* --- HEADER --- */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-end gap-6 mb-8">
        <div>
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-3 rounded-2xl ${isCoachView ? 'bg-[#7b2cbf]' : 'bg-[#00f5d4]'}`}>
                    <ImageIcon className="text-black w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-4xl font-black italic uppercase text-white">
                        {isCoachView ? `${t('gallery_of')} ${selectedClient?.full_name}` : t('gallery_title')}
                    </h1>
                    <p className="text-gray-400 text-sm">
                        {isCoachView 
                            ? `Gestion visuelle de ${selectedClient?.full_name || 'votre client'}` 
                            : "Capturez vos progrès, analysez votre évolution."}
                    </p>
                </div>
            </div>
            
            {/* VIEW SWITCHER (Client Only) */}
            {!isCoachView && (
                <div className="flex bg-[#1a1a20] p-1 rounded-lg border border-gray-800 w-fit mt-4">
                    <button 
                        onClick={() => setActiveTab('gallery')}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'gallery' ? 'bg-[#00f5d4] text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('my_photos')}
                    </button>
                    <button 
                        onClick={() => setActiveTab('social')}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'social' ? 'bg-[#7b2cbf] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('community')}
                    </button>
                </div>
            )}
        </div>

        <div className="flex gap-2">
            <Button 
                variant="outline" 
                className={`font-bold transition-all ${
                    compareMode 
                    ? 'bg-red-500 hover:bg-red-600 text-white border-none' 
                    : 'bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black hover:scale-105 border-none'
                }`}
                onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
            >
                <SplitSquareHorizontal className="mr-2 h-4 w-4" /> 
                {compareMode ? t('cancel') : t('compare')}
            </Button>
            
            <Button 
                className={`font-black text-black ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black'}`}
                onClick={() => setIsUploadOpen(!isUploadOpen)}
            >
                <Upload className="mr-2 h-4 w-4" /> 
                {isUploadOpen ? t('cancel') : t('add')}
            </Button>
        </div>
      </div>

      {/* --- ZONE D'UPLOAD MULTIPLE (COLLAPSIBLE) --- */}
      <AnimatePresence>
        {isUploadOpen && (
            <motion.div 
                initial={{ height: 0, opacity: 0 }} 
                animate={{ height: 'auto', opacity: 1 }} 
                exit={{ height: 0, opacity: 0 }}
                className="max-w-7xl mx-auto mb-8 overflow-hidden"
            >
                <Card className="bg-[#1a1a20] border border-[#00f5d4]/30 shadow-[0_0_30px_rgba(0,245,212,0.1)]">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            
                            {/* ZONE DE DROP / APERÇU */}
                            <div className="md:col-span-2">
                                <div 
                                    className="border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center p-6 cursor-pointer hover:border-[#00f5d4] hover:bg-[#00f5d4]/5 transition-all min-h-[200px]"
                                    onClick={() => fileInputRef.current.click()}
                                >
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/*,video/*" 
                                        multiple // <--- MULTIPLE ACTIVÉ
                                        onChange={handleFileSelect}
                                    />
                                    
                                    {uploadFiles.length > 0 ? (
                                        <div className="w-full">
                                            <p className="text-center text-[#00f5d4] font-bold mb-4">{uploadFiles.length} fichier(s) sélectionné(s)</p>
                                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                                {uploadFiles.map((file, idx) => (
                                                    <div key={idx} className="relative group aspect-square bg-black rounded-lg overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
                                                        {file.type.startsWith('video') ? (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-500"><Video size={20}/></div>
                                                        ) : (
                                                            <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover opacity-80" />
                                                        )}
                                                        <button 
                                                            onClick={() => removeFile(idx)}
                                                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <div className="aspect-square flex items-center justify-center bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors" onClick={() => fileInputRef.current.click()}>
                                                    <PlusIcon />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
                                                <Upload className="text-gray-400" />
                                            </div>
                                            <p className="text-gray-300 font-bold">{t('drag_drop_media')}</p>
                                            <p className="text-xs text-gray-500">Sélection multiple supportée</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* OPTIONS & BOUTON */}
                            <div className="space-y-4">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Camera size={16} className="text-[#00f5d4]"/> {t('new_media')}
                                </h3>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">{t('category')}</label>
                                        <Select value={uploadCategory} onValueChange={setUploadCategory}>
                                            <SelectTrigger className="bg-black border-gray-700 text-white"><SelectValue /></SelectTrigger>
                                            <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                                                <SelectItem value="physique">{t('physique')}</SelectItem>
                                                <SelectItem value="posing">{t('posing')}</SelectItem>
                                                <SelectItem value="repas">{t('meal')}</SelectItem>
                                                <SelectItem value="autre">{t('other')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">{t('privacy')}</label>
                                        <Select value={uploadPrivacy} onValueChange={setUploadPrivacy}>
                                            <SelectTrigger className="bg-black border-gray-700 text-white"><SelectValue /></SelectTrigger>
                                            <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                                                <SelectItem value="Coach">{t('visible_coach')}</SelectItem>
                                                <SelectItem value="Privé">{t('me_only')}</SelectItem>
                                                <SelectItem value="Amis">Amis</SelectItem>
                                                <SelectItem value="Public">{t('visible_community')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {isUploading && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>{t('uploading')}</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <Progress value={uploadProgress} className="h-2 bg-gray-800 [&>div]:bg-[#00f5d4]" />
                                    </div>
                                )}

                                <Button 
                                    className={`w-full font-black ${isCoachView ? 'bg-[#7b2cbf] hover:bg-[#9d4edd]' : 'bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black'}`}
                                    disabled={uploadFiles.length === 0 || isUploading}
                                    onClick={handleUpload}
                                >
                                    {isUploading ? "Envoi..." : `${t('publish')} (${uploadFiles.length})`}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- CONTENU PRINCIPAL --- */}
      {activeTab === 'gallery' ? (
        <div className="max-w-7xl mx-auto">
            
            {/* FILTRES & MODE COMPARATIF */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <Tabs value={filterCategory} onValueChange={setFilterCategory} className="w-full md:w-auto">
                    <TabsList className="bg-[#1a1a20] border border-gray-800 h-10">
                        {CATEGORIES.map(cat => (
                            <TabsTrigger key={cat.id} value={cat.id} className="data-[state=active]:bg-[#00f5d4] data-[state=active]:text-black text-xs px-3 h-8">
                                <span className="mr-2">{cat.icon}</span> {t(cat.id)} 
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {compareMode && (
                    <div className="bg-[#00f5d4]/10 border border-[#00f5d4] px-4 py-2 rounded-full flex items-center gap-3 animate-in fade-in">
                        <span className="text-xs font-bold text-[#00f5d4] uppercase">Sélection</span>
                        <div className="flex gap-1">
                            {[0, 1].map(i => (
                                <div key={i} className={`w-3 h-3 rounded-full ${i < compareSelection.length ? 'bg-[#00f5d4]' : 'bg-gray-700'}`}></div>
                            ))}
                        </div>
                        <span className="text-xs text-white">{compareSelection.length}/2</span>
                        {compareSelection.length === 2 && (
                            <Button size="sm" className="h-6 text-[10px] bg-[#00f5d4] text-black font-bold" onClick={() => setSelectedMedia('COMPARE')}>
                                Voir Comparaison
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* GRILLE PHOTOS */}
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
                    {[1,2,3,4].map(i => <div key={i} className="aspect-square bg-[#1a1a20] rounded-xl border border-gray-800"></div>)}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <AnimatePresence>
                        {filteredMedia.map((media) => {
                            const isSelectedForCompare = compareSelection.find(p => p.id === media.id);
                            
                            return (
                                <motion.div 
                                    key={media.id}
                                    layout 
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className={`relative group aspect-square rounded-2xl overflow-hidden bg-[#1a1a20] border cursor-pointer transition-all duration-300 
                                        ${isSelectedForCompare ? 'border-[#00f5d4] ring-2 ring-[#00f5d4] ring-offset-2 ring-offset-black' : 'border-gray-800 hover:border-[#7b2cbf]'}
                                    `}
                                    onClick={() => {
                                        if (compareMode) toggleCompareSelection(media);
                                        else setSelectedMedia(media);
                                    }}
                                >
                                    {media.type === 'video' ? (
                                        <video src={media.mediaUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    ) : (
                                        <img src={media.mediaUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    )}

                                    {/* Overlay Info */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-white font-bold text-sm">{format(new Date(media.createdAt), 'dd MMM yyyy', {locale: fr})}</p>
                                                {media.uploadedByCoach && (
                                                    <Badge className="bg-[#7b2cbf] text-white text-[9px] mt-1 border-none">Coach Ref</Badge>
                                                )}
                                            </div>
                                            <PrivacyBadge privacy={media.privacy} />
                                        </div>
                                    </div>

                                    {/* Type Badge */}
                                    <div className="absolute top-2 left-2">
                                        {media.type === 'video' && <Badge className="bg-black/50 backdrop-blur border-none text-white"><Play size={10} className="mr-1"/> Video</Badge>}
                                    </div>

                                    {/* Sélection Overlay (Mode Compare) */}
                                    {compareMode && (
                                        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity ${isSelectedForCompare ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
                                            {isSelectedForCompare ? (
                                                <div className="bg-[#00f5d4] text-black p-2 rounded-full font-bold shadow-lg">#{compareSelection.findIndex(p => p.id === media.id) + 1}</div>
                                            ) : (
                                                <div className="border-2 border-white rounded-full w-8 h-8"></div>
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
                <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-3xl bg-[#1a1a20]/50">
                    <ImageIcon className="mx-auto text-gray-600 w-16 h-16 mb-4" />
                    <p className="text-gray-400 font-bold text-lg">{t('no_content')}</p>
                    <p className="text-sm text-gray-600">
                        {filterCategory !== 'all' ? "Aucun média dans cette catégorie." : "Commencez à uploader vos progrès !"}
                    </p>
                </div>
            )}

        </div>
      ) : (
        /* --- ONGLET SOCIAL --- */
        <div className="max-w-4xl mx-auto text-center py-20">
            <h2 className="text-2xl font-bold text-white mb-2">{t('community')}</h2>
            <p className="text-gray-400">Connectez-vous avec d'autres athlètes. (À venir)</p>
        </div>
      )}

      {/* --- FOOTER TICKER (PUBLIC POSTS) --- */}
      {!isCoachView && publicTicker.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 h-20 bg-black/80 backdrop-blur-md border-t border-[#00f5d4]/20 z-40 flex items-center overflow-hidden">
            <div className="px-4 bg-[#00f5d4] text-black font-black text-xs py-1 rounded-r-full absolute left-0 z-20 shadow-[0_0_15px_rgba(0,245,212,0.5)]">
                LIVE
            </div>
            <motion.div 
                className="flex gap-4 items-center pl-20"
                animate={{ x: [0, -1000] }}
                transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
            >
                {[...publicTicker, ...publicTicker].map((post, i) => (
                    <div key={`${post.id}-${i}`} className="w-12 h-12 rounded-lg border border-gray-700 overflow-hidden flex-shrink-0 cursor-pointer hover:scale-110 transition-transform hover:border-[#00f5d4]" onClick={() => setSelectedMedia(post)}>
                        {post.type === 'video' ? <video src={post.mediaUrl} className="w-full h-full object-cover" /> : <img src={post.mediaUrl} className="w-full h-full object-cover" />}
                    </div>
                ))}
            </motion.div>
        </div>
      )}

      {/* --- MODAL LIGHTBOX / COMPARE --- */}
      <Dialog open={!!selectedMedia} onOpenChange={() => { setSelectedMedia(null); if(selectedMedia === 'COMPARE') setCompareSelection([]); }}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-6xl p-0 overflow-hidden rounded-2xl">
            
            {/* CAS 1 : COMPARAISON CÔTE À CÔTE */}
            {selectedMedia === 'COMPARE' && compareSelection.length === 2 ? (
                <div className="flex flex-col h-[80vh]">
                    <div className="flex-1 grid grid-cols-2 gap-1 bg-black relative">
                        {compareSelection.map((item, idx) => (
                            <div key={idx} className="relative h-full flex items-center justify-center overflow-hidden border-r border-gray-800 last:border-none">
                                <img src={item.mediaUrl} className="max-w-full max-h-full object-contain" />
                                <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md border border-gray-700">
                                    {format(new Date(item.createdAt), 'dd MMM yyyy', {locale: fr})}
                                </div>
                            </div>
                        ))}
                        
                        {/* Séparateur Central Décoratif */}
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-[#00f5d4] shadow-[0_0_15px_rgba(0,245,212,0.8)] z-10"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#00f5d4] text-black font-black rounded-full p-2 z-20 shadow-xl border-4 border-black">
                            VS
                        </div>
                    </div>
                    <div className="p-4 bg-[#1a1a20] flex justify-between items-center border-t border-gray-800">
                        <p className="text-gray-400 text-sm">Mode Comparaison</p>
                        <Button onClick={() => setSelectedMedia(null)} variant="outline" className="border-gray-700 text-white">{t('cancel')}</Button>
                    </div>
                </div>
            ) : (
                /* CAS 2 : VISIONNEUSE SIMPLE */
                selectedMedia && selectedMedia !== 'COMPARE' && (
                    <div className="flex flex-col md:flex-row h-[80vh]">
                        <div className="flex-1 bg-black flex items-center justify-center relative">
                            {selectedMedia.type === 'video' ? (
                                <video src={selectedMedia.mediaUrl} controls autoPlay className="max-w-full max-h-full" />
                            ) : (
                                <img src={selectedMedia.mediaUrl} className="max-w-full max-h-full object-contain" />
                            )}
                        </div>
                        <div className="w-full md:w-80 bg-[#1a1a20] border-l border-gray-800 p-6 flex flex-col">
                            <div className="flex items-center gap-3 mb-6">
                                <Avatar>
                                    <AvatarImage src="" />
                                    <AvatarFallback className="bg-[#7b2cbf] text-white">{selectedMedia.authorName?.[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-bold text-white text-sm">{selectedMedia.authorName}</p>
                                    <p className="text-xs text-gray-500">{format(new Date(selectedMedia.createdAt), 'PPP', {locale: fr})}</p>
                                </div>
                            </div>

                            <div className="flex gap-2 mb-6">
                                <PrivacyBadge privacy={selectedMedia.privacy} />
                                <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{selectedMedia.category}</Badge>
                            </div>

                            <div className="flex-1"></div>

                            {/* Actions */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-800">
                                <Button variant="ghost" className="flex-1 text-gray-400 hover:text-red-500 hover:bg-red-500/10" onClick={() => handleDelete(selectedMedia.id)}>
                                    <Trash2 size={18} />
                                </Button>
                                <Button variant="ghost" className="flex-1 text-gray-400 hover:text-[#00f5d4]">
                                    <Share2 size={18} />
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

// Composant icône plus pour l'ajout multiple
const PlusIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5V19M5 12H19" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);