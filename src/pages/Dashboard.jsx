import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext'; // <--- LE CERVEAU DU MODE COACH
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Dumbbell, Flame, Trophy, TrendingUp, Calendar, 
  ArrowRight, Plus, Utensils, Zap, Target, Clock, Check, ChefHat, Activity, Users, Edit3
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/lib/utils';
import { Badge } from "@/components/ui/badge";
import Scheduler from '@/components/coach/Scheduler'; // <--- L'AGENDA DU COACH

export default function Dashboard() {
  const [user, setUser] = useState(null); // Info Auth de base
  const { currentUser } = useAuth();
  
  // --- NOUVEAU : GESTION DU MODE COACH ---
  // on récupère l'ID cible (soit moi, soit mon client)
  const { selectedClient, isCoachView, targetUserId } = useClient();
  const [userProfile, setUserProfile] = useState(null);
  
  // État pour savoir si JE SUIS un coach (pour afficher l'agenda)
  const [isCoach, setIsCoach] = useState(false);

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date().getDay()];

  // 1. Vérification du Rôle (Suis-je coach ?)
  useEffect(() => {
    const checkRole = async () => {
        if(!currentUser) return;
        try {
            const myDoc = await getDoc(doc(db, "users", currentUser.uid));
            if(myDoc.exists() && myDoc.data().role === 'coach') {
                setIsCoach(true);
            }
        } catch(e) { console.error("Erreur check role", e); }
    };
    checkRole();
  }, [currentUser]);

  // 2. Chargement des données Base44 (Auth)
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUserData = await base44.auth.me();
        setUser(currentUserData);
      } catch (error) { console.error("Erreur base44:", error); }
    };
    loadUser();
  }, []);

  // 3. Chargement Firestore (LE COEUR DU SYSTÈME)
  // Cette fonction se relance automatiquement si on change de client (targetUserId change)
  useEffect(() => {
    const fetchProfile = async () => {
      if (targetUserId) {
        try {
            const docRef = doc(db, "users", targetUserId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              setUserProfile(docSnap.data());
            } else {
              // Si le profil n'existe pas encore (nouveau client)
              setUserProfile(null);
            }
        } catch (e) { console.error("Erreur chargement dashboard", e)}
      }
    };
    fetchProfile();
  }, [targetUserId]); // <--- IMPORTANT : Déclencheur du changement

  // --- FONCTION INTELLIGENTE POUR LE PRÉNOM ---
  const getFirstName = () => {
    // Cas 1 : On regarde un client
    if (isCoachView && userProfile) {
        if (userProfile.firstName) return userProfile.firstName;
        return userProfile.full_name?.split(' ')[0] || "Client";
    }

    // Cas 2 : C'est moi
    if (userProfile?.firstName) {
        const first = userProfile.firstName;
        return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }

    const fullName = userProfile?.full_name || userProfile?.name || user?.full_name || '';
    if (fullName) {
        const firstName = fullName.split(' ')[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    }
    
    return "Athlète";
  };

  // --- LOGIQUE NUTRITION (Compatible Coach) ---
  const activePlan = userProfile?.nutritionalPlans?.find(p => p.scheduledDays.includes(todayName));

  const handleToggleMeal = async (planId, mealType) => {
    // Si je suis coach, je peux cocher les repas de mon client (optionnel, mais pratique)
    if (!targetUserId || !userProfile) return;
    
    try {
      const updatedPlans = userProfile.nutritionalPlans.map(p => {
        if (p.id === planId) {
          return {
            ...p,
            consumed: {
              ...p.consumed,
              [mealType]: !p.consumed?.[mealType]
            }
          };
        }
        return p;
      });

      // On écrit dans la DB du CIBLE (Moi ou Client)
      const userRef = doc(db, "users", targetUserId);
      await updateDoc(userRef, { nutritionalPlans: updatedPlans });
      
      // Mise à jour locale
      setUserProfile(prev => ({ ...prev, nutritionalPlans: updatedPlans }));
    } catch (e) {
      console.error("Erreur toggle meal", e);
    }
  };

  // --- CALCULS & STATS ---
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

  // Stats réelles depuis le profil chargé
  const totalPoints = userProfile?.points || 0;
  const totalWorkouts = userProfile?.history?.length || 0; 
  const dailyCalories = activePlan?.totalMacros?.cal || 0;
  const completedChallenges = userProfile?.challengesCompleted?.length || 0;

  // --- LOGIQUE CALENDRIER ---
  const getWorkoutForDay = (dayIndex) => {
    const dayNamesFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const dayName = dayNamesFull[dayIndex];
    return userProfile?.workouts?.find(w => w.scheduledDays?.includes(dayName));
  };

  // Historique récent
  const recentActivity = userProfile?.history?.slice(-3).reverse() || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* ZONE 1 : BANNIÈRE MODE COACH 
          S'affiche uniquement si un coach regarde le profil d'un client
      */}
      {isCoachView && (
        <div className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white p-4 rounded-xl flex flex-col md:flex-row items-center justify-between mb-4 shadow-[0_0_20px_rgba(123,44,191,0.4)] border border-white/10">
             <div className="flex items-center gap-4 mb-3 md:mb-0">
                <div className="bg-white/20 p-2 rounded-full">
                    <Users className="text-white h-6 w-6"/>
                </div>
                <div>
                    <p className="text-xs uppercase font-bold text-white/80 tracking-widest">Mode Supervision</p>
                    <p className="font-black text-xl">Client : {userProfile?.full_name || "Chargement..."}</p>
                </div>
             </div>
             <div className="flex gap-2">
                 <Link to="/messages">
                    <Button variant="secondary" className="bg-white text-[#7b2cbf] font-bold text-xs h-9 hover:bg-gray-100">
                        Envoyer un message
                    </Button>
                 </Link>
                 <Link to="/coach/payments">
                    <Button variant="outline" className="border-white text-white hover:bg-white/20 font-bold text-xs h-9">
                        Voir Paiements
                    </Button>
                 </Link>
             </div>
        </div>
      )}

      {/* ZONE 2 : HEADER PRINCIPAL 
          S'adapte selon qui regarde quoi
      */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/20 to-transparent p-6 rounded-2xl border border-[#7b2cbf]/30 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-black text-white italic tracking-tight">
            {isCoachView ? "SUIVI" : "PRÊT À"} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">{isCoachView ? "CLIENT" : "DOMINER"}</span> ?
          </h1>
          <p className="text-gray-300 mt-2 text-lg">
             {isCoachView 
                ? <span>Analyse des performances de <span className="font-bold text-[#00f5d4]">{getFirstName()}</span>.</span>
                : <span>Bon retour, <span className="font-bold text-[#00f5d4]">{getFirstName()}</span>.</span>
             }
          </p>
        </div>
        
        {/* Le bouton "Lancer Séance" ne s'affiche que si c'est MON profil */}
        {!isCoachView && (
            <Link to={createPageUrl('Session')}>
            <Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-extrabold py-6 px-8 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all hover:scale-105 border-none">
                <Zap className="mr-2 h-5 w-5 fill-black" />
                LANCER LA SÉANCE
            </Button>
            </Link>
        )}
        
        {/* Déco fond */}
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/10 to-transparent pointer-events-none"></div>
      </div>

      {/* ZONE 3 : GRILLE PRINCIPALE (Métriques) 
      */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLONNE GAUCHE (Objectifs + Nutrition) */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* WIDGET POIDS */}
            {userProfile?.targetWeight ? (
              <div className="kb-card p-6 relative overflow-hidden group border-l-4 border-l-[#00f5d4] h-full flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#7b2cbf]/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-[#7b2cbf]/30 transition-all duration-500" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Target className="text-[#00f5d4]" size={20} />
                        <h3 className="text-lg font-bold text-gray-200">Poids</h3>
                    </div>
                    {/* Indicateur de progression visuel */}
                    <div className={`text-xs font-black px-2 py-1 rounded ${isWeightLoss ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {isWeightLoss ? '-' : '+'}{Math.abs(weightDiff).toFixed(1)} {unit}
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <div>
                      <p className="text-4xl font-black text-white">{currentWeight}<span className="text-lg text-[#7b2cbf] ml-1">{unit}</span></p>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Actuel</span>
                    </div>
                    
                    {/* Barre de progression visuelle entre actuel et cible */}
                    <div className="flex-1 mx-4 pb-2 hidden sm:block">
                        <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] w-1/2"></div>
                        </div>
                    </div>

                    <div className="text-right">
                      <p className="text-4xl font-black text-[#00f5d4]">{targetWeight}<span className="text-lg text-[#7b2cbf]/70 ml-1">{unit}</span></p>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Cible</span>
                    </div>
                  </div>
                  
                  {daysLeft && (
                      <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-2 text-xs text-gray-400">
                          <Clock size={12}/> Objectif dans {daysLeft} jours
                      </div>
                  )}
                </div>
              </div>
            ) : (
               // État vide si pas d'objectif
               <div className="kb-card p-6 flex flex-col items-center justify-center text-center h-full border-dashed border-gray-700 bg-[#1a1a20]/50">
                  <Target className="text-gray-600 w-12 h-12 mb-4 opacity-50" />
                  <p className="text-gray-400 text-sm mb-4 font-bold">Aucun objectif de poids.</p>
                  <Link to="/profile">
                    <Button variant="outline" className="bg-[#7b2cbf]/20 text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white border-[#7b2cbf] border">Définir maintenant</Button>
                  </Link>
               </div>
            )}

            {/* WIDGET NUTRITION */}
            <div className="bg-[#1a1a20] p-6 rounded-3xl border-l-4 border-l-[#7b2cbf] border-y border-r border-gray-800 shadow-xl h-full flex flex-col">
              <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <ChefHat className="text-[#7b2cbf]" size={20} />
                    <h3 className="text-lg font-bold text-gray-200">Nutrition</h3>
                  </div>
                  {/* Bouton Coach : Modifier la diète */}
                  {isCoachView && (
                      <Link to="/meals">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-[#7b2cbf]">
                            <Edit3 size={14}/>
                        </Button>
                      </Link>
                  )}
              </div>
              
              <div className="flex-1 flex flex-col justify-center items-center py-2">
                {activePlan ? (
                    <>
                        <div className="relative">
                            <svg className="w-32 h-32 transform -rotate-90">
                                <circle cx="64" cy="64" r="60" stroke="#1f2937" strokeWidth="8" fill="transparent" />
                                <circle cx="64" cy="64" r="60" stroke="#7b2cbf" strokeWidth="8" fill="transparent" strokeDasharray={377} strokeDashoffset={377 - (377 * 0.7)} className="transition-all duration-1000 ease-out" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-black text-white">{dailyCalories}</span>
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Kcal</span>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 w-full text-center">
                            <div className="bg-black/30 rounded p-1"><p className="text-xs text-white font-bold">{activePlan.totalMacros?.pro || 0}g</p><p className="text-[9px] text-gray-500">Prot</p></div>
                            <div className="bg-black/30 rounded p-1"><p className="text-xs text-white font-bold">{activePlan.totalMacros?.carb || 0}g</p><p className="text-[9px] text-gray-500">Gluc</p></div>
                            <div className="bg-black/30 rounded p-1"><p className="text-xs text-white font-bold">{activePlan.totalMacros?.fat || 0}g</p><p className="text-[9px] text-gray-500">Lip</p></div>
                        </div>
                    </>
                ) : (
                    <div className="text-center">
                        <p className="text-gray-500 italic text-sm mb-4">Pas de plan aujourd'hui</p>
                        <Link to="/meals">
                            <Button variant="outline" size="sm" className="bg-[#7b2cbf] text-white hover:bg-[#9d4edd] border-none font-bold">
                                {isCoachView ? "Assigner une diète" : "Créer un plan"}
                            </Button>
                        </Link>
                    </div>
                )}
              </div>
            </div>
        </div>

        {/* COLONNE DROITE : LOGIQUE HYBRIDE AGENDA / CALENDRIER
            Si je suis Coach sur mon profil -> Agenda Mensuel (Scheduler)
            Si je suis Client (ou Coach voyant Client) -> Semaine Type d'Entraînement
        */}
        <div className="lg:col-span-1 h-full">
            {isCoach && !isCoachView ? (
                // MODE AGENDA COACH
                <Scheduler />
            ) : (
                // MODE SEMAINE ENTRAINEMENT (Standard)
                <div className="bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 h-full shadow-xl flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Calendar className="text-[#00f5d4]"/> Semaine
                        </h3>
                        {/* Indicateur jour actuel */}
                        <Badge variant="outline" className="border-[#00f5d4] text-[#00f5d4] bg-[#00f5d4]/10">
                            {todayName}
                        </Badge>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                        {weekDays.map((d, index) => {
                            const isToday = index === todayIndex;
                            const workout = getWorkoutForDay(index);
                            
                            return (
                                <div key={d} className={`flex items-center p-3 rounded-xl border transition-all ${isToday ? 'bg-[#7b2cbf]/10 border-[#7b2cbf] shadow-[0_0_10px_rgba(123,44,191,0.1)]' : 'bg-black/20 border-gray-800'}`}>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black mr-3 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}>
                                        {d.substring(0, 1)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold truncate ${isToday ? 'text-white' : 'text-gray-400'}`}>
                                            {workout ? workout.name : "Repos"}
                                        </p>
                                        {workout && <p className="text-[10px] text-gray-500">{workout.exercises?.length || 0} exercices</p>}
                                    </div>
                                    {workout && (
                                        <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-[#00f5d4] animate-pulse' : 'bg-gray-600'}`}></div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {isCoachView && (
                         <div className="mt-4 pt-4 border-t border-gray-800">
                             <Link to="/exercises">
                                <Button className="w-full bg-[#00f5d4] text-black font-bold hover:bg-[#00f5d4]/80">
                                    <Plus className="mr-2 h-4 w-4"/> Planifier Séance
                                </Button>
                             </Link>
                         </div>
                    )}
                </div>
            )}
        </div>

      </div>
      
      {/* ZONE 4 : STATS RAPIDES (Connectées au profil ciblé) 
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Dumbbell} title="Séances" value={totalWorkouts} color="#00f5d4" />
        <StatCard icon={Flame} title="Kcal Jour" value={dailyCalories} color="#fdcb6e" />
        <StatCard icon={Trophy} title="Défis" value={completedChallenges} color="#9d4edd" />
        <StatCard icon={TrendingUp} title="Points" value={totalPoints} color="#7b2cbf" />
      </div>

      {/* ZONE 5 : PROGRAMME ACTIF & HISTORIQUE 
      */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Carte Programme Actif */}
        <Card className="kb-card lg:col-span-2 border-l-4 border-l-[#7b2cbf]">
          <CardHeader>
            <CardTitle className="flex items-center text-xl text-white">
              <Zap className="mr-3 text-[#00f5d4]" />
              {userProfile?.activeProgram?.name || "Aucun Programme Actif"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userProfile?.activeProgram ? (
              <>
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                   <span>Progression Globale</span>
                   <span className="text-[#00f5d4] font-bold">{userProfile.activeProgram.progress || 0}%</span>
                </div>
                <Progress value={userProfile.activeProgram.progress || 0} className="h-2 bg-gray-800 mb-6 [&>div]:bg-gradient-to-r [&>div]:from-[#7b2cbf] [&>div]:to-[#00f5d4]" />
                
                <div className="flex gap-4">
                    <div className="text-center px-4 border-r border-gray-700">
                        <p className="text-2xl font-bold text-white">{userProfile.activeProgram.weeksCompleted || 0}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Semaines</p>
                    </div>
                    <div className="text-center px-4">
                        <p className="text-2xl font-bold text-white">{userProfile.activeProgram.totalWorkouts || 0}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Séances</p>
                    </div>
                </div>
              </>
            ) : (
              <div className="py-4">
                  <p className="text-sm text-gray-500 mb-4">Aucun programme n'est assigné pour le moment.</p>
                  {isCoachView ? (
                      <Link to="/exercises">
                        <Button variant="outline" className="border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white">Assigner un programme</Button>
                      </Link>
                  ) : (
                      <Link to="/community">
                        <Button variant="outline" className="border-[#00f5d4] text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black">Trouver un programme</Button>
                      </Link>
                  )}
              </div>
            )}
            
            {userProfile?.activeProgram && (
                <div className="mt-6">
                    <Link to="/exercises">
                    <Button className="w-full bg-[#7b2cbf] text-white hover:bg-[#9d4edd] border-none font-bold">
                        {isCoachView ? "Gérer le programme" : "Continuer le programme"}
                    </Button>
                    </Link>
                </div>
            )}
          </CardContent>
        </Card>

        {/* Carte Historique */}
        <Card className="kb-card border-0">
          <CardHeader><CardTitle className="text-xl text-white">Activité Récente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, idx) => (
                <ActivityItem 
                  key={idx}
                  icon={activity.type === 'workout' ? Dumbbell : Trophy} 
                  title={activity.name} 
                  date={new Date(activity.date).toLocaleDateString()} 
                  color={activity.type === 'workout' ? "#00f5d4" : "#fdcb6e"} 
                />
              ))
            ) : (
              <div className="text-center py-12 flex flex-col items-center">
                 <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                    <Activity className="text-gray-500"/>
                 </div>
                 <p className="text-gray-500 text-sm font-bold">Aucune activité récente.</p>
                 <p className="text-gray-600 text-xs mt-1">L'historique apparaîtra ici une fois la première séance terminée.</p>
              </div>
            )}
            
            {recentActivity.length > 0 && (
                <Link to="/performance">
                    <Button variant="ghost" className="w-full text-gray-400 hover:text-[#00f5d4] hover:bg-transparent mt-2">
                        Voir tout l'historique <ArrowRight size={14} className="ml-1"/>
                    </Button>
                </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// COMPOSANTS INTERNES DE STYLE
function StatCard({ icon: Icon, title, value, color }) {
  return (
    <Card className="kb-card border-0 relative group overflow-hidden hover:scale-[1.02] transition-transform duration-300">
      <div className="absolute -right-4 -top-4 opacity-10 scale-150 rotate-12 transition-transform group-hover:rotate-45" style={{ color }}>
        <Icon className="w-24 h-24" />
      </div>
      <CardHeader className="pb-2 relative z-10">
        <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-3xl font-black text-white">{value}</div>
        <div className="w-8 h-1 mt-2 rounded-full transition-all group-hover:w-16" style={{ backgroundColor: color }}></div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ icon: Icon, title, date, color }) {
  return (
    <div className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-gray-800 transition-all cursor-default group">
      <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800 group-hover:border-[#7b2cbf]/50 transition-colors">
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate group-hover:text-[#00f5d4] transition-colors">{title}</p>
        <p className="text-xs text-gray-500">{date}</p>
      </div>
    </div>
  );
}