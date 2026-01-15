import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useClient } from '@/context/ClientContext'; 
import { doc, updateDoc, arrayUnion, collection, getDocs } from "firebase/firestore"; 
import { 
  Utensils, Search, Plus, Calendar, Zap, Clock, 
  Flame, ChevronRight, ChevronLeft, Check, ChefHat, Users, UserCheck, RefreshCw, ImageOff
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Meals() {
  const { currentUser } = useAuth();
  
  // --- LOGIQUE HYBRIDE (COACH/CLIENT) ---
  const { selectedClient, isCoachView, targetUserId } = useClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("Tout");
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // --- ÉTATS DONNÉES ---
  const [dailyMeals, setDailyMeals] = useState([]); // Les 50 du jour
  const [isLoading, setIsLoading] = useState(true);

  // --- ÉTATS DU PLAN NUTRITIF ---
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerStep, setPlannerStep] = useState(1);
  const [currentPlan, setCurrentPlan] = useState({
    breakfast: null, lunch: null, dinner: null, dessert: null
  });
  const [isDaySelectOpen, setIsDaySelectOpen] = useState(false);

  // --- 1. CHARGEMENT & LOGIQUE DE SÉLECTION INTELLIGENTE ---
  useEffect(() => {
    const fetchMeals = async () => {
      setIsLoading(true);
      try {
        // A. Récupération de TOUS les repas depuis Firestore
        const querySnapshot = await getDocs(collection(db, "meals"));
        let allMeals = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // B. Filtrage : On garde uniquement ceux qui ont une image valide
        // (On suppose qu'une image valide contient "alt=media" ou "http")
        allMeals = allMeals.filter(m => m.imageUrl && (m.imageUrl.includes('alt=media') || m.imageUrl.startsWith('http')));

        // C. Seed du jour (pour que l'aléatoire soit stable sur 24h)
        const today = new Date().toISOString().slice(0, 10); // "2023-10-27"
        const seed = parseInt(today.replace(/-/g, ''));

        // D. Fonction de mélange déterministe (Fisher-Yates avec seed)
        const shuffle = (array) => {
            let m = array.length, t, i;
            // On utilise un générateur pseudo-aléatoire simple basé sur le seed
            let localSeed = seed;
            const random = () => {
                localSeed = (localSeed * 9301 + 49297) % 233280;
                return localSeed / 233280;
            };

            while (m) {
                i = Math.floor(random() * m--);
                t = array[m];
                array[m] = array[i];
                array[i] = t;
            }
            return array;
        };

        // E. Séparation par catégories
        const breakfasts = allMeals.filter(m => m.type && m.type.toLowerCase().includes('déjeuner'));
        const desserts = allMeals.filter(m => m.type && m.type.toLowerCase().includes('dessert'));
        // Tout le reste est considéré comme Dinner/Souper
        const dinners = allMeals.filter(m => !m.type?.toLowerCase().includes('déjeuner') && !m.type?.toLowerCase().includes('dessert'));

        // F. Sélection des Quotas (15 Dej, 25 Din, 10 Des)
        const selectedBreakfasts = shuffle(breakfasts).slice(0, 15);
        const selectedDinners = shuffle(dinners).slice(0, 25);
        const selectedDesserts = shuffle(desserts).slice(0, 10);

        // G. Fusion et mélange final pour l'affichage
        const finalMenu = shuffle([...selectedBreakfasts, ...selectedDinners, ...selectedDesserts]);
        
        setDailyMeals(finalMenu);

      } catch (error) {
        console.error("Erreur chargement repas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeals();
  }, []);

  // Filtrage des plats (sur la base des 50 du jour)
  const filteredMeals = dailyMeals.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const typeNormalized = m.type ? m.type.toLowerCase() : "";
    let matchesType = selectedType === "Tout";

    if (!matchesType) {
        const filter = selectedType.toLowerCase();
        if (filter === "déjeuner" && typeNormalized.includes("déjeuner")) matchesType = true;
        else if (filter === "dessert" && typeNormalized.includes("dessert")) matchesType = true;
        // Dinner capture tout ce qui n'est pas dej/dessert
        else if (filter === "dinner" && !typeNormalized.includes("déjeuner") && !typeNormalized.includes("dessert")) matchesType = true;
    }
    
    return matchesSearch && matchesType;
  });

  // Calcul des macros du plan en cours
  const totalMacros = () => {
    const meals = Object.values(currentPlan).filter(m => m !== null);
    return meals.reduce((acc, m) => ({
      cal: acc.cal + (m.calories || 0),
      pro: acc.pro + (m.protein || 0),
      carb: acc.carb + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0)
    }), { cal: 0, pro: 0, carb: 0, fat: 0 });
  };

  // --- SAUVEGARDE INTELLIGENTE ---
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
      
      alert(isCoachView 
        ? `Diète assignée à ${selectedClient?.full_name} pour : ${days.join(', ')}` 
        : "Plan nutritionnel sauvegardé !"
      );

    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-4 lg:p-8 bg-[#0a0a0f] min-h-screen text-white pb-32">
      {/* HEADER */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase italic text-[#00f5d4] flex items-center gap-3">
            <Utensils size={36} /> Cuisine Santé
          </h1>
          <p className="text-gray-400 mt-2 flex items-center gap-2">
             <RefreshCw size={14} className="text-[#00f5d4]"/> 
             Menu du jour : {dailyMeals.length} plats (15 Matin / 25 Soir / 10 Desserts).
          </p>
          
          {/* BANDEAU INFO COACH */}
          {isCoachView && (
             <Badge className="mt-2 bg-[#7b2cbf] text-white border-none">
                <Users size={12} className="mr-1"/> Mode Coach : {selectedClient?.full_name}
             </Badge>
          )}
        </div>
        
        <Button 
          onClick={() => { setIsPlannerOpen(true); setPlannerStep(1); }}
          className={`text-black font-black py-6 px-8 rounded-2xl shadow-lg hover:scale-105 transition-transform ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]'}`}
        >
          {isCoachView ? <UserCheck className="mr-2" /> : <Zap className="mr-2 fill-black" />}
          {isCoachView ? "ASSIGNER UNE DIÈTE" : "CRÉER UN PLAN NUTRITIF"}
        </Button>
      </div>

      {/* FILTRES & RECHERCHE */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input 
            placeholder="Chercher un ingrédient ou un plat..." 
            className="pl-12 bg-[#1a1a20] border-gray-800 h-12"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          {["Tout", "Déjeuner", "Dinner", "Dessert"].map(type => (
            <Button 
              key={type} 
              onClick={() => setSelectedType(type)}
              className={selectedType === type 
                ? "bg-[#7b2cbf] text-white hover:bg-[#9d4edd] border-none whitespace-nowrap" 
                : "bg-[#7b2cbf]/20 text-white border border-[#7b2cbf]/50 hover:bg-[#7b2cbf]/40 whitespace-nowrap"}
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      {/* GRILLE DES PLATS */}
      {isLoading ? (
          <div className="max-w-7xl mx-auto text-center py-20">
              <div className="animate-spin w-12 h-12 border-4 border-[#00f5d4] border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500">Chargement du menu du jour...</p>
          </div>
      ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredMeals.map((meal) => (
              <div key={meal.id} className="bg-[#1a1a20] rounded-3xl overflow-hidden border border-gray-800 hover:border-[#00f5d4] transition-all group">
                <div className="relative h-56 cursor-pointer" onClick={() => { setSelectedMeal(meal); setIsDetailOpen(true); }}>
                  <img 
                    src={meal.imageUrl} 
                    alt={meal.name} 
                    className="w-full h-full object-cover" 
                    onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800"; }} // Fallback si image cassée
                  />
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-black/60 text-[#00f5d4] border-none">{meal.type}</Badge>
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/80 px-3 py-1 rounded-full flex items-center gap-2">
                    <Flame size={14} className="text-orange-500" />
                    <span className="text-xs font-bold">{meal.calories} kcal</span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-lg mb-4 truncate">{meal.name}</h3>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-4 font-mono">
                    <span>P: {meal.protein}g</span>
                    <span>G: {meal.carbs}g</span>
                    <span>L: {meal.fat}g</span>
                  </div>
                  <Button 
                    className="w-full bg-[#7b2cbf] text-white hover:bg-[#9d4edd] rounded-xl border-none"
                    onClick={() => { setSelectedMeal(meal); setIsDetailOpen(true); }}
                  >
                    Voir Recette
                  </Button>
                </div>
              </div>
            ))}
            {filteredMeals.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-500 italic border-2 border-dashed border-gray-800 rounded-3xl">
                    Aucun plat trouvé pour cette recherche dans le menu du jour.
                </div>
            )}
          </div>
      )}

      {/* --- MODAL PLANNER (WIZARD) --- */}
      <Dialog open={isPlannerOpen} onOpenChange={setIsPlannerOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-[#00f5d4] uppercase italic">
              Étape {plannerStep} : {plannerStep === 1 ? "Le Déjeuner" : plannerStep === 2 ? "Le Dinner" : plannerStep === 3 ? "Le Souper" : plannerStep === 4 ? "Le Dessert" : "Récapitulatif"}
            </DialogTitle>
          </DialogHeader>

          {plannerStep <= 4 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* On filtre dans dailyMeals pour proposer uniquement les plats du jour */}
                {dailyMeals
                  .filter(m => {
                      const t = m.type ? m.type.toLowerCase() : "";
                      if (plannerStep === 1) return t.includes("déjeuner");
                      if (plannerStep === 4) return t.includes("dessert");
                      return t.includes("dinner") || t.includes("dîner");
                  })
                  .slice(0, 6) // On en montre juste 6 pour pas surcharger le modal
                  .map(m => (
                    <div 
                      key={m.id} 
                      onClick={() => {
                        const key = plannerStep === 1 ? 'breakfast' : plannerStep === 2 ? 'lunch' : plannerStep === 3 ? 'dinner' : 'dessert';
                        setCurrentPlan({...currentPlan, [key]: m});
                        setPlannerStep(prev => prev + 1);
                      }}
                      className="bg-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-[#7b2cbf]/20 border border-transparent hover:border-[#7b2cbf] transition-all"
                    >
                      <img src={m.imageUrl} className="w-16 h-16 rounded-xl object-cover" onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800"; }} />
                      <div>
                        <p className="font-bold text-sm line-clamp-1">{m.name}</p>
                        <p className="text-xs text-[#00f5d4]">{m.protein}g Protéines</p>
                      </div>
                    </div>
                  ))}
              </div>
              <Button 
                variant="ghost" 
                className="w-full py-4 text-gray-500 hover:text-white"
                onClick={() => setPlannerStep(prev => prev + 1)}
              >
                SKIPPER CETTE ÉTAPE <ChevronRight className="ml-2" />
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-[#1a1a20] p-6 rounded-3xl border border-[#00f5d4]/20">
                <h4 className="text-center text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Total Macros Journée</h4>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div><p className="text-2xl font-black text-[#00f5d4]">{totalMacros().cal}</p><p className="text-[10px] text-gray-500 uppercase">Kcal</p></div>
                  <div><p className="text-2xl font-black text-white">{totalMacros().pro}g</p><p className="text-[10px] text-gray-500 uppercase">Prot</p></div>
                  <div><p className="text-2xl font-black text-white">{totalMacros().carb}g</p><p className="text-[10px] text-gray-500 uppercase">Gluc</p></div>
                  <div><p className="text-2xl font-black text-white">{totalMacros().fat}g</p><p className="text-[10px] text-gray-500 uppercase">Lip</p></div>
                </div>
              </div>
              
              <div className="space-y-2">
                {Object.entries(currentPlan).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-xs font-bold uppercase text-gray-500">{key}</span>
                    <span className="text-sm font-bold truncate max-w-[200px]">{val ? val.name : "Skippé"}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPlannerStep(key === 'breakfast' ? 1 : key === 'lunch' ? 2 : key === 'dinner' ? 3 : 4)}>Modifier</Button>
                  </div>
                ))}
              </div>

              <Button 
                className={`w-full text-black font-black py-6 rounded-2xl ${isCoachView ? 'bg-[#7b2cbf] text-white hover:bg-[#9d4edd]' : 'bg-[#00f5d4]'}`}
                onClick={() => setIsDaySelectOpen(true)}
              >
                {isCoachView ? "PROGRAMMER POUR LE CLIENT" : "SAUVEGARDER LE PLAN"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL SÉLECTION JOURS */}
      <Dialog open={isDaySelectOpen} onOpenChange={setIsDaySelectOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white">
          <DialogHeader><DialogTitle>Attribuer à quel(s) jour(s) ?</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(day => (
              <Button key={day} variant="outline" className="border-gray-800 hover:border-[#00f5d4]" onClick={() => saveNutritionalPlan([day])}>{day}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* --- MODAL DÉTAILS DU PLAT --- */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedMeal && (
            <div className="space-y-6">
              <div className="relative h-64 rounded-3xl overflow-hidden">
                <img src={selectedMeal.imageUrl} className="w-full h-full object-cover" onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800"; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <h2 className="absolute bottom-6 left-6 text-3xl font-black uppercase italic">{selectedMeal.name}</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 p-3 rounded-2xl text-center">
                  <Clock className="mx-auto text-[#00f5d4] mb-1" size={18} />
                  <p className="text-sm font-bold">{selectedMeal.prepTime}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl text-center">
                  <Flame className="mx-auto text-orange-500 mb-1" size={18} />
                  <p className="text-sm font-bold">{selectedMeal.calories} Kcal</p>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl text-center">
                  <ChefHat className="mx-auto text-blue-400 mb-1" size={18} />
                  <p className="text-sm font-bold">{selectedMeal.protein}g Prot</p>
                </div>
                <div className="bg-[#7b2cbf]/20 p-3 rounded-2xl text-center border border-[#7b2cbf]/30">
                  <Badge className="bg-[#7b2cbf] mb-1">Low Fat</Badge>
                  <p className="text-sm font-bold">{selectedMeal.fat}g Fat</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-bold mb-3 text-[#00f5d4]">Ingrédients</h4>
                  <ul className="text-sm space-y-2 text-gray-400">
                    {selectedMeal.ingredients && selectedMeal.ingredients.map((ing, i) => <li key={i}>• {ing}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold mb-3 text-[#00f5d4]">Préparation</h4>
                  <p className="text-sm text-gray-400 leading-relaxed italic">"{selectedMeal.instructions}"</p>
                </div>
              </div>
              
              {selectedMeal.description && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-xs text-gray-500 italic">
                      {selectedMeal.description}
                  </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}