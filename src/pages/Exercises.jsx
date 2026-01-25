import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, storage } from '@/lib/firebase';
import { 
  collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where, updateDoc, arrayUnion, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Dumbbell, Search, Plus, Trash2, Save, Play, 
  ChevronRight, ChevronLeft, LayoutList, History, Filter, Info, 
  Upload, CheckCircle, Loader2, Clock, Calendar as CalendarIcon, Star, Image as ImageIcon, Video, Sparkles, Wand2, Check
} from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { autoBuildWorkoutsWithGemini } from '@/lib/gemini';
import { format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

// --- CONFIGURATION ---
const ITEMS_PER_PAGE = 24;
const EXERCISE_DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMAGE_BASE_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

const EQUIPMENTS = [
  { id: 'all', name: 'all_equipment' },
  { id: 'barbell', name: 'barbell' },
  { id: 'dumbbell', name: 'dumbbell' },
  { id: 'machine', name: 'machine' },
  { id: 'cable', name: 'cable' },
  { id: 'body weight', name: 'bodyweight' },
  { id: 'kettlebell', name: 'kettlebell' },
  { id: 'band', name: 'elastic_band' },
];

const FOCUS_AREAS = [
  "Pectoraux", "Dos", "Jambes", "Épaules", "Bras (Biceps/Triceps)",
  "Abdominaux", "Fessiers", "Cardio / Endurance", "Full Body", "Haut du corps", "Bas du corps"
];

export default function Exercises() {
  const { currentUser } = useAuth();
  const { selectedClient, isCoachView, targetUserId } = useClient() || {};
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // --- ÉTATS ---
  const [exercisesDB, setExercisesDB] = useState([]); 
  const [userProfile, setUserProfile] = useState(null);
  const [customExercises, setCustomExercises] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  // États Interface
  const [activeTab, setActiveTab] = useState('all'); 
  const [activeEquipment, setActiveEquipment] = useState('all'); 
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [cart, setCart] = useState([]); 
  const [templates, setTemplates] = useState([]);
  
  // États Modals
  const [selectedExo, setSelectedExo] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  
  // PROGRAMMATION MANUELLE
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [programName, setProgramName] = useState("");
  const [programDates, setProgramDates] = useState([]);

  // AUTO BUILD STATES
  const [isAutoBuildModalOpen, setIsAutoBuildModalOpen] = useState(false);
  const [autoBuildStep, setAutoBuildStep] = useState(1);
  const [autoBuildDates, setAutoBuildDates] = useState([]);
  const [autoBuildFocus, setAutoBuildFocus] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [templateToLoad, setTemplateToLoad] = useState(null);

  // États Création Coach
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newExoData, setNewExoData] = useState({ name: '', group: 'chest', equipment: 'body weight', description: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- DÉFINITION DYNAMIQUE DES GROUPES ---
  const MUSCLE_GROUPS = [
    { id: 'custom', name: 'Coach', icon: '👑', keywords: [] },
    { id: 'chest', name: t('chest'), icon: '🛡️', keywords: ['chest', 'pectorals', 'poitrine'] },
    { id: 'back', name: t('back_muscle'), icon: '🦅', keywords: ['back', 'lats', 'spine', 'trapezius', 'dos'] },
    { id: 'legs', name: t('legs'), icon: '🦵', keywords: ['legs', 'quadriceps', 'hamstrings', 'calves', 'glutes', 'adductors', 'abductors', 'jambes'] },
    { id: 'shoulders', name: t('shoulders'), icon: '💪', keywords: ['shoulders', 'deltoids', 'épaules'] },
    { id: 'arms', name: t('arms'), icon: '🦾', keywords: ['arms', 'biceps', 'triceps', 'forearms', 'bras'] },
    { id: 'abs', name: t('abs'), icon: '🍫', keywords: ['abs', 'waist', 'abdominals', 'core'] },
    { id: 'cardio', name: t('cardio'), icon: '🏃', keywords: ['cardio', 'cardiovascular'] }
  ];

  // --- 1. CHARGEMENT API ---
  useEffect(() => {
    const loadExercises = async () => {
        setIsDbLoading(true);
        try {
            const cachedData = localStorage.getItem('kaybee_exercises_cache_v7');
            if (cachedData) {
                setExercisesDB(JSON.parse(cachedData));
                setIsDbLoading(false);
            } else {
                const response = await fetch(EXERCISE_DB_URL);
                const data = await response.json();
                
                const cleanData = data.map((ex, index) => {
                    let group = 'other';
                    const target = (ex.primaryMuscles?.[0] || ex.category || "").toLowerCase();
                    for (const mg of MUSCLE_GROUPS) {
                        if (mg.keywords.some(k => target.includes(k))) {
                            group = mg.id;
                            break;
                        }
                    }
                    let eq = 'body weight';
                    const rawEq = (ex.equipment || "").toLowerCase();
                    if (rawEq.includes('barbell')) eq = 'barbell';
                    else if (rawEq.includes('dumbbell')) eq = 'dumbbell';
                    else if (rawEq.includes('cable')) eq = 'cable';
                    else if (rawEq.includes('machine') || rawEq.includes('lever')) eq = 'machine';
                    else if (rawEq.includes('kettlebell')) eq = 'kettlebell';
                    else if (rawEq.includes('band')) eq = 'band';

                    let imgUrl = "https://images.unsplash.com/photo-1574680096141-1cddd32e04ca?w=800&q=80"; 
                    if (ex.images && ex.images.length > 0) {
                        const relativePath = ex.images[0].replace('exercises/', '');
                        imgUrl = IMAGE_BASE_URL + relativePath;
                    }

                    let desc = ex.instructions ? (Array.isArray(ex.instructions) ? ex.instructions.join(' ') : ex.instructions) : "";
                    if (!desc || desc.length < 15) desc = t('default_instruction', {name: ex.name});

                    return {
                        id: ex.id || `web_${index}`,
                        name: ex.name.charAt(0).toUpperCase() + ex.name.slice(1),
                        group: group,
                        equipment: eq,
                        imageUrl: imgUrl, 
                        description: desc,
                        targetMuscles: ex.primaryMuscles || [],
                        isCustom: false
                    };
                });
                setExercisesDB(cleanData);
                localStorage.setItem('kaybee_exercises_cache_v7', JSON.stringify(cleanData));
                setIsDbLoading(false);
            }
        } catch (error) {
            console.error("Erreur téléchargement exercices:", error);
            setIsDbLoading(false);
        }
    };
    loadExercises();
  }, []);

  // --- 2. CHARGEMENT INFOS PROFIL ET EXERCICES PERSO ---
  useEffect(() => {
    const fetchUserData = async () => {
        if (!currentUser) return;
        try {
            const userRef = doc(db, "users", targetUserId || currentUser.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                setUserProfile(userSnap.data());
            }
        } catch (e) { console.error(e); }
    };

    const fetchCustomExercises = async () => {
        if (!currentUser) return;
        let authorIdToFetch = isCoachView ? currentUser.uid : null;
        
        if (!isCoachView) {
            try {
                const userSnap = await getDoc(doc(db, "users", currentUser.uid));
                if (userSnap.exists()) authorIdToFetch = userSnap.data().coachId;
            } catch (e) { console.error(e); }
        }

        if (!authorIdToFetch) return;

        try {
            const q = query(collection(db, "custom_exercises"), where("authorId", "==", authorIdToFetch));
            const snapshot = await getDocs(q);
            setCustomExercises(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isCustom: true })));
        } catch (e) { console.error(e); }
    };

    fetchUserData();
    fetchCustomExercises();
  }, [currentUser, isCoachView, targetUserId]);

  // --- 3. CHARGEMENT TEMPLATES ---
  useEffect(() => {
    const fetchTemplates = async () => {
      if (!targetUserId) return;
      try {
        const q = query(collection(db, "users", targetUserId, "templates"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (e) { console.error(e); }
    };
    fetchTemplates();
  }, [targetUserId]);

  // --- LOGIQUE PANIER ---
  const addToCart = (exo) => {
    const newExo = { ...exo, uniqueId: Date.now() + Math.random(), sets: 3, reps: 10, rest: 60 };
    setCart([...cart, newExo]);
  };

  const removeFromCart = (uniqueId) => setCart(cart.filter(item => item.uniqueId !== uniqueId));
  
  const updateExoDetails = (uniqueId, field, value) => {
      setCart(cart.map(item => item.uniqueId === uniqueId ? { ...item, [field]: value } : item));
  };

  // 1. Sauvegarder comme modèle
  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setIsSaving(true);
    try {
      const templateData = {
        name: newTemplateName,
        exercises: cart,
        createdBy: isCoachView ? 'coach' : 'client', 
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "users", targetUserId, "templates"), templateData);
      setIsSaveModalOpen(false);
      setNewTemplateName("");
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  // 2. PROGRAMMER POUR LA SEMAINE (Lien Dashboard)
  const handleProgramWeek = async () => {
      if (!programName.trim() || programDates.length === 0) {
          alert("Donne un nom et choisis au moins une date.");
          return;
      }
      setIsSaving(true);
      try {
          const workoutData = {
              id: Date.now().toString(),
              name: programName,
              exercises: cart,
              scheduledDays: programDates.map(d => format(d, 'yyyy-MM-dd')),
              createdAt: new Date().toISOString(),
              assignedBy: isCoachView ? 'coach' : 'self'
          };

          const userRef = doc(db, "users", targetUserId);
          await updateDoc(userRef, {
              workouts: arrayUnion(workoutData)
          });

          setIsProgramModalOpen(false);
          setProgramName("");
          setProgramDates([]);
          alert(t('program_saved')); 
      } catch (e) {
          console.error("Erreur programmation:", e);
      } finally {
          setIsSaving(false);
      }
  };

  // --- AUTO BUILD LOGIC ---
  const handleAutoBuild = async () => {
    if (autoBuildDates.length === 0 || autoBuildFocus.length === 0) {
      alert("Veuillez sélectionner des dates et au moins un focus.");
      return;
    }
    setIsGenerating(true);
    try {
      const userWeight = userProfile?.weight || 75;
      const weightUnit = userProfile?.weightUnit || 'kg';

      const formattedDates = autoBuildDates.map(d => format(d, 'yyyy-MM-dd'));
      const generatedWorkouts = await autoBuildWorkoutsWithGemini(
        formattedDates,
        autoBuildFocus,
        userWeight,
        weightUnit
      );

      const userRef = doc(db, "users", targetUserId);
      const workoutPromises = generatedWorkouts.map(async (workout) => {
        const enhancedExercises = workout.exercises.map(ex => {
          const found = exercisesDB.find(dbEx => dbEx.name.toLowerCase().includes(ex.name.toLowerCase()));
          return {
            ...ex,
            uniqueId: Math.random(),
            imageUrl: found?.imageUrl || "https://images.unsplash.com/photo-1574680096141-1cddd32e04ca?w=800&q=80",
            description: found?.description || t('default_instruction', {name: ex.name})
          };
        });

        const workoutData = {
          id: Date.now().toString() + Math.random(),
          name: workout.name,
          tip: workout.tip,
          exercises: enhancedExercises,
          scheduledDays: [workout.date],
          createdAt: new Date().toISOString(),
          assignedBy: 'AI'
        };

        return updateDoc(userRef, {
          workouts: arrayUnion(workoutData)
        });
      });

      await Promise.all(workoutPromises);
      setIsAutoBuildModalOpen(false);
      alert("Programme généré et ajouté à ton Dashboard !");
      navigate('/dashboard');
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération. Réessaie.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleAutoFocus = (focus) => {
    setAutoBuildFocus(prev => prev.includes(focus) ? prev.filter(f => f !== focus) : [...prev, focus]);
  };

  const confirmLoadTemplate = () => {
    if (!templateToLoad) return;
    const freshCart = templateToLoad.exercises.map(ex => ({ ...ex, uniqueId: Date.now() + Math.random() }));
    setCart(freshCart);
    setTemplateToLoad(null);
  };

  const deleteTemplate = async (e, id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await deleteDoc(doc(db, "users", targetUserId, "templates", id));
      setTemplates(templates.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
  };

  // --- CRÉATION EXERCICE (COACH) ---
  const handleCreateExercise = async () => {
      if (!newExoData.name || !uploadFile) {
          alert(t('error'));
          return;
      }
      setIsUploading(true);

      try {
          const fileRef = ref(storage, `custom_exercises/${currentUser.uid}/${Date.now()}_${uploadFile.name}`);
          await uploadBytes(fileRef, uploadFile);
          const downloadUrl = await getDownloadURL(fileRef);
          
          const isVideo = uploadFile.type.startsWith('video');

          const newExo = {
              name: newExoData.name,
              group: newExoData.group,
              equipment: newExoData.equipment,
              description: newExoData.description,
              imageUrl: downloadUrl,
              mediaType: isVideo ? 'video' : 'image',
              authorId: currentUser.uid,
              authorName: currentUser.displayName || "Coach",
              targetMuscles: [newExoData.group],
              createdAt: serverTimestamp()
          };

          const docRef = await addDoc(collection(db, "custom_exercises"), newExo);
          setCustomExercises([{ id: docRef.id, ...newExo, isCustom: true }, ...customExercises]);
          
          setIsCreateOpen(false);
          setNewExoData({ name: '', group: 'chest', equipment: 'body weight', description: '' });
          setUploadFile(null);

      } catch (e) {
          console.error("Erreur création exo:", e);
      } finally {
          setIsUploading(false);
      }
  };

  // --- FILTRAGE ---
  const allExercises = useMemo(() => [...customExercises, ...exercisesDB], [customExercises, exercisesDB]);
  const filteredExercises = useMemo(() => {
      return allExercises.filter(ex => {
        let matchesGroup = true;
        if (activeTab === 'custom') matchesGroup = ex.isCustom; 
        else if (activeTab !== 'all') matchesGroup = ex.group === activeTab;
        
        const matchesEquipment = activeEquipment === 'all' || ex.equipment === activeEquipment;
        const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
        return matchesGroup && matchesEquipment && matchesSearch;
      });
  }, [allExercises, activeTab, activeEquipment, search]);

  const totalPages = Math.ceil(filteredExercises.length / ITEMS_PER_PAGE);
  const currentExercises = filteredExercises.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-4 lg:p-8 min-h-screen bg-gradient-to-br from-[#0a0a0f] to-[#111118] text-white pb-32">
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#9d4edd]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-all group-hover:bg-[#9d4edd]/10" />
            <div className="flex-1 relative z-10">
                <h1 className="text-4xl font-black italic uppercase flex items-center gap-3 text-white">
                    <Dumbbell className="text-[#9d4edd] w-10 h-10 fill-[#9d4edd]/20"/> 
                    {t('workout_builder')}
                </h1>
                <p className="text-gray-400 text-sm font-medium mt-2">
                    {isDbLoading ? t('loading') : t('exercises_available', {count: allExercises.length})}
                </p>
            </div>

            <div className="flex gap-4 relative z-10">
                {/* --- BOUTON AUTO BUILD --- */}
                <Button
                    onClick={() => { setIsAutoBuildModalOpen(true); setAutoBuildStep(1); }}
                    className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] hover:opacity-90 text-white font-black h-14 px-8 rounded-xl shadow-[0_0_20px_rgba(157,78,221,0.3)] transition-all hover:scale-105 border border-white/10"
                >
                    <Wand2 size={20} className="mr-2 animate-pulse"/> AUTO BUILD (IA)
                </Button>

                {isCoachView && (
                    <Button 
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-white text-black hover:bg-gray-200 font-black h-14 px-8 rounded-xl shadow-lg transition-all hover:scale-105 border-none"
                    >
                        <Plus size={24} className="mr-2"/> {t('create_exercise')}
                    </Button>
                )}
            </div>
        </div>
      </div>

      {/* --- FAVORITE TEMPLATES BAR --- */}
      {templates.length > 0 && (
        <div className="max-w-7xl mx-auto mb-10 animate-in slide-in-from-top duration-500">
            <h3 className="text-sm font-bold text-[#9d4edd] uppercase mb-4 flex items-center gap-2 tracking-widest pl-2">
                <Star size={14} className="fill-[#9d4edd]" /> {t('favorite_workouts')}
            </h3>
            <ScrollArea className="w-full whitespace-nowrap rounded-3xl border border-[#7b2cbf]/30 bg-[#15151a]/90 backdrop-blur-md p-4 shadow-2xl">
                <div className="flex space-x-4">
                    {templates.map((tpl) => (
                        <div key={tpl.id} onClick={() => setTemplateToLoad(tpl)} className={`relative group flex-shrink-0 w-72 p-5 rounded-2xl border cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${tpl.createdBy === 'coach' ? 'bg-gradient-to-br from-[#7b2cbf]/20 to-[#9d4edd]/10 border-[#7b2cbf]/50 hover:border-[#9d4edd]' : 'bg-[#1a1a20] border-gray-700 hover:border-[#9d4edd]'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <h4 className="font-bold text-white truncate pr-6 text-lg">{tpl.name}</h4>
                                {tpl.createdBy === 'coach' && <Badge className="bg-[#7b2cbf] text-white text-[10px] px-2 py-0.5">Coach</Badge>}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                                <span className="flex items-center gap-1"><LayoutList size={12}/> {tpl.exercises?.length || 0} Exos</span>
                                <span>{tpl.createdAt?.seconds ? new Date(tpl.createdAt.seconds * 1000).toLocaleDateString() : ""}</span>
                            </div>
                            <div className="flex gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                <Button size="sm" className="h-8 text-xs w-full font-bold bg-white/10 hover:bg-white/20 text-white"><Play size={12} className="mr-2"/> {t('load')}</Button>
                                <button onClick={(e) => {e.stopPropagation(); deleteTemplate(e, tpl.id)}} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" className="bg-[#7b2cbf]/20" />
            </ScrollArea>
        </div>
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- LEFT COLUMN : SELECTION --- */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#1a1a20]/90 backdrop-blur p-5 rounded-3xl border border-gray-800 sticky top-4 z-10 shadow-2xl">
                <div className="relative mb-5">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20}/>
                    <Input value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder={t('search_exercise')} className="pl-12 bg-black/50 border-gray-700 text-white h-12 rounded-xl focus:border-[#9d4edd] focus:ring-[#9d4edd]"/>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4">
                    <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setCurrentPage(1); }} className="flex-1 min-w-0">
                        <ScrollArea className="w-full whitespace-nowrap rounded-xl bg-black/50 border border-gray-800">
                            <TabsList className="bg-transparent w-full justify-start h-auto p-1.5">
                                <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-[#9d4edd] data-[state=active]:text-white text-xs py-2.5 font-bold transition-all">{t('all')}</TabsTrigger>
                                {customExercises.length > 0 && (
                                    <TabsTrigger value="custom" className="rounded-lg data-[state=active]:bg-[#9d4edd] data-[state=active]:text-white text-xs py-2.5 font-bold transition-all border border-[#9d4edd]/50 mx-1">
                                        <span className="mr-1.5">👑</span> Coach
                                    </TabsTrigger>
                                )}
                                {MUSCLE_GROUPS.filter(g => g.id !== 'custom').map(g => (
                                    <TabsTrigger key={g.id} value={g.id} className="rounded-lg data-[state=active]:bg-[#9d4edd] data-[state=active]:text-white text-xs py-2.5 font-bold transition-all whitespace-nowrap">
                                        <span className="mr-1.5 opacity-80">{g.icon}</span> {g.name}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                            <ScrollBar orientation="horizontal" className="invisible"/>
                        </ScrollArea>
                    </Tabs>

                    <div className="w-full md:w-48 shrink-0">
                        <Select value={activeEquipment} onValueChange={(val) => { setActiveEquipment(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-full bg-[#2d2d35] border-[#9d4edd]/30 text-white h-[52px] rounded-xl font-bold hover:border-[#9d4edd] transition-colors"><Filter size={14} className="mr-2 text-[#9d4edd]"/><SelectValue placeholder="Équipement" /></SelectTrigger>
                            <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                                {EQUIPMENTS.map(eq => <SelectItem key={eq.id} value={eq.id} className="focus:bg-[#9d4edd] focus:text-white cursor-pointer font-medium">{t(eq.name)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {isDbLoading ? (
                <div className="py-20 text-center"><Loader2 className="animate-spin w-12 h-12 text-[#9d4edd] mx-auto mb-4"/><p className="text-gray-500">{t('loading')}</p></div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {currentExercises.map(exo => {
                        const isAdded = cart.find(e => e.name === exo.name);
                        return (
                            <div key={exo.id} className={`rounded-2xl border transition-all group overflow-hidden flex flex-col h-full ${exo.isCustom ? 'bg-[#1a1a25] border-[#9d4edd]/30 hover:border-[#9d4edd] hover:shadow-[0_0_20px_rgba(157,78,221,0.2)]' : 'bg-[#1a1a20] border-gray-800 hover:border-[#9d4edd]'}`}>
                                <div className="relative h-40 bg-gray-900 cursor-pointer overflow-hidden" onClick={() => { setSelectedExo(exo); setIsDetailOpen(true); }}>
                                    {exo.mediaType === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center bg-black">
                                            <video src={exo.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted loop onMouseOver={e => e.target.play()} onMouseOut={e => e.target.pause()}/>
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Play className="fill-white text-white opacity-50" size={32}/></div>
                                        </div>
                                    ) : (
                                        <img src={exo.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" loading="lazy" onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"; }}/>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a20] to-transparent opacity-80 pointer-events-none"></div>
                                    <div className="absolute bottom-2 left-3 pointer-events-none">
                                        <Badge className={`text-[10px] font-bold border-none px-2 mb-1 capitalize ${exo.isCustom ? 'bg-white text-[#9d4edd]' : 'bg-[#9d4edd] text-white'}`}>
                                            {exo.isCustom ? 'Coach' : MUSCLE_GROUPS.find(g => g.id === exo.group)?.name || exo.group}
                                        </Badge>
                                    </div>
                                    <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 backdrop-blur-md pointer-events-none"><Info size={14} className="text-white"/></div>
                                </div>
                                <div className="p-4 flex-1 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-bold text-white text-sm line-clamp-2 leading-tight mb-1 group-hover:text-[#00f5d4] transition-colors">{exo.name}</h3>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wide truncate">{t(EQUIPMENTS.find(e => e.id === exo.equipment)?.name) || exo.equipment}</p>
                                    </div>
                                    <Button size="sm" className={`w-full mt-3 h-9 font-bold text-xs rounded-lg transition-all ${isAdded ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' : 'bg-[#9d4edd] text-white hover:bg-[#7b2cbf] shadow-lg shadow-purple-500/20'}`} onClick={() => isAdded ? removeFromCart(isAdded.uniqueId) : addToCart(exo)}>
                                        {isAdded ? <><Trash2 size={14} className="mr-1"/> {t('remove')}</> : <><Plus size={14} className="mr-1"/> {t('add')}</>}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!isDbLoading && filteredExercises.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center items-center gap-4 py-6">
                    <Button variant="outline" size="icon" className="bg-[#1a1a20] border border-[#7b2cbf] text-[#9d4edd] hover:bg-[#7b2cbf] hover:text-white rounded-full transition-colors" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={20}/></Button>
                    <span className="text-sm font-bold text-[#9d4edd] bg-[#9d4edd]/10 px-4 py-2 rounded-full border border-[#9d4edd]/20">Page {currentPage} / {totalPages}</span>
                    <Button variant="outline" size="icon" className="bg-[#1a1a20] border border-[#7b2cbf] text-[#9d4edd] hover:bg-[#7b2cbf] hover:text-white rounded-full transition-colors" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={20}/></Button>
                </div>
            )}
        </div>

        {/* --- RIGHT COLUMN : CART --- */}
        <div className="lg:col-span-1">
            <Card className="bg-[#1a1a20] border-gray-800 sticky top-4 h-[calc(100vh-100px)] flex flex-col shadow-[0_0_30px_rgba(0,0,0,0.5)] rounded-3xl overflow-hidden ring-1 ring-white/5">
                <div className="p-6 border-b border-gray-800 bg-gradient-to-b from-[#252530] to-[#1a1a20]">
                    <div className="flex justify-between items-center mb-1">
                        <h2 className="font-black text-xl text-white flex items-center gap-2 italic uppercase"><LayoutList className="text-[#9d4edd]"/> {t('current_session')}</h2>
                        <Badge className="bg-[#9d4edd] text-white font-bold px-2.5 py-0.5 text-xs">{cart.length}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 font-medium">{t('drag_adjust_save')}</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {cart.map((item, index) => (
                        <div key={item.uniqueId} className="bg-[#0f0f13] p-4 rounded-2xl border border-gray-800 hover:border-[#9d4edd]/50 transition-colors group animate-in slide-in-from-right duration-300">
                            <div className="flex justify-between items-start mb-3">
                                <span className="font-bold text-sm text-white flex gap-3 items-center"><span className="w-5 h-5 rounded-full bg-[#9d4edd] text-white flex items-center justify-center text-[10px] font-black">{index + 1}</span> <span className="truncate w-40">{item.name}</span></span>
                                <button onClick={() => removeFromCart(item.uniqueId)} className="text-gray-600 hover:text-red-500 transition-colors p-1 hover:bg-red-500/10 rounded-md"><Trash2 size={14}/></button>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-[#1a1a20] p-1 rounded-lg border border-gray-700">
                                    <label className="text-[9px] text-[#9d4edd] font-bold uppercase block text-center mb-0.5">{t('sets')}</label>
                                    <Input type="number" value={item.sets} onChange={(e) => updateExoDetails(item.uniqueId, 'sets', e.target.value)} className="h-6 text-sm bg-gray-800 border-none text-center text-white font-bold p-0 focus-visible:ring-0 rounded"/>
                                </div>
                                <div className="bg-[#1a1a20] p-1 rounded-lg border border-gray-700">
                                    <label className="text-[9px] text-[#9d4edd] font-bold uppercase block text-center mb-0.5">Reps</label>
                                    <Input type="number" value={item.reps} onChange={(e) => updateExoDetails(item.uniqueId, 'reps', e.target.value)} className="h-6 text-sm bg-gray-800 border-none text-center text-white font-bold p-0 focus-visible:ring-0 rounded"/>
                                </div>
                                <div className="bg-[#1a1a20] p-1 rounded-lg border border-gray-700">
                                    <label className="text-[9px] text-[#9d4edd] font-bold uppercase block text-center mb-0.5 flex items-center justify-center gap-1"><Clock size={8}/> Repos</label>
                                    <Input type="number" value={item.rest} onChange={(e) => updateExoDetails(item.uniqueId, 'rest', e.target.value)} className="h-6 text-sm bg-gray-800 border-none text-center text-white font-bold p-0 focus-visible:ring-0 rounded" placeholder="60"/>
                                </div>
                            </div>
                        </div>
                    ))}
                    {cart.length === 0 && (
                        <div className="text-center text-gray-500 py-10 italic flex flex-col items-center justify-center h-full">
                            <div className="w-20 h-20 rounded-full bg-gray-800/30 flex items-center justify-center mb-4 border border-dashed border-gray-700"><Plus className="text-gray-600" size={32}/></div>
                            <p className="font-bold text-gray-400">{t('session_empty')}</p>
                            <p className="text-xs mt-2 text-gray-600">{t('add_from_left')}</p>
                        </div>
                    )}
                </div>

                {/* --- FOOTER ACTIONS --- */}
                <div className="p-5 border-t border-gray-800 bg-[#15151a] space-y-3">
                    <Button disabled={cart.length === 0} onClick={() => setIsSaveModalOpen(true)} className="w-full bg-[#1a1a20] border border-gray-700 hover:bg-gray-800 text-white font-bold h-12 rounded-xl">
                        <Save className="mr-2 h-4 w-4" /> {t('save_favorite')}
                    </Button>

                    <Button
                        disabled={cart.length === 0} 
                        onClick={() => setIsProgramModalOpen(true)}
                        className="w-full bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-bold h-12 rounded-xl"
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" /> Programmer
                    </Button>

                    <Button 
                        className={`w-full font-black text-white h-14 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] ${isCoachView ? 'bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd]' : 'bg-gradient-to-r from-[#00f5d4] to-[#00b89f] text-black'}`} 
                        disabled={cart.length === 0} 
                        onClick={() => navigate('/session', { state: { sessionData: cart } })}
                    >
                        {isCoachView ? t('assign_to_client') : t('start')}
                    </Button>
                </div>
            </Card>
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white max-w-2xl rounded-3xl overflow-hidden p-0">
            {selectedExo && (
                <div className="flex flex-col">
                    <div className="h-64 relative bg-gray-900 flex items-center justify-center">
                        {selectedExo.mediaType === 'video' ? (
                            <video src={selectedExo.imageUrl} controls className="w-full h-full object-contain" autoPlay muted loop />
                        ) : (
                            <img src={selectedExo.imageUrl} className="w-full h-full object-cover" onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"; }}/>
                        )}
                        <div className="absolute bottom-6 left-6 pointer-events-none">
                            <Badge className="bg-[#9d4edd] text-white font-bold border-none mb-2 capitalize">{selectedExo.isCustom ? 'Coach' : MUSCLE_GROUPS.find(g => g.id === selectedExo.group)?.name || selectedExo.group}</Badge>
                            <DialogTitle className="text-3xl font-black italic uppercase text-white leading-none shadow-black drop-shadow-md">{selectedExo.name}</DialogTitle>
                        </div>
                    </div>
                    <div className="p-8">
                        <h4 className="text-sm font-bold text-[#9d4edd] uppercase tracking-widest mb-3 flex items-center gap-2"><Info size={16}/> Instructions</h4>
                        <p className="text-gray-300 leading-relaxed text-sm whitespace-pre-line">{selectedExo.description}</p>
                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <div className="bg-black/30 p-3 rounded-xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase font-bold">Équipement</p><p className="font-bold text-white capitalize">{selectedExo.equipment}</p></div>
                            <div className="bg-black/30 p-3 rounded-xl border border-gray-800"><p className="text-[10px] text-gray-500 uppercase font-bold">Type</p><p className="font-bold text-white capitalize">{selectedExo.isCustom ? 'Personnalisé' : 'Standard'}</p></div>
                        </div>
                        <Button className="w-full mt-8 bg-[#9d4edd] hover:bg-[#7b2cbf] text-white font-bold py-6 rounded-xl shadow-lg" onClick={() => { addToCart(selectedExo); setIsDetailOpen(false); }}>{t('add_to_session')}</Button>
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      {/* --- AUTO BUILD MODAL --- */}
      <Dialog open={isAutoBuildModalOpen} onOpenChange={setIsAutoBuildModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-xl">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black italic text-[#9d4edd] flex items-center gap-2 uppercase">
                    <Sparkles className="animate-pulse" /> Auto Build AI
                </DialogTitle>
                <DialogDescription className="text-gray-400">Génère un programme complet de 5 à 6 séances basé sur tes besoins.</DialogDescription>
            </DialogHeader>

            {autoBuildStep === 1 ? (
                <div className="space-y-6 py-4 animate-in fade-in duration-300 flex flex-col items-center">
                    <h4 className="text-lg font-bold text-[#00f5d4] italic uppercase w-full text-center">1. Sélectionne tes dates d'entraînement</h4>
                    <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                        <Calendar
                            mode="multiple"
                            selected={autoBuildDates}
                            onSelect={setAutoBuildDates}
                            locale={fr}
                            className="bg-transparent text-white"
                        />
                    </div>
                    <DialogFooter className="w-full">
                        <Button disabled={autoBuildDates.length === 0} onClick={() => setAutoBuildStep(2)} className="bg-[#9d4edd] text-white font-bold w-full h-12 rounded-xl">Suivant <ChevronRight className="ml-2" size={16}/></Button>
                    </DialogFooter>
                </div>
            ) : (
                <div className="space-y-6 py-4 animate-in slide-in-from-right duration-300">
                    <h4 className="text-lg font-bold text-[#00f5d4] italic uppercase text-center">2. Sur quoi veux-tu travailler ?</h4>
                    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {FOCUS_AREAS.map(focus => (
                            <button key={focus} onClick={() => toggleAutoFocus(focus)} className={`h-12 px-4 rounded-xl text-[10px] font-bold text-left transition-all border flex items-center justify-between ${autoBuildFocus.includes(focus) ? 'bg-[#9d4edd]/20 text-[#9d4edd] border-[#9d4edd]' : 'bg-black/30 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                                {focus}
                                {autoBuildFocus.includes(focus) && <Check size={14}/>}
                            </button>
                        ))}
                    </div>
                    <DialogFooter className="flex gap-3">
                        <Button variant="ghost" onClick={() => setAutoBuildStep(1)} className="text-gray-500 font-bold h-12">Retour</Button>
                        <Button
                            disabled={autoBuildFocus.length === 0 || isGenerating}
                            onClick={handleAutoBuild}
                            className="bg-[#00f5d4] text-black font-black flex-1 h-12 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.3)]"
                        >
                            {isGenerating ? <><Loader2 className="animate-spin mr-2"/> Génération...</> : "Générer mon programme"}
                        </Button>
                    </DialogFooter>
                </div>
            )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-lg">
            <DialogHeader><DialogTitle className="text-2xl font-black italic text-white">{t('create_exercise')}</DialogTitle><DialogDescription>Cet exercice sera visible par vos clients.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nom</label><Input value={newExoData.name} onChange={(e) => setNewExoData({...newExoData, name: e.target.value})} className="bg-black border-gray-700"/></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Groupe</label><Select value={newExoData.group} onValueChange={(val) => setNewExoData({...newExoData, group: val})}><SelectTrigger className="bg-black border-gray-700"><SelectValue/></SelectTrigger><SelectContent className="bg-[#1a1a20] border-gray-700 text-white">{MUSCLE_GROUPS.filter(g => g.id !== 'custom').map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Équipement</label><Select value={newExoData.equipment} onValueChange={(val) => setNewExoData({...newExoData, equipment: val})}><SelectTrigger className="bg-black border-gray-700"><SelectValue/></SelectTrigger><SelectContent className="bg-[#1a1a20] border-gray-700 text-white">{EQUIPMENTS.filter(e => e.id !== 'all').map(e => <SelectItem key={e.id} value={e.id}>{t(e.name)}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Instructions</label><Textarea value={newExoData.description} onChange={(e) => setNewExoData({...newExoData, description: e.target.value})} className="bg-black border-gray-700 min-h-[100px]"/></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Média</label><div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-[#9d4edd] relative group"><input type="file" accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setUploadFile(e.target.files[0])}/>{uploadFile ? <div className="flex items-center justify-center gap-2 text-[#9d4edd] font-bold"><CheckCircle size={16}/> {uploadFile.name}</div> : <div className="text-gray-500 group-hover:text-white transition-colors"><Upload className="mx-auto mb-2"/> <span className="text-xs">{t('drag_drop_media')}</span></div>}</div></div>
            </div>
            <DialogFooter><Button onClick={handleCreateExercise} disabled={isUploading} className="bg-[#9d4edd] hover:bg-[#7b2cbf] text-white font-bold w-full h-12 rounded-xl">{isUploading ? <><Loader2 className="animate-spin mr-2"/> {t('uploading')}</> : t('create_exercise')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl">
            <DialogHeader><DialogTitle className="text-2xl font-black italic text-white">{t('name_session')}</DialogTitle></DialogHeader>
            <div className="py-6"><Input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="Ex: Leg Day Intense..." className="bg-black border-gray-700 text-white h-14 text-lg rounded-xl"/></div>
            <DialogFooter><Button onClick={handleSaveTemplate} className="bg-[#9d4edd] hover:bg-[#7b2cbf] text-white font-bold w-full h-12 rounded-xl">{t('save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- MODAL PROGRAMMATION --- */}
      <Dialog open={isProgramModalOpen} onOpenChange={setIsProgramModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-md">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black italic text-[#9d4edd] uppercase">Programmer</DialogTitle>
                <DialogDescription className="text-gray-400">Sélectionne les dates exactes dans le calendrier pour cette séance.</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4 flex flex-col items-center">
                <Input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Nom de la séance (ex: Full Body)" className="bg-black border-gray-700 text-white h-12 rounded-xl w-full"/>
                <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                    <Calendar
                        mode="multiple"
                        selected={programDates}
                        onSelect={setProgramDates}
                        locale={fr}
                        className="bg-transparent text-white"
                    />
                </div>
            </div>
            <DialogFooter><Button onClick={handleProgramWeek} className="w-full bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-bold h-12 rounded-xl">{isSaving ? "Enregistrement..." : "Confirmer la planification"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!templateToLoad} onOpenChange={() => setTemplateToLoad(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-sm p-0 overflow-hidden">
            <div className="h-2 w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd]"></div>
            <div className="flex flex-col items-center text-center p-8">
                <div className="w-20 h-20 rounded-full bg-[#9d4edd]/20 flex items-center justify-center mb-6 text-[#9d4edd] border-4 border-[#1a1a20] shadow-[0_0_20px_rgba(157,78,221,0.3)]"><Star size={40} /></div>
                <h3 className="text-2xl font-black text-white mb-2 leading-tight">Charger<br/>"{templateToLoad?.name}" ?</h3>
                <p className="text-gray-400 text-sm mb-8 px-4">Attention, cela va <span className="text-red-400 font-bold">remplacer</span> votre sélection.</p>
                <div className="grid grid-cols-2 gap-4 w-full">
                    <Button variant="outline" onClick={() => setTemplateToLoad(null)} className="border-gray-700 hover:bg-gray-800 h-14 rounded-xl font-bold">{t('cancel')}</Button>
                    <Button onClick={confirmLoadTemplate} className="bg-[#9d4edd] hover:bg-[#7b2cbf] text-white font-black h-14 rounded-xl shadow-lg">{t('load')}</Button>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}