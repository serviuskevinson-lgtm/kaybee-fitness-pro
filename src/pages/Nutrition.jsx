import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db, app } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { getDatabase, ref, onValue } from "firebase/database";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Apple, Beef, Wheat, Droplets, Candy, Activity, Utensils } from 'lucide-react';
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
        const userSnap = await getDoc(doc(db, "users", targetId));
        if (userSnap.exists()) setUserProfile(userSnap.data());

        const q = query(
          collection(db, "users", targetId, "nutrition_history"),
          orderBy("timestamp", "desc"),
          limit(30)
        );
        const snap = await getDocs(q);
        setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

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

  if (loading) return <div className="h-screen bg-[#0a0a0f] flex items-center justify-center text-[#00f5d4] font-black uppercase animate-pulse">Sync Nutrition...</div>;

  return (
    <div className="p-2 sm:p-4 lg:p-8 bg-[#0a0a0f] min-h-screen text-white pb-32 overflow-x-hidden">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-[#1a1a20] p-5 rounded-2xl border border-gray-800 shadow-xl">
          <h1 className="text-2xl sm:text-4xl font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
            <Apple className="text-[#00f5d4] size-8 sm:size-10" /> {t('nutrition_history')}
          </h1>
          {isCoachView && <Badge className="bg-[#7b2cbf] text-white mt-2 text-[10px] uppercase font-black">VUE COACH</Badge>}
        </div>

        {/* LIVE MACROS COMPACT */}
        {liveMacros && (
            <Card className="bg-gradient-to-br from-[#1a1a20] to-[#0a0a0f] border-[#00f5d4]/30 border-2 rounded-2xl overflow-hidden shadow-2xl">
                <CardHeader className="p-4 border-b border-white/5 flex flex-row items-center justify-between bg-white/5">
                    <CardTitle className="text-white flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest"><Activity className="text-[#00f5d4]" size={14}/> Nutrition du jour</CardTitle>
                    <Badge className="bg-[#00f5d4] text-black font-black">{Math.round(liveMacros.calories || 0)} KCAL</Badge>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4">
                    <MacroItem label="Prot" value={liveMacros.protein} goal={goals.protein} color="#3b82f6" icon={Beef} />
                    <MacroItem label="Gluc" value={liveMacros.carbs} goal={goals.carbs} color="#00f5d4" icon={Wheat} />
                    <MacroItem label="Lip" value={liveMacros.fats} goal={goals.fats} color="#f59e0b" icon={Droplets} />
                    <MacroItem label="Fibre" value={liveMacros.fiber} goal={goals.fiber} color="#10b981" icon={Utensils} />
                    <MacroItem label="Sucre" value={liveMacros.sugar} goal={goals.sugar} color="#ec4899" icon={Candy} />
                </CardContent>
            </Card>
        )}

        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-2">Historique</h3>
          {history.length === 0 ? (
            <div className="py-20 text-center text-gray-600 bg-black/20 rounded-2xl border-2 border-dashed border-gray-800">
              <Utensils size={40} className="mx-auto mb-2 opacity-20" />
              <p className="font-black uppercase italic text-xs">Aucun historique</p>
            </div>
          ) : (
            history.map((day) => (
              <Card key={day.id} className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    <div className="p-4 sm:p-6 bg-black/20 sm:w-40 flex flex-col justify-center items-center text-center border-b sm:border-b-0 sm:border-r border-gray-800">
                      <p className="text-[10px] font-black text-[#7b2cbf] uppercase mb-1">
                        {day.date ? format(new Date(day.date), 'EEE d MMM', { locale: fr }) : "..."}
                      </p>
                      <p className="text-2xl font-black text-white">{Math.round(day.calories || 0)}</p>
                      <p className="text-[8px] font-bold text-gray-600 uppercase">KCAL</p>
                    </div>
                    <div className="flex-1 p-4 grid grid-cols-3 sm:grid-cols-5 gap-3">
                      <MacroMini label="P" value={day.protein} color="text-blue-400" />
                      <MacroMini label="G" value={day.carbs} color="text-[#00f5d4]" />
                      <MacroMini label="L" value={day.fats} color="text-orange-400" />
                      <MacroMini label="F" value={day.fiber} color="text-emerald-400" />
                      <MacroMini label="S" value={day.sugar} color="text-pink-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MacroItem({ label, value = 0, goal, color, icon: Icon }) {
  const percent = Math.min(100, (value / (goal || 1)) * 100);
  return (
    <div className="bg-black/40 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center">
      <Icon size={12} style={{ color }} className="mb-1" />
      <p className="text-[7px] font-black text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-xs font-black italic mb-1" style={{ color }}>{Math.round(value)}g</p>
      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full transition-all duration-1000" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function MacroMini({ label, value, color }) {
    return (
        <div className="text-center">
            <p className={`text-[10px] font-black ${color}`}>{Math.round(value || 0)}g</p>
            <p className="text-[7px] text-gray-600 font-bold uppercase">{label}</p>
        </div>
    );
}
