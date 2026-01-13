import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Flame, Trophy, TrendingUp, Calendar, ArrowRight, Plus, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/lib/utils';
import { Zap } from 'lucide-react';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const today = new Date().getDay() - 1; // 0 = Lundi pour l'index

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) { console.error("Erreur:", error); }
    };
    loadUser();
  }, []);

  const getFirstName = () => user?.full_name?.split(' ')[0] || 'Athlète';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER AVEC BOUTON D'ACTION */}
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

      {/* STATS RAPIDES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Dumbbell} title="Séances" value="12" color="#00f5d4" />
        <StatCard icon={Flame} title="Kcal" value="14,500" color="#fdcb6e" />
        <StatCard icon={Trophy} title="Défis" value="2" color="#9d4edd" />
        <StatCard icon={TrendingUp} title="Points" value="3,450" color="#7b2cbf" />
      </div>

      {/* CALENDRIER HEBDOMADAIRE (NOUVEAU) */}
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
                
                {/* Exemple de contenu (à dynamiser plus tard) */}
                {index === 1 && <div className="text-xs bg-[#7b2cbf]/40 text-[#e0aaff] p-1 rounded mb-1 border border-[#7b2cbf]/50 truncate">Pectoraux</div>}
                {index === 3 && <div className="text-xs bg-[#7b2cbf]/40 text-[#e0aaff] p-1 rounded mb-1 border border-[#7b2cbf]/50 truncate">Jambes</div>}
                
                {/* Boutons d'ajout au survol */}
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

      {/* SECTION PRINCIPALE DIVISÉE */}
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
            
            {/* BOUTON CORRIGÉ : Lien vers Exercices */}
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
            
            {/* BOUTON CORRIGÉ : Lien vers Performance */}
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

// Composants visuels
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