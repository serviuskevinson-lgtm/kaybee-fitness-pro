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
  Wallet, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, CheckCircle2
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next'; // <--- 1. IMPORT

// --- UTILITAIRES DATES ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Ajuster pour Lundi = 0
};

export default function Payments() {
  const { currentUser } = useAuth();
  const { t, i18n } = useTranslation(); // <--- 2. HOOK (i18n pour la date)
  
  // --- ÉTATS ---
  const [transactions, setTransactions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États Calendrier
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateForEvent, setSelectedDateForEvent] = useState(null);

  // Modals
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isBankOpen, setIsBankOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false); 

  // Formulaires
  const [invoiceData, setInvoiceData] = useState({ clientId: '', amount: '', description: '' });
  const [planData, setPlanData] = useState({ name: '', amount: '', interval: 'month' });
  const [bankData, setBankData] = useState({ iban: '', holder: '' });
  const [scheduleData, setScheduleData] = useState({ clientName: '', amount: '', description: '' });

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
            // Clients
            const qClients = query(collection(db, "users"), where("coachId", "==", currentUser.uid));
            const snapClients = await getDocs(qClients);
            setClients(snapClients.docs.map(d => ({id: d.id, ...d.data()})));

            // Transactions
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
            // Tri par date
            data.sort((a,b) => b.dateObj - a.dateObj);
            setTransactions(data);

            // Plans
            const qPlans = query(collection(db, "plans"), where("coachId", "==", currentUser.uid));
            const snapPlans = await getDocs(qPlans);
            setPlans(snapPlans.docs.map(d => ({id: d.id, ...d.data()})));

        } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchData();
  }, [currentUser]);

  // --- LOGIQUE FINANCIÈRE ---

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
          setIsInvoiceOpen(false);
          setInvoiceData({ clientId: '', amount: '', description: '' });
      } catch (e) { console.error(e); }
  };

  const handleSchedulePayment = async () => {
      if(!scheduleData.clientName || !scheduleData.amount) return alert(t('error'));
      const amount = parseFloat(scheduleData.amount);
      
      try {
          const scheduledDate = new Date(selectedDateForEvent);
          scheduledDate.setHours(12, 0, 0, 0);

          const newScheduled = {
              coachId: currentUser.uid,
              clientName: scheduleData.clientName, 
              amount: amount,
              platformFee: amount * 0.05,
              netAmount: amount * 0.95,
              description: scheduleData.description || t('scheduled'),
              status: "scheduled", 
              type: "scheduled",
              createdAt: serverTimestamp(),
              scheduledDate: scheduledDate
          };

          const docRef = await addDoc(collection(db, "invoices"), newScheduled);
          setTransactions([{id: docRef.id, ...newScheduled, dateObj: scheduledDate}, ...transactions]);
          setIsScheduleOpen(false);
          setScheduleData({ clientName: '', amount: '', description: '' });
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
      for(let i=0; i<firstDay; i++) days.push(<div key={`empty-${i}`} className="h-24 bg-[#1a1a20]/50 border border-gray-800/50 rounded-lg"></div>);
      
      for(let d=1; d<=daysInMonth; d++) {
          const dateStr = new Date(year, month, d).toDateString();
          const dayEvents = transactions.filter(t => t.status === 'scheduled' && t.dateObj.toDateString() === dateStr);
          const isToday = new Date().toDateString() === dateStr;

          days.push(
              <div 
                key={d} 
                onClick={() => { setSelectedDateForEvent(new Date(year, month, d)); setIsScheduleOpen(true); }}
                className={`h-24 p-2 border rounded-lg cursor-pointer transition-all hover:border-[#00f5d4] flex flex-col justify-between
                    ${isToday ? 'bg-[#00f5d4]/5 border-[#00f5d4] shadow-[0_0_10px_rgba(0,245,212,0.1)]' : 'bg-[#1a1a20] border-gray-800'}
                `}
              >
                  <span className={`text-xs font-bold ${isToday ? 'text-[#00f5d4]' : 'text-gray-500'}`}>{d}</span>
                  <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                      {dayEvents.map(ev => (
                          <div key={ev.id} className="bg-[#7b2cbf]/20 text-[#7b2cbf] text-[9px] px-1.5 py-0.5 rounded border border-[#7b2cbf]/30 truncate font-medium">
                              {ev.clientName}: {ev.amount}$
                          </div>
                      ))}
                  </div>
              </div>
          );
      }
      return days;
  };

  // --- STATS ---
  const currentMonthIdx = new Date().getMonth();
  const monthlyRevenue = transactions
    .filter(t => t.status === 'paid' && t.dateObj.getMonth() === currentMonthIdx)
    .reduce((acc, t) => acc + (t.netAmount || 0), 0);

  const pendingAmount = transactions
    .filter(t => t.status === 'pending' || t.status === 'scheduled')
    .reduce((acc, t) => acc + (t.amount || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
       
       {/* HEADER */}
       <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-gradient-to-r from-[#7b2cbf]/10 to-transparent p-8 rounded-3xl border border-[#7b2cbf]/20">
          <div>
              <h1 className="text-4xl font-black italic text-white uppercase flex items-center gap-3">
                  <DollarSign className="text-[#00f5d4] w-10 h-10"/> {t('finance_title')}
              </h1>
              <p className="text-gray-400 mt-2 text-sm font-medium">Suivez vos encaissements et planifiez les paiements futurs.</p>
          </div>
          <div className="flex gap-3 flex-wrap">
              <Button onClick={() => setIsBankOpen(true)} variant="outline" className="border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white font-bold h-12">
                 <Landmark className="mr-2 h-4 w-4"/> {t('bank_account')}
              </Button>
              <Button onClick={() => setIsInvoiceOpen(true)} className="bg-[#00f5d4] text-black font-black hover:bg-[#00f5d4]/80 h-12 shadow-[0_0_20px_rgba(0,245,212,0.3)]">
                 <Send className="mr-2 h-4 w-4"/> {t('send_invoice')}
              </Button>
          </div>
       </div>

       {/* KPIs */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-[#1a1a20] border-l-4 border-l-[#00f5d4] border-gray-800">
             <CardContent className="pt-6">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t('income_month')} (Net)</p>
                <h3 className="text-4xl font-black text-white mt-2">{monthlyRevenue.toFixed(2)}$</h3>
             </CardContent>
          </Card>
          
          <Card className="bg-[#1a1a20] border-l-4 border-l-orange-500 border-gray-800 relative overflow-hidden">
             <div className="absolute right-0 top-0 h-full w-20 bg-gradient-to-l from-orange-500/10 to-transparent"></div>
             <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t('pending_payments')}</p>
                    <Clock className="text-orange-500 h-5 w-5"/>
                </div>
                <h3 className="text-4xl font-black text-white mt-2">{pendingAmount.toFixed(2)}$</h3>
                <div className="flex items-center text-orange-400 text-xs font-bold mt-2">
                    <AlertCircle size={14} className="mr-1"/> 
                    {transactions.filter(t => t.status === 'pending').length} Factures + {transactions.filter(t => t.status === 'scheduled').length} Planifiés
                </div>
             </CardContent>
          </Card>

          <Card className="bg-[#1a1a20] border-l-4 border-l-[#7b2cbf] border-gray-800">
             <CardContent className="pt-6">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t('active_subs')}</p>
                <h3 className="text-4xl font-black text-white mt-2">{plans.length}</h3>
             </CardContent>
          </Card>
       </div>

       {/* --- CALENDRIER --- */}
       <div className="grid grid-cols-1 gap-8">
           <Card className="bg-[#1a1a20] border-gray-800">
               <CardHeader className="flex flex-row items-center justify-between">
                   <CardTitle className="text-white flex items-center"><CalendarIcon className="mr-2 text-[#9d4edd]"/> Calendrier</CardTitle>
                   <div className="flex items-center gap-4 bg-black/40 p-2 rounded-lg">
                        <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-white/10 rounded"><ChevronLeft size={16} className="text-white"/></button>
                        {/* DATE DYNAMIQUE SELON LA LANGUE */}
                        <span className="font-bold text-white text-sm capitalize w-32 text-center">
                            {currentDate.toLocaleString(i18n.language, { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={() => changeMonth(1)} className="p-1 hover:bg-white/10 rounded"><ChevronRight size={16} className="text-white"/></button>
                   </div>
               </CardHeader>
               <CardContent>
                   <div className="grid grid-cols-7 gap-4 mb-2 text-center">
                       {['L','M','M','J','V','S','D'].map(d => <span key={d} className="text-xs font-bold text-gray-500 uppercase">{d}</span>)}
                   </div>
                   <div className="grid grid-cols-7 gap-2">
                       {renderCalendar()}
                   </div>
                   <div className="mt-4 flex gap-4 text-xs text-gray-500">
                       <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#7b2cbf] mr-2"></div> {t('scheduled')}</span>
                       <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#00f5d4] mr-2"></div> Auj.</span>
                   </div>
               </CardContent>
           </Card>
       </div>

       {/* LISTE TRANSACTIONS */}
       <Card className="bg-[#1a1a20] border-gray-800">
          <CardHeader><CardTitle className="text-white">{t('history')}</CardTitle></CardHeader>
          <CardContent>
             <div className="space-y-3">
                {transactions.length > 0 ? transactions.slice(0, 5).map(t => (
                   <div key={t.id} className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-gray-800 group hover:border-[#00f5d4] transition-colors">
                      <div className="flex items-center gap-4">
                         <div className={`p-3 rounded-full ${t.status === 'paid' ? 'bg-green-500/10 text-green-500' : (t.status === 'scheduled' ? 'bg-[#7b2cbf]/10 text-[#7b2cbf]' : 'bg-orange-500/10 text-orange-500')}`}>
                            <DollarSign size={20}/>
                         </div>
                         <div>
                            <p className="text-white font-bold">{t.clientName}</p>
                            <p className="text-gray-500 text-xs">
                                {t.dateObj.toLocaleDateString()}
                            </p>
                         </div>
                      </div>
                      <div className="flex items-center gap-4">
                         <div className="text-right">
                             <p className="text-white font-black">{t.amount}$</p>
                             <Badge variant="outline" className="border-none text-[10px] bg-white/5 text-gray-400 capitalize">
                                {t.status === 'scheduled' ? t('scheduled') : (t.status === 'paid' ? t('paid') : t('pending'))}
                             </Badge>
                         </div>
                         
                         {t.status !== 'paid' && (
                             <div className="flex gap-1">
                                 {t.status === 'scheduled' && (
                                     <Button onClick={() => updateStatus(t.id, 'pending')} size="icon" variant="ghost" className="h-8 w-8 text-[#00f5d4] hover:bg-[#00f5d4]/10">
                                         <Send size={14}/>
                                     </Button>
                                 )}
                                 <Button onClick={() => updateStatus(t.id, 'paid')} size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10">
                                     <CheckCircle2 size={14}/>
                                 </Button>
                             </div>
                         )}
                      </div>
                   </div>
                )) : <p className="text-center text-gray-500 py-4">...</p>}
             </div>
          </CardContent>
       </Card>

       {/* --- MODALS --- */}

       {/* 1. PLANIFIER PAIEMENT */}
       <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl">
            <DialogHeader>
                <DialogTitle>Planifier</DialogTitle>
                <DialogDescription>{selectedDateForEvent?.toLocaleDateString()}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">Client</label>
                    <Input value={scheduleData.clientName} onChange={(e) => setScheduleData({...scheduleData, clientName: e.target.value})} className="bg-black border-gray-700 text-white"/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">Montant ($)</label>
                    <Input type="number" value={scheduleData.amount} onChange={(e) => setScheduleData({...scheduleData, amount: e.target.value})} className="bg-black border-gray-700 text-white"/>
                </div>
            </div>
            <DialogFooter><Button onClick={handleSchedulePayment} className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white font-bold w-full rounded-xl">{t('save')}</Button></DialogFooter>
        </DialogContent>
       </Dialog>

       {/* 2. FACTURE STANDARD */}
       <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl">
            <DialogHeader><DialogTitle>{t('send_invoice')}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">Client</label>
                    <Select onValueChange={(val) => setInvoiceData({...invoiceData, clientId: val})}>
                        <SelectTrigger className="bg-black border-gray-700 text-white"><SelectValue/></SelectTrigger>
                        <SelectContent className="bg-[#1a1a20] border-gray-700 text-white">
                            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">Montant ($)</label>
                    <Input type="number" value={invoiceData.amount} onChange={(e) => setInvoiceData({...invoiceData, amount: e.target.value})} className="bg-black border-gray-700 text-white"/>
                </div>
            </div>
            <DialogFooter><Button onClick={handleCreateInvoice} className="bg-[#00f5d4] text-black font-bold w-full rounded-xl">{t('send_invoice')}</Button></DialogFooter>
        </DialogContent>
       </Dialog>

       {/* 3. BANQUE */}
       <Dialog open={isBankOpen} onOpenChange={setIsBankOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl">
            <DialogHeader><DialogTitle>{t('bank_account')}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <Input placeholder="Titulaire" className="bg-black border-gray-700 text-white"/>
                <Input placeholder="IBAN / Transit" className="bg-black border-gray-700 text-white"/>
            </div>
            <DialogFooter><Button onClick={() => setIsBankOpen(false)} className="bg-[#00f5d4] text-black font-bold w-full rounded-xl">{t('save')}</Button></DialogFooter>
        </DialogContent>
       </Dialog>

    </div>
  );
}