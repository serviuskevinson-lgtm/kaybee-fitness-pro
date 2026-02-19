import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext'; 
import { doc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { 
  Utensils, Search, Zap, Clock, Flame, ChevronRight, ChevronLeft, Check, ChefHat, Users, UserCheck, RefreshCw, Database, Loader2, CheckCircle, Info, X, LayoutList, History as HistoryIcon, ShoppingBasket
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomCalendar from "@/components/CustomCalendar";
import { useTranslation } from 'react-i18next';
import { fr } from 'date-fns/locale';

// --- CONFIGURATION API ---
const API_KEY = "65232507";
const BASE_URL = `https://www.themealdb.com/api/json/v2/${API_KEY}/`;
const ITEMS_PER_PAGE = 24;
const FILTER_KEYS = ["Latest", "Breakfast", "Dessert", "Chicken", "Beef", "Seafood", "Vegetarian", "Pasta", "Pork", "Lamb"];

const translateMeasure = (measure) => {
    if (!measure) return "";
    let m = measure.toLowerCase();
    m = m.replace(/tbsp/g, "c.à.s").replace(/tsp/g, "c.à.c").replace(/cup/g, "tasse");
    return m;
};

export default function Meals() {
  const { currentUser } = useAuth();
  const { isCoachView, targetUserId } = useClient() || {};
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Latest");
  const [allMeals, setAllMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedMeal, setSelectedMeal] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerSelection, setPlannerSelection] = useState([]);
  const [isDaySelectOpen, setIsDaySelectOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);

  const processMealData = (m) => {
      if (!m) return null;
      const rawCat = m.strCategory || selectedCategory;
      const seed = parseInt(m.idMeal.slice(-2)) || 50;
      const randomize = (val) => Math.floor(val * (0.9 + (seed / 100) * 0.2));

      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
          const ing = m[`strIngredient${i}`];
          const measure = m[`strMeasure${i}`];
          if (ing && ing.trim() !== "") {
              ingredients.push(`${translateMeasure(measure)} ${ing}`);
          }
      }

      return {
          id: m.idMeal,
          name: m.strMeal,
          imageUrl: m.strMealThumb,
          category: t(rawCat.toLowerCase()) || rawCat,
          instructions: m.strInstructions || t('no_instructions'),
          ingredients,
          calories: randomize(450),
          protein: randomize(30),
          carbs: randomize(45),
          fat: randomize(15),
          prepTime: `${randomize(20) + 10} min`
      };
  };

  useEffect(() => {
    const fetchMeals = async () => {
      setIsLoading(true);
      try {
        let rawMeals = [];
        if (searchTerm.trim() !== "") {
            const res = await fetch(`${BASE_URL}search.php?s=${searchTerm}`);
            const data = await res.json();
            rawMeals = data.meals || [];
        } else if (selectedCategory === "Latest") {
            const letters = "abcdefghijklmnopqrstuvwxyz".split("");
            const results = await Promise.all(
                letters.slice(0, 8).map(l => fetch(`${BASE_URL}search.php?f=${l}`).then(r => r.json()))
            );
            rawMeals = results.flatMap(r => r.meals || []);
        } else {
            const listRes = await fetch(`${BASE_URL}filter.php?c=${selectedCategory}`);
            const listData = await listRes.json();
            const mealsList = (listData.meals || []).slice(0, 100);
            const detailPromises = mealsList.map(m => fetch(`${BASE_URL}lookup.php?i=${m.idMeal}`).then(res => res.json()));
            const detailsResults = await Promise.all(detailPromises);
            rawMeals = detailsResults.flatMap(r => r.meals || []);
        }

        const unique = Array.from(new Map(rawMeals.filter(m => m !== null).map(m => [m.idMeal, m])).values());
        setAllMeals(unique.map(processMealData).filter(m => m !== null));
        setCurrentPage(1);
      } catch (error) {
        console.error("Erreur chargement plats:", error);
      } finally {
        setIsLoading(false);
      }
    };
    const timeoutId = setTimeout(fetchMeals, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedCategory]);

  const totalPages = Math.ceil(allMeals.length / ITEMS_PER_PAGE);
  const currentMeals = allMeals.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const toggleMealSelection = (meal) => {
    if (plannerSelection.find(m => m.id === meal.id)) {
        setPlannerSelection(plannerSelection.filter(m => m.id !== meal.id));
    } else {
        setPlannerSelection([...plannerSelection, meal]);
    }
  };

  const handleOpenDetails = (meal) => {
    setSelectedMeal(meal);
    setIsDetailOpen(true);
  };

  const saveNutritionalPlan = async () => {
    if (!targetUserId || selectedDates.length === 0) return;
    try {
      const userRef = doc(db, "users", targetUserId || currentUser.uid);
      const plan = {
        id: Date.now().toString(),
        meals: plannerSelection.map(m => ({ ...m, eaten: false, logId: Math.random().toString(36).substr(2, 9) })),
        scheduledDays: selectedDates.map(d => d.toISOString()),
        createdAt: new Date().toISOString(),
        assignedBy: isCoachView ? 'coach' : 'self'
      };
      await updateDoc(userRef, { nutritionalPlans: arrayUnion(plan) });
      setIsDaySelectOpen(false);
      setIsPlannerOpen(false);
      setPlannerSelection([]);
      setSelectedDates([]);
      alert(t('plan_saved'));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-2 sm:p-4 lg:p-8 bg-[#0a0a0f] min-h-screen text-white pb-32 animate-in fade-in duration-500 overflow-x-hidden">
      {/* HEADER COMPACT */}
      <div className="max-w-7xl mx-auto mb-4 sm:mb-10 flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#1a1a20] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-gray-800 shadow-xl">
        <div className="text-center sm:text-left">
          <h1 className="text-xl sm:text-4xl font-black uppercase italic text-[#00f5d4] flex items-center justify-center sm:justify-start gap-2 tracking-tighter">
            <Utensils size={24} className="sm:size-[36px]" /> {t('healthy_kitchen')}
          </h1>
          <p className="text-gray-500 mt-1 text-[10px] sm:text-sm italic uppercase font-bold tracking-widest">{allMeals.length} Recettes</p>
        </div>
        <Button onClick={() => { setIsPlannerOpen(!isPlannerOpen); setPlannerSelection([]); }} className={`w-full sm:w-auto h-12 sm:h-16 ${isPlannerOpen ? 'bg-red-500' : 'bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]'} text-black font-black px-6 sm:px-8 rounded-xl sm:rounded-2xl shadow-lg transition-all text-xs sm:text-base`}>
          {isPlannerOpen ? <X className="mr-2" size={18}/> : <Zap className="mr-2 fill-black" size={18} />}
          {isPlannerOpen ? "ANNULER" : "CRÉER UN PLAN"}
        </Button>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="max-w-7xl mx-auto mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <Input placeholder={t('search_recipe_placeholder')} className="pl-12 bg-[#1a1a20] border-gray-800 h-12 text-sm rounded-xl focus:border-[#00f5d4]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {FILTER_KEYS.map(apiKey => (
            <Button
              key={apiKey}
              onClick={() => { setSelectedCategory(apiKey); setSearchTerm(""); }}
              className={`flex-shrink-0 h-9 px-4 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${selectedCategory === apiKey && !searchTerm ? "bg-[#7b2cbf] border-[#7b2cbf] text-white" : "bg-[#1a1a20] border-gray-800 text-gray-500"}`}
            >
              {t(apiKey.toLowerCase())}
            </Button>
          ))}
        </div>
      </div>

      {/* GRID : 2 COLUMNS ON MOBILE */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#00f5d4] mb-4" size={40}/>
          <p className="text-gray-500 text-xs font-black uppercase tracking-[0.2em]">Chargement...</p>
        </div>
      ) : (
        <>
          <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-6">
            {currentMeals.map((meal) => {
              const isSelected = plannerSelection.find(m => m.id === meal.id);
              return (
                <div key={meal.id} className={`bg-[#1a1a20] rounded-2xl overflow-hidden border transition-all relative ${isSelected ? 'border-[#00f5d4] ring-2 ring-[#00f5d4]/20' : 'border-gray-800'}`}>
                  {isPlannerOpen && (
                    <div className="absolute top-2 right-2 z-20">
                        <div
                          onClick={() => toggleMealSelection(meal)}
                          className={`size-8 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer ${isSelected ? 'bg-[#00f5d4] border-[#00f5d4] shadow-lg' : 'bg-black/60 border-white/50'}`}
                        >
                            {isSelected && <Check size={16} className="text-black font-black"/>}
                        </div>
                    </div>
                  )}
                  <div className="relative h-32 sm:h-48 cursor-pointer overflow-hidden" onClick={() => { if(isPlannerOpen) toggleMealSelection(meal); else handleOpenDetails(meal); }}>
                    <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a20] via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-2 left-2">
                        <Badge className="bg-black/70 text-[#00f5d4] border-none text-[7px] font-black uppercase px-1.5">{meal.category}</Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-black text-white text-[11px] mb-2 truncate italic uppercase">{meal.name}</h3>
                    <div className="grid grid-cols-3 gap-1 mb-3 text-center">
                        <div className="bg-black/40 py-1 rounded border border-white/5"><p className="text-[7px] text-blue-400 font-black uppercase">{meal.protein}g</p></div>
                        <div className="bg-black/40 py-1 rounded border border-white/5"><p className="text-[7px] text-[#00f5d4] font-black uppercase">{meal.carbs}g</p></div>
                        <div className="bg-black/40 py-1 rounded border border-white/5"><p className="text-[7px] text-orange-400 font-black uppercase">{meal.fat}g</p></div>
                    </div>
                    <Button variant="ghost" className="w-full text-[#9d4edd] h-7 text-[8px] font-black uppercase border border-[#9d4edd]/20 rounded-lg" onClick={(e) => { e.stopPropagation(); handleOpenDetails(meal); }}>
                        DÉTAILS
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PAGINATION COMPACT */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8">
              <Button variant="outline" size="icon" disabled={currentPage === 1} onClick={() => { setCurrentPage(p => p - 1); window.scrollTo(0, 0); }} className="size-9 rounded-full border-gray-800 bg-black/40 text-[#00f5d4]"><ChevronLeft size={18}/></Button>
              <span className="text-[10px] font-black text-white bg-white/5 px-4 h-9 flex items-center rounded-full border border-white/5">{currentPage} / {totalPages}</span>
              <Button variant="outline" size="icon" disabled={currentPage === totalPages} onClick={() => { setCurrentPage(p => p + 1); window.scrollTo(0, 0); }} className="size-9 rounded-full border-gray-800 bg-black/40 text-[#00f5d4]"><ChevronRight size={18}/></Button>
            </div>
          )}
        </>
      )}

      {/* MOBILE FLOATING ACTION */}
      {isPlannerOpen && plannerSelection.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6">
            <Button onClick={() => setIsDaySelectOpen(true)} className="w-full bg-[#00f5d4] text-black font-black h-14 rounded-2xl shadow-[0_0_30px_rgba(0,245,212,0.4)] flex items-center justify-center gap-3 uppercase italic">
                <ShoppingBasket size={20}/> CONFIRMER LA SÉLECTION ({plannerSelection.length})
            </Button>
        </div>
      )}

      {/* DETAIL MODAL MOBILE FRIENDLY */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto rounded-t-[2.5rem] sm:rounded-[2.5rem] p-0 shadow-2xl bottom-0 sm:bottom-auto fixed sm:relative">
          {selectedMeal && (
            <div className="flex flex-col">
              <div className="relative h-56 sm:h-80">
                <img src={selectedMeal.imageUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />
                <button onClick={() => setIsDetailOpen(false)} className="absolute top-4 right-4 bg-black/60 p-2 rounded-full text-white z-30"><X size={20}/></button>
                <div className="absolute bottom-4 left-6">
                    <Badge className="bg-[#7b2cbf] text-white border-none mb-2 px-2 py-0.5 text-[10px] font-black uppercase">{selectedMeal.category}</Badge>
                    <h2 className="text-xl sm:text-4xl font-black uppercase italic tracking-tighter leading-tight">{selectedMeal.name}</h2>
                </div>
              </div>
              <div className="p-6 sm:p-10 space-y-6">
                <div className="grid grid-cols-4 gap-2">
                    <div className="bg-white/5 p-2 rounded-xl text-center border border-white/5"><Flame className="mx-auto text-orange-500 mb-1" size={16} /><p className="text-[7px] text-gray-500 font-black uppercase">Calories</p><p className="text-[10px] font-black">{selectedMeal.calories}</p></div>
                    <div className="bg-white/5 p-2 rounded-xl text-center border border-white/5"><ChefHat className="mx-auto text-blue-400 mb-1" size={16} /><p className="text-[7px] text-gray-500 font-black uppercase">Proteines</p><p className="text-[10px] font-black">{selectedMeal.protein}g</p></div>
                    <div className="bg-white/5 p-2 rounded-xl text-center border border-white/5"><Clock className="mx-auto text-[#00f5d4] mb-1" size={16} /><p className="text-[7px] text-gray-500 font-black uppercase">Temps</p><p className="text-[10px] font-black">{selectedMeal.prepTime}</p></div>
                    <div className="bg-white/5 p-2 rounded-xl text-center border border-white/5"><Utensils className="mx-auto text-yellow-500 mb-1" size={16} /><p className="text-[7px] text-gray-500 font-black uppercase">Portion</p><p className="text-[10px] font-black">1</p></div>
                </div>
                <div className="space-y-6 pt-4">
                    <div><h4 className="font-black text-md mb-3 text-[#00f5d4] uppercase flex items-center gap-2"><LayoutList size={16}/> Ingrédients</h4><div className="grid grid-cols-1 gap-2">{selectedMeal.ingredients.map((ing, i) => <div key={i} className="text-[11px] text-gray-400 flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/5"><Check size={10} className="text-[#7b2cbf]"/> {ing}</div>)}</div></div>
                    <div><h4 className="font-black text-md mb-3 text-[#00f5d4] uppercase flex items-center gap-2"><HistoryIcon size={16}/> Préparation</h4><p className="text-[11px] text-gray-400 leading-relaxed italic border-l-2 border-[#7b2cbf] pl-4">{selectedMeal.instructions}</p></div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CALENDAR MODAL MOBILE */}
      <Dialog open={isDaySelectOpen} onOpenChange={setIsDaySelectOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white w-[95vw] rounded-[2rem] p-6 shadow-3xl">
          <DialogHeader><DialogTitle className="text-[#00f5d4] uppercase font-black italic text-center text-xl tracking-tighter">Planification</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center py-4">
            <div className="mb-6 scale-90 sm:scale-100">
                <CustomCalendar selectedDates={selectedDates} onSelect={setSelectedDates} />
            </div>
            <Button className="w-full bg-[#00f5d4] text-black font-black h-14 rounded-xl shadow-xl text-sm uppercase italic" onClick={saveNutritionalPlan} disabled={selectedDates.length === 0}>
                CONFIRMER LE PLAN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
