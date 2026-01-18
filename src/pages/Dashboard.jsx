import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db } from '@/lib/firebase';
import { 
  doc, getDoc, collection, addDoc, query, where, getDocs, orderBy, deleteDoc 
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { 
  Dumbbell, Flame, Trophy, TrendingUp, Calendar, 
  ArrowRight, Plus, Zap, Target, Clock, Users, Edit3, MapPin, UserPlus, Trash2, ChefHat, Activity, AlertTriangle, CreditCard
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next'; // <--- IMPORT AJOUTÉ
import HealthTracker from '@/components/HealthTracker';
import SmartCalorieWidget from '@/components/SmartCalorieWidget';

// --- FONCTION DE SÉCURITÉ POUR LES DATES ---
const safeDate = (dateVal) => {
    try {
        if (!dateVal) return "";
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ""; }
};

export default function Dashboard() {
  // Protection contre les Contextes vides
  const auth = useAuth();
  const clientContext = useClient();
  const { t } = useTranslation(); // <--- HOOK ACTIVÉ
  
  const currentUser = auth?.currentUser;
  const { selectedClient, isCoachView, targetUserId } = clientContext || {};
  
  // --- ÉTATS ---
  const [userProfile, setUserProfile] = useState(null);
  const [isCoach, setIsCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // C'est du pseudo-code pour te montrer la logique
const fetchHealthData = async () => {
   // Demander la permission au téléphone
   await GoogleFit.connect(); 
   
   // Récupérer les pas d'aujourd'hui
   const steps = await GoogleFit.getSteps({ date: today });
   
   // Récupérer les calories actives (sport + marche)
   const activeCals = await GoogleFit.getCalories({ date: today });
   
   // Mettre à jour Firebase pour que le coach puisse voir aussi !
   updateDoc(userRef, { 
      dailySteps: steps.value,
      dailyActivityCal: activeCals.value
   });
};
  // États Coach
  const [isRdvOpen, setIsRdvOpen] = useState(false);
  const [rdvData, setRdvData] = useState({ clientName: '', date: '', location: '', workoutId: 'none' });
  const [coachTemplates, setCoachTemplates] = useState([]);
  const [appointments, setAppointments] = useState([]);
  
  // État Facturation (Pour le bouton Orange)
  const [hasPendingInvoices, setHasPendingInvoices] = useState(false);
  
  // État Calendrier
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekDaysShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const todayName = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date().getDay()];

  // 1. INITIALISATION DES DONNÉES
  useEffect(() => {
    let isMounted = true;

    const initData = async () => {
        try {
            if(!currentUser) {
                if(isMounted) setLoading(false);
                return;
            }
            
            // A. Rôle Coach
            const myDoc = await getDoc(doc(db, "users", currentUser.uid));
            if(myDoc.exists() && myDoc.data()?.role === 'coach') {
                if(isMounted) setIsCoach(true);
                // Chargement des données coach en parallèle
                const p1 = loadCoachTemplates(currentUser.uid);
                const p2 = loadAppointments(currentUser.uid);
                await Promise.all([p1, p2]);
            }

            // B. Profil Utilisateur Cible & Factures
            const targetId = targetUserId || currentUser.uid;
            if(targetId) {
                const profileSnap = await getDoc(doc(db, "users", targetId));
                if (profileSnap.exists() && isMounted) {
                    setUserProfile(profileSnap.data());
                }

                // Vérifier les factures impayées (Si ce n'est pas la vue coach)
                if (!isCoachView) {
                    const invQ = query(
                        collection(db, "invoices"), 
                        where("clientId", "==", targetId), 
                        where("status", "==", "pending")
                    );
                    const invSnap = await getDocs(invQ);
                    if(isMounted) setHasPendingInvoices(!invSnap.empty);
                }
            }
        } catch(e) {
            console.error("Erreur Dashboard Init:", e);
            if(isMounted) setError(t('error'));
        } finally {
            if(isMounted) setLoading(false);
        }
    };

    initData();
    return () => { isMounted = false; };
  }, [currentUser, targetUserId, isCoachView]);

  // 2. LOGIQUE COACH
  const loadCoachTemplates = async (uid) => {
      try {
          const q = query(collection(db, "users", uid, "templates"), orderBy("createdAt", "desc"));
          const snap = await getDocs(q);
          setCoachTemplates(snap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch(e) { console.error("Templates error", e); }
  };

  const loadAppointments = async (uid) => {
      try {
          const q = query(collection(db, "appointments"), where("coachId", "==", uid));
          const snap = await getDocs(q);
          const rdvList = snap.docs.map(d => ({id: d.id, ...d.data()}));
          // Tri sécurisé
          rdvList.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
          setAppointments(rdvList);
      } catch(e) { console.error("RDV error", e); }
  };

  const handleSaveRdv = async () => {
      if(!rdvData.clientName || !rdvData.date) return alert(t('error'));
      try {
          const workoutName = rdvData.workoutId !== 'none' 
            ? coachTemplates.find(t => t.id === rdvData.workoutId)?.name 
            : null;

          const newRdv = {
              coachId: currentUser?.uid,
              clientName: rdvData.clientName,
              date: rdvData.date,
              location: rdvData.location || "Gym",
              workoutId: rdvData.workoutId !== 'none' ? rdvData.workoutId : null,
              workoutName: workoutName,
              status: 'upcoming',
              createdAt: new Date().toISOString()
          };

          const docRef = await addDoc(collection(db, "appointments"), newRdv);
          const updated = [...appointments, { id: docRef.id, ...newRdv }];
          updated.sort((a, b) => new Date(a.date) - new Date(b.date));
          
          setAppointments(updated);
          setIsRdvOpen(false);
          setRdvData({ clientName: '', date: '', location: '', workoutId: 'none' });
      } catch(e) { alert(t('error')); }
  };

  const deleteAppointment = async (id) => {
      if(!window.confirm(t('confirm_delete'))) return;
      try {
          await deleteDoc(doc(db, "appointments", id));
          setAppointments(appointments.filter(a => a.id !== id));
      } catch(e) { console.error(e); }
  };

  // --- CALENDRIER ---
  const changeMonth = (offset) => {
      const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
      setCurrentDate(new Date(newDate));
  };

  const renderCalendarDays = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

      const days = [];
      for (let i = 0; i < adjustedFirstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);

      for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = new Date().toISOString().split('T')[0] === dateStr;
          const hasRdv = appointments.some(a => a.date && a.date.startsWith(dateStr));

          days.push(
              <div key={d} className={`h-8 w-8 flex items-center justify-center rounded-full text-xs font-medium relative cursor-default
                  ${isToday ? 'bg-[#9d4edd] text-white font-bold' : 'text-gray-400 hover:bg-white/10'}
                  ${hasRdv && !isToday ? 'border border-[#9d4edd] text-[#9d4edd]' : ''}
              `}>
                  {d}
                  {hasRdv && <div className="absolute bottom-1 w-1 h-1 bg-[#00f5d4] rounded-full"></div>}
              </div>
          );
      }
      return days;
  };

  // --- UI HELPERS (SÉCURISÉS) ---
  const getFirstName = () => {
    // Essaie firstName, puis first_name, puis split le full_name, sinon "Athlète"
    if (userProfile?.firstName) return userProfile.firstName;
    if (userProfile?.first_name) return userProfile.first_name;
    if (userProfile?.full_name) return userProfile.full_name.split(' ')[0];
    return "Athlète";
  };

  const currentWeight = parseFloat(userProfile?.weight || 0);
  const targetWeight = parseFloat(userProfile?.targetWeight || 0);
  const weightDiff = targetWeight - currentWeight;
  const isWeightLoss = weightDiff < 0;
  
  const activePlan = userProfile?.nutritionalPlans?.find(p => p?.scheduledDays?.includes(todayName));
  const dailyCalories = activePlan?.totalMacros?.cal || 0;

  let daysLeft = null;
  if (userProfile?.targetDate) {
    try {
        const diff = new Date(userProfile.targetDate) - new Date();
        daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch(e) {}
  }

  const recentActivity = userProfile?.history?.slice(-3).reverse() || [];
  
  const getWorkoutForDay = (dayIndex) => {
    const dayNamesFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    return userProfile?.workouts?.find(w => w?.scheduledDays?.includes(dayNamesFull[dayIndex]));
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#9d4edd]">{t('loading')}</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-red-500 gap-2"><AlertTriangle/> {error}</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* BANNIÈRE COACH */}
      {isCoachView && (
        <div className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white p-4 rounded-xl flex flex-col md:flex-row items-center justify-between shadow-lg border border-white/10">
             <div className="flex items-center gap-4 mb-3 md:mb-0">
                <div className="bg-white/20 p-2 rounded-full"><Users className="text-white h-6 w-6"/></div>
                <div>
                    <p className="text-xs uppercase font-bold opacity-80 tracking-wider">Supervision Active</p>
                    <p className="font-black text-xl">Client : {userProfile?.full_name || "Inconnu"}</p>
                </div>
             </div>
             <div className="flex gap-2">
                 <Link to="/messages"><Button variant="secondary" className="text-[#7b2cbf] font-bold text-xs h-9">{t('messages')}</Button></Link>
                 <Link to="/coach/payments"><Button variant="outline" className="border-white text-white hover:bg-white/20 font-bold text-xs h-9">Paiements</Button></Link>
             </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-8 rounded-3xl border border-[#7b2cbf]/20 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-5xl font-black text-white italic tracking-tighter">
            {isCoachView ? t('dashboard').toUpperCase() : t('welcome').toUpperCase()} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]">{getFirstName().toUpperCase()}</span>
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
              {isCoachView ? "Gérez les progrès et assignez les objectifs." : "Prêt à exploser les records aujourd'hui ?"}
          </p>
        </div>
        
        <div className="flex gap-2 relative z-10">
            {/* BOUTON PAIEMENT ORANGE SI FACTURES */}
            {hasPendingInvoices && !isCoachView && (
                <Link to="/my-coach">
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white font-bold animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.5)]">
                        <CreditCard className="mr-2 h-4 w-4"/> {t('pending_payments')}
                    </Button>
                </Link>
            )}

            {!isCoachView && (
                <Link to="/session">
                    <Button className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-6 px-8 rounded-xl shadow-[0_0_20px_rgba(0,245,212,0.3)] transition-transform hover:scale-105">
                        <Zap className="mr-2 h-5 w-5 fill-black" /> {t('start_session')}
                    </Button>
                </Link>
            )}
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/10 to-transparent pointer-events-none"></div>
      </div>

      {/* GRILLE PRINCIPALE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLONNE GAUCHE (WIDGETS) */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Widget Poids */}
            <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#00f5d4] relative overflow-hidden group flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#7b2cbf]/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2"><Target className="text-[#00f5d4]" size={20}/><h3 className="font-bold text-gray-200">{t('weight')}</h3></div>
                        {userProfile?.targetWeight && (
                            <Badge className={`border-none ${isWeightLoss ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                {isWeightLoss ? '-' : '+'}{Math.abs(weightDiff).toFixed(1)} {userProfile?.weightUnit || 'kg'}
                            </Badge>
                        )}
                    </div>
                    
                    {userProfile?.targetWeight ? (
                        <>
                            <div className="flex items-end justify-between mb-2">
                                <div><p className="text-4xl font-black text-white">{currentWeight}</p><span className="text-xs text-gray-500 uppercase font-bold">{t('current')}</span></div>
                                <div className="h-1 flex-1 mx-4 bg-gray-800 rounded-full overflow-hidden self-center mb-4"><div className="h-full bg-[#00f5d4] w-1/2"></div></div>
                                <div className="text-right"><p className="text-4xl font-black text-[#00f5d4]">{targetWeight}</p><span className="text-xs text-gray-500 uppercase font-bold">{t('target')}</span></div>
                            </div>
                            {daysLeft && <p className="text-xs text-gray-500 flex items-center mt-2 border-t border-gray-800 pt-2"><Clock size={10} className="mr-1"/> Objectif dans {daysLeft} jours</p>}
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-gray-500 text-sm mb-2">Pas d'objectif défini.</p>
                            <Link to="/profile"><Button variant="outline" size="sm" className="text-[#00f5d4] border-[#00f5d4] hover:bg-[#00f5d4]/10">Définir</Button></Link>
                        </div>
                    )}
                </div>
            </div>

            {/* Widget Nutrition */}
            <div className="bg-[#1a1a20] p-6 rounded-2xl border-l-4 border-l-[#7b2cbf] flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2"><Flame className="text-[#7b2cbf]" size={20}/><h3 className="font-bold text-gray-200">{t('meals')}</h3></div>
                    {isCoachView && <Link to="/meals"><Button size="icon" variant="ghost" className="h-6 w-6"><Edit3 size={14}/></Button></Link>}
                </div>
                
                {activePlan ? (
                    <>
                        <div className="flex items-center justify-center py-4">
                            <div className="text-center">
                                <span className="text-4xl font-black text-white">{dailyCalories}</span>
                                <p className="text-[10px] text-gray-500 uppercase font-bold mt-1">Kcal / Jour</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="bg-black/30 p-2 rounded"><p className="font-bold text-white">{activePlan?.totalMacros?.pro || 0}g</p><p className="text-gray-500">Prot</p></div>
                            <div className="bg-black/30 p-2 rounded"><p className="font-bold text-white">{activePlan?.totalMacros?.carb || 0}g</p><p className="text-gray-500">Gluc</p></div>
                            <div className="bg-black/30 p-2 rounded"><p className="font-bold text-white">{activePlan?.totalMacros?.fat || 0}g</p><p className="text-gray-500">Lip</p></div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <p className="text-gray-500 text-sm italic mb-3">Aucun plan pour aujourd'hui.</p>
                        <Link to="/meals"><Button size="sm" className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-bold">Gérer la diète</Button></Link>
                    </div>
                )}
            </div>
        </div>

        {/* --- COLONNE DROITE : AGENDA OU SEMAINE --- */}
        <div className="lg:col-span-1 h-full">
            {isCoach && !isCoachView ? (
                // AGENDA COACH
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 h-full shadow-xl flex flex-col min-h-[300px]">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2"><Calendar className="text-[#9d4edd]"/> {t('agenda')}</h3>
                        <Button size="sm" onClick={() => setIsRdvOpen(true)} className="bg-[#9d4edd] hover:bg-[#7b2cbf] text-white text-xs font-bold h-8 shadow-[0_0_10px_rgba(157,78,221,0.3)]">
                            <Plus size={14} className="mr-1"/> {t('add')}
                        </Button>
                    </div>
                    
                    {/* Calendrier */}
                    <div className="flex items-center justify-between mb-4 bg-black/40 p-2 rounded-lg">
                        <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-white/10 rounded"><ArrowRight className="rotate-180" size={16}/></button>
                        <span className="font-bold text-white text-sm capitalize">{currentDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}</span>
                        <button onClick={() => changeMonth(1)} className="p-1 hover:bg-white/10 rounded"><ArrowRight size={16}/></button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                        {weekDaysShort.map(d => <span key={d} className="text-[10px] text-gray-500 uppercase">{d}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-6">
                        {renderCalendarDays()}
                    </div>
                    
                    {/* Liste RDV */}
                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar border-t border-gray-800 pt-4 max-h-[200px]">
                        {appointments.length > 0 ? appointments.slice(0, 5).map(rdv => (
                            <div key={rdv.id} className="bg-black/40 p-3 rounded-xl border border-gray-800 flex justify-between items-center group hover:border-[#9d4edd] transition-colors">
                                <div>
                                    <p className="font-bold text-white text-xs">{rdv.clientName}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                        <span>{safeDate(rdv.date)}</span>
                                    </div>
                                </div>
                                <button onClick={() => deleteAppointment(rdv.id)} className="text-gray-600 hover:text-red-500 transition"><Trash2 size={12}/></button>
                            </div>
                        )) : (
                            <p className="text-gray-500 text-xs italic text-center py-4">Aucun RDV à venir.</p>
                        )}
                    </div>
                </div>
            ) : (
                // SEMAINE CLIENT
                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 h-full shadow-xl flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2"><Calendar className="text-[#00f5d4]"/> {t('week')}</h3>
                        <Badge variant="outline" className="border-[#00f5d4] text-[#00f5d4] bg-[#00f5d4]/10">{todayName}</Badge>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                        {weekDaysShort.map((d, index) => {
                            const isToday = index === new Date().getDay() - 1;
                            const workout = getWorkoutForDay(index);
                            return (
                                <div key={d} className={`flex items-center p-3 rounded-xl border transition-all ${isToday ? 'bg-[#7b2cbf]/10 border-[#7b2cbf]' : 'bg-black/20 border-gray-800'}`}>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black mr-3 ${isToday ? 'bg-[#7b2cbf] text-white' : 'bg-gray-800 text-gray-500'}`}>{d.substring(0, 1)}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold truncate ${isToday ? 'text-white' : 'text-gray-400'}`}>{workout ? workout.name : "Repos"}</p>
                                    </div>
                                    {workout && <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-[#00f5d4] animate-pulse' : 'bg-gray-600'}`}></div>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* ZONE 4 : STATS RAPIDES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Dumbbell} title={t('workouts')} value={userProfile?.history?.length || 0} color="#00f5d4" />
        <StatCard icon={Flame} title={t('calories')} value={dailyCalories} color="#fdcb6e" />
        <StatCard icon={Trophy} title={t('challenges')} value={userProfile?.challengesCompleted?.length || 0} color="#9d4edd" />
        <StatCard icon={TrendingUp} title={t('points')} value={userProfile?.points || 0} color="#7b2cbf" />
      </div>

      {/* ZONE 5 : PROGRAMME */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="bg-[#1a1a20] rounded-2xl border-l-4 border-l-[#7b2cbf] border-gray-800 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center text-xl text-white">
              <Zap className="mr-3 text-[#00f5d4]" />
              {userProfile?.activeProgram?.name || t('active_program')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userProfile?.activeProgram ? (
              <div className="space-y-4">
                <div className="flex justify-between text-xs text-gray-400"><span>{t('progress')}</span><span className="text-[#00f5d4] font-bold">{userProfile.activeProgram.progress || 0}%</span></div>
                <Progress value={userProfile.activeProgram.progress || 0} className="h-2 bg-gray-800 [&>div]:bg-gradient-to-r [&>div]:from-[#7b2cbf] [&>div]:to-[#00f5d4]" />
                <Link to="/exercises"><Button className="w-full bg-[#7b2cbf] text-white hover:bg-[#9d4edd] font-bold mt-2">{t('continue')}</Button></Link>
              </div>
            ) : (
              <div className="py-6 text-center">
                  <p className="text-gray-500 mb-4">Aucun programme actif.</p>
                  <Link to="/exercises">
                    <Button className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-bold px-8 py-2 rounded-xl shadow-lg border-none">
                        {t('find_program')}
                    </Button>
                  </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a20] rounded-2xl border border-gray-800">
          <CardHeader><CardTitle className="text-xl text-white">{t('history')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, idx) => (
                <ActivityItem 
                  key={idx}
                  icon={activity.type === 'workout' ? Dumbbell : Trophy} 
                  title={activity.name} 
                  date={safeDate(activity.date)} 
                  color={activity.type === 'workout' ? "#00f5d4" : "#fdcb6e"} 
                />
              ))
            ) : (
              <div className="text-center py-12 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                    <Activity className="text-gray-500"/>
                  </div>
                  <p className="text-gray-500 text-sm font-bold">{t('no_content')}</p>
              </div>
            )}
            {recentActivity.length > 0 && (
                <Link to="/performance">
                    <Button variant="ghost" className="w-full text-gray-400 hover:text-[#00f5d4] hover:bg-transparent mt-2">
                        {t('see_all_history')} <ArrowRight size={14} className="ml-1"/>
                    </Button>
                </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MODAL RDV */}
      <Dialog open={isRdvOpen} onOpenChange={setIsRdvOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black italic">{t('schedule_appointment')}</DialogTitle>
                <DialogDescription>Ajoutez un client et assignez une séance.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nom du Client</label>
                    <div className="relative">
                        <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16}/>
                        <Input value={rdvData.clientName} onChange={(e) => setRdvData({...rdvData, clientName: e.target.value})} placeholder="Ex: Jean Dupont" className="pl-10 bg-black border-gray-700 text-white"/>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Date & Heure</label>
                    <Input type="datetime-local" value={rdvData.date} onChange={(e) => setRdvData({...rdvData, date: e.target.value})} className="bg-black border-gray-700 text-white [color-scheme:dark]"/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Lieu</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16}/>
                        <Input value={rdvData.location} onChange={(e) => setRdvData({...rdvData, location: e.target.value})} placeholder="Ex: Gym Centre-Ville" className="pl-10 bg-black border-gray-700 text-white"/>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Assigner un Entraînement (Optionnel)</label>
                    <Select value={rdvData.workoutId} onValueChange={(val) => setRdvData({...rdvData, workoutId: val})}>
                        <SelectTrigger className="bg-black border-gray-700 text-white"><SelectValue placeholder="Choisir un template..."/></SelectTrigger>
                        <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                            <SelectItem value="none">Aucun</SelectItem>
                            {coachTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button onClick={handleSaveRdv} className="bg-[#9d4edd] hover:bg-[#7b2cbf] text-white font-bold w-full h-12 rounded-xl">{t('confirm_appointment')}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* Colonne Gauche */}
    <div className="lg:col-span-2 space-y-6">
        {/* ... ton code existant (prochaine séance etc) ... */}
        
        {/* Ajoute le tracker ici */}
        <HealthTracker userProfile={userProfile} />
    </div>
    {/* ... Colonne droite ... */}
</div>

// STYLE COMPONENTS
function StatCard({ icon: Icon, title, value, color }) {
  return (
    <Card className="bg-[#1a1a20] rounded-2xl border border-gray-800 relative group overflow-hidden hover:scale-[1.02] transition-transform duration-300">
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
<div className="col-span-1">
    <SmartCalorieWidget userProfile={userProfile} />
</div>

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