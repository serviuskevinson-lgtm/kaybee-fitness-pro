import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next'; // <--- 1. IMPORT
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Award, Trophy, Target, TrendingUp, User, 
  Ruler, Weight, Activity, AlertCircle, Save 
} from 'lucide-react';

export default function Profile() {
  const { currentUser } = useAuth();
  const { t } = useTranslation(); // <--- 2. HOOK
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // État local pour le formulaire
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
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
    targetDate: ''
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
              firstName: data.first_name || data.firstName || '', // Supporte les deux formats
              lastName: data.last_name || data.lastName || '',
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
              targetDate: data.target_date || data.targetDate || ''
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

  // 2. MISE À JOUR DU PROFIL
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
        full_name: `${formData.firstName} ${formData.lastName}`
      });
      
      alert(t('success')); // "Succès !"
    } catch (error) {
      console.error("Erreur sauvegarde:", error);
      alert(t('error'));
    }
    setSaving(false);
  };

  if (loading) return <div className="text-white p-8">{t('loading')}</div>;

  // Calcul âge
  const age = formData.birthDate 
    ? new Date().getFullYear() - new Date(formData.birthDate).getFullYear() 
    : '?';

  // Calcul progression niveau
  const progressToNext = ((stats.points % 500) / 500) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* --- HEADER --- */}
      <div className="text-center relative">
        {/* Avatar avec initiales */}
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] mx-auto mb-4 flex items-center justify-center text-4xl font-black text-black shadow-[0_0_30px_rgba(123,44,191,0.6)] border-4 border-[#0a0a0f]">
          {formData.firstName?.[0]}{formData.lastName?.[0]}
        </div>
        
        <h1 className="text-4xl font-black text-white capitalize mb-2">
          {formData.firstName} <span className="text-[#00f5d4]">{formData.lastName}</span>
        </h1>
        <p className="text-gray-400">{formData.email}</p>
        
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
        {/* Note: J'utilise des textes fixes ici car on n'a pas créé de clés spécifiques pour "Séances Totales" dans le dictionnaire précédent, mais on peut ajouter t('workouts') plus tard */}
        <StatCard icon={TrendingUp} value={stats.workouts} label="Séances" color="#00f5d4" />
        <StatCard icon={Trophy} value={stats.challenges} label={t('challenges')} color="#fdcb6e" />
        <StatCard icon={Target} value={stats.level} label="Niveau" color="#9d4edd" />
      </div>

      {/* --- FORMULAIRE PRINCIPAL --- */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLONNE GAUCHE : PHYSIQUE */}
        <Card className="kb-card lg:col-span-1 h-fit bg-[#1a1a20] border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <User className="text-[#9d4edd]" size={20} />
              {t('profile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {/* Prénom / Nom (Editable) */}
            <div className="grid grid-cols-2 gap-2 mb-2">
                 <div>
                    <label className="text-xs text-gray-500 uppercase font-bold">{t('firstname')}</label>
                    <Input value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="bg-black border-gray-800 text-white h-8 text-xs"/>
                 </div>
                 <div>
                    <label className="text-xs text-gray-500 uppercase font-bold">{t('lastname')}</label>
                    <Input value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="bg-black border-gray-800 text-white h-8 text-xs"/>
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
                    <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <Input 
                        value={formData.height} 
                        onChange={(e) => setFormData({...formData, height: e.target.value})}
                        className="bg-black border-gray-800 pl-10 text-white focus:border-[#00f5d4]" 
                    />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">{t('weight')} ({formData.weightUnit})</label>
                <div className="relative">
                    <Weight className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <Input 
                        value={formData.weight} 
                        onChange={(e) => setFormData({...formData, weight: e.target.value})}
                        className="bg-black border-gray-800 pl-10 text-white focus:border-[#00f5d4]" 
                    />
                </div>
            </div>
            
            {/* Rappel Objectif */}
            <div className="bg-[#1a1a20] p-4 rounded-xl border border-dashed border-gray-700 mt-4">
                <p className="text-xs text-gray-400 mb-1">{t('target_weight')} : {formData.targetWeight} {formData.weightUnit}</p>
                {formData.targetDate && (
                    <p className="text-xs text-gray-400">Date : {new Date(formData.targetDate).toLocaleDateString()}</p>
                )}
            </div>
          </CardContent>
        </Card>

        {/* COLONNE DROITE : SANTÉ & INFO */}
        <Card className="kb-card lg:col-span-2 bg-[#1a1a20] border-gray-800">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                    <Activity className="text-[#00f5d4]" size={20} />
                    {t('client_goals')} & Santé
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                
                {/* Objectifs */}
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

                {/* Blessures */}
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold mb-2 block flex items-center gap-2">
                        <AlertCircle size={14} className="text-red-400" /> {t('injuries_title')}
                    </label>
                    <Textarea
                        placeholder={t('injuries_placeholder')}
                        value={formData.injuries}
                        onChange={(e) => setFormData({...formData, injuries: e.target.value})}
                        className="bg-black border-gray-800 text-white min-h-[80px] focus:border-red-400/50"
                    />
                </div>

                {/* Allergies */}
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold mb-2 block">{t('allergies_title')}</label>
                    <Textarea
                        placeholder={t('allergies_placeholder')}
                        value={formData.allergies}
                        onChange={(e) => setFormData({...formData, allergies: e.target.value})}
                        className="bg-black border-gray-800 text-white min-h-[80px] focus:border-[#00f5d4]"
                    />
                </div>

                <div className="pt-4 border-t border-gray-800 flex justify-end">
                    <Button 
                        type="submit" 
                        disabled={saving}
                        className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-bold px-8"
                    >
                        {saving ? t('loading') : <><Save size={18} className="mr-2"/> {t('save')}</>}
                    </Button>
                </div>

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