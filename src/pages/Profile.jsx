import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Award, Trophy, Target, TrendingUp, User, 
  Ruler, Weight, Activity, AlertCircle, Save, Camera, Edit2, X, Calendar,
  Clock, Info, Flame, Dumbbell, Heart, Zap, CheckCircle2, ChevronRight,
  Image as ImageIcon, Loader2, Sparkles, Goal, CreditCard, Plus, Trash2, Tag, Percent, MapPin, Search,
  Users, Globe, Laptop
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from 'framer-motion';
import { calculateDiscountedPrice, getCurrencyFromLocation } from '@/lib/coachPrice';

export const GOAL_OPTIONS = [
  { id: 'fat_loss', label: 'Perte de Gras', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { id: 'muscle_gain', label: 'Prise de Muscle', icon: Dumbbell, color: 'text-[#9d4edd]', bg: 'bg-[#9d4edd]/10', border: 'border-[#9d4edd]/20' },
  { id: 'endurance', label: 'Endurance', icon: Heart, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  { id: 'strength', label: 'Force Pure', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  { id: 'flexibility', label: 'Souplesse', icon: Activity, color: 'text-[#00f5d4]', bg: 'bg-[#00f5d4]/10', border: 'border-[#00f5d4]/20' },
];

export const SERVICE_CATEGORIES = [
  { id: 'private', label: 'Privé', icon: User, color: 'text-[#00f5d4]' },
  { id: 'semi', label: 'Semi-Privé', icon: Users, color: 'text-[#9d4edd]' },
  { id: 'group', label: 'Groupe', icon: Sparkles, color: 'text-[#fdcb6e]' },
  { id: 'remote', label: 'À distance', icon: Laptop, color: 'text-blue-400' },
];

export const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function Profile() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId } = useClient();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coachPhotoUploading, setCoachPhotoUploading] = useState(false);
  const fileInputRef = useRef(null);
  const placePickerRef = useRef(null);

  const activeUserId = targetUserId || currentUser?.uid;

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    birthDate: '',
    sex: '',
    height: '',
    weight: '',
    targetWeight: '',
    weightUnit: 'kg',
    injuries: '',
    allergies: '',
    selectedGoals: [],
    customGoals: '',
    availability: [],
    avatar: '',
    coachUpdatePhoto: '',
    role: 'client',
    coachId: null,
    pricing: [],
    location: {
      city: '',
      district: '',
      country: '',
      formattedAddress: ''
    }
  });

  const [stats, setStats] = useState({
    level: 1,
    points: 0,
    workouts: 0,
    challenges: 0
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (activeUserId) {
        try {
          const docRef = doc(db, "users", activeUserId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setFormData({
              firstName: data.first_name || data.firstName || '',
              lastName: data.last_name || data.lastName || '',
              username: data.username || '',
              email: data.email || (activeUserId === currentUser?.uid ? currentUser.email : ''),
              birthDate: data.birth_date || data.birthDate || '',
              sex: data.sex || '',
              height: data.height || '',
              weight: data.weight || '',
              targetWeight: data.targetWeight || '',
              weightUnit: data.weightUnit || 'kg',
              injuries: data.injuries || '',
              allergies: data.allergies || '',
              selectedGoals: data.selectedGoals || [],
              customGoals: data.goals || '',
              availability: data.availabilityDays || [],
              avatar: data.avatar || '',
              coachUpdatePhoto: data.coachUpdatePhoto || '',
              role: data.role || 'client',
              coachId: data.coachId || null,
              pricing: data.pricing || [],
              location: data.location || { city: '', district: '', country: '', formattedAddress: '' }
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
  }, [activeUserId, currentUser]);

  useEffect(() => {
    const picker = placePickerRef.current;
    if (picker) {
        const handlePlaceChange = () => {
            const place = picker.value;
            if (place) {
                const addr = place.address_components || [];
                const city = addr.find(c => c.types.includes('locality'))?.long_name ||
                             addr.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';
                const district = addr.find(c => c.types.includes('administrative_area_level_2'))?.long_name || '';
                const country = addr.find(c => c.types.includes('country'))?.long_name || '';

                const newLoc = {
                    city,
                    district,
                    country,
                    formattedAddress: place.formatted_address || ''
                };
                setFormData(prev => ({ ...prev, location: newLoc }));
            }
        };
        picker.addEventListener('gmpx-placechange', handlePlaceChange);
        return () => picker.removeEventListener('gmpx-placechange', handlePlaceChange);
    }
  }, [isEditing]);

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

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
        const storageRef = ref(storage, `avatars/${activeUserId}_${Date.now()}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await updateDoc(doc(db, "users", activeUserId), { avatar: downloadURL });
        setFormData(prev => ({ ...prev, avatar: downloadURL }));
    } catch (error) { console.error(error); } finally { setAvatarUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, "users", activeUserId);
      await updateDoc(docRef, {
        height: formData.height,
        weight: formData.weight,
        targetWeight: formData.targetWeight,
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
        location: formData.location,
        priceStart: formData.pricing?.length > 0 ? Math.min(...formData.pricing.map(p => calculateDiscountedPrice(p.price, p.discount))) : 0,
      });
      setIsEditing(false);
      alert("Profil mis à jour !");
    } catch (error) { console.error(error); }
    setSaving(false);
  };

  if (loading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-[#00f5d4] font-black uppercase animate-pulse">Sync Profil...</div>;

  return (
    <div className="p-2 sm:p-4 bg-[#0a0a0f] min-h-screen text-white pb-32 overflow-x-hidden">

      {/* HEADER */}
      <div className="bg-[#1a1a20] p-5 sm:p-8 rounded-2xl border border-gray-800 shadow-xl mb-6 relative">
        <div className="absolute top-4 right-4">
            <Button onClick={() => setIsEditing(!isEditing)} size="sm" className={`h-9 px-4 rounded-xl font-black uppercase text-[10px] italic transition-all ${isEditing ? "bg-red-500" : "bg-[#00f5d4] text-black"}`}>
                {isEditing ? <><X size={14} className="mr-1"/> Annuler</> : <><Edit2 size={14} className="mr-1"/> Modifier</>}
            </Button>
        </div>

        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6">
            <div className="relative">
                <Avatar className="size-24 sm:size-32 border-4 border-[#0a0a0f] ring-2 ring-[#00f5d4]">
                    <AvatarImage src={formData.avatar} className="object-cover"/>
                    <AvatarFallback className="bg-[#1a1a20] text-2xl font-black text-white">{formData.firstName?.[0]}</AvatarFallback>
                </Avatar>
                <button onClick={() => fileInputRef.current.click()} className="absolute bottom-0 right-0 bg-[#00f5d4] text-black size-8 rounded-full border-4 border-[#0a0a0f] flex items-center justify-center">
                    {avatarUploading ? <Loader2 className="animate-spin" size={14} /> : <Camera size={14} />}
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
            </div>

            <div className="text-center sm:text-left flex-1 min-w-0">
                <h1 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tighter truncate text-white drop-shadow-md">
                    {formData.firstName} {formData.lastName}
                </h1>
                <p className="text-[#9d4edd] font-black text-sm tracking-widest mt-1">@{formData.username}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                    <Badge className="bg-[#7b2cbf]/20 text-[#00f5d4] border-none text-[10px] font-black uppercase">Lv. {stats.level}</Badge>
                    {formData.location?.city && <Badge variant="outline" className="text-[10px] uppercase border-white/10 text-white font-bold"><MapPin size={8} className="mr-1 text-red-500"/> {formData.location.city}</Badge>}
                </div>
            </div>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6">

        {/* COLONNE GAUCHE */}
        <div className="lg:col-span-4 space-y-6">
            {/* LOCALISATION EDITABLE */}
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl shadow-lg">
                <CardHeader className="p-4 border-b border-white/5"><CardTitle className="text-[10px] font-black text-[#00f5d4] uppercase tracking-[0.2em]">Localisation Mondiale</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-4">
                    {isEditing ? (
                        <div className="space-y-2 dark-theme-picker">
                            <gmpx-place-picker
                                ref={placePickerRef}
                                placeholder="Rechercher Ville, Région, Pays..."
                                style={{
                                    "--gmpx-color-surface": "#000",
                                    "--gmpx-color-on-surface": "#fff",
                                    "--gmpx-font-family": "inherit",
                                    "width": "100%",
                                    "borderRadius": "12px"
                                }}
                            ></gmpx-place-picker>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                            <MapPin size={14} className="text-red-500 shrink-0"/>
                            <p className="text-xs text-white font-black truncate">{formData.location?.formattedAddress || 'Non renseignée'}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* BIOMÉTRIE (MODIFIABLE) */}
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl shadow-lg">
                <CardHeader className="p-4 border-b border-white/5"><CardTitle className="text-[10px] font-black text-[#00f5d4] uppercase tracking-[0.2em]">Poids & Taille</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-center shadow-inner">
                            <p className="text-[8px] text-gray-400 font-black uppercase mb-1">Taille</p>
                            <div className="flex items-center justify-center gap-1">
                                <input type="number" value={formData.height} onChange={(e)=>setFormData({...formData, height:e.target.value})} disabled={!isEditing} className="bg-transparent text-xl font-black w-12 text-center text-white focus:outline-none"/>
                                <span className="text-[8px] text-[#00f5d4] font-black">CM</span>
                            </div>
                        </div>
                        <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-center shadow-inner">
                            <p className="text-[8px] text-gray-400 font-black uppercase mb-1">Poids</p>
                            <div className="flex items-center justify-center gap-1">
                                <input type="number" value={formData.weight} onChange={(e)=>setFormData({...formData, weight:e.target.value})} disabled={!isEditing} className="bg-transparent text-xl font-black w-12 text-center text-white focus:outline-none"/>
                                <span className="text-[8px] text-[#00f5d4] font-black">{formData.weightUnit}</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-black/40 p-3 rounded-xl border-2 border-dashed border-[#9d4edd]/30 text-center shadow-inner">
                        <p className="text-[8px] text-[#9d4edd] font-black uppercase mb-1">Poids Cible</p>
                        <div className="flex items-center justify-center gap-1">
                            <input type="number" value={formData.targetWeight} onChange={(e)=>setFormData({...formData, targetWeight:e.target.value})} disabled={!isEditing} className="bg-transparent text-xl font-black w-12 text-center text-white focus:outline-none" placeholder="--"/>
                            <span className="text-[8px] text-[#9d4edd] font-black">{formData.weightUnit}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl shadow-lg">
                <CardHeader className="p-4 border-b border-white/5"><CardTitle className="text-[10px] font-black text-[#00f5d4] uppercase tracking-[0.2em]">Données Personnelles</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[8px] text-gray-400 font-black uppercase">Date de naissance</label>
                        <Input type="date" value={formData.birthDate} onChange={(e)=>setFormData({...formData, birthDate:e.target.value})} disabled={!isEditing} className="bg-black/40 border-gray-800 h-9 text-xs text-white font-black"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[8px] text-gray-400 font-black uppercase">Sexe</label>
                        <Select value={formData.sex} onValueChange={(val)=>setFormData({...formData, sex:val})} disabled={!isEditing}>
                            <SelectTrigger className="bg-black/40 border-gray-800 h-9 text-xs text-white font-black"><SelectValue placeholder="Choisir..."/></SelectTrigger>
                            <SelectContent className="bg-[#1a1a20] border-gray-800 text-white"><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem><SelectItem value="O">Autre</SelectItem></SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl shadow-lg">
                <CardHeader className="p-4 border-b border-white/5"><CardTitle className="text-[10px] font-black text-[#00f5d4] uppercase tracking-[0.2em]">Santé</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-3">
                    <div className="space-y-1"><label className="text-[8px] text-red-400 font-black uppercase">Blessures</label><Input value={formData.injuries} onChange={(e)=>setFormData({...formData, injuries:e.target.value})} disabled={!isEditing} className="bg-black/40 border-gray-800 h-9 text-xs text-white font-black" placeholder="Néant"/></div>
                    <div className="space-y-1"><label className="text-[8px] text-yellow-500 font-black uppercase">Allergies</label><Input value={formData.allergies} onChange={(e)=>setFormData({...formData, allergies:e.target.value})} disabled={!isEditing} className="bg-black/40 border-gray-800 h-9 text-xs text-white font-black" placeholder="Néant"/></div>
                </CardContent>
            </Card>
        </div>

        {/* COLONNE DROITE */}
        <div className="lg:col-span-8 space-y-6">
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl shadow-xl">
                <CardHeader className="p-4 border-b border-white/5"><CardTitle className="text-[10px] font-black text-[#00f5d4] uppercase tracking-[0.2em]">Compte & Identité</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[8px] text-white font-black uppercase">Prénom</label><Input value={formData.firstName} onChange={(e)=>setFormData({...formData, firstName:e.target.value})} disabled={!isEditing} className="bg-black/40 border-gray-800 h-10 text-xs text-white font-black shadow-inner"/></div>
                        <div className="space-y-1"><label className="text-[8px] text-white font-black uppercase">Nom</label><Input value={formData.lastName} onChange={(e)=>setFormData({...formData, lastName:e.target.value})} disabled={!isEditing} className="bg-black/40 border-gray-800 h-10 text-xs text-white font-black shadow-inner"/></div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[8px] text-white font-black uppercase">Pseudo Personnel (@)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9d4edd] font-black text-xs">@</span>
                            <Input value={formData.username} onChange={(e)=>setFormData({...formData, username:e.target.value})} disabled={!isEditing} className="bg-black/40 border-gray-800 h-10 text-xs text-white pl-7 font-black shadow-inner"/>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <CardHeader className="p-4 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent border-b border-white/5">
                    <CardTitle className="text-xs font-black text-white uppercase italic tracking-widest flex items-center gap-2"><Target className="text-[#00f5d4]"/> Objectifs prioritaires</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-6">
                    <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar">
                        {GOAL_OPTIONS.map(goal => {
                            const isSel = formData.selectedGoals.includes(goal.id);
                            if (!isEditing && !isSel) return null;
                            return (
                                <button key={goal.id} type="button" onClick={() => toggleGoal(goal.id)} className={`flex-shrink-0 size-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${isSel ? 'border-[#00f5d4] bg-[#00f5d4]/5' : 'border-gray-800 bg-black/40 opacity-40'}`}>
                                    <goal.icon size={24} className={isSel ? goal.color : 'text-white opacity-40'}/>
                                    <span className={`text-[9px] font-black uppercase text-center mt-2 px-1 ${isSel ? 'text-white font-black' : 'text-gray-400'}`}>{goal.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="space-y-1">
                        <label className="text-[8px] text-gray-400 font-black uppercase">Détails de mes objectifs</label>
                        <Textarea value={formData.customGoals} onChange={(e)=>setFormData({...formData, customGoals:e.target.value})} disabled={!isEditing} placeholder="Décrivez vos objectifs en détail..." className="bg-black/40 border-gray-800 min-h-[100px] text-xs rounded-xl italic text-white font-black shadow-inner"/>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl shadow-xl">
                <CardHeader className="p-4 border-b border-white/5"><CardTitle className="text-[10px] font-black text-[#00f5d4] uppercase tracking-widest">Jours d'entraînement</CardTitle></CardHeader>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                        {DAYS.map(day => (
                            <button key={day} type="button" onClick={() => toggleDay(day)} className={`size-12 rounded-lg flex items-center justify-center text-[10px] font-black border-2 transition-all ${formData.availability.includes(day) ? 'bg-[#9d4edd] border-[#9d4edd] text-white shadow-lg shadow-purple-900/30' : 'bg-black/40 border-gray-800 text-white font-black'}`}>{day}</button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {isEditing && (
                <div className="fixed bottom-6 left-0 w-full px-6 z-40 lg:relative lg:bottom-0 lg:px-0">
                    <Button onClick={handleSubmit} disabled={saving} className="w-full bg-[#00f5d4] text-black font-black uppercase italic h-14 rounded-2xl shadow-[0_0_30px_rgba(0,245,212,0.3)] active:scale-95 transition-all">
                        {saving ? <Loader2 className="animate-spin mr-2" /> : <><Save size={18} className="mr-2"/> ENREGISTRER MON PROFIL</>}
                    </Button>
                </div>
            )}
        </div>
      </div>
      <style>{`
        gmpx-place-picker {
            border-radius: 12px;
            overflow: hidden;
        }
      `}</style>
    </div>
  );
}
