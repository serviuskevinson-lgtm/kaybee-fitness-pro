import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext'; 
import { doc, updateDoc, arrayUnion } from "firebase/firestore"; 
import { 
  Utensils, Search, Zap, Clock, Flame, ChevronRight, Check, ChefHat, Users, UserCheck, RefreshCw, Database
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from 'react-i18next'; // <--- IMPORT

// --- CONFIGURATION API V2 ---
const API_KEY = "65232507";
const BASE_URL = `https://www.themealdb.com/api/json/v2/${API_KEY}/`;

// Liste des clés de filtres (Les valeurs affichées seront traduites via t())
const FILTER_KEYS = ["Latest", "Breakfast", "Dessert", "Chicken", "Beef", "Seafood", "Vegetarian", "Pasta"];

// Traduction des unités de mesure courantes (Helper local)
const translateMeasure = (measure) => {
    if (!measure) return "";
    let m = measure.toLowerCase();
    m = m.replace(/tbsp/g, "c.à.s");
    m = m.replace(/tsp/g, "c.à.c");
    m = m.replace(/cup/g, "tasse");
    m = m.replace(/cups/g, "tasses");
    m = m.replace(/oz/g, "oz");
    m = m.replace(/lb/g, "lb");
    m = m.replace(/g/g, "g");
    m = m.replace(/kg/g, "kg");
    m = m.replace(/pinch/g, "pincée");
    m = m.replace(/slice/g, "tranche");
    m = m.replace(/slices/g, "tranches");
    m = m.replace(/large/g, "gros");
    m = m.replace(/medium/g, "moyen");
    m = m.replace(/small/g, "petit");
    return m;
};

export default function Meals() {
  const { currentUser } = useAuth();
  const { selectedClient, isCoachView, targetUserId } = useClient();
  const { t } = useTranslation(); // <--- HOOK

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Latest");
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // --- ÉTATS DONNÉES ---
  const [dailyMeals, setDailyMeals] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);

  // --- ÉTATS PLANNER ---
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerStep, setPlannerStep] = useState(1);
  const [currentPlan, setCurrentPlan] = useState({ breakfast: null, lunch: null, dinner: null, dessert: null });
  const [isDaySelectOpen, setIsDaySelectOpen] = useState(false);

  // --- FONCTION DE TRAITEMENT ET TRADUCTION ---
  const processMealData = (m) => {
      // 1. Catégorie (Affichage traduit)
      const rawCat = m.strCategory || selectedCategory;
      // On utilise la clé rawCat en minuscule pour la traduction (ex: 'chicken' -> 'Poulet')
      const displayCategory = t(rawCat.toLowerCase()) || rawCat;

      // 2. Détection Type UI
      let type = t('dinner');
      const catLower = rawCat.toLowerCase();
      if (catLower === "breakfast") type = t('breakfast');
      else if (catLower === "dessert") type = t('dessert');
      else if (catLower === "starter") type = t('starter');
      else if (["chicken", "beef", "pork", "lamb", "seafood", "pasta", "vegetarian"].includes(catLower)) type = t('main_course');
      
      // 3. Génération Macros (Simulation intelligente)
      let calBase = 450; let proBase = 25; let fatBase = 15; let carbBase = 40;
      
      if (catLower === "dessert") { calBase = 350; proBase = 5; carbBase = 50; fatBase = 15; }
      if (catLower === "breakfast") { calBase = 350; proBase = 15; carbBase = 45; fatBase = 12; }
      if (["beef", "pork", "lamb"].includes(catLower)) { calBase = 650; proBase = 45; fatBase = 30; carbBase = 10; }
      if (["chicken", "seafood"].includes(catLower)) { calBase = 450; proBase = 40; fatBase = 10; carbBase = 20; }
      if (catLower === "vegetarian") { calBase = 380; proBase = 12; fatBase = 10; carbBase = 55; }

      const seed = parseInt(m.idMeal.slice(-2)) || 50; 
      const randomize = (val) => Math.floor(val * (0.9 + (seed / 100) * 0.2));

      // 4. Extraction & Traduction Ingrédients
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
          const ingName = m[`strIngredient${i}`];
          const measure = m[`strMeasure${i}`];
          
          if (ingName && ingName.trim() !== "") {
              const frMeasure = translateMeasure(measure);
              ingredients.push(`${frMeasure} ${ingName}`);
          }
      }

      return {
          id: m.idMeal,
          name: m.strMeal,
          imageUrl: m.strMealThumb,
          type: type,
          category: displayCategory,
          area: m.strArea || "International",
          instructions: m.strInstructions || t('no_instructions'),
          ingredients: ingredients,
          calories: randomize(calBase),
          protein: randomize(proBase),
          carbs: randomize(carbBase),
          fat: randomize(fatBase),
          prepTime: `${randomize(25) + 10} min`
      };
  };

  // --- CHARGEMENT INTELLIGENT ---
  useEffect(() => {
    const fetchMeals = async () => {
      setIsLoading(true);
      try {
        let rawMeals = [];

        // 1. RECHERCHE
        if (searchTerm.trim() !== "") {
            const res = await fetch(`${BASE_URL}search.php?s=${searchTerm}`);
            const data = await res.json();
            rawMeals = data.meals || [];
        } 
        // 2. NOUVEAUTÉS (Latest)
        else if (selectedCategory === "Latest") {
            const promises = Array(2).fill().map(() => fetch(`${BASE_URL}randomselection.php`).then(res => res.json()));
            const results = await Promise.all(promises);
            rawMeals = results.flatMap(r => r.meals || []);
        }
        // 3. FILTRE PAR CATÉGORIE
        else {
            const listRes = await fetch(`${BASE_URL}filter.php?c=${selectedCategory}`);
            const listData = await listRes.json();
            let mealsList = listData.meals || [];
            mealsList = mealsList.slice(0, 24);

            const detailPromises = mealsList.map(m => 
                fetch(`${BASE_URL}lookup.php?i=${m.idMeal}`).then(res => res.json())
            );
            const detailsResults = await Promise.all(detailPromises);
            rawMeals = detailsResults.flatMap(r => r.meals || []);
        }

        const processed = rawMeals.map(processMealData);
        const uniqueMeals = Array.from(new Map(processed.map(m => [m.id, m])).values());
        
        setDailyMeals(uniqueMeals);

      } catch (error) {
        console.error("Erreur API:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => { fetchMeals(); }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedCategory]);


  // --- LOGIQUE PLANNER ---
  const totalMacros = () => {
    const meals = Object.values(currentPlan).filter(m => m !== null);
    return meals.reduce((acc, m) => ({
      cal: acc.cal + (m.calories || 0),
      pro: acc.pro + (m.protein || 0),
      carb: acc.carb + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0)
    }), { cal: 0, pro: 0, carb: 0, fat: 0 });
  };

  const saveNutritionalPlan = async (days) => {
    if (!targetUserId) return;
    try {
      const userRef = doc(db, "users", targetUserId);
      const plan = {
        id: Date.now().toString(),
        meals: currentPlan,
        totalMacros: totalMacros(),
        scheduledDays: days,
        createdAt: new Date().toISOString(),
        assignedBy: isCoachView ? 'coach' : 'self'
      };
      await updateDoc(userRef, { nutritionalPlans: arrayUnion(plan) });
      setIsDaySelectOpen(false);
      setIsPlannerOpen(false);
      setCurrentPlan({ breakfast: null, lunch: null, dinner: null, dessert: null });
      alert(isCoachView ? `${t('diet_assigned')} ${selectedClient?.full_name} !` : t('plan_saved'));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-4 lg:p-8 bg-[#0a0a0f] min-h-screen text-white pb-32">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase italic text-[#00f5d4] flex items-center gap-3">
            <Utensils size={36} /> {t('healthy_kitchen')}
          </h1>
          <p className="text-gray-400 mt-2 flex items-center gap-2">
             <Database size={14} className="text-[#00f5d4]"/> 
             {t('meals_subtitle')}
          </p>
          {isCoachView && (
             <Badge className="mt-2 bg-[#7b2cbf] text-white border-none">
                <Users size={12} className="mr-1"/> Coach Mode : {selectedClient?.full_name}
             </Badge>
          )}
        </div>
        <Button 
          onClick={() => { setIsPlannerOpen(true); setPlannerStep(1); }}
          className={`text-black font-black py-6 px-8 rounded-2xl shadow-lg hover:scale-105 transition-transform ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]'}`}
        >
          {isCoachView ? <UserCheck className="mr-2" /> : <Zap className="mr-2 fill-black" />}
          {isCoachView ? t('assign_diet') : t('create_nutrition_plan')}
        </Button>
      </div>

      {/* RECHERCHE & FILTRES CATÉGORIES */}
      <div className="max-w-7xl mx-auto mb-8 space-y-4">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input 
            placeholder={t('search_recipe_placeholder')}
            className="pl-12 bg-[#1a1a20] border-gray-800 h-14 text-lg rounded-2xl focus:border-[#00f5d4]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Boutons Catégories (Affichage Traduit, Valeur Anglaise) */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {FILTER_KEYS.map(apiKey => (
            <Button 
                key={apiKey} 
                onClick={() => { setSelectedCategory(apiKey); setSearchTerm(""); }}
                className={selectedCategory === apiKey && !searchTerm ? "bg-[#7b2cbf] text-white hover:bg-[#9d4edd] border-none font-bold px-6 h-10 rounded-xl" : "bg-[#1a1a20] text-gray-400 border border-gray-800 hover:bg-[#1a1a20] hover:text-white hover:border-[#7b2cbf] h-10 rounded-xl"}
            >
              {t(apiKey.toLowerCase())} {/* Traduction dynamique */}
            </Button>
          ))}
        </div>
      </div>

      {/* GRILLE RÉSULTATS */}
      {isLoading ? (
          <div className="max-w-7xl mx-auto text-center py-20">
              <div className="animate-spin w-12 h-12 border-4 border-[#00f5d4] border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500 animate-pulse">
                  {searchTerm ? t('searching') : t('loading')}
              </p>
          </div>
      ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {dailyMeals.length > 0 ? dailyMeals.map((meal) => (
              <div key={meal.id} className="bg-[#1a1a20] rounded-3xl overflow-hidden border border-gray-800 hover:border-[#00f5d4] transition-all group">
                <div className="relative h-56 cursor-pointer" onClick={() => { setSelectedMeal(meal); setIsDetailOpen(true); }}>
                  <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute top-3 left-3"><Badge className="bg-black/60 text-[#00f5d4] border-none backdrop-blur-sm">{meal.category}</Badge></div>
                  <div className="absolute bottom-3 right-3 bg-black/80 px-3 py-1 rounded-full flex items-center gap-2 backdrop-blur-sm">
                    <Flame size={14} className="text-orange-500" /><span className="text-xs font-bold">{meal.calories} kcal</span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-lg mb-4 truncate">{meal.name}</h3>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-4 font-mono">
                    <span>P: {meal.protein}g</span><span>G: {meal.carbs}g</span><span>L: {meal.fat}g</span>
                  </div>
                  <Button className="w-full bg-[#7b2cbf] text-white hover:bg-[#9d4edd] rounded-xl border-none font-bold" onClick={() => { setSelectedMeal(meal); setIsDetailOpen(true); }}>
                    {t('view_recipe')}
                  </Button>
                </div>
              </div>
            )) : (
                <div className="col-span-full text-center py-20 text-gray-500 italic">
                    {t('no_recipes_found')}
                </div>
            )}
          </div>
      )}

      {/* PLANNER MODAL */}
      <Dialog open={isPlannerOpen} onOpenChange={setIsPlannerOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-2xl font-black text-[#00f5d4] uppercase italic">
              {t('step')} {plannerStep} : {plannerStep === 1 ? t('the_breakfast') : plannerStep === 2 ? t('the_lunch') : plannerStep === 3 ? t('the_dinner') : plannerStep === 4 ? t('the_dessert') : t('summary')}
          </DialogTitle></DialogHeader>
          {plannerStep <= 4 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2"></div>
                {dailyMeals.map(m => (
                    <div key={m.id} onClick={() => {
                        const key = plannerStep === 1 ? 'breakfast' : plannerStep === 2 ? 'lunch' : plannerStep === 3 ? 'dinner' : 'dessert';
                        setCurrentPlan({...currentPlan, [key]: m});
                        setPlannerStep(prev => prev + 1);
                      }} className="bg-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-[#7b2cbf]/20 border border-transparent hover:border-[#7b2cbf] transition-all">
                      <img src={m.imageUrl} className="w-16 h-16 rounded-xl object-cover" />
                      <div><p className="font-bold text-sm line-clamp-1">{m.name}</p><p className="text-xs text-[#00f5d4]">{m.protein}g Prot</p></div>
                    </div>
                  ))}
              </div>
              <Button variant="ghost" className="w-full py-4 text-gray-500 hover:text-white" onClick={() => setPlannerStep(prev => prev + 1)}>{t('skip_step')} <ChevronRight className="ml-2" /></Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-[#1a1a20] p-6 rounded-3xl border border-[#00f5d4]/20">
                <h4 className="text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">{t('total_macros')}</h4>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div><p className="text-2xl font-black text-[#00f5d4]">{totalMacros().cal}</p><p className="text-[10px] text-gray-500 uppercase">Kcal</p></div>
                  <div><p className="text-2xl font-black text-white">{totalMacros().pro}g</p><p className="text-[10px] text-gray-500 uppercase">Prot</p></div>
                  <div><p className="text-2xl font-black text-white">{totalMacros().carb}g</p><p className="text-[10px] text-gray-500 uppercase">Gluc</p></div>
                  <div><p className="text-2xl font-black text-white">{totalMacros().fat}g</p><p className="text-[10px] text-gray-500 uppercase">Lip</p></div>
                </div>
              </div>
              <Button className={`w-full text-black font-black py-6 rounded-2xl ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-[#00f5d4]'}`} onClick={() => setIsDaySelectOpen(true)}>
                {isCoachView ? t('program_for_client') : t('save_plan')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DETAIL MODAL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedMeal && (
            <div className="space-y-6">
              <div className="relative h-64 rounded-3xl overflow-hidden">
                <img src={selectedMeal.imageUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <h2 className="absolute bottom-6 left-6 text-3xl font-black uppercase italic">{selectedMeal.name}</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 p-3 rounded-2xl text-center"><Clock className="mx-auto text-[#00f5d4] mb-1" size={18} /><p className="text-sm font-bold">{selectedMeal.prepTime}</p></div>
                <div className="bg-white/5 p-3 rounded-2xl text-center"><Flame className="mx-auto text-orange-500 mb-1" size={18} /><p className="text-sm font-bold">{selectedMeal.calories} Kcal</p></div>
                <div className="bg-white/5 p-3 rounded-2xl text-center"><ChefHat className="mx-auto text-blue-400 mb-1" size={18} /><p className="text-sm font-bold">{selectedMeal.protein}g Prot</p></div>
                <div className="bg-[#7b2cbf]/20 p-3 rounded-2xl text-center border border-[#7b2cbf]/30"><Badge className="bg-[#7b2cbf] mb-1">{selectedMeal.category}</Badge><p className="text-sm font-bold">{selectedMeal.area}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div><h4 className="font-bold mb-3 text-[#00f5d4]">{t('ingredients')}</h4><ul className="text-sm space-y-2 text-gray-400">{selectedMeal.ingredients.map((ing, i) => <li key={i}>• {ing}</li>)}</ul></div>
                <div><h4 className="font-bold mb-3 text-[#00f5d4]">{t('preparation')}</h4><p className="text-sm text-gray-400 leading-relaxed italic whitespace-pre-line">{selectedMeal.instructions}</p></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DAY SELECT MODAL */}
      <Dialog open={isDaySelectOpen} onOpenChange={setIsDaySelectOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white">
          <DialogHeader><DialogTitle>{t('assign_to_day')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(day => (
              <Button key={day} variant="outline" className="border-gray-800 hover:border-[#00f5d4]" onClick={() => saveNutritionalPlan([day])}>{day}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}