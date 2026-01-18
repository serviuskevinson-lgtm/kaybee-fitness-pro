import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { 
  UserCheck, DollarSign, Clock, FileText, AlertTriangle, 
  MessageSquare, XCircle, CheckCircle2, TrendingUp 
} from 'lucide-react';

export default function MyCoach() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  
  const [coach, setCoach] = useState(null);
  const [logs, setLogs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");

  // Récupérer les infos du coach actuel
  useEffect(() => {
    const fetchCoachData = async () => {
      if (!currentUser?.uid) return;

      try {
        // 1. Récupérer mon profil pour avoir l'ID du coach
        const myProfileRef = doc(db, "users", currentUser.uid);
        const myProfileSnap = await getDocs(query(collection(db, "users"), where("uid", "==", currentUser.uid)));
        
        if (!myProfileSnap.empty) {
            const myData = myProfileSnap.docs[0].data();
            
            if (myData.coachId) {
                // 2. Récupérer le profil du Coach
                const coachRef = doc(db, "users", myData.coachId);
                const coachSnap = await getDoc(coachRef);
                if (coachSnap.exists()) {
                    setCoach({ id: coachSnap.id, ...coachSnap.data() });
                }

                // 3. Récupérer les logs (Activités du coach sur mon compte)
                // Note: Tu devras créer ces logs quand le coach ajoute un truc
                const logsQ = query(
                    collection(db, "logs"), 
                    where("clientId", "==", currentUser.uid),
                    orderBy("createdAt", "desc")
                );
                const logsSnap = await getDocs(logsQ);
                setLogs(logsSnap.docs.map(d => d.data()));

                // 4. Récupérer les factures (Paiements)
                const invQ = query(
                    collection(db, "invoices"),
                    where("clientId", "==", currentUser.uid),
                    orderBy("createdAt", "desc")
                );
                const invSnap = await getDocs(invQ);
                setInvoices(invSnap.docs.map(d => ({id: d.id, ...d.data()})));
            }
        }
      } catch (e) {
        console.error("Erreur fetch MyCoach", e);
      } finally {
        setLoading(false);
      }
    };
    fetchCoachData();
  }, [currentUser]);

  // Fonction Désabonnement
  const handleUnsubscribe = async () => {
    // Vérifier balance
    const unpaid = invoices.filter(i => i.status === 'pending');
    if (unpaid.length > 0) {
        alert(t('pay_debt_first'));
        return;
    }

    if (!window.confirm(t('confirm_unsubscribe'))) return;

    try {
        // Envoyer notif au coach
        await addDoc(collection(db, "notifications"), {
            recipientId: coach.id,
            senderId: currentUser.uid,
            type: "unsubscribe_request",
            title: "Désinscription Client",
            message: `${currentUser.email} a mis fin au coaching.`,
            read: false,
            createdAt: new Date().toISOString()
        });

        // Retirer le coach de mon profil
        const userDocs = await getDocs(query(collection(db, "users"), where("uid", "==", currentUser.uid)));
        const myDocId = userDocs.docs[0].id;
        
        await updateDoc(doc(db, "users", myDocId), {
            coachId: null,
            coachName: null
        });

        setCoach(null);
        alert(t('unsubscribe_success'));

    } catch (e) {
        console.error(e);
        alert(t('error'));
    }
  };

  // Fonction Paiement Rapide (Simulation)
  const handleSendPayment = async () => {
      // Ici tu connecterais Stripe
      alert(`Paiement de ${payAmount}$ envoyé à ${coach.full_name} (Simulation)`);
      setIsPayOpen(false);
  };

  if (loading) return <div className="p-8 text-white">{t('loading')}</div>;

  if (!coach) return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <UserCheck size={64} className="text-gray-600"/>
        <h2 className="text-2xl font-bold text-white">{t('no_coach_title')}</h2>
        <p className="text-gray-400">{t('no_coach_desc')}</p>
        <Button className="bg-[#00f5d4] text-black font-bold" onClick={() => window.location.href='/community'}>
            {t('find_coach')}
        </Button>
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-in fade-in">
        {/* HEADER COACH */}
        <div className="bg-[#1a1a20] border border-gray-800 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6">
            <Avatar className="w-24 h-24 border-4 border-[#7b2cbf]">
                <AvatarImage src={coach.avatar} />
                <AvatarFallback className="bg-[#7b2cbf] text-white text-2xl font-black">{coach.full_name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left space-y-2">
                <h1 className="text-3xl font-black text-white italic uppercase">{coach.full_name}</h1>
                <p className="text-gray-400 text-sm flex items-center justify-center md:justify-start gap-2">
                    <CheckCircle2 size={16} className="text-[#00f5d4]"/> {t('your_coach_since')} {new Date().toLocaleDateString()}
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start mt-2">
                    <Badge variant="outline" className="border-[#7b2cbf] text-[#7b2cbf]">Suivi Mensuel</Badge>
                    <Badge variant="outline" className="border-gray-600 text-gray-400">{coach.specialties?.[0]}</Badge>
                </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto">
                <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#00f5d4] text-black font-black hover:bg-[#00f5d4]/80">
                            <DollarSign size={18} className="mr-2"/> {t('make_payment')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                        <DialogHeader><DialogTitle>Envoyer un paiement</DialogTitle></DialogHeader>
                        <div className="py-4 space-y-4">
                            <p className="text-sm text-gray-400">Montant à envoyer à {coach.full_name}</p>
                            <Input 
                                type="number" 
                                value={payAmount} 
                                onChange={(e) => setPayAmount(e.target.value)} 
                                className="bg-black border-gray-700 text-white text-lg font-bold"
                                placeholder="0.00"
                            />
                            <Button onClick={handleSendPayment} className="w-full bg-[#7b2cbf] text-white font-bold">Valider Paiement</Button>
                        </div>
                    </DialogContent>
                </Dialog>
                
                <Button variant="outline" className="border-red-500/50 text-red-500 hover:bg-red-500/10" onClick={handleUnsubscribe}>
                    <XCircle size={18} className="mr-2"/> {t('stop_coaching')}
                </Button>
            </div>
        </div>

        {/* CONTENU */}
        <Tabs defaultValue="logs" className="w-full">
            <TabsList className="bg-[#1a1a20] border border-gray-800 w-full justify-start p-1">
                <TabsTrigger value="logs" className="flex-1 data-[state=active]:bg-[#7b2cbf]">{t('activity_log')}</TabsTrigger>
                <TabsTrigger value="finance" className="flex-1 data-[state=active]:bg-[#7b2cbf]">{t('finance')}</TabsTrigger>
                <TabsTrigger value="rates" className="flex-1 data-[state=active]:bg-[#7b2cbf]">{t('rates')}</TabsTrigger>
            </TabsList>

            {/* ONGLET JOURNAL (LOGS) */}
            <TabsContent value="logs" className="mt-4 space-y-4">
                <Card className="bg-[#1a1a20] border-gray-800">
                    <CardHeader><CardTitle className="text-white text-sm uppercase flex items-center gap-2"><FileText size={16} className="text-[#00f5d4]"/> Dernières Mises à jour</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {logs.length > 0 ? logs.map((log, i) => (
                            <div key={i} className="flex items-start gap-4 pb-4 border-b border-gray-800/50 last:border-0 last:pb-0">
                                <div className="bg-[#7b2cbf]/20 p-2 rounded-full mt-1">
                                    <TrendingUp size={16} className="text-[#9d4edd]"/>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-bold">{log.action}</p>
                                    <p className="text-gray-500 text-xs">{new Date(log.createdAt).toLocaleDateString()} - {log.details}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-gray-500 text-sm italic text-center py-4">Rien à signaler pour le moment.</p>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            {/* ONGLET FINANCE */}
            <TabsContent value="finance" className="mt-4">
                <Card className="bg-[#1a1a20] border-gray-800">
                    <CardHeader><CardTitle className="text-white text-sm uppercase flex items-center gap-2"><DollarSign size={16} className="text-[#00f5d4]"/> Historique & Dettes</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {invoices.map((inv) => (
                            <div key={inv.id} className="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-gray-800">
                                <div>
                                    <p className="text-white font-bold text-sm">{inv.description}</p>
                                    <p className="text-xs text-gray-500">{new Date(inv.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-bold">{inv.amount}$</p>
                                    <Badge className={inv.status === 'paid' ? 'bg-green-500/20 text-green-500' : 'bg-orange-500/20 text-orange-500'}>
                                        {inv.status === 'paid' ? t('paid') : t('pending')}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                        {invoices.length === 0 && <p className="text-gray-500 text-center text-sm py-4">Aucune facture.</p>}
                    </CardContent>
                </Card>
            </TabsContent>

            {/* ONGLET TARIFS */}
            <TabsContent value="rates" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Exemple statique, à connecter aux données réelles du coach */}
                    <Card className="bg-[#1a1a20] border-gray-800 hover:border-[#7b2cbf] cursor-pointer transition-colors">
                        <CardContent className="p-6">
                            <h3 className="text-white font-bold text-lg mb-2">Plan Premium</h3>
                            <p className="text-gray-400 text-xs mb-4">Coaching complet + Nutrition + Chat 24/7</p>
                            <div className="flex justify-between items-end">
                                <span className="text-2xl font-black text-[#00f5d4]">150$</span>
                                <Button size="sm" variant="outline" className="text-xs border-[#7b2cbf] text-[#7b2cbf]">Changer</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
        </Tabs>
    </div>
  );
}