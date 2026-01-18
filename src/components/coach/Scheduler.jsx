import React from 'react';
import { Calendar as CalendarIcon, Clock, Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function Scheduler() {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentDay = today.getDate();

  return (
    <div className="bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 shadow-xl h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black uppercase italic flex items-center gap-2 text-white">
          <CalendarIcon className="text-[#9d4edd]" /> Agenda Coach
        </h3>
        <Button size="sm" className="bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80 font-bold text-xs">
           <Plus size={14} className="mr-1"/> RDV
        </Button>
      </div>

      {/* Grille Calendrier Simplifiée */}
      <div className="grid grid-cols-7 gap-1 mb-4 text-center">
         {['L','M','M','J','V','S','D'].map(d => <div key={d} className="text-xs text-gray-500 font-bold">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 flex-1">
         {Array.from({length: daysInMonth}).map((_, i) => {
             const day = i + 1;
             const isToday = day === currentDay;
             const hasEvent = [5, 12, 18, 24].includes(day); // Simulation
             
             return (
                 <div key={i} className={`aspect-square rounded-lg flex items-center justify-center text-xs relative
                     ${isToday ? 'bg-[#7b2cbf] text-white font-bold' : 'bg-black/20 text-gray-400 hover:bg-white/5'}
                 `}>
                     {day}
                     {hasEvent && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[#00f5d4]"></div>}
                 </div>
             )
         })}
      </div>

      {/* Prochains RDV */}
      <div className="mt-4 space-y-2 border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-500 font-bold uppercase mb-2">Aujourd'hui</p>
          <div className="flex items-center gap-3 p-2 rounded-lg bg-black/40 border-l-2 border-[#00f5d4]">
              <Clock size={14} className="text-gray-400"/>
              <div>
                  <p className="text-sm font-bold text-white">14:00 - Sophie M.</p>
                  <p className="text-[10px] text-gray-500">Bilan Mensuel</p>
              </div>
          </div>
      </div>
    </div>
  );
}