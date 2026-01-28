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
  { id: 'fat_loss', label: 'Perte de Gras', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'muscle_gain', label: 'Prise de Muscle', icon: Dumbbell, color: 'text-[#9d4edd]', bg: 'bg-[#9d4edd]/10' },
  { id: 'endurance', label: 'Endurance', icon: Heart, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'strength', label: 'Force Pure', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { id: 'flexibility', label: 'Souplesse', icon: Activity, color: 'text-[#00f5d4]', bg: 'bg-[#00f5d4]/10' },
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
    targetWeight: '',
    targetDate: '',
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
              targetWeight: data.target_weight || data.targetWeight || '',
              targetDate: data.target_date || data.targetDate || '',
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
      selectedGoals: (prev.selectedGoals || []).includes(goalId)
        ? prev.selectedGoals.filter(id => id !== goalId)
        : [...(prev.selectedGoals || []), goalId]
    }));
  };

  const toggleDay = (day) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      availability: (prev.availability || []).includes(day)
        ? prev.availability.filter(d => d !== day)
        : [...(prev.availability || []), day]
    }));
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
        alert("Photo de profil mise à jour !");
    } catch (error) {
        console.error(error);
        alert("Erreur upload");
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
        alert("Photo envoyée à votre coach !");
    } catch (error) {
        console.error(error);
        alert("Erreur upload");
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
      alert("Profil mis à jour !");
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      alert("Erreur sauvegarde");
    }
    setSaving(false);
  };

  if (loading) return <div className="text-white p-8">Chargement...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-4">
      
      {/* HEADER SECTION */}
      <div className="text-center relative pt-10">
        <div className="absolute top-0 right-0">
            <Button
                onClick={() => setIsEditing(!isEditing)}
                variant={isEditing ? "destructive" : "outline"}
                className={`gap-2 transition-all ${!isEditing ? "border-[#7b2cbf] hover:bg-[#7b2cbf] text-white" : ""}`}
            >
                {isEditing ? <><X size={16}/> Annuler</> : <><Edit2 size={16}/> Modifier</>}
            </Button>
        </div>

        <div className="relative w-32 h-32 mx-auto mb-4 group">
            <div className="w-full h-full rounded-full p-1 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] shadow-lg">
                <Avatar className="w-full h-full border-4 border-[#0a0a0f]">
                    <AvatarImage src={formData.avatar} className="object-cover"/>
                    <AvatarFallback className="text-3xl font-black bg-[#1a1a20] text-white">
                        {formData.firstName?.[0] || 'K'}
                    </AvatarFallback>
                </Avatar>
            </div>
            {isEditing && (
              <div
                  className="absolute bottom-0 right-0 bg-[#00f5d4] text-black p-2 rounded-full cursor-pointer border-4 border-[#0a0a0f] hover:scale-110 transition"
                  onClick={() => fileInputRef.current.click()}
              >
                  {avatarUploading ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"/> : <Camera size={20} />}
              </div>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
        </div>

        <h1 className="text-4xl font-black text-white capitalize">
          {formData.firstName} <span className="text-[#00f5d4]">{formData.lastName}</span>
        </h1>
        <p className="text-[#9d4edd] font-bold">@{formData.username || 'athlète'}</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLONNE GAUCHE */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="kb-card border-gray-800 bg-[#1a1a20]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                <User className="text-[#9d4edd]" size={16} /> Identité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Prénom</label>
                  <Input value={formData.firstName} onChange={(e)=>setFormData({...formData, firstName:e.target.value})} disabled={!isEditing} className="bg-black/50 border-gray-800 h-9"/>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Nom</label>
                  <Input value={formData.lastName} onChange={(e)=>setFormData({...formData, lastName:e.target.value})} disabled={!isEditing} className="bg-black/50 border-gray-800 h-9"/>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Date de naissance</label>
                <Input type="date" value={formData.birthDate} onChange={(e)=>setFormData({...formData, birthDate:e.target.value})} disabled={!isEditing} className="bg-black/50 border-gray-800 h-9 text-xs"/>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Sexe</label>
                <div className="flex gap-2">
                  {['male', 'female'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => isEditing && setFormData({...formData, sex: s})}
                      className={`flex-1 py-2 rounded-lg border transition-all font-bold text-xs uppercase ${formData.sex === s ? 'bg-[#9d4edd] border-[#9d4edd] text-white' : 'border-gray-800 text-gray-500'}`}
                    >
                      {s === 'male' ? 'H' : 'F'}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="kb-card border-gray-800 bg-[#1a1a20]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                <Ruler className="text-[#00f5d4]" size={16} /> Biométrie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 text-center">
                  <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Taille</label>
                  <div className="flex items-center justify-center gap-1">
                    <input type="number" value={formData.height} onChange={(e)=>setFormData({...formData, height:e.target.value})} disabled={!isEditing} className="bg-transparent text-xl font-black text-white w-12 text-center focus:outline-none"/>
                    <span className="text-xs text-[#00f5d4] font-bold">cm</span>
                  </div>
                </div>
                <div className="bg-black/40 p-3 rounded-xl border border-gray-800 text-center">
                  <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Poids</label>
                  <div className="flex items-center justify-center gap-1">
                    <input type="number" value={formData.weight} onChange={(e)=>setFormData({...formData, weight:e.target.value})} disabled={!isEditing} className="bg-transparent text-xl font-black text-white w-12 text-center focus:outline-none"/>
                    <span className="text-xs text-[#00f5d4] font-bold">{formData.weightUnit}</span>
                  </div>
                </div>
              </div>
              {isEditing && (
                <div className="flex justify-center gap-2 mt-2">
                  {['kg', 'lbs'].map(unit => (
                    <button key={unit} type="button" onClick={() => setFormData({...formData, weightUnit: unit})} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${formData.weightUnit === unit ? 'bg-[#00f5d4] text-black' : 'border border-gray-800 text-gray-500'}`}>{unit}</button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLONNE DROITE */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="kb-card border-gray-800 bg-[#1a1a20] overflow-hidden">
            <div className="bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-6 pb-0">
              <CardTitle className="text-lg flex items-center gap-2 text-white uppercase font-black">
                <Target className="text-[#00f5d4]" size={20} /> Mes Objectifs
              </CardTitle>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {GOAL_OPTIONS.map((goal) => {
                  const Icon = goal.icon;
                  const isSelected = (formData.selectedGoals || []).includes(goal.id);
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => toggleGoal(goal.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${isSelected ? `border-[#00f5d4] ${goal.bg}` : 'border-gray-800 bg-black/20 opacity-50'} ${!isEditing && !isSelected ? 'hidden' : ''}`}
                    >
                      <Icon className={`w-8 h-8 mb-2 ${isSelected ? goal.color : 'text-gray-600'}`} />
                      <span className={`text-[10px] font-black uppercase text-center ${isSelected ? 'text-white' : 'text-gray-600'}`}>{goal.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-400 uppercase font-black">Précisions Coach</label>
                <Textarea value={formData.customGoals} onChange={(e)=>setFormData({...formData, customGoals:e.target.value})} disabled={!isEditing} placeholder="Décrivez vos attentes spécifiques..." className="bg-black/40 border-gray-800 min-h-[100px] text-sm"/>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="kb-card border-gray-800 bg-[#1a1a20]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                  <Calendar className="text-[#9d4edd]" size={16} /> Disponibilités
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => {
                    const isAvailable = (formData.availability || []).includes(day);
                    return (
                      <button key={day} type="button" onClick={() => toggleDay(day)} className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all border-2 ${isAvailable ? 'bg-[#9d4edd] border-[#9d4edd] text-white' : 'bg-black/40 border-gray-800 text-gray-600'} ${!isEditing && !isAvailable ? 'hidden' : ''}`}>{day}</button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="kb-card border-gray-800 bg-[#1a1a20]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-400 uppercase font-black">
                  <AlertCircle className="text-red-500" size={16} /> Santé
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-[10px] text-red-400 uppercase font-black">Blessures</label>
                  <Input value={formData.injuries} onChange={(e)=>setFormData({...formData, injuries:e.target.value})} disabled={!isEditing} placeholder="Ex: Genou..." className="bg-black/40 border-gray-800 h-8 text-xs"/>
                </div>
                <div>
                  <label className="text-[10px] text-yellow-500 uppercase font-black">Allergies</label>
                  <Input value={formData.allergies} onChange={(e)=>setFormData({...formData, allergies:e.target.value})} disabled={!isEditing} placeholder="Ex: Gluten..." className="bg-black/40 border-gray-800 h-8 text-xs"/>
                </div>
              </CardContent>
            </Card>
          </div>

          {isEditing && (
            <div className="flex justify-end pt-4">
              <Button onClick={handleSubmit} disabled={saving} className="bg-[#00f5d4] text-black font-black uppercase px-10 rounded-xl py-6 flex gap-2">
                {saving ? <Loader2 className="animate-spin" /> : <><Save size={20}/> Sauvegarder</>}
              </Button>
            </div>
          )}

          {formData.coachId && !isEditing && (
            <Card className="kb-card border-[#00f5d4]/30 bg-black/40 p-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="relative group">
                  <div className="w-24 h-32 bg-black rounded-xl border-2 border-dashed border-gray-700 overflow-hidden flex items-center justify-center">
                    {formData.coachUpdatePhoto ? <img src={formData.coachUpdatePhoto} className="w-full h-full object-cover" /> : <ImageIcon size={32} className="text-gray-800" />}
                  </div>
                  <button onClick={() => coachPhotoInputRef.current.click()} className="absolute -bottom-2 -right-2 bg-[#00f5d4] text-black p-2 rounded-lg shadow-lg"><Camera size={16} /></button>
                  <input type="file" ref={coachPhotoInputRef} className="hidden" accept="image/*" onChange={handleCoachPhotoUpload} />
                </div>
                <div className="flex-1 space-y-2 text-center md:text-left">
                  <h3 className="text-lg font-black text-white italic uppercase tracking-tighter flex items-center justify-center md:justify-start gap-2">
                    <TrendingUp className="text-[#00f5d4]" /> Suivi Évolution
                  </h3>
                  <p className="text-xs text-gray-400 font-bold">Mettez à jour votre photo régulièrement pour votre coach.</p>
                  {coachPhotoUploading && <div className="text-[#00f5d4] text-[10px] font-black uppercase animate-pulse">Envoi...</div>}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
