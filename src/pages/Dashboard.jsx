import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/context/AuthContext'; // <--- AJOUT pour récupérer l'ID
import { db } from '@/lib/firebase'; // <--- AJOUT pour Firestore
import { doc, getDoc } from 'firebase/firestore'; // <--- AJOUT pour lire le profil
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Flame, Trophy, TrendingUp, TrendingDown, Calendar, ArrowRight, Plus, Utensils, Zap, Target, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/lib/utils';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  
  // --- NOUVEAUX ÉTATS POUR LE PROFIL COMPLET ---
  const { currentUser } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const today = new Date().getDay() - 1; // 0 = Lundi pour l'index

  // 1. Chargement existant (base44)
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUserData = await base44.auth.me();
        setUser(currentUserData);
      } catch (error) { console.error("Erreur:", error); }
    };
    loadUser();
  }, []);

  // 2. NOUVEAU CHARGEMENT (Firestore pour Poids/Objectifs)
  useEffect(() => {
    const fetchProfile = async () => {
      if (currentUser) {
        try {
            const docRef = doc(db, "users", currentUser.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
            setUserProfile(docSnap.data());
            }
        } catch (e) { console.error("Erreur profil dashboard", e)}
      }
    };
    fetchProfile();
  }, [currentUser]);

  const getFirstName = () => user?.full_name?.split(' ')[0] || 'Athlète';

  // --- CALCULS LOGIQUES POUR LE WIDGET ---
  const currentWeight = parseFloat(userProfile?.weight || 0);
  const targetWeight = parseFloat(userProfile?.targetWeight || 0);
  const unit = userProfile?.weightUnit || 'lbs';
  const weightDiff = targetWeight - currentWeight;
  const isWeightLoss = weightDiff < 0;
  
  let daysLeft = null;
  if (userProfile?.targetDate) {
    const todayDate = new Date();
    const target = new Date(userProfile.targetDate);
    const diffTime = target - todayDate;
    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  // ----------------------------------------

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER EXISTANT */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/20 to-transparent p-6 rounded-2xl border border-[#7b2cbf]/30">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-white italic tracking-tight">
            PRÊT À <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">DOMINER</span> ?
          </h1>
          <p className="text-gray-300 mt-2 text-lg">Bon retour, <span className="font-bold text-[#00f5d4]">{getFirstName()}</span>.</p>
        </div>
        <Link to={createPageUrl('Session')}>
          <Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-extrabold py-6 px-8 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all hover:scale-105">
            <Zap className="mr-2 h-5 w-5 fill-black" />
            LANCER LA SÉANCE
          </Button>
        </Link>
      </div>

      {/* --- NOUVEAU WIDGET OBJECTIF (AJOUTÉ ICI) --- */}
      {userProfile?.targetWeight && (
        <div className="kb-card p-6 relative overflow-hidden group border-l-4 border-l-[#00f5d4]">
          {/* Background Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#7b2cbf]/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-[#7b2cbf]/30 transition-all duration-500" />
          
          <div className="flex flex-col md:flex-row justify-between gap-6 relative z-10">
            {/* Colonne Poids */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Target className="text-[#00f5d4]" size={20} />
                <h3 className="text-lg font-bold text-gray-200">Objectif Principal</h3>
              </div>
              
              <div className="flex items-baseline gap-4 mt-2">
                <div>
                   <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Actuel</span>
                   <p className="text-3xl font-bold text-white">{currentWeight}<span className="text-sm text-[#7b2cbf] ml-1">{unit}</span></p>
                </div>
                
                {/* Flèche visuelle */}
                <div className="flex flex-col items-center px-2">
                    <span className={`text-xs font-bold ${isWeightLoss ? 'text-green-400' : 'text-yellow-400'} mb-1`}>
                        {isWeightLoss ? '-' : '+'}{Math.abs(weightDiff).toFixed(1)}
                    </span>
                    <div className="w-12 h-[2px] bg-gray-700 relative">
                        <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${isWeightLoss ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                    </div>
                </div>
                
                <div>
                   <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Cible</span>
                   <p className="text-3xl font-bold text-[#00f5d4]">{targetWeight}<span className="text-sm text-[#7b2cbf]/70 ml-1">{unit}</span></p>
                </div>
              </div>
            </div>

            {/* Colonne Date / Temps */}
            <div className="flex-1 md:border-l md:border-gray-700 md:pl-6 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2">
                 <Calendar className="text-[#7b2cbf]" size={20} />
                 <h3 className="text-lg font-bold text-gray-200">Date Limite</h3>
              </div>

              {userProfile?.targetDate ? (
                <div>
                   {daysLeft > 0 ? (
                     <div className="flex items-end gap-2">
                        <p className="text-4xl font-bold text-white tabular-nums">{daysLeft}</p>
                        <div className="mb-1">
                            <p className="text-gray-400 font-bold leading-none">Jours</p>
                            <p className="text-xs text-gray-500">restants</p>
                        </div>
                     </div>
                   ) : (
                     <p className="text-xl font-bold text-[#00f5d4] animate-pulse">Date atteinte ! 🎉</p>
                   )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-500">
                   <Clock size={24} />
                   <p className="text-sm">Aucune date fixée.<br/>Focus sur la constance.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* --- FIN DU WIDGET --- */}

      {/* STATS RAPIDES EXISTANTES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Dumbbell} title="Séances" value="12" color="#00f5d4" />
        <StatCard icon={Flame} title="Kcal" value="14,500" color="#fdcb6e" />
        <StatCard icon={Trophy} title="Défis" value="2" color="#9d4edd" />
        <StatCard icon={TrendingUp} title="Points" value="3,450" color="#7b2cbf" />
      </div>

      {/* CALENDRIER EXISTANT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="text-[#9d4edd]" /> Ma Semaine
          </h2>
          <Button variant="ghost" className="text-xs text-[#00f5d4]">Gérer mon planning</Button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {weekDays.map((day, index) => {
            const isToday = index === (today === -1 ? 6 : today);
            return (
              <div key={day} className={`kb-card flex flex-col p-3 min-h-[140px] relative group ${isToday ? 'border-[#00f5d4] bg-[#00f5d4]/10' : ''}`}>
                <span className={`text-sm font-bold mb-2 ${isToday ? 'text-[#00f5d4]' : 'text-gray-400'}`}>{day}</span>
                
                {index === 1 && <div className="text-xs bg-[#7b2cbf]/40 text-[#e0aaff] p-1 rounded mb-1 border border-[#7b2cbf]/50 truncate">Pectoraux</div>}
                {index === 3 && <div className="text-xs bg-[#7b2cbf]/40 text-[#e0aaff] p-1 rounded mb-1 border border-[#7b2cbf]/50 truncate">Jambes</div>}
                
                <div className="mt-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-center pt-2">
                  <Link to={createPageUrl('Exercises')} title="Ajouter entrainement">
                    <div className="w-6 h-6 rounded bg-[#7b2cbf] flex items-center justify-center hover:bg-[#9d4edd] cursor-pointer">
                      <Plus className="w-3 h-3 text-white" />
                    </div>
                  </Link>
                  <Link to={createPageUrl('Meals')} title="Ajouter repas">
                    <div className="w-6 h-6 rounded bg-[#00f5d4] flex items-center justify-center hover:bg-[#adfff2] cursor-pointer">
                      <Utensils className="w-3 h-3 text-black" />
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION PRINCIPALE DIVISÉE EXISTANTE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Prochaine Séance */}
        <Card className="kb-card lg:col-span-2 border-l-4 border-l-[#7b2cbf] overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center text-xl text-white">
              <Zap className="mr-3 text-[#00f5d4]" />
              Programme en cours : "Spartan Shred"
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm text-gray-300 mb-4">
              <span>Semaine 3 / 8</span>
              <span className="text-[#00f5d4]">Haute Intensité</span>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progression globale</span>
                <span className="font-bold text-white">45%</span>
              </div>
              <Progress value={45} className="h-2 bg-gray-800 [&>div]:bg-gradient-to-r [&>div]:from-[#7b2cbf] [&>div]:to-[#00f5d4]" />
            </div>
            
            <Link to={createPageUrl('Exercises')}>
              <Button variant="outline" className="w-full border-[#7b2cbf] text-white hover:bg-[#7b2cbf] hover:text-white font-bold py-5 transition-all">
                Voir le détail du programme
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Activité Récente */}
        <Card className="kb-card border-0">
          <CardHeader>
            <CardTitle className="text-xl text-white">Activité Récente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ActivityItem icon={Dumbbell} title="Haut du corps" date="Hier" color="#00f5d4" />
              <ActivityItem icon={Trophy} title="Défi 'Abdos' rejoint" date="Il y a 2 jours" color="#fdcb6e" />
              <ActivityItem icon={Flame} title="Record Battu !" date="Il y a 3 jours" color="#9d4edd" />
            </div>
            
            <Link to={createPageUrl('Performance')}>
              <Button variant="ghost" className="w-full mt-4 text-gray-400 hover:text-[#00f5d4] hover:bg-white/5 group">
                  Voir tout l'historique <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Composants visuels existants
function StatCard({ icon: Icon, title, value, color }) {
  return (
    <Card className="kb-card border-0 relative group overflow-hidden">
      <div className={`absolute -right-4 -top-4 opacity-10 group-hover:opacity-30 transition-all duration-500 scale-150 rotate-12`} style={{ color }}>
        <Icon className="w-24 h-24" />
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black text-white" style={{ textShadow: `0 0 10px ${color}50` }}>{value}</div>
        <div className="w-8 h-1 mt-2 rounded-full" style={{ backgroundColor: color }}></div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ icon: Icon, title, date, color }) {
    return (
        <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/5 transition border border-transparent hover:border-gray-800">
            <div className={`p-2 rounded-lg bg-[#0a0a0f] border border-gray-800 shrink-0`}>
                <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{title}</p>
                <p className="text-xs text-gray-500">{date}</p>
            </div>
        </div>
    )
}