import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { 
  collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, doc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, TrendingUp, CreditCard, AlertCircle, Plus, Send, Landmark, Receipt, 
  Wallet, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, CheckCircle2, User, Tag
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { sendNotification } from '@/lib/notifications';

// --- UTILITAIRES DATES ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Ajuster pour Lundi = 0
};

export default function Payments() {
  const { currentUser } = useAuth();
  const { t, i18n } = useTranslation();
  
  // --- ÉTATS ---
  const [transactions, setTransactions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coachProfile, setCoachProfile] = useState(null);

  // États Calendrier
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateForEvent, setSelectedDateForEvent] = useState(null);

  // Modals
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false); 

  // Formulaires
  const [invoiceData, setInvoiceData] = useState({ clientId: '', amount: '', description: '' });
  const [scheduleData, setScheduleData] = useState({ clientId: '', pricingId: '', status: 'scheduled' });

   // --- LOGIQUE STRIPE CONNECT ---
  const handleLinkBank = async () => {
    setLoading(true);
    try {
        const functions = getFunctions();
        const createAccount = httpsCallable(functions, 'createStripeConnectAccount');
        const result = await createAccount();
        window.location.href = result.data.url; 
    } catch (error) {
        console.error("Erreur Stripe:", error);
        alert(t('error'));
    }
  };

  // 1. CHARGEMENT
  useEffect(() => {
    const fetchData = async () => {
        if(!currentUser) return;
        try {
            // Coach Profile (pour récupérer ses tarifs)
            const coachSnap = await getDocs(query(collection(db, "users"), where("uid", "==", currentUser.uid)));
            if (!coachSnap.empty) {
                setCoachProfile(coachSnap.docs[0].data());
            }

            // Clients
            const qClients = query(collection(db, "users"), where("coachId", "==", currentUser.uid));
            const snapClients = await getDocs(qClients);
            setClients(snapClients.docs.map(d => ({id: d.id, ...d.data()})));

            // Transactions (Invoices)
            const qInvoices = query(collection(db, "invoices"), where("coachId", "==", currentUser.uid));
            const snapInvoices = await getDocs(qInvoices);
            
            const data = snapInvoices.docs.map(d => {
                const rawDate = d.data().scheduledDate ? d.data().scheduledDate.toDate() : d.data().createdAt?.toDate();
                return {
                    id: d.id, 
                    ...d.data(),
                    dateObj: rawDate || new Date()
                };
            });
            data.sort((a,b) => b.dateObj - a.dateObj);
            setTransactions(data);

            // Plans (Abonnements actifs si besoin)
            const qPlans = query(collection(db, "plans"), where("coachId", "==", currentUser.uid));
            const snapPlans = await getDocs(qPlans);
            setPlans(snapPlans.docs.map(d => ({id: d.id, ...d.data()})));

        } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchData();
  }, [currentUser]);

  // --- ACTIONS ---

  const handleCreateInvoice = async () => {
      if(!invoiceData.clientId || !invoiceData.amount) return alert(t('error'));
      const amount = parseFloat(invoiceData.amount);
      const fee = amount * 0.05;
      const clientName = clients.find(c => c.id === invoiceData.clientId)?.full_name || "Client";

      try {
          const newInvoice = {
              coachId: currentUser.uid,
              clientId: invoiceData.clientId,
              clientName: clientName,
              amount: amount,
              platformFee: fee,
              netAmount: amount - fee,
              description: invoiceData.description || t('finance_title'),
              status: "pending",
              type: "invoice",
              createdAt: serverTimestamp()
          };
          const docRef = await addDoc(collection(db, "invoices"), newInvoice);
          setTransactions([{id: docRef.id, ...newInvoice, dateObj: new Date()}, ...transactions]);
          
          await sendNotification(
              invoiceData.clientId,
              currentUser.uid,
              "Coach Kaybee",
              "Nouvelle Facture 💳",
              `Une facture de ${amount}$ est disponible.`,
              "invoice"
          );

          setIsInvoiceOpen(false);
          setInvoiceData({ clientId: '', amount: '', description: '' });
      } catch (e) { console.error(e); }
  };

  const handleSchedulePayment = async () => {
      if(!scheduleData.clientId || !scheduleData.pricingId) return alert("Veuillez remplir tous les champs.");

      const client = clients.find(c => c.id === scheduleData.clientId);
      const pricing = coachProfile?.pricing?.find(p => p.id.toString() === scheduleData.pricingId.toString());

      if (!client || !pricing) return alert("Données invalides.");

      const amount = pricing.price;
      
      try {
          const scheduledDate = new Date(selectedDateForEvent);
          scheduledDate.setHours(12, 0, 0, 0);

          const newScheduled = {
              coachId: currentUser.uid,
              clientId: client.id,
              clientName: client.full_name || client.name,
              amount: amount,
              platformFee: amount * 0.05,
              netAmount: amount * 0.95,
              description: pricing.description || "Service Coaching",
              status: scheduleData.status, // 'paid' ou 'scheduled'
              type: "scheduled",
              createdAt: serverTimestamp(),
              scheduledDate: scheduledDate
          };

          const docRef = await addDoc(collection(db, "invoices"), newScheduled);
          setTransactions([{id: docRef.id, ...newScheduled, dateObj: scheduledDate}, ...transactions]);
          setIsScheduleOpen(false);
          setScheduleData({ clientId: '', pricingId: '', status: 'scheduled' });
      } catch (e) { console.error(e); }
  };

  const updateStatus = async (id, status) => {
      try {
          await updateDoc(doc(db, "invoices", id), { status: status });
          setTransactions(transactions.map(t => t.id === id ? { ...t, status: status } : t));
      } catch (e) { console.error(e); }
  };

  // --- LOGIQUE CALENDRIER ---
  const changeMonth = (offset) => {
      const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
      setCurrentDate(new Date(newDate));
  };

  const renderCalendar = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = getDaysInMonth(year, month);
      const firstDay = getFirstDayOfMonth(year, month);
      
      const days = [];
      for(let i=0; i<firstDay; i++) days.push(<div key={`empty-${i}`} className="h-24 bg-[#1a1a20]/30 border border-gray-800/30 rounded-2xl"></div>);
      
      for(let d=1; d<=daysInMonth; d++) {
          const currentDayDate = new Date(year, month, d);
          const dateStr = currentDayDate.toDateString();
          const dayEvents = transactions.filter(t => (t.status === 'scheduled' || t.status === 'paid') && t.dateObj.toDateString() === dateStr);
          const isToday = new Date().toDateString() === dateStr;

          days.push(
              <div 
                key={d} 
                onClick={() => { setSelectedDateForEvent(currentDayDate); setIsScheduleOpen(true); }}
                className={`h-24 p-2 border-2 rounded-2xl cursor-pointer transition-all hover:border-[#00f5d4] group flex flex-col justify-between
                    ${isToday ? 'bg-[#00f5d4]/5 border-[#00f5d4] shadow-[0_0_20px_rgba(0,245,212,0.1)]' : 'bg-[#1a1a20]/60 border-gray-800/50 hover:bg-[#1a1a20]'}
                `}
              >
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isToday ? 'text-[#00f5d4]' : 'text-gray-600'}`}>{d}</span>
                  <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                      {dayEvents.map(ev => (
                          <div key={ev.id} className={`text-[8px] px-1.5 py-1 rounded-lg border truncate font-black uppercase italic ${ev.status === 'paid' ? 'bg-[#00f5d4]/10 text-[#00f5d4] border-[#00f5d4]/20' : 'bg-[#7b2cbf]/10 text-[#7b2cbf] border-[#7b2cbf]/20'}`}>
                              {ev.clientName}: {ev.amount}$
                          </div>
                      ))}
                  </div>
                  {dayEvents.length === 0 && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-center pb-1">
                      <Plus size={12} className="text-gray-700" />
                    </div>
                  )}
              </div>
          );
      }
      return days;
  };

  // --- STATS ---
  const currentMonthIdx = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Revenu du mois (Confirmé payé)
  const monthlyRevenue = transactions
    .filter(t => t.status === 'paid' && t.dateObj.getMonth() === currentMonthIdx && t.dateObj.getFullYear() === currentYear)
    .reduce((acc, t) => acc + (t.netAmount || 0), 0);

  // Planifié (Non payé pour le mois sélectionné)
  const plannedAmount = transactions
    .filter(t => (t.status === 'scheduled' || t.status === 'pending') && t.dateObj.getMonth() === currentMonthIdx && t.dateObj.getFullYear() === currentYear)
    .reduce((acc, t) => acc + (t.amount || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
       
       {/* HEADER */}
       <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-gradient-to-br from-[#1a1a20] to-black p-8 rounded-[2rem] border border-gray-800 shadow-2xl relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/10 to-transparent pointer-events-none"></div>
          <div className="relative z-10">
              <h1 className="text-4xl font-black italic text-white uppercase flex items-center gap-3 tracking-tighter">
                  <DollarSign className="text-[#00f5d4] w-10 h-10"/> Finance <span className="text-[#00f5d4]">Élite</span>
              </h1>
              <p className="text-gray-400 mt-2 text-sm font-bold uppercase tracking-widest opacity-70">Gestion des flux et planification stratégique</p>
          </div>
          <div className="flex gap-3 flex-wrap relative z-10">
              <Button onClick={() => setIsBankOpen(true)} variant="outline" className="border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white font-black uppercase italic rounded-xl h-12 px-6">
                 <Landmark className="mr-2 h-4 w-4"/> Compte Bancaire
              </Button>
              <Button onClick={() => setIsInvoiceOpen(true)} className="bg-[#00f5d4] text-black font-black uppercase italic rounded-xl h-12 px-8 shadow-[0_0_20px_rgba(0,245,212,0.3)] hover:scale-105 transition-transform">
                 <Send className="mr-2 h-4 w-4"/> Facturer Client
              </Button>
          </div>
       </div>

       {/* KPIs DYNAMIQUES */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="kb-card border-l-4 border-l-[#00f5d4] bg-[#1a1a20]/60">
             <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Revenu {currentDate.toLocaleString(i18n.language, { month: 'short' })} (Net)</p>
                  <TrendingUp className="text-[#00f5d4] h-4 w-4"/>
                </div>
                <h3 className="text-4xl font-black text-white mt-2 tracking-tighter">{monthlyRevenue.toFixed(2)}$</h3>
                <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold">Encaissements confirmés</p>
             </CardContent>
          </Card>
          
          <Card className="kb-card border-l-4 border-l-[#9d4edd] bg-[#1a1a20]/60">
             <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total Planifié</p>
                    <CalendarIcon className="text-[#9d4edd] h-4 w-4"/>
                </div>
                <h3 className="text-4xl font-black text-white mt-2 tracking-tighter">{plannedAmount.toFixed(2)}$</h3>
                <p className="text-[10px] text-[#9d4edd] mt-1 uppercase font-bold">Prévisions de paiement</p>
             </CardContent>
          </Card>

          <Card className="kb-card border-l-4 border-l-orange-500 bg-[#1a1a20]/60 hidden lg:block">
             <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Clients Actifs</p>
                    <User className="text-orange-500 h-4 w-4"/>
                </div>
                <h3 className="text-4xl font-black text-white mt-2 tracking-tighter">{clients.length}</h3>
                <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold">Base de facturation</p>
             </CardContent>
          </Card>
       </div>

       {/* --- CALENDRIER INTERACTIF --- */}
       <Card className="kb-card bg-[#1a1a20]/40 border-gray-800 overflow-hidden">
           <CardHeader className="flex flex-row items-center justify-between bg-black/20 p-6 border-b border-gray-800/50">
               <div>
                  <CardTitle className="text-xl font-black italic uppercase text-white flex items-center gap-3">
                    <CalendarIcon className="text-[#9d4edd]"/> Planning Financier
                  </CardTitle>
                  <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">Céduler vos revenus futurs</p>
               </div>
               <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-2xl border border-gray-800">
                    <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="h-8 w-8 hover:bg-white/5 text-gray-400">
                      <ChevronLeft size={18}/>
                    </Button>
                    <span className="font-black text-white text-xs uppercase italic tracking-widest min-w-[120px] text-center">
                        {currentDate.toLocaleString(i18n.language, { month: 'long', year: 'numeric' })}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="h-8 w-8 hover:bg-white/5 text-gray-400">
                      <ChevronRight size={18}/>
                    </Button>
               </div>
           </CardHeader>
           <CardContent className="p-6">
               <div className="grid grid-cols-7 gap-4 mb-4 text-center">
                   {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => <span key={d} className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{d}</span>)}
               </div>
               <div className="grid grid-cols-7 gap-3">
                   {renderCalendar()}
               </div>
               <div className="mt-8 flex gap-6 justify-center">
                   <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#7b2cbf] shadow-[0_0_10px_rgba(123,44,191,0.5)]"></div> <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Prévu</span></div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#00f5d4] shadow-[0_0_10px_rgba(0,245,212,0.5)]"></div> <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Payé</span></div>
               </div>
           </CardContent>
       </Card>

       {/* DERNIÈRES TRANSACTIONS */}
       <Card className="kb-card bg-[#1a1a20]/40 border-gray-800">
          <CardHeader className="p-6 border-b border-gray-800/50">
            <CardTitle className="text-sm font-black italic uppercase text-gray-400">Journal des Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
             <div className="space-y-4">
                {transactions.length > 0 ? transactions.slice(0, 10).map(t => (
                   <div key={t.id} className="flex items-center justify-between p-5 bg-black/40 rounded-[1.5rem] border border-gray-800 group hover:border-[#00f5d4]/30 transition-all shadow-xl">
                      <div className="flex items-center gap-5">
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${t.status === 'paid' ? 'bg-[#00f5d4]/10 text-[#00f5d4] shadow-[0_0_15px_rgba(0,245,212,0.1)]' : 'bg-[#7b2cbf]/10 text-[#7b2cbf]'}`}>
                            {t.status === 'paid' ? <CheckCircle2 size={24}/> : <Clock size={24}/>}
                         </div>
                         <div>
                            <p className="text-white font-black italic uppercase tracking-tighter">{t.clientName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{t.dateObj.toLocaleDateString()}</p>
                              <Badge className={`text-[8px] font-black uppercase border-none h-4 px-2 ${t.status === 'paid' ? 'bg-[#00f5d4]/20 text-[#00f5d4]' : 'bg-[#7b2cbf]/20 text-[#7b2cbf]'}`}>
                                {t.status === 'paid' ? 'Encaissé' : 'Attente'}
                              </Badge>
                            </div>
                         </div>
                      </div>
                      <div className="flex items-center gap-6">
                         <div className="text-right">
                             <p className={`text-2xl font-black tracking-tighter ${t.status === 'paid' ? 'text-[#00f5d4]' : 'text-white'}`}>{t.amount.toFixed(2)}$</p>
                             <p className="text-[9px] text-gray-600 font-bold uppercase">{t.description}</p>
                         </div>
                         
                         {t.status !== 'paid' && (
                             <div className="flex gap-2">
                                 <Button onClick={() => updateStatus(t.id, 'paid')} size="sm" className="bg-[#00f5d4] hover:bg-[#00d1b5] text-black font-black uppercase italic rounded-xl px-4 h-10 shadow-lg">
                                     <CheckCircle2 size={16} className="mr-2"/> Payer
                                 </Button>
                                 <Button onClick={() => updateStatus(t.id, 'cancelled')} variant="ghost" size="icon" className="h-10 w-10 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl">
                                     <Plus size={18} className="rotate-45" />
                                 </Button>
                             </div>
                         )}
                      </div>
                   </div>
                )) : (
                  <div className="text-center py-20 opacity-20">
                    <Receipt size={64} className="mx-auto mb-4" />
                    <p className="font-black uppercase italic tracking-widest">Aucun historique</p>
                  </div>
                )}
             </div>
          </CardContent>
       </Card>

       {/* --- MODALS --- */}

       {/* 1. PLANIFIER PAIEMENT (DEPUIS LE CALENDRIER) */}
       <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] shadow-2xl max-w-md">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-[#00f5d4]">Céduler un Payment</DialogTitle>
                <DialogDescription className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">
                  Pour le {selectedDateForEvent?.toLocaleDateString()}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2"><User size={12}/> Sélectionner le Client</label>
                    <Select onValueChange={(val) => setScheduleData({...scheduleData, clientId: val})}>
                        <SelectTrigger className="bg-black/40 border-gray-800 text-white h-12 rounded-xl focus:ring-[#00f5d4]">
                          <SelectValue placeholder="Choisir un client..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
                            {clients.map(c => <SelectItem key={c.id} value={c.id} className="focus:bg-[#00f5d4] focus:text-black font-bold uppercase text-xs">{c.full_name || c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2"><Tag size={12}/> Choisir le Tarif / Service</label>
                    <Select onValueChange={(val) => setScheduleData({...scheduleData, pricingId: val})}>
                        <SelectTrigger className="bg-black/40 border-gray-800 text-white h-12 rounded-xl focus:ring-[#00f5d4]">
                          <SelectValue placeholder="Sélectionner un tarif..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
                            {coachProfile?.pricing?.map(p => (
                              <SelectItem key={p.id} value={p.id.toString()} className="focus:bg-[#00f5d4] focus:text-black font-bold uppercase text-xs">
                                {p.description} ({p.price}$)
                              </SelectItem>
                            ))}
                            {(!coachProfile?.pricing || coachProfile.pricing.length === 0) && (
                              <div className="p-4 text-center text-xs text-gray-500 uppercase font-black italic">Aucun tarif défini dans votre profil</div>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2 pt-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Statut Initial</label>
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                          type="button"
                          onClick={() => setScheduleData({...scheduleData, status: 'paid'})}
                          className={`h-12 rounded-xl font-black uppercase italic tracking-tighter gap-2 transition-all ${scheduleData.status === 'paid' ? 'bg-[#00f5d4] text-black shadow-[0_0_15px_rgba(0,245,212,0.3)]' : 'bg-black/40 text-gray-500 border border-gray-800'}`}
                        >
                          <CheckCircle2 size={16}/> Payé
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setScheduleData({...scheduleData, status: 'scheduled'})}
                          className={`h-12 rounded-xl font-black uppercase italic tracking-tighter gap-2 transition-all ${scheduleData.status === 'scheduled' ? 'bg-[#7b2cbf] text-white shadow-[0_0_15px_rgba(123,44,191,0.3)]' : 'bg-black/40 text-gray-500 border border-gray-800'}`}
                        >
                          <Clock size={16}/> Non Payé
                        </Button>
                    </div>
                </div>
            </div>
            <DialogFooter className="gap-3">
                <Button variant="ghost" onClick={() => setIsScheduleOpen(false)} className="flex-1 h-12 font-black uppercase italic text-gray-500 hover:text-white rounded-xl">Annuler</Button>
                <Button onClick={handleSchedulePayment} className="flex-1 bg-gradient-to-r from-[#00f5d4] to-[#00d1b5] text-black font-black uppercase italic h-12 rounded-xl shadow-lg">Enregistrer</Button>
            </DialogFooter>
        </DialogContent>
       </Dialog>

       {/* 2. FACTURE STANDARD */}
       <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] shadow-2xl">
            <DialogHeader><DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-[#00f5d4]">Envoyer une Facture</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Client</label>
                    <Select onValueChange={(val) => setInvoiceData({...invoiceData, clientId: val})}>
                        <SelectTrigger className="bg-black/40 border-gray-800 text-white h-12 rounded-xl"><SelectValue/></SelectTrigger>
                        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
                            {clients.map(c => <SelectItem key={c.id} value={c.id} className="font-bold uppercase text-xs">{c.full_name || c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Montant Libre ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00f5d4] w-4 h-4" />
                      <Input type="number" value={invoiceData.amount} onChange={(e) => setInvoiceData({...invoiceData, amount: e.target.value})} className="bg-black/40 border-gray-800 text-white h-12 pl-12 rounded-xl focus:border-[#00f5d4] font-black text-lg"/>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase">Description</label>
                    <Input placeholder="Libellé de la facture..." value={invoiceData.description} onChange={(e) => setInvoiceData({...invoiceData, description: e.target.value})} className="bg-black/40 border-gray-800 text-white h-12 rounded-xl italic"/>
                </div>
            </div>
            <DialogFooter><Button onClick={handleCreateInvoice} className="w-full bg-[#00f5d4] text-black font-black uppercase italic h-12 rounded-xl shadow-lg hover:scale-105 transition-transform">Envoyer au client</Button></DialogFooter>
        </DialogContent>
       </Dialog>

       {/* 3. BANQUE */}
       <Dialog open={isBankOpen} onOpenChange={setIsBankOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] shadow-2xl">
            <DialogHeader><DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-[#7b2cbf]">Coordonnées Bancaires</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Titulaire du compte</label>
                  <Input placeholder="Nom complet" className="bg-black/40 border-gray-800 text-white h-12 rounded-xl font-bold"/>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase">Numéro IBAN / Transit</label>
                  <Input placeholder="FR76..." className="bg-black/40 border-gray-800 text-white h-12 rounded-xl font-mono"/>
                </div>
                <div className="p-4 bg-[#7b2cbf]/5 rounded-2xl border border-[#7b2cbf]/20">
                  <p className="text-[10px] text-[#9d4edd] font-black uppercase leading-tight">Note: Ces informations seront utilisées pour vos virements automatiques Stripe Connect.</p>
                </div>
            </div>
            <DialogFooter><Button onClick={() => setIsBankOpen(false)} className="w-full bg-[#7b2cbf] text-white font-black uppercase italic h-12 rounded-xl shadow-lg">Enregistrer les infos</Button></DialogFooter>
        </DialogContent>
       </Dialog>

    </div>
  );
}
