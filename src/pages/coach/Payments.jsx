import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Payments() {
  // Données factices pour l'instant
  const transactions = [
    { id: 1, client: "Sophie Martin", date: "Auj. 10:23", amount: 120, status: "completed", plan: "Suivi Premium" },
    { id: 2, client: "Marc Dupont", date: "Hier", amount: 80, status: "completed", plan: "Programme Perso" },
    { id: 3, client: "Julie L.", date: "12 Jan", amount: 120, status: "failed", plan: "Suivi Premium" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
       <div className="flex justify-between items-end">
          <h1 className="text-4xl font-black italic text-white uppercase">Finance</h1>
          <Button className="bg-[#00f5d4] text-black font-bold hover:bg-[#00f5d4]/80">
             <CreditCard className="mr-2 h-4 w-4"/> Configurer Stripe
          </Button>
       </div>

       {/* KPIs */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="kb-card border-l-4 border-l-[#00f5d4]">
             <CardContent className="pt-6">
                <p className="text-gray-400 text-xs font-bold uppercase">Revenus ce mois</p>
                <h3 className="text-4xl font-black text-white mt-1">3,450$</h3>
                <div className="flex items-center text-[#00f5d4] text-xs font-bold mt-2"><TrendingUp size={14} className="mr-1"/> +12% vs dec.</div>
             </CardContent>
          </Card>
          <Card className="kb-card border-l-4 border-l-[#7b2cbf]">
             <CardContent className="pt-6">
                <p className="text-gray-400 text-xs font-bold uppercase">Abonnements Actifs</p>
                <h3 className="text-4xl font-black text-white mt-1">24</h3>
                <p className="text-gray-500 text-xs mt-2">Clients récurrents</p>
             </CardContent>
          </Card>
          <Card className="kb-card border-l-4 border-l-red-500">
             <CardContent className="pt-6">
                <p className="text-gray-400 text-xs font-bold uppercase">Paiements en attente</p>
                <h3 className="text-4xl font-black text-white mt-1">120$</h3>
                <div className="flex items-center text-red-400 text-xs font-bold mt-2"><AlertCircle size={14} className="mr-1"/> 1 Action requise</div>
             </CardContent>
          </Card>
       </div>

       {/* TABLEAU */}
       <Card className="kb-card border-0">
          <CardHeader><CardTitle className="text-white">Transactions Récentes</CardTitle></CardHeader>
          <CardContent>
             <div className="space-y-4">
                {transactions.map(t => (
                   <div key={t.id} className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-gray-800">
                      <div className="flex items-center gap-4">
                         <div className={`p-3 rounded-full ${t.status === 'completed' ? 'bg-[#00f5d4]/10 text-[#00f5d4]' : 'bg-red-500/10 text-red-500'}`}>
                            <DollarSign size={20}/>
                         </div>
                         <div>
                            <p className="text-white font-bold">{t.client}</p>
                            <p className="text-gray-500 text-xs">{t.plan} • {t.date}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-white font-black text-lg">{t.amount}$</p>
                         <Badge variant="outline" className={`border-none ${t.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {t.status === 'completed' ? 'Payé' : 'Échoué'}
                         </Badge>
                      </div>
                   </div>
                ))}
             </div>
          </CardContent>
       </Card>
    </div>
  );
}