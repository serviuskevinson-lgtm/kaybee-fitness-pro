import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function CustomCalendar({ selectedDates, onSelect }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysOfWeek = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const toggleDate = (day) => {
    const isSelected = selectedDates.find(d => isSameDay(d, day));
    if (isSelected) {
      onSelect(selectedDates.filter(d => !isSameDay(d, day)));
    } else {
      onSelect([...selectedDates, day]);
    }
  };

  return (
    <div className="w-full max-w-[320px] bg-black/40 p-4 rounded-[32px] border border-white/10 shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-2">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ChevronLeft className="text-[#9d4edd]" size={20} />
        </button>
        <h2 className="text-sm font-black uppercase text-[#9d4edd] italic tracking-widest">
          {format(currentMonth, 'MMMM yyyy', { locale: fr })}
        </h2>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ChevronRight className="text-[#9d4edd]" size={20} />
        </button>
      </div>

      {/* Days Row */}
      <div className="grid grid-cols-7 mb-4">
        {daysOfWeek.map((day) => (
          <div key={day} className="text-[10px] font-bold text-gray-500 uppercase text-center">
            {day}
          </div>
        ))}
      </div>

      {/* Dates Grid */}
      <div className="grid grid-cols-7 gap-y-2">
        {calendarDays.map((day, idx) => {
          const isSelected = selectedDates.find(d => isSameDay(d, day));
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isToday = isSameDay(day, new Date());

          return (
            <div key={idx} className="flex justify-center items-center h-10">
              <button
                onClick={() => toggleDate(day)}
                className={`
                  w-9 h-9 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center
                  ${!isCurrentMonth ? 'text-gray-800 opacity-20' : 'text-gray-300'}
                  ${isToday && !isSelected ? 'border border-[#00f5d4]/50 text-[#00f5d4]' : ''}
                  ${isSelected
                    ? 'bg-[#9d4edd] text-white shadow-[0_0_20px_rgba(157,78,221,0.9)] border border-white/30 scale-110 font-black'
                    : 'hover:bg-white/10'}
                `}
              >
                {format(day, 'd')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
