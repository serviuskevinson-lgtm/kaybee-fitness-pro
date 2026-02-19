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
  Upload, CheckCircle, Loader2, Clock, Calendar as CalendarIcon, Star, Image as ImageIcon, Video, Sparkles, Wand2, Check, ShoppingCart, X
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
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CustomCalendar from "@/components/CustomCalendar";
import WorkoutCart from "@/components/WorkoutCart";
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { autoBuildWorkoutsWithGemini } from '@/lib/geminiexercices';
import { format, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { WearPlugin } from '@/lib/wear';

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
  
  const [exercisesDB, setExercisesDB] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [customExercises, setCustomExercises] = useState([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('all');
  const [activeEquipment, setActiveEquipment] = useState('all'); 
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [groups, setGroups] = useState([]);
  const [pendingExercises, setPendingExercises] = useState([]);
  const [selectedSetType, setSelectedSetType] = useState('straight');

  const [templates, setTemplates] = useState([]);
  const [selectedExo, setSelectedExo] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [programName, setProgramName] = useState("");
  const [programDates, setProgramDates] = useState([]);
  const [isAutoBuildModalOpen, setIsAutoBuildModalOpen] = useState(false);
  const [autoBuildStep, setAutoBuildStep] = useState(1);
  const [autoBuildDates, setAutoBuildDates] = useState([]);
  const [autoBuildFocus, setAutoBuildFocus] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [templateToLoad, setTemplateToLoad] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newExoData, setNewExoData] = useState({ name: '', group: 'chest', equipment: 'body weight', description: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const MUSCLE_GROUPS = [
    { id: 'custom', name: 'Coach', icon: '👑', keywords: [] },
    { id: 'chest', name: t('chest'), icon: '🛡️', keywords: ['chest', 'pectorals', 'poitrine'] },
    { id: 'back', name: t('back_muscle'), icon: '🦅', keywords: ['back', 'lats', 'spine', 'trapezius', 'dos'] },
    { id: 'legs', name: t('legs'), icon: '🦵', keywords: ['legs', 'quadriceps', 'hamstrings', 'glutes', 'adductors', 'abductors', 'jambes'] },
    { id: 'shoulders', name: t('shoulders'), icon: '💪', keywords: ['shoulders', 'deltoids', 'épaules'] },
    { id: 'arms', name: t('arms'), icon: '🦾', keywords: ['arms', 'biceps', 'triceps', 'forearms', 'bras'] },
    { id: 'abs', name: t('abs'), icon: '🍫', keywords: ['abs', 'waist', 'abdominals', 'core'] },
    { id: 'cardio', name: t('cardio'), icon: '🏃', keywords: ['cardio', 'cardiovascular'] }
  ];

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
                        if (mg.keywords.some(k => target.includes(k))) { group = mg.id; break; }
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
        } catch (error) { console.error(error); setIsDbLoading(false); }
    };
    loadExercises();
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
        if (!currentUser) return;
        try {
            const userRef = doc(db, "users", targetUserId || currentUser.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) setUserProfile(userSnap.data());
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

  const addToCart = (exo) => {
    const newExo = { ...exo, uniqueId: Date.now() + Math.random() };
    setPendingExercises([...pendingExercises, newExo]);
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) return;
    setIsSaving(true);
    try {
      const templateData = {
        name: newTemplateName,
        groups: groups,
        createdBy: isCoachView ? 'coach' : 'client',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "users", targetUserId, "templates"), templateData);
      setIsSaveModalOpen(false);
      setNewTemplateName("");
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleProgramWeek = async () => {
      if (!programName.trim() || programDates.length === 0) {
          alert("Donne un nom et choisis au moins une date.");
          return;
      }

      if (!targetUserId) {
          alert("Erreur: Utilisateur non identifié.");
          return;
      }

      setIsSaving(true);
      try {
          const cleanGroups = JSON.parse(JSON.stringify(groups));
          const userRef = doc(db, "users", targetUserId);

          const updates = {};
          programDates.forEach(date => {
              const dateKey = `Exercise-${format(date, 'MM-dd-yyyy')}`;
              updates[dateKey] = {
                  id: Date.now().toString() + Math.random(),
                  name: programName,
                  groups: cleanGroups,
                  scheduledDays: [format(date, 'yyyy-MM-dd')],
                  createdAt: new Date().toISOString(),
                  assignedBy: isCoachView ? 'coach' : 'self'
              };
          });

          await updateDoc(userRef, updates);

          setIsProgramModalOpen(false);
          setProgramName("");
          setProgramDates([]);
          alert(t('program_saved') || "Planification réussie !");
          navigate('/dashboard');
      } catch (e) {
          console.error("Erreur lors de la planification:", e);
          alert("Erreur lors de l'enregistrement : " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  const handleAutoBuild = async () => {
    if (autoBuildDates.length === 0 || autoBuildFocus.length === 0) { alert("Sélectionne des dates et un focus."); return; }
    setIsGenerating(true);
    try {
      const userWeight = userProfile?.weight || 75;
      const weightUnit = userProfile?.weightUnit || 'kg';
      const formattedDates = autoBuildDates.map(d => format(d, 'yyyy-MM-dd'));
      const generatedWorkouts = await autoBuildWorkoutsWithGemini(formattedDates, autoBuildFocus, userWeight, weightUnit);
      if (!Array.isArray(generatedWorkouts)) throw new Error("Format invalide");

      const userRef = doc(db, "users", targetUserId);
      const updates = {};

      generatedWorkouts.forEach(workout => {
        const groupedExercises = workout.exercises.map(ex => {
          const found = exercisesDB.find(dbEx => dbEx.name.toLowerCase().includes(ex.name.toLowerCase()));
          return {
            id: Math.random(),
            setType: 'straight',
            exercises: [{
              ...ex,
              uniqueId: Math.random(),
              imageUrl: found?.imageUrl || "https://images.unsplash.com/photo-1574680096141-1cddd32e04ca?w=800&q=80",
              description: found?.description || t('default_instruction', {name: ex.name})
            }],
            sets: ex.sets || 3,
            rest: 60
          };
        });

        const dateObj = parseISO(workout.date);
        const dateKey = `Exercise-${format(dateObj, 'MM-dd-yyyy')}`;

        updates[dateKey] = {
          id: Date.now().toString() + Math.random(),
          name: workout.name,
          tip: workout.tip,
          groups: groupedExercises,
          scheduledDays: [workout.date],
          createdAt: new Date().toISOString(),
          assignedBy: 'AI'
        };
      });

      await updateDoc(userRef, updates);
      setIsAutoBuildModalOpen(false);
      alert("Programme généré !");
      navigate('/dashboard');
    } catch (e) { console.error(e); } finally { setIsGenerating(false); }
  };

  const confirmLoadTemplate = () => {
    if (!templateToLoad) return;
    if (templateToLoad.exercises && !templateToLoad.groups) {
        const converted = templateToLoad.exercises.map(ex => ({
            id: Math.random(),
            setType: 'straight',
            exercises: [{ ...ex, uniqueId: Date.now() + Math.random() }],
            sets: ex.sets || 3,
            rest: ex.rest || 60
        }));
        setGroups(converted);
    } else if (templateToLoad.groups) {
        setGroups(templateToLoad.groups.map(g => ({ ...g, id: Math.random() })));
    }
    setTemplateToLoad(null);
  };

  const deleteTemplate = async (e, id) => {
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await deleteDoc(doc(db, "users", targetUserId, "templates", id));
      setTemplates(templates.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleCreateExercise = async () => {
      if (!newExoData.name || !uploadFile) { alert(t('error')); return; }
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

          const exoForState = {
              ...newExo,
              id: docRef.id,
              isCustom: true,
              createdAt: new Date().toISOString()
          };

          setCustomExercises([exoForState, ...customExercises]);
          setIsCreateOpen(false);
          setNewExoData({ name: '', group: 'chest', equipment: 'body weight', description: '' });
          setUploadFile(null);
      } catch (e) { console.error(e); } finally { setIsUploading(false); }
  };

  const toggleAutoFocus = (focus) => {
    if (autoBuildFocus.includes(focus)) { setAutoBuildFocus(autoBuildFocus.filter(f => f !== focus)); }
    else { setAutoBuildFocus([...autoBuildFocus, focus]); }
  };

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
    <div className="p-2 sm:p-4 lg:p-8 min-h-screen bg-[#0a0a0f] text-white pb-32 overflow-x-hidden">
      <div className="max-w-7xl mx-auto mb-6 sm:mb-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6 bg-[#1a1a20] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-gray-800 shadow-xl">
            <div className="flex-1 text-center md:text-left">
                <h1 className="text-2xl sm:text-4xl font-black italic uppercase flex items-center justify-center md:justify-start gap-3 text-white tracking-tighter">
                    <Dumbbell className="text-[#9d4edd] size-8 sm:size-10 fill-[#9d4edd]/20"/> {t('workout_builder')}
                </h1>
                <p className="text-gray-400 text-[10px] sm:text-sm font-medium mt-1 sm:mt-2">{isDbLoading ? t('loading') : t('exercises_available', {count: allExercises.length})}</p>
            </div>
            <div className="flex gap-2 sm:gap-4 w-full md:w-auto">
                <Button onClick={() => { setIsAutoBuildModalOpen(true); setAutoBuildStep(1); }} className="flex-1 md:flex-none bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-black h-12 sm:h-14 px-4 sm:px-8 rounded-xl shadow-[0_0_20px_rgba(157,78,221,0.3)] transition-all text-xs sm:text-base border border-white/10">
                    <Wand2 size={16} className="mr-2 animate-pulse sm:size-5"/> AI BUILD
                </Button>
                {isCoachView && ( <Button onClick={() => setIsCreateOpen(true)} className="flex-1 md:flex-none bg-white text-black hover:bg-gray-200 font-black h-12 sm:h-14 px-4 sm:px-8 rounded-xl shadow-lg text-xs sm:text-base border-none"> <Plus size={18} className="mr-2 sm:size-6"/> {t('create_exercise')} </Button> )}
            </div>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="max-w-7xl mx-auto mb-6 sm:mb-10 animate-in slide-in-from-top duration-500">
            <h3 className="text-[10px] sm:text-sm font-bold text-[#9d4edd] uppercase mb-3 sm:mb-4 flex items-center gap-2 tracking-widest pl-2"> <Star size={12} className="fill-[#9d4edd] sm:size-3.5" /> {t('favorite_workouts')} </h3>
            <ScrollArea className="w-full whitespace-nowrap rounded-2xl sm:rounded-3xl border border-[#7b2cbf]/30 bg-[#15151a]/90 backdrop-blur-md p-3 sm:p-4 shadow-2xl">
                <div className="flex space-x-3 sm:space-x-4">
                    {templates.map((tpl) => (
                        <div key={tpl.id} onClick={() => setTemplateToLoad(tpl)} className={`relative group flex-shrink-0 w-56 sm:w-72 p-4 sm:p-5 rounded-xl sm:rounded-2xl border cursor-pointer transition-all duration-300 hover:scale-[1.02] ${tpl.createdBy === 'coach' ? 'bg-gradient-to-br from-[#7b2cbf]/20 to-[#9d4edd]/10 border-[#7b2cbf]/50 hover:border-[#9d4edd]' : 'bg-[#1a1a20] border-gray-700 hover:border-[#9d4edd]'}`}>
                            <div className="flex justify-between items-start mb-2 sm:mb-3"> <h4 className="font-bold text-white truncate pr-4 sm:pr-6 text-sm sm:text-lg">{tpl.name}</h4> {tpl.createdBy === 'coach' && <Badge className="bg-[#7b2cbf] text-white text-[8px] sm:text-[10px] px-1.5 py-0 sm:px-2 sm:py-0.5">Coach</Badge>} </div>
                            <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-400 mb-3 sm:mb-4"> <span className="flex items-center gap-1"><LayoutList size={10} className="sm:size-3"/> {tpl.groups?.length || tpl.exercises?.length || 0} Blocs</span> <span>{tpl.createdAt?.seconds ? new Date(tpl.createdAt.seconds * 1000).toLocaleDateString() : ""}</span> </div>
                            <div className="flex gap-2 opacity-100 sm:opacity-80 sm:group-hover:opacity-100 transition-opacity"> <Button size="sm" className="h-7 sm:h-8 text-[10px] sm:text-xs w-full font-bold bg-white/10 hover:bg-white/20 text-white"><Play size={10} className="mr-1.5 sm:size-3"/> {t('load')}</Button> <button onClick={(e) => {e.stopPropagation(); deleteTemplate(e, tpl.id)}} className="p-1.5 sm:p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"><Trash2 size={14} className="sm:size-4"/></button> </div>
                        </div>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" className="bg-[#7b2cbf]/20" />
            </ScrollArea>
        </div>
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="bg-[#1a1a20]/90 backdrop-blur p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-800 sticky top-2 sm:top-4 z-10 shadow-2xl">
                <div className="relative mb-4 sm:mb-5">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18}/>
                    <Input value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder={t('search_exercise')} className="pl-11 bg-black/50 border-gray-700 text-white h-11 sm:h-12 rounded-xl focus:border-[#9d4edd] text-sm"/>
                </div>
                <div className="flex flex-col gap-3 sm:gap-4">
                    <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setCurrentPage(1); }} className="flex-1 min-w-0">
                        <ScrollArea className="w-full whitespace-nowrap rounded-xl bg-black/50 border border-gray-800">
                            <TabsList className="bg-transparent w-full justify-start h-auto p-1">
                                <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-[#9d4edd] data-[state=active]:text-white text-[10px] sm:text-xs py-2 px-3 sm:px-4 font-bold transition-all">{t('all')}</TabsTrigger>
                                {customExercises.length > 0 && ( <TabsTrigger value="custom" className="rounded-lg data-[state=active]:bg-[#9d4edd] data-[state=active]:text-white text-[10px] sm:text-xs py-2 px-3 sm:px-4 font-bold transition-all border border-[#9d4edd]/50 mx-1"> 👑 Coach </TabsTrigger> )}
                                {MUSCLE_GROUPS.filter(g => g.id !== 'custom').map(g => ( <TabsTrigger key={g.id} value={g.id} className="rounded-lg data-[state=active]:bg-[#9d4edd] data-[state=active]:text-white text-[10px] sm:text-xs py-2 px-3 sm:px-4 font-bold transition-all whitespace-nowrap"> {g.icon} {g.name} </TabsTrigger> ))}
                            </TabsList>
                            <ScrollBar orientation="horizontal" className="invisible"/>
                        </ScrollArea>
                    </Tabs>
                    <div className="w-full lg:w-48 shrink-0">
                        <Select value={activeEquipment} onValueChange={(val) => { setActiveEquipment(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-full bg-[#2d2d35] border-[#9d4edd]/30 text-white h-10 sm:h-[52px] rounded-xl font-bold text-xs sm:text-sm"><Filter size={14} className="mr-2 text-[#9d4edd]"/><SelectValue placeholder="Équipement" /></SelectTrigger>
                            <SelectContent className="bg-[#1a1a20] border-gray-700 text-white"> {EQUIPMENTS.map(eq => <SelectItem key={eq.id} value={eq.id} className="focus:bg-[#9d4edd] focus:text-white cursor-pointer font-medium text-xs sm:text-sm">{t(eq.name)}</SelectItem>)} </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {isDbLoading ? ( <div className="py-20 text-center"><Loader2 className="animate-spin w-10 h-10 sm:w-12 sm:h-12 text-[#9d4edd] mx-auto mb-4"/><p className="text-gray-500 text-sm">{t('loading')}</p></div> ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                    {currentExercises.map(exo => {
                        const isPending = pendingExercises.find(e => e.name === exo.name);
                        const isInGroups = groups.some(g => g.exercises.some(e => e.name === exo.name));
                        const isAdded = isPending || isInGroups;

                        return (
                            <div key={exo.id} className={`rounded-xl sm:rounded-2xl border transition-all group overflow-hidden flex flex-col h-full ${exo.isCustom ? 'bg-[#1a1a25] border-[#9d4edd]/30' : 'bg-[#1a1a20] border-gray-800'}`}>
                                <div className="relative h-28 sm:h-40 bg-gray-900 cursor-pointer overflow-hidden" onClick={() => { setSelectedExo(exo); setIsDetailOpen(true); }}>
                                    {exo.mediaType === 'video' ? ( <div className="w-full h-full flex items-center justify-center bg-black"> <video src={exo.imageUrl} className="w-full h-full object-cover opacity-80" muted loop playsInline onMouseOver={e => e.target.play()} onMouseOut={e => e.target.pause()}/> <Play className="absolute fill-white text-white opacity-50 size-6 sm:size-8" /> </div> ) : ( <img src={exo.imageUrl} className="w-full h-full object-cover opacity-80 transition-all duration-500" loading="lazy" onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"; }}/> )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a20] to-transparent opacity-60 pointer-events-none"></div>
                                    <div className="absolute bottom-1.5 left-2 pointer-events-none"> <Badge className={`text-[7px] sm:text-[9px] font-bold border-none px-1.5 py-0 sm:py-0.5 capitalize ${exo.isCustom ? 'bg-white text-[#9d4edd]' : 'bg-[#9d4edd] text-white'}`}> {exo.isCustom ? 'Coach' : MUSCLE_GROUPS.find(g => g.id === exo.group)?.name || exo.group} </Badge> </div>
                                    <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-1 backdrop-blur-md pointer-events-none"><Info size={12} className="text-white"/></div>
                                </div>
                                <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between">
                                    <div> <h3 className="font-bold text-white text-[11px] sm:text-sm line-clamp-2 leading-tight mb-0.5">{exo.name}</h3> <p className="text-[8px] sm:text-[10px] text-gray-500 uppercase font-black tracking-tight truncate">{t(EQUIPMENTS.find(e => e.id === exo.equipment)?.name) || exo.equipment}</p> </div>
                                    <Button size="sm" className={`w-full mt-2 sm:mt-3 h-8 sm:h-9 font-bold text-[10px] sm:text-xs rounded-lg transition-all ${isAdded ? 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/50' : 'bg-[#9d4edd] text-white'}`} onClick={() => !isAdded && addToCart(exo)}> {isAdded ? <><Check size={12} className="mr-1 sm:size-3.5"/> OK</> : <><Plus size={12} className="mr-1 sm:size-3.5"/> {t('add')}</>} </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {!isDbLoading && filteredExercises.length > ITEMS_PER_PAGE && ( <div className="flex justify-center items-center gap-3 py-6"> <Button variant="outline" size="icon" className="bg-[#1a1a20] border-[#7b2cbf] text-[#9d4edd] rounded-full size-8 sm:size-10" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={16} className="sm:size-5"/></Button> <span className="text-[10px] sm:text-sm font-bold text-[#9d4edd] bg-[#9d4edd]/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-[#9d4edd]/20">Page {currentPage} / {totalPages}</span> <Button variant="outline" size="icon" className="bg-[#1a1a20] border-[#7b2cbf] text-[#9d4edd] rounded-full size-8 sm:size-10" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={16} className="sm:size-5"/></Button> </div> )}
        </div>

        {/* WORKOUT CART : VISIBLE ON DESKTOP, HIDDEN ON MOBILE (Sheet used instead) */}
        <div className="hidden lg:block lg:col-span-1">
            <WorkoutCart
                groups={groups}
                setGroups={setGroups}
                pendingExercises={pendingExercises}
                setPendingExercises={setPendingExercises}
                selectedSetType={selectedSetType}
                setSelectedSetType={setSelectedSetType}
                onSaveTemplate={() => setIsSaveModalOpen(true)}
                onProgramWeek={() => setIsProgramModalOpen(true)}
                onStartSession={() => navigate('/session', { state: { workout: { name: "Séance Express", groups: groups } } })}
                isCoachView={isCoachView}
                t={t}
            />
        </div>
      </div>

      {/* MOBILE FLOATING CART BUTTON */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <Sheet>
            <SheetTrigger asChild>
                <Button className="size-14 rounded-full bg-[#9d4edd] text-white shadow-2xl shadow-purple-900/50 border-4 border-[#0a0a0f] flex items-center justify-center relative">
                    <ShoppingCart size={24} />
                    {(groups.length > 0 || pendingExercises.length > 0) && (
                        <span className="absolute -top-1 -right-1 size-6 bg-[#00f5d4] text-black font-black text-[10px] rounded-full flex items-center justify-center border-2 border-[#0a0a0f]">
                            {groups.length + pendingExercises.length}
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[90vh] bg-[#0a0a0f] border-gray-800 p-0 rounded-t-[2.5rem]">
                <SheetHeader className="p-6 border-b border-gray-800 bg-[#1a1a20]">
                    <div className="flex justify-between items-center">
                        <SheetTitle className="text-white font-black italic uppercase tracking-tighter flex items-center gap-2">
                            <LayoutList className="text-[#9d4edd]" /> Ma Séance
                        </SheetTitle>
                    </div>
                </SheetHeader>
                <div className="h-full overflow-y-auto pb-32">
                    <WorkoutCart
                        groups={groups}
                        setGroups={setGroups}
                        pendingExercises={pendingExercises}
                        setPendingExercises={setPendingExercises}
                        selectedSetType={selectedSetType}
                        setSelectedSetType={setSelectedSetType}
                        onSaveTemplate={() => setIsSaveModalOpen(true)}
                        onProgramWeek={() => setIsProgramModalOpen(true)}
                        onStartSession={() => navigate('/session', { state: { workout: { name: "Séance Express", groups: groups } } })}
                        isCoachView={isCoachView}
                        t={t}
                    />
                </div>
            </SheetContent>
        </Sheet>
      </div>

      {/* DIALOGS ADAPTED FOR MOBILE */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white max-w-2xl rounded-2xl sm:rounded-3xl overflow-hidden p-0 w-[95vw] sm:w-full">
            {selectedExo && (
                <div className="flex flex-col">
                    <div className="h-48 sm:h-64 relative bg-gray-900 flex items-center justify-center">
                        {selectedExo.mediaType === 'video' ? ( <video src={selectedExo.imageUrl} controls className="w-full h-full object-contain" autoPlay muted loop playsInline /> ) : ( <img src={selectedExo.imageUrl} className="w-full h-full object-cover" onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80"; }}/> )}
                        <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6"> <Badge className="bg-[#9d4edd] text-white font-bold mb-1 sm:mb-2 capitalize text-[8px] sm:text-xs">{selectedExo.isCustom ? 'Coach' : MUSCLE_GROUPS.find(g => g.id === selectedExo.group)?.name || selectedExo.group}</Badge> <DialogTitle className="text-xl sm:text-3xl font-black italic uppercase text-white drop-shadow-md">{selectedExo.name}</DialogTitle> </div>
                        <button onClick={() => setIsDetailOpen(false)} className="absolute top-4 right-4 bg-black/40 p-1.5 rounded-full"><X size={18}/></button>
                    </div>
                    <div className="p-5 sm:p-8 space-y-4 sm:space-y-6 overflow-y-auto max-h-[50vh]">
                        <h4 className="text-[10px] sm:text-xs font-black text-[#9d4edd] uppercase tracking-widest flex items-center gap-2"><Info size={14}/> Instructions</h4>
                        <p className="text-gray-300 leading-relaxed text-[11px] sm:text-sm italic">{selectedExo.description}</p>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4"> <div className="bg-black/30 p-2 sm:p-3 rounded-xl border border-gray-800"><p className="text-[8px] sm:text-[10px] text-gray-500 uppercase font-black">Équipement</p><p className="font-bold text-white text-[10px] sm:text-xs capitalize">{t(EQUIPMENTS.find(e => e.id === selectedExo.equipment)?.name) || selectedExo.equipment}</p></div> <div className="bg-black/30 p-2 sm:p-3 rounded-xl border border-gray-800"><p className="text-[8px] sm:text-[10px] text-gray-500 uppercase font-black">Type</p><p className="font-bold text-white text-[10px] sm:text-xs capitalize">{selectedExo.isCustom ? 'Custom' : 'Standard'}</p></div> </div>
                        <Button className="w-full mt-4 sm:mt-6 bg-[#9d4edd] text-white font-black py-5 sm:py-6 rounded-xl text-xs sm:text-sm" onClick={() => { addToCart(selectedExo); setIsDetailOpen(false); }}>{t('add_to_session')}</Button>
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAutoBuildModalOpen} onOpenChange={setIsAutoBuildModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl sm:rounded-3xl max-w-xl w-[95vw] sm:w-full">
            <DialogHeader>
                <DialogTitle className="text-xl sm:text-2xl font-black italic text-[#9d4edd] flex items-center gap-2 uppercase"> <Sparkles size={20} /> AI BUILDER </DialogTitle>
            </DialogHeader>
            {autoBuildStep === 1 ? (
                <div className="space-y-4 sm:space-y-6 py-2 flex flex-col items-center">
                    <h4 className="text-xs sm:text-sm font-bold text-[#00f5d4] uppercase">1. Sélectionnez vos dates</h4>
                    <div className="w-full scale-90 sm:scale-100 flex justify-center">
                        <CustomCalendar selectedDates={autoBuildDates} onSelect={setAutoBuildDates} />
                    </div>
                    <Button disabled={autoBuildDates.length === 0} onClick={() => setAutoBuildStep(2)} className="bg-[#9d4edd] text-white font-black w-full h-12 rounded-xl">Suivant <ChevronRight className="ml-2" size={16}/></Button>
                </div>
            ) : (
                <div className="space-y-4 sm:space-y-6 py-2">
                    <h4 className="text-xs sm:text-sm font-bold text-[#00f5d4] uppercase text-center">2. Choisissez vos focus</h4>
                    <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                        {FOCUS_AREAS.map(focus => ( <button key={focus} onClick={() => toggleAutoFocus(focus)} className={`h-10 px-3 rounded-lg text-[9px] sm:text-[10px] font-black text-left transition-all border flex items-center justify-between uppercase ${autoBuildFocus.includes(focus) ? 'bg-[#9d4edd] text-white border-[#9d4edd]' : 'bg-black/30 text-gray-500 border-gray-800'}`}> {focus} {autoBuildFocus.includes(focus) && <Check size={12}/>} </button> ))}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setAutoBuildStep(1)} className="text-gray-500 font-bold h-12">Retour</Button>
                        <Button disabled={autoBuildFocus.length === 0 || isGenerating} onClick={handleAutoBuild} className="bg-[#00f5d4] text-black font-black flex-1 h-12 rounded-xl"> {isGenerating ? <Loader2 className="animate-spin" size={18}/> : "Générer"} </Button>
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      {/* OTHER DIALOGS (CREATE, SAVE, PROGRAM) - SIMILAR ADAPTATIONS */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl w-[95vw]">
            <DialogHeader><DialogTitle className="text-xl font-black italic text-white uppercase">{t('create_exercise')}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
                <div><label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Nom</label><Input value={newExoData.name} onChange={(e) => setNewExoData({...newExoData, name: e.target.value})} className="bg-black border-gray-800 h-10 text-sm"/></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Groupe</label><Select value={newExoData.group} onValueChange={(val) => setNewExoData({...newExoData, group: val})}><SelectTrigger className="bg-black border-gray-800 h-10 text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-[#1a1a20] border-gray-800 text-white">{MUSCLE_GROUPS.filter(g => g.id !== 'custom').map(g => <SelectItem key={g.id} value={g.id} className="text-xs">{g.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Matériel</label><Select value={newExoData.equipment} onValueChange={(val) => setNewExoData({...newExoData, equipment: val})}><SelectTrigger className="bg-black border-gray-800 h-10 text-xs"><SelectValue/></SelectTrigger><SelectContent className="bg-[#1a1a20] border-gray-800 text-white">{EQUIPMENTS.filter(e => e.id !== 'all').map(e => <SelectItem key={e.id} value={e.id} className="text-xs">{t(e.name)}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">Média</label><div className="border-2 border-dashed border-gray-800 rounded-xl p-4 text-center cursor-pointer relative"><input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setUploadFile(e.target.files[0])}/>{uploadFile ? <div className="text-[#9d4edd] font-bold text-[10px] truncate">{uploadFile.name}</div> : <div className="text-gray-600"><Upload className="mx-auto mb-1" size={16}/> <span className="text-[10px]">Photo/Vidéo</span></div>}</div></div>
            </div>
            <Button onClick={handleCreateExercise} disabled={isUploading} className="bg-[#9d4edd] text-white font-black w-full h-12 rounded-xl mt-2">{isUploading ? <Loader2 className="animate-spin" size={18}/> : "CRÉER"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={isProgramModalOpen} onOpenChange={setIsProgramModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-2xl w-[95vw]">
            <DialogHeader><DialogTitle className="text-xl font-black italic text-[#9d4edd] uppercase">Programmer</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2 flex flex-col items-center">
                <Input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Nom de la séance" className="bg-black border-gray-800 text-white h-10 text-sm w-full"/>
                <div className="scale-90"><CustomCalendar selectedDates={programDates} onSelect={setProgramDates} /></div>
            </div>
            <Button onClick={handleProgramWeek} disabled={isSaving} className="w-full bg-[#00f5d4] text-black font-black h-12 rounded-xl"> {isSaving ? <Loader2 className="animate-spin" size={18}/> : "CONFIRMER"} </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
