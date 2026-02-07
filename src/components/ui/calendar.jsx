import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 w-full", className)}
      classNames={{
        months: "flex flex-col space-y-4 w-full",
        month: "space-y-4 w-full",
        caption: "flex justify-center pt-1 relative items-center mb-4",
        caption_label: "text-sm font-black uppercase text-[#9d4edd] italic tracking-widest",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-white/5 p-0 opacity-50 hover:opacity-100 border-gray-800"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        
        // --- STRUCTURE GRILLE ---
        table: "w-full border-collapse block", // On passe en block pour que la grille fonctionne
        thead: "block w-full",
        tbody: "block w-full",
        
        // Jours de la semaine : 7 colonnes
        head_row: "grid grid-cols-7 w-full mb-2",
        head_cell: "text-gray-500 font-bold text-[10px] uppercase text-center",
        
        // Lignes de dates : 7 colonnes
        row: "grid grid-cols-7 w-full mt-2",
        
        cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 w-full flex justify-center items-center h-10",
        
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-bold aria-selected:opacity-100 text-gray-300 hover:bg-white/10 rounded-xl transition-all"
        ),
        
        // EFFET MAUVE GLOW
        day_selected:
          "bg-[#9d4edd] !important text-white !important hover:bg-[#7b2cbf] !important shadow-[0_0_15px_rgba(157,78,221,0.8)] border border-white/20 scale-110 font-black z-10",
        
        day_today: "border border-[#00f5d4] text-[#00f5d4]",
        day_outside: "text-gray-600 opacity-50",
        day_disabled: "text-gray-600 opacity-20",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4 text-[#9d4edd]", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4 text-[#9d4edd]", className)} {...props} />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
