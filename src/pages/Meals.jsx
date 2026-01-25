import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext'; 
import { doc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { 
  Utensils, Search, Zap, Clock, Flame, ChevronRight, ChevronLeft, Check, ChefHat, Users, UserCheck, RefreshCw, Database, Loader2, CheckCircle, Info, X, LayoutList, History as HistoryIcon
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
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

  // --- ÉTATS DONNÉES ---
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Latest");
  const [allMeals, setAllMeals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // --- ÉTATS SÉLECTION & MODALS ---
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
            // Pour charger énormément de plats (le "500+"), on boucle sur l'alphabet
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
    <div className="p-4 lg:p-8 bg-[#0a0a0f] min-h-screen text-white pb-32 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center gap-6 bg-[#1a1a20] p-6 rounded-3xl border border-gray-800 shadow-xl">
        <div className="flex-1">
          <h1 className="text-4xl font-black uppercase italic text-[#00f5d4] flex items-center gap-3 tracking-tighter">
            <Utensils size={36} /> {t('healthy_kitchen')}
          </h1>
          <p className="text-gray-400 mt-2 flex items-center gap-2 text-sm italic">
            <Database size={14} className="text-[#00f5d4]"/> Bibliothèque complète : {allMeals.length}+ plats disponibles.
          </p>
        </div>
        <Button onClick={() => { setIsPlannerOpen(!isPlannerOpen); setPlannerSelection([]); }} className={`${isPlannerOpen ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black'} font-black py-6 px-8 rounded-2xl shadow-lg hover:scale-105 transition-all`}>
          {isPlannerOpen ? <X className="mr-2"/> : <Zap className="mr-2 fill-black" size={20} />}
          {isPlannerOpen ? "ANNULER" : t('create_nutrition_plan')}
        </Button>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="max-w-7xl mx-auto mb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input placeholder={t('search_recipe_placeholder')} className="pl-12 bg-[#1a1a20] border-gray-800 h-14 text-lg rounded-2xl focus:border-[#00f5d4]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {FILTER_KEYS.map(apiKey => (
            <Button
              key={apiKey}
              onClick={() => { setSelectedCategory(apiKey); setSearchTerm(""); }}
              className={selectedCategory === apiKey && !searchTerm ? "bg-[#7b2cbf] text-white font-bold px-6 h-10 rounded-xl border-none" : "bg-[#1a1a20] text-gray-400 border border-gray-800 hover:text-white h-10 rounded-xl"}
            >
              {t(apiKey.toLowerCase())}
            </Button>
          ))}
        </div>
      </div>

      {/* GRID */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#00f5d4] mb-4" size={48}/>
          <p className="text-gray-500 font-bold italic animate-pulse">Chargement de la bibliothèque...</p>
        </div>
      ) : (
        <>
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {currentMeals.map((meal) => {
              const isSelected = plannerSelection.find(m => m.id === meal.id);
              return (
                <div key={meal.id} className={`bg-[#1a1a20] rounded-3xl overflow-hidden border transition-all duration-300 group relative ${isSelected ? 'border-[#00f5d4] ring-4 ring-[#00f5d4]/20' : 'border-gray-800 hover:border-[#7b2cbf]'}`}>
                  {isPlannerOpen && (
                    <div className="absolute top-4 right-4 z-20">
                        <div
                          onClick={() => toggleMealSelection(meal)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer ${isSelected ? 'bg-[#00f5d4] border-[#00f5d4] scale-110 shadow-lg' : 'bg-black/60 border-white/50 hover:border-[#00f5d4]'}`}
                        >
                            {isSelected && <Check size={24} className="text-black font-black"/>}
                        </div>
                    </div>
                  )}
                  <div className="relative h-56 cursor-pointer overflow-hidden" onClick={() => { if(isPlannerOpen) toggleMealSelection(meal); else handleOpenDetails(meal); }}>
                    <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                    <div className="absolute bottom-3 left-3 flex gap-2">
                        <Badge className="bg-black/70 text-[#00f5d4] border-none backdrop-blur-md px-2 py-1 text-[10px] font-black">{meal.category}</Badge>
                        <Badge className="bg-black/70 text-white border-none backdrop-blur-md px-2 py-1 text-[10px] font-black">{meal.calories} kcal</Badge>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="font-black text-white text-lg mb-4 truncate italic uppercase tracking-tight">{meal.name}</h3>

                    {/* MACROS HIGHLIGHTED */}
                    <div className="grid grid-cols-3 gap-2 mb-6 text-center">
                        <div className="bg-black/40 p-2 rounded-xl border border-white/5 border-b-blue-500/50">
                          <p className="text-[10px] text-blue-400 font-bold uppercase">P: {meal.protein}g</p>
                        </div>
                        <div className="bg-black/40 p-2 rounded-xl border border-white/5 border-b-[#00f5d4]/50">
                          <p className="text-[10px] text-[#00f5d4] font-bold uppercase">G: {meal.carbs}g</p>
                        </div>
                        <div className="bg-black/40 p-2 rounded-xl border border-white/5 border-b-orange-500/50">
                          <p className="text-[10px] text-orange-400 font-bold uppercase">L: {meal.fat}g</p>
                        </div>
                    </div>

                    <Button variant="ghost" className="w-full text-[#9d4edd] hover:text-[#00f5d4] hover:bg-white/5 text-xs font-black uppercase tracking-widest transition-colors" onClick={(e) => { e.stopPropagation(); handleOpenDetails(meal); }}>
                        VOIR DÉTAILS
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-6 mt-16 bg-[#1a1a20] w-fit mx-auto p-2 rounded-2xl border border-gray-800 shadow-xl ring-1 ring-white/5">
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === 1}
                onClick={() => { setCurrentPage(p => p - 1); window.scrollTo(0, 0); }}
                className="border-gray-700 bg-black/40 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black transition-all"
              >
                <ChevronLeft size={24}/>
              </Button>
              <div className="flex items-center gap-3 px-4">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">Page</span>
                <span className="text-xl font-black text-white">{currentPage}</span>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">/ {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === totalPages}
                onClick={() => { setCurrentPage(p => p + 1); window.scrollTo(0, 0); }}
                className="border-gray-700 bg-black/40 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black transition-all"
              >
                <ChevronRight size={24}/>
              </Button>
            </div>
          )}
        </>
      )}

      {/* FLOATING ACTION */}
      {isPlannerOpen && plannerSelection.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 duration-500">
            <Button onClick={() => setIsDaySelectOpen(true)} className="bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black py-8 px-12 rounded-full shadow-[0_0_50px_rgba(0,245,212,0.5)] flex items-center gap-4 scale-110 border-4 border-[#0a0a0f]">
                <CheckCircle size={28}/>
                <div className="flex flex-col items-start leading-none text-left">
                    <span className="text-lg">CONFIRMER ({plannerSelection.length})</span>
                    <span className="text-[10px] opacity-60 uppercase">DÉFINIR LES DATES</span>
                </div>
            </Button>
        </div>
      )}

      {/* DETAIL MODAL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto rounded-[40px] p-0 shadow-2xl">
          {selectedMeal && (
            <div className="flex flex-col">
              <div className="relative h-80">
                <img src={selectedMeal.imageUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />
                <button onClick={() => setIsDetailOpen(false)} className="absolute top-6 right-6 bg-black/60 p-2 rounded-full hover:bg-red-500 transition-colors text-white z-30"><X size={20}/></button>
                <div className="absolute bottom-8 left-8">
                    <Badge className="bg-[#7b2cbf] text-white border-none mb-3 px-3 py-1 font-bold">{selectedMeal.category}</Badge>
                    <h2 className="text-4xl font-black uppercase italic tracking-tighter drop-shadow-lg">{selectedMeal.name}</h2>
                </div>
              </div>
              <div className="p-10 space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white/5 p-4 rounded-3xl text-center border border-white/5"><Flame className="mx-auto text-orange-500 mb-2" size={24} /><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Énergie</p><p className="text-sm font-black">{selectedMeal.calories} Cal</p></div>
                    <div className="bg-white/5 p-4 rounded-3xl text-center border border-white/5"><ChefHat className="mx-auto text-blue-400 mb-2" size={24} /><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Protéines</p><p className="text-sm font-black">{selectedMeal.protein}g</p></div>
                    <div className="bg-white/5 p-4 rounded-3xl text-center border border-white/5"><Clock className="mx-auto text-[#00f5d4] mb-2" size={24} /><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Temps</p><p className="text-sm font-black">{selectedMeal.prepTime}</p></div>
                    <div className="bg-white/5 p-4 rounded-3xl text-center border border-white/5"><Utensils className="mx-auto text-yellow-500 mb-2" size={24} /><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Portion</p><p className="text-sm font-black">1 Pers.</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-8 border-t border-white/5">
                    <div><h4 className="font-black text-xl mb-4 text-[#00f5d4] flex items-center gap-2 italic uppercase tracking-tight"><LayoutList size={20}/> Ingrédients</h4><ul className="text-sm space-y-3 text-gray-400 font-medium">{selectedMeal.ingredients.map((ing, i) => <li key={i} className="flex items-start gap-3"><Check size={14} className="text-[#7b2cbf] mt-1 shrink-0"/> {ing}</li>)}</ul></div>
                    <div><h4 className="font-black text-xl mb-4 text-[#00f5d4] flex items-center gap-2 italic uppercase tracking-tight"><HistoryIcon size={20}/> Préparation</h4><p className="text-sm text-gray-400 leading-relaxed italic whitespace-pre-line border-l-2 border-[#7b2cbf]/30 pl-4">{selectedMeal.instructions}</p></div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CALENDAR MODAL */}
      <Dialog open={isDaySelectOpen} onOpenChange={setIsDaySelectOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-sm rounded-[40px] p-8 shadow-3xl">
          <DialogHeader><DialogTitle className="text-[#00f5d4] uppercase font-black italic text-center text-2xl tracking-tighter">Planification</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center py-6">
            <div className="bg-black/40 p-4 rounded-[32px] border border-white/10 mb-8 shadow-2xl">
                <Calendar mode="multiple" selected={selectedDates} onSelect={setSelectedDates} locale={fr} className="bg-transparent text-white" />
            </div>
            <Button className="w-full bg-[#00f5d4] text-black font-black h-16 rounded-3xl shadow-[0_0_30px_rgba(0,245,212,0.3)] text-lg hover:scale-105 transition-all" onClick={saveNutritionalPlan} disabled={selectedDates.length === 0}>
                {isCoachView ? "ENVOYER AU CLIENT" : "VALIDER LE PLAN"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
