import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { format, isSameDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Dumbbell, Activity, Calendar as CalendarIcon,
  ArrowLeft, Zap, Layers, Flame, Target, Zap as ZapIcon, Repeat, TrendingUp, TrendingDown, Link2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from 'react-router-dom';

const SET_TYPE_INFO = {
  straight: { name: 'Série Classique', icon: Dumbbell, color: 'bg-gray-600' },
  superset_antagonist: { name: 'Superset Antagoniste', icon: Link2, color: 'bg-blue-600' },
  superset_agonist: { name: 'Superset Agoniste', icon: Flame, color: 'bg-orange-600' },
  pre_exhaustion: { name: 'Pré-fatigue', icon: Target, color: 'bg-red-600' },
  triset: { name: 'Tri-Set', icon: Layers, color: 'bg-purple-600' },
  giant_set: { name: 'Série Géante', icon: ZapIcon, color: 'bg-yellow-600' },
  dropset: { name: 'Drop Set', icon: TrendingDown, color: 'bg-pink-600' },
  pyramid: { name: 'Pyramide', icon: TrendingUp, color: 'bg-emerald-600' },
  reverse_pyramid: { name: 'Pyramide Inversée', icon: Repeat, color: 'bg-cyan-600' }
};

export default function WorkoutAgenda() {
  const { currentUser } = useAuth();
  const { targetUserId } = useClient();
  const navigate = useNavigate();
  const [viewDate, setViewDate] = useState(new Date());
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);

  const targetId = targetUserId || currentUser?.uid;

  useEffect(() => {
    const fetchWorkout = async () => {
      if (!targetId) return;
      setLoading(true);
      try {
        const docSnap = await getDoc(doc(db, "users", targetId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          const dateKey = `Exercise-${format(viewDate, 'MM-dd-yyyy')}`;
          const foundWorkout = data[dateKey];

          if (foundWorkout) {
            // Normalisation si besoin
            if (foundWorkout.exercises && !foundWorkout.groups) {
              foundWorkout.groups = foundWorkout.exercises.map(ex => ({
                id: Math.random(),
                setType: 'straight',
                exercises: [ex],
                sets: ex.sets || 3,
                rest: ex.rest || 60
              }));
            }
            setWorkout(foundWorkout);
          } else {
            setWorkout(null);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkout();
  }, [targetId, viewDate]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6 pb-32 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full bg-white/5">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-2xl font-black italic uppercase tracking-tighter">Mon Agenda</h1>
      </div>

      {/* Date Navigation */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between mb-8 bg-[#1a1a20]/50 p-2 rounded-2xl border border-white/5">
        <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addDays(prev, -1))} className="text-gray-400 hover:text-white">
          <ChevronLeft size={24} />
        </Button>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#7b2cbf]">
            {isSameDay(viewDate, new Date()) ? "Aujourd'hui" : format(viewDate, 'EEEE', { locale: fr })}
          </span>
          <span className="text-lg font-bold italic">
            {format(viewDate, 'd MMMM yyyy', { locale: fr })}
          </span>
        </div>

        <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addDays(prev, 1))} className="text-gray-400 hover:text-white">
          <ChevronRight size={24} />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : workout ? (
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black italic uppercase text-white">{workout.name}</h2>
            <p className="text-gray-500 text-sm">{workout.groups?.length || 0} blocs d'exercices prévus.</p>
          </div>

          <div className="space-y-4">
            {workout.groups?.map((group, idx) => {
              const typeInfo = SET_TYPE_INFO[group.setType] || SET_TYPE_INFO.straight;
              const TypeIcon = typeInfo.icon;
              return (
                <div key={idx} className="bg-[#1a1a20] p-5 rounded-3xl border border-white/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <Badge className={`${typeInfo.color} text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border-none flex items-center gap-1.5`}>
                      <TypeIcon size={12}/> {typeInfo.name}
                    </Badge>
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{group.sets} SÉRIES</span>
                  </div>
                  <div className="space-y-3">
                    {group.exercises.map((exo, eIdx) => (
                      <div key={eIdx} className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-black/40 overflow-hidden shrink-0 border border-white/5">
                          {exo.imageUrl ? <img src={exo.imageUrl} className="w-full h-full object-cover" /> : <Activity size={20} className="m-3 text-gray-700"/>}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-white uppercase italic text-sm truncate">{exo.name}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase">{exo.reps || "10-12"} REPS • {exo.weight || 0} LBS</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {isSameDay(viewDate, new Date()) && (
            <Button
              onClick={() => navigate('/session')}
              className="w-full h-16 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-black text-xl italic rounded-2xl shadow-lg mt-4"
            >
              <Zap size={20} className="mr-2 fill-black" /> DÉMARRER LA SÉANCE
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center py-20 space-y-6">
          <div className="p-6 bg-white/5 rounded-full inline-block text-gray-600">
            <CalendarIcon size={64} />
          </div>
          <h2 className="text-xl font-bold uppercase italic text-gray-400">Aucune séance prévue</h2>
          <Button onClick={() => navigate('/exercises')} variant="outline" className="border-[#7b2cbf] text-[#7b2cbf] hover:bg-[#7b2cbf] hover:text-white rounded-xl">
            Programmer une séance
          </Button>
        </div>
      )}
    </div>
  );
}
