import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, app } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { getDatabase, ref, onValue } from "firebase/database";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Utensils, Calendar, ChevronRight, Apple, Beef, Wheat, Droplets, Candy, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Nutrition() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId } = useClient();
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [liveMacros, setLiveMacros] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  const targetId = targetUserId || currentUser?.uid;
  const rtdb = getDatabase(app);

  // Objectifs par défaut ou venant du profil
  const goals = {
    calories: userProfile?.dailyCaloriesGoal || 2000,
    protein: userProfile?.dailyProteinGoal || 150,
    carbs: userProfile?.dailyCarbsGoal || 200,
    fats: userProfile?.dailyFatsGoal || 70,
    fiber: 30,
    sugar: 50
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!targetId) return;
      setLoading(true);
      try {
        // 1. Profil pour les objectifs
        const userSnap = await getDoc(doc(db, "users", targetId));
        if (userSnap.exists()) setUserProfile(userSnap.data());

        // 2. Historique Firestore
        const q = query(
          collection(db, "users", targetId, "nutrition_history"),
          orderBy("timestamp", "desc"),
          limit(30)
        );
        const snap = await getDocs(q);
        setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // 3. Live Data RTDB (pour voir ce que le client mange AUJOURD'HUI)
        const nutritionRef = ref(rtdb, `users/${targetId}/live_data/nutrition`);
        onValue(nutritionRef, (snapshot) => {
            if (snapshot.exists()) {
                setLiveMacros(snapshot.val());
            }
        });

      } catch (e) {
        console.error("Erreur nutrition:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [targetId, rtdb]);

  if (loading) return <div className="p-8 text-white">{t('loading')}...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
            <Apple className="text-[#00f5d4] w-10 h-10" /> {t('nutrition_history')}
          </h1>
          {isCoachView && <Badge className="bg-[#7b2cbf] text-white">VUE COACH (LIVE)</Badge>}
        </div>
      </div>

      {/* LIVE MACROS (TODAY) */}
      {liveMacros && (
          <Card className="bg-gradient-to-br from-[#1a1a20] to-[#0a0a0f] border-[#00f5d4]/30 border-2">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2 text-sm font-black uppercase"><Activity className="text-[#00f5d4]"/> Nutrition du jour (Live)</CardTitle>
                  <Badge variant="outline" className="text-[#00f5d4] border-[#00f5d4]">{Math.round(liveMacros.calories || 0)} KCAL</Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-4">
                  <MacroProgress label="Prot" value={liveMacros.protein} goal={goals.protein} color="#3b82f6" icon={Beef} />
                  <MacroProgress label="Gluc" value={liveMacros.carbs} goal={goals.carbs} color="#00f5d4" icon={Wheat} />
                  <MacroProgress label="Lip" value={liveMacros.fats} goal={goals.fats} color="#f59e0b" icon={Droplets} />
                  <MacroProgress label="Fibres" value={liveMacros.fiber} goal={goals.fiber} color="#10b981" icon={ChevronRight} />
                  <MacroProgress label="Sucre" value={liveMacros.sugar} goal={goals.sugar} color="#ec4899" icon={Candy} />
              </CardContent>
          </Card>
      )}

      {history.length === 0 ? (
        <Card className="bg-[#1a1a20] border-dashed border-gray-800 p-12 text-center">
          <Utensils className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-500 italic">Aucun historique nutritionnel.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2">Historique des 30 derniers jours</p>
          {history.map((day) => (
            <Card key={day.id} className="bg-[#1a1a20] border-gray-800 hover:border-[#7b2cbf]/50 transition-all overflow-hidden group">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  <div className="p-6 bg-black/20 md:w-48 flex flex-col justify-center items-center text-center border-b md:border-b-0 md:border-r border-gray-800">
                    <p className="text-xs font-bold text-[#7b2cbf] uppercase mb-1">
                      {day.date ? format(new Date(day.date), 'EEEE d MMMM', { locale: fr }) : "Date inconnue"}
                    </p>
                    <p className="text-3xl font-black text-white">{Math.round(day.calories || 0)}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">KCAL</p>
                  </div>
                  <div className="flex-1 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    <MacroProgress label="Protéines" value={day.protein} goal={goals.protein} color="#3b82f6" icon={Beef} />
                    <MacroProgress label="Glucides" value={day.carbs} goal={goals.carbs} color="#00f5d4" icon={Wheat} />
                    <MacroProgress label="Lipides" value={day.fats} goal={goals.fats} color="#f59e0b" icon={Droplets} />
                    <MacroProgress label="Fibres" value={day.fiber} goal={goals.fiber} color="#10b981" icon={ChevronRight} />
                    <MacroProgress label="Sucre" value={day.sugar} goal={goals.sugar} color="#ec4899" icon={Candy} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MacroProgress({ label, value = 0, goal, color, icon: Icon }) {
  const percent = Math.min(100, (value / (goal || 1)) * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <Icon size={12} style={{ color }} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{label}</span>
        </div>
        <span className="text-[10px] font-black text-white">{Math.round(value)}g</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full transition-all duration-1000" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
