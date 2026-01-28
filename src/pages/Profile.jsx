import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Award, Trophy, Target, TrendingUp, User, 
  Ruler, Weight, Activity, AlertCircle, Save, Camera, Edit2, X, Calendar,
  Clock, Info, Flame, Dumbbell, Heart, Zap, CheckCircle2, ChevronRight,
  Image as ImageIcon, Loader2, Sparkles
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from 'framer-motion';

const GOAL_OPTIONS = [
  { id: 'fat_loss', label: 'Perte de Gras', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { id: 'muscle_gain', label: 'Prise de Muscle', icon: Dumbbell, color: 'text-[#9d4edd]', bg: 'bg-[#9d4edd]/10', border: 'border-[#9d4edd]/20' },
  { id: 'endurance', label: 'Endurance', icon: Heart, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  { id: 'strength', label: 'Force Pure', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  { id: 'flexibility', label: 'Souplesse', icon: Activity, color: 'text-[#00f5d4]', bg: 'bg-[#00f5d4]/10', border: 'border-[#00f5d4]/20' },
];

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function Profile() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coachPhotoUploading, setCoachPhotoUploading] = useState(false);
  const fileInputRef = useRef(null);
  const coachPhotoInputRef = useRef(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    birthDate: '',
    sex: '',
    height: '',
    weight: '',
    weightUnit: 'kg',
    injuries: '',
    allergies: '',
    selectedGoals: [],
    customGoals: '',
    availability: [],
    avatar: '',
    coachUpdatePhoto: '',
    role: 'client',
    coachId: null
  });

  const [stats, setStats] = useState({
    level: 1,
    points: 0,
    workouts: 0,
    challenges: 0
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (currentUser) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setFormData({
              firstName: data.first_name || data.firstName || '',
              lastName: data.last_name || data.lastName || '',
              username: data.username || '',
              email: data.email || currentUser.email,
              birthDate: data.birth_date || data.birthDate || '',
              sex: data.sex || '',
              height: data.height || '',
              weight: data.weight || '',
              weightUnit: data.weightUnit || 'kg',
              injuries: data.injuries || '',
              allergies: data.allergies || '',
              selectedGoals: data.selectedGoals || [],
              customGoals: data.goals || '',
              availability: data.availabilityDays || [],
              avatar: data.avatar || '',
              coachUpdatePhoto: data.coachUpdatePhoto || '',
              role: data.role || 'client',
              coachId: data.coachId || null
            });

            setStats({
              level: data.level || 1,
              points: data.points || 0,
              workouts: data.totalWorkouts || 0,
              challenges: data.completedChallenges || 0
            });
          }
        } catch (error) {
          console.error("Erreur chargement profil:", error);
        }
      }
      setLoading(false);
    };
    fetchUserData();
  }, [currentUser]);

  const toggleGoal = (goalId) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      selectedGoals: prev.selectedGoals.includes(goalId)
        ? prev.selectedGoals.filter(id => id !== goalId)
        : [...prev.selectedGoals, goalId]
    }));
  };

  const toggleDay = (day) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      availability: prev.availability.includes(day)
        ? prev.availability.filter(d => d !== day)
        : [...prev.availability, day]
    }));
  };

  const calculateCompletion = () => {
    const required = [
      formData.firstName, formData.lastName, formData.birthDate,
      formData.sex, formData.height, formData.weight,
      formData.selectedGoals.length > 0
    ];
    const filled = required.filter(Boolean).length;
    return Math.round((filled / required.length) * 100);
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
        const storageRef = ref(storage, `avatars/${currentUser.uid}_${Date.now()}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await updateDoc(doc(db, "users", currentUser.uid), { avatar: downloadURL });
        setFormData(prev => ({ ...prev, avatar: downloadURL }));
    } catch (error) {
        console.error(error);
    } finally { setAvatarUploading(false); }
  };

  const handleCoachPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoachPhotoUploading(true);
    try {
        const storageRef = ref(storage, `coach_updates/${currentUser.uid}_${Date.now()}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await updateDoc(doc(db, "users", currentUser.uid), { coachUpdatePhoto: downloadURL });
        setFormData(prev => ({ ...prev, coachUpdatePhoto: downloadURL }));
    } catch (error) {
        console.error(error);
    } finally { setCoachPhotoUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, "users", currentUser.uid);
      await updateDoc(docRef, {
        height: formData.height,
        weight: formData.weight,
        injuries: formData.injuries,
        allergies: formData.allergies,
        first_name: formData.firstName,
        last_name: formData.lastName,
        username: formData.username,
        full_name: `${formData.firstName} ${formData.lastName}`,
        birth_date: formData.birthDate,
        sex: formData.sex,
        selectedGoals: formData.selectedGoals,
        goals: formData.customGoals,
        availabilityDays: formData.availability,
        weightUnit: formData.weightUnit,
        keywords: [
            formData.username?.toLowerCase(), 
            formData.firstName?.toLowerCase(), 
            formData.lastName?.toLowerCase()
        ].filter(Boolean)
      });
      setIsEditing(false);
      alert("Profil mis à jour !");
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la sauvegarde.");
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-[#00f5d4] animate-spin" />
    </div>
  );

  const completion = calculateCompletion();

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-4">
      
      {/* --- TOP PROFILE HEADER --- */}
      <div className="relative pt-6">
        <div className="flex flex-col md:flex-row items-center gap-8 bg-gradient-to-br from-[#1a1a20] to-black/40 p-8 rounded-[2rem] border border-gray-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6">
              <Button
                  onClick={() => setIsEditing(!isEditing)}
                  variant={isEditing ? "destructive" : "outline"}
                  className={`gap-2 rounded-full px-6 transition-all duration-300 ${!isEditing ? "border-[#7b2cbf] hover:bg-[#7b2cbf] text-white" : ""}`}
              >
                  {isEditing ? <><X size={16}/> Annuler</> : <><Edit2 size={16}/> Modifier</>}
              </Button>
          </div>

          {/* AVATAR */}
          <div className="relative group">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-36 h-36 rounded-full p-1 bg-gradient-to-tr from-[#7b2cbf] via-[#9d4edd] to-[#00f5d4] shadow-[0_0_30px_rgba(123,44,191,0.3)]"
            >
                <Avatar className="w-full h-full border-4 border-[#0a0a0f]">
                    <AvatarImage src={formData.avatar} className="object-cover"/>
                    <AvatarFallback className="text-4xl font-black bg-[#1a1a20] text-white">
                        {formData.firstName?.[0] || 'K'}
                    </AvatarFallback>
                </Avatar>
            </motion.div>
            <button
              onClick={() => fileInputRef.current.click()}
              className="absolute bottom-0 right-0 bg-[#00f5d4] text-black p-2.5 rounded-full border-4 border-[#0a0a0f] shadow-xl hover:scale-110 transition"
            >
                {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Camera size={18} />}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
          </div>

          <div className="text-center md:text-left flex-1 space-y-2">
            <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">
              {formData.firstName || 'Athlète'} <span className="text-[#00f5d4]">{formData.lastName}</span>
            </h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              <span className="text-[#9d4edd] font-bold text-lg tracking-wider">@{formData.username || 'user'}</span>
              <Badge className="bg-[#7b2cbf]/20 text-[#00f5d4] border-[#7b2cbf]/50">Niveau {stats.level}</Badge>
              <Badge className="bg-[#fdcb6e]/10 text-[#fdcb6e] border-[#fdcb6e]/30 flex items-center gap-1">
                <Trophy size={12} /> {stats.points} XP
              </Badge>
            </div>

            {/* Barre de complétion */}
            <div className="mt-4 max-w-xs mx-auto md:mx-0">
              <div className="flex justify-between text-[10px] uppercase font-black text-gray-500 mb-1">
                <span>Complétion du Profil</span>
                <span className={completion < 100 ? "text-yellow-500" : "text-[#00f5d4]"}>{completion}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completion}%` }}
                  className={`h-full ${completion < 100 ? 'bg-yellow-500' : 'bg-[#00f5d4]'}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* --- COLONNE GAUCHE (BIO & PHYSIQUE) --- */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="kb-card border-gray-800 bg-[#1a1a20]/60">
            <CardHeader className="pb-2 border-b border-gray-800/50 mb-4">
              <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                <User className="text-[#9d4edd]" size={16} /> Identité & Sexe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Prénom</label>
                  <Input
                    value={formData.firstName}
                    onChange={(e)=>setFormData({...formData, firstName:e.target.value})}
                    disabled={!isEditing}
                    className="bg-black/40 border-gray-800 focus:border-[#00f5d4] h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Nom</label>
                  <Input
                    value={formData.lastName}
                    onChange={(e)=>setFormData({...formData, lastName:e.target.value})}
                    disabled={!isEditing}
                    className="bg-black/40 border-gray-800 focus:border-[#00f5d4] h-10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Pseudo</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9d4edd] font-black">@</span>
                  <Input
                    value={formData.username}
                    onChange={(e)=>setFormData({...formData, username:e.target.value})}
                    disabled={!isEditing}
                    className="bg-black/40 border-gray-800 pl-8 focus:border-[#00f5d4] h-10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Date de naissance</label>
                <Input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e)=>setFormData({...formData, birthDate:e.target.value})}
                  disabled={!isEditing}
                  className="bg-black/40 border-gray-800 h-10 text-xs text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Sexe</label>
                <div className="flex gap-2">
                  {['male', 'female'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => isEditing && setFormData({...formData, sex: s})}
                      className={`flex-1 py-3 rounded-xl border-2 transition-all font-black text-xs uppercase ${
                        formData.sex === s
                        ? 'border-[#9d4edd] bg-[#9d4edd]/10 text-white shadow-[0_0_15px_rgba(157,78,221,0.2)]'
                        : 'border-gray-800 bg-black/20 text-gray-500'
                      }`}
                    >
                      {s === 'male' ? 'Homme' : 'Femme'}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="kb-card border-gray-800">
            <CardHeader className="pb-2 border-b border-gray-800/50 mb-4">
              <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                <Ruler className="text-[#00f5d4]" size={16} /> Biométrie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 p-4 rounded-2xl border border-gray-800 text-center relative overflow-hidden group">
                  <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Taille</label>
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      value={formData.height}
                      onChange={(e)=>setFormData({...formData, height:e.target.value})}
                      disabled={!isEditing}
                      className="bg-transparent text-3xl font-black text-white w-20 text-center focus:outline-none placeholder:text-gray-800"
                      placeholder="0"
                    />
                    <span className="text-xs text-[#00f5d4] font-bold">cm</span>
                  </div>
                  {isEditing && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00f5d4] opacity-30" />}
                </div>

                <div className="bg-black/40 p-4 rounded-2xl border border-gray-800 text-center relative overflow-hidden group">
                  <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Poids Actuel</label>
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e)=>setFormData({...formData, weight:e.target.value})}
                      disabled={!isEditing}
                      className="bg-transparent text-3xl font-black text-white w-20 text-center focus:outline-none placeholder:text-gray-800"
                      placeholder="0"
                    />
                    <span className="text-xs text-[#00f5d4] font-bold">{formData.weightUnit}</span>
                  </div>
                  {isEditing && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00f5d4] opacity-30" />}
                </div>
              </div>

              {isEditing && (
                <div className="flex justify-center p-1 bg-black/60 rounded-full border border-gray-800 w-fit mx-auto">
                  {['kg', 'lbs'].map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setFormData({...formData, weightUnit: unit})}
                      className={`px-6 py-1.5 rounded-full text-[10px] font-black uppercase transition-all ${
                        formData.weightUnit === unit ? 'bg-[#00f5d4] text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* --- COLONNE DROITE (OBJECTIFS & DISPO) --- */}
        <div className="lg:col-span-8 space-y-6">

          <Card className="kb-card border-gray-800 overflow-hidden bg-black/20">
            <div className="bg-gradient-to-r from-[#7b2cbf]/20 via-[#7b2cbf]/5 to-transparent p-6 border-b border-gray-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-3 text-white italic uppercase font-black tracking-tighter">
                    <Sparkles className="text-[#00f5d4]" size={24} /> Mes Objectifs Élite
                  </CardTitle>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Cliquez pour définir vos priorités</p>
                </div>
                <Target className="text-gray-800 w-12 h-12" />
              </div>
            </div>
            <CardContent className="p-6 space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {GOAL_OPTIONS.map((goal) => {
                  const Icon = goal.icon;
                  const isSelected = formData.selectedGoals.includes(goal.id);
                  return (
                    <motion.button
                      key={goal.id}
                      type="button"
                      whileHover={isEditing ? { scale: 1.05, y: -2 } : {}}
                      whileTap={isEditing ? { scale: 0.95 } : {}}
                      onClick={() => toggleGoal(goal.id)}
                      className={`relative flex flex-col items-center justify-center aspect-square p-4 rounded-[1.5rem] border-2 transition-all duration-300 ${
                        isSelected
                        ? `border-[#00f5d4] ${goal.bg} shadow-[0_0_20px_rgba(0,245,212,0.15)]`
                        : 'border-gray-800 bg-black/40 opacity-40 grayscale'
                      } ${!isEditing && !isSelected ? 'hidden' : ''}`}
                    >
                      <Icon className={`w-10 h-10 mb-3 ${isSelected ? goal.color : 'text-gray-600'}`} />
                      <span className={`text-[10px] font-black uppercase text-center leading-tight ${isSelected ? 'text-white' : 'text-gray-600'}`}>
                        {goal.label}
                      </span>
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="absolute -top-2 -right-2 bg-[#00f5d4] text-black rounded-full p-1 border-2 border-[#0a0a0f]"
                          >
                            <CheckCircle2 size={12} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>

              <div className="space-y-3">
                <label className="text-xs text-gray-400 uppercase font-black flex items-center gap-2">
                  <Edit2 size={12} className="text-[#9d4edd]" /> Précisions pour votre coach
                </label>
                <Textarea
                  value={formData.customGoals}
                  onChange={(e)=>setFormData({...formData, customGoals:e.target.value})}
                  disabled={!isEditing}
                  placeholder="Décrivez vos attentes, vos motivations ou vos dates clés..."
                  className="bg-black/60 border-gray-800 focus:border-[#00f5d4] min-h-[120px] rounded-2xl text-sm p-4"
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="kb-card border-gray-800 bg-[#1a1a20]/60">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                  <Calendar className="text-[#9d4edd]" size={16} /> Jours d'entraînement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => {
                    const isAvailable = (formData.availability || []).includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`w-11 h-11 rounded-[12px] flex items-center justify-center text-xs font-black transition-all border-2 ${
                          isAvailable
                          ? 'bg-[#9d4edd] border-[#9d4edd] text-white shadow-[0_0_15px_rgba(157,78,221,0.3)]'
                          : 'bg-black/40 border-gray-800 text-gray-600'
                        } ${!isEditing && !isAvailable ? 'opacity-20 grayscale' : ''}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-600 mt-4 italic uppercase font-bold">Sélectionnez vos jours de disponibilité</p>
              </CardContent>
            </Card>

            <Card className="kb-card border-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                  <AlertCircle className="text-red-500" size={16} /> Santé & Sécurité
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-red-400/70 uppercase font-black">Blessures / Limites</label>
                  <Input
                    value={formData.injuries}
                    onChange={(e)=>setFormData({...formData, injuries:e.target.value})}
                    disabled={!isEditing}
                    placeholder="Aucune signalée"
                    className="bg-black/40 border-gray-800 h-10 text-xs focus:border-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-yellow-500/70 uppercase font-black">Allergies</label>
                  <Input
                    value={formData.allergies}
                    onChange={(e)=>setFormData({...formData, allergies:e.target.value})}
                    disabled={!isEditing}
                    placeholder="Aucune signalée"
                    className="bg-black/40 border-gray-800 h-10 text-xs focus:border-yellow-500/50"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <AnimatePresence>
            {isEditing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex justify-center pt-6"
              >
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="bg-gradient-to-r from-[#00f5d4] to-[#00d1b5] text-black font-black uppercase italic px-16 py-7 rounded-[1.5rem] shadow-[0_10px_30px_rgba(0,245,212,0.3)] hover:scale-105 transition-all flex items-center gap-3 text-lg tracking-tighter"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <><Save size={24}/> Enregistrer mon profil</>
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SECTION COACH - VISIBLE SI COACHID */}
          {formData.coachId && !isEditing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-800" />
                <h2 className="text-xs font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                  <TrendingUp size={14} className="text-[#00f5d4]" /> Suivi Évolution
                </h2>
                <div className="h-px flex-1 bg-gray-800" />
              </div>
              <Card className="kb-card border-dashed border-[#00f5d4]/20 bg-black/20 overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center gap-8 p-8">
                  <div className="relative group shrink-0">
                    <div className="w-32 h-44 bg-black rounded-[1.5rem] border-2 border-dashed border-gray-800 overflow-hidden flex items-center justify-center transition-all group-hover:border-[#00f5d4]/40">
                      {formData.coachUpdatePhoto ? (
                        <img src={formData.coachUpdatePhoto} className="w-full h-full object-cover" alt="Evolution" />
                      ) : (
                        <ImageIcon size={40} className="text-gray-800" />
                      )}
                    </div>
                    <button
                      onClick={() => coachPhotoInputRef.current.click()}
                      className="absolute -bottom-2 -right-2 bg-[#00f5d4] text-black p-2.5 rounded-2xl shadow-xl hover:scale-110 transition"
                    >
                      <Camera size={20} />
                    </button>
                    <input type="file" ref={coachPhotoInputRef} className="hidden" accept="image/*" onChange={handleCoachPhotoUpload} />
                  </div>

                  <div className="flex-1 space-y-4 text-center sm:text-left">
                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                      Photo pour votre Coach
                    </h3>
                    <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-md">
                      Mettez à jour votre photo régulièrement. Elle permet à votre coach de visualiser vos progrès physiques et d'ajuster vos macros et entraînements.
                    </p>
                    {coachPhotoUploading && (
                      <div className="flex items-center gap-2 text-[#00f5d4] text-xs font-black uppercase animate-pulse justify-center sm:justify-start">
                        <Loader2 className="animate-spin" size={16} /> Mise à jour en cours...
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </form>
    </div>
  );
}
