import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase'; // Ajout de storage
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Pour l'avatar
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Award, Trophy, Target, TrendingUp, User, 
  Ruler, Weight, Activity, AlertCircle, Save, Camera, Edit2, X 
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Profile() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // Mode édition global
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

  // État local pour le formulaire
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '', // Le Pseudo (Rectangle Bleu)
    email: '',
    birthDate: '',
    sex: '',
    height: '',
    weight: '',
    weightUnit: 'lbs',
    injuries: '',
    allergies: '',
    goals: [],
    targetWeight: '',
    targetDate: '',
    avatar: '' // URL de la photo
  });

  // Calculs dérivés (Niveau, Points...)
  const [stats, setStats] = useState({
    level: 1,
    points: 0,
    workouts: 0,
    challenges: 0
  });

  // 1. CHARGEMENT DES DONNÉES FIRESTORE
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
              username: data.username || '', // Charge le pseudo
              email: data.email || currentUser.email,
              birthDate: data.birth_date || data.birthDate || '',
              sex: data.sex || '',
              height: data.height || '',
              weight: data.weight || '',
              weightUnit: data.unit || data.weightUnit || 'lbs',
              injuries: data.injuries || '',
              allergies: data.allergies || '',
              goals: data.goals || [],
              targetWeight: data.target_weight || data.targetWeight || '',
              targetDate: data.target_date || data.targetDate || '',
              avatar: data.avatar || ''
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

  // 2. GESTION UPLOAD AVATAR (Rectangle Rouge)
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAvatarUploading(true);
    try {
        const storageRef = ref(storage, `avatars/${currentUser.uid}_${Date.now()}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        // Mise à jour immédiate dans la DB
        await updateDoc(doc(db, "users", currentUser.uid), { avatar: downloadURL });
        
        // Mise à jour locale
        setFormData(prev => ({ ...prev, avatar: downloadURL }));
        alert("Photo de profil mise à jour !");
    } catch (error) {
        console.error("Erreur upload avatar:", error);
        alert("Erreur lors de l'envoi de la photo.");
    } finally {
        setAvatarUploading(false);
    }
  };

  // 3. MISE À JOUR DU PROFIL (Bouton Enregistrer)
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
        username: formData.username, // Sauvegarde du pseudo
        full_name: `${formData.firstName} ${formData.lastName}`, // Nom complet pour la recherche
        // Pour la recherche : on peut créer un champ de mots-clés si besoin plus tard
        keywords: [
            formData.username?.toLowerCase(), 
            formData.firstName?.toLowerCase(), 
            formData.lastName?.toLowerCase()
        ].filter(Boolean)
      });
      
      alert(t('success'));
      setIsEditing(false); // Quitter le mode édition
    } catch (error) {
      console.error("Erreur sauvegarde:", error);
      alert(t('error'));
    }
    setSaving(false);
  };

  if (loading) return <div className="text-white p-8">{t('loading')}</div>;

  const age = formData.birthDate 
    ? new Date().getFullYear() - new Date(formData.birthDate).getFullYear() 
    : '?';

  const progressToNext = ((stats.points % 500) / 500) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* --- HEADER --- */}
      <div className="text-center relative">
        
        {/* BOUTON GLOBAL MODIFIER (Active les zones jaunes) */}
        <div className="absolute top-0 right-0">
            <Button 
                onClick={() => setIsEditing(!isEditing)} 
                variant={isEditing ? "destructive" : "outline"}
                className={`gap-2 ${!isEditing ? "border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white" : ""}`}
            >
                {isEditing ? <><X size={16}/> Annuler</> : <><Edit2 size={16}/> Modifier Profil</>}
            </Button>
        </div>

        {/* AVATAR (Rectangle Rouge) */}
        <div className="relative w-32 h-32 mx-auto mb-4 group">
            <div className="w-full h-full rounded-full p-1 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] shadow-[0_0_30px_rgba(123,44,191,0.6)]">
                <Avatar className="w-full h-full border-4 border-[#0a0a0f]">
                    <AvatarImage src={formData.avatar} className="object-cover"/>
                    <AvatarFallback className="text-3xl font-black text-black bg-white">
                        {formData.firstName?.[0]}{formData.lastName?.[0]}
                    </AvatarFallback>
                </Avatar>
            </div>
            
            {/* Bouton Caméra (Visible au survol ou en mode édition) */}
            <div 
                className="absolute bottom-0 right-0 bg-[#00f5d4] text-black p-2 rounded-full cursor-pointer border-4 border-[#0a0a0f] hover:scale-110 transition shadow-lg"
                onClick={() => fileInputRef.current.click()}
            >
                {avatarUploading ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"/> : <Camera size={20} />}
            </div>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleAvatarChange} 
            />
        </div>
        
        <h1 className="text-4xl font-black text-white capitalize mb-1">
          {formData.firstName} <span className="text-[#00f5d4]">{formData.lastName}</span>
        </h1>

        {/* PSEUDO (Rectangle Bleu) */}
        <div className="h-8 flex justify-center items-center">
            {isEditing ? (
                <Input 
                    placeholder="Choisis un pseudo (ex: @TheBeast)" 
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-64 bg-black border-[#7b2cbf] text-center text-[#9d4edd] font-bold h-8"
                />
            ) : (
                formData.username && <p className="text-[#9d4edd] font-bold text-lg">@{formData.username}</p>
            )}
        </div>

        <p className="text-gray-500 text-sm mt-1">{formData.email}</p>
        
        {/* Badges */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <Badge className="bg-[#7b2cbf]/20 text-[#e0aaff] border-[#7b2cbf] px-4 py-1 text-sm flex gap-2">
            <Award size={16} /> Niv. {stats.level}
          </Badge>
          <Badge className="bg-[#fdcb6e]/20 text-[#fdcb6e] border-[#fdcb6e] px-4 py-1 text-sm flex gap-2">
            <Trophy size={16} /> {stats.points} {t('points')}
          </Badge>
        </div>

        {/* Barre XP */}
        <div className="mt-6 max-w-md mx-auto">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Niv. {stats.level}</span>
            <span>{stats.points % 500} / 500 XP</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] transition-all duration-500"
              style={{ width: `${progressToNext}%` }}
            />
          </div>
        </div>
      </div>

      {/* --- GRILLE DE STATS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={TrendingUp} value={stats.workouts} label="Séances" color="#00f5d4" />
        <StatCard icon={Trophy} value={stats.challenges} label={t('challenges')} color="#fdcb6e" />
        <StatCard icon={Target} value={stats.level} label="Niveau" color="#9d4edd" />
      </div>

      {/* --- FORMULAIRE PRINCIPAL --- */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLONNE GAUCHE : PHYSIQUE (Rectangle Jaune 1) */}
        <Card className={`kb-card lg:col-span-1 h-fit bg-[#1a1a20] border-gray-800 transition-all ${isEditing ? 'ring-2 ring-[#00f5d4]/50' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="text-[#9d4edd]" size={20} />
              {t('profile')} {isEditing && <span className="text-xs text-[#00f5d4] ml-auto uppercase animate-pulse">Édition</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div className="grid grid-cols-2 gap-2 mb-2">
                 <div>
                    <label className="text-xs text-gray-500 uppercase font-bold">{t('firstname')}</label>
                    <Input 
                        value={formData.firstName} 
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})} 
                        className="bg-black border-gray-800 text-white h-9"
                        disabled={!isEditing}
                    />
                 </div>
                 <div>
                    <label className="text-xs text-gray-500 uppercase font-bold">{t('lastname')}</label>
                    <Input 
                        value={formData.lastName} 
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})} 
                        className="bg-black border-gray-800 text-white h-9"
                        disabled={!isEditing}
                    />
                 </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold">{t('birthdate')}</label>
                    <div className="text-white font-bold text-lg border-b border-gray-800 py-1">{age} ans</div>
                </div>
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold">{t('sex')}</label>
                    <div className="text-white font-bold text-lg border-b border-gray-800 py-1 capitalize">{formData.sex}</div>
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">{t('height')} (cm)</label>
                <div className="relative">
                    <Ruler className={`absolute left-3 top-1/2 -translate-y-1/2 ${isEditing ? "text-[#00f5d4]" : "text-gray-500"}`} size={16} />
                    <Input 
                        value={formData.height} 
                        onChange={(e) => setFormData({...formData, height: e.target.value})}
                        className="bg-black border-gray-800 pl-10 text-white focus:border-[#00f5d4]" 
                        disabled={!isEditing}
                    />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">{t('weight')} ({formData.weightUnit})</label>
                <div className="relative">
                    <Weight className={`absolute left-3 top-1/2 -translate-y-1/2 ${isEditing ? "text-[#00f5d4]" : "text-gray-500"}`} size={16} />
                    <Input 
                        value={formData.weight} 
                        onChange={(e) => setFormData({...formData, weight: e.target.value})}
                        className="bg-black border-gray-800 pl-10 text-white focus:border-[#00f5d4]" 
                        disabled={!isEditing}
                    />
                </div>
            </div>
            
            <div className="bg-[#1a1a20] p-4 rounded-xl border border-dashed border-gray-700 mt-4">
                <p className="text-xs text-gray-400 mb-1">{t('target_weight')} : {formData.targetWeight} {formData.weightUnit}</p>
                {formData.targetDate && (
                    <p className="text-xs text-gray-400">Date : {new Date(formData.targetDate).toLocaleDateString()}</p>
                )}
            </div>
          </CardContent>
        </Card>

        {/* COLONNE DROITE : SANTÉ & INFO (Rectangle Jaune 2) */}
        <Card className={`kb-card lg:col-span-2 bg-[#1a1a20] border-gray-800 transition-all ${isEditing ? 'ring-2 ring-[#00f5d4]/50' : ''}`}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                    <Activity className="text-[#00f5d4]" size={20} />
                    {t('client_goals')} & Santé
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold mb-2 block">{t('client_goals')}</label>
                    <div className="flex flex-wrap gap-2">
                        {formData.goals.length > 0 ? (
                            formData.goals.map((g, i) => (
                                <Badge key={i} className="bg-[#7b2cbf]/20 border-[#7b2cbf] text-gray-200">
                                    {g}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-gray-600 text-sm italic">Aucun objectif défini</span>
                        )}
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold mb-2 block flex items-center gap-2">
                        <AlertCircle size={14} className="text-red-400" /> {t('injuries_title')}
                    </label>
                    <Textarea
                        placeholder={t('injuries_placeholder')}
                        value={formData.injuries}
                        onChange={(e) => setFormData({...formData, injuries: e.target.value})}
                        className="bg-black border-gray-800 text-white min-h-[80px] focus:border-red-400/50"
                        disabled={!isEditing}
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold mb-2 block">{t('allergies_title')}</label>
                    <Textarea
                        placeholder={t('allergies_placeholder')}
                        value={formData.allergies}
                        onChange={(e) => setFormData({...formData, allergies: e.target.value})}
                        className="bg-black border-gray-800 text-white min-h-[80px] focus:border-[#00f5d4]"
                        disabled={!isEditing}
                    />
                </div>

                {isEditing && (
                    <div className="pt-4 border-t border-gray-800 flex justify-end animate-in slide-in-from-bottom-2">
                        <Button 
                            type="submit" 
                            disabled={saving}
                            className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-bold px-8 shadow-[0_0_15px_rgba(0,245,212,0.3)]"
                        >
                            {saving ? t('loading') : <><Save size={18} className="mr-2"/> {t('save')}</>}
                        </Button>
                    </div>
                )}

            </CardContent>
        </Card>

      </form>
    </div>
  );
}

// Composant Carte Stats
function StatCard({ icon: Icon, value, label, color }) {
    return (
        <Card className="kb-card border-0 bg-[#1a1a20]">
            <CardContent className="p-6 text-center">
                <Icon className="w-8 h-8 mx-auto mb-2" style={{ color }} />
                <p className="text-3xl font-black text-white">{value}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
            </CardContent>
        </Card>
    );
}