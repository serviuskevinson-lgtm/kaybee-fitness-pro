import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Flame, Utensils, Activity, Plus, ScanSearch, BellRing, X } from 'lucide-react';
import { estimateMealCalories } from '@/lib/aiNutrition';
import { getEveningAdvice } from '@/lib/coachingEngine';
import { doc, updateDoc, increment, getDoc } from 'firebase/firestore'; // Assure-toi d'avoir ces imports
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

export default function SmartCalorieWidget({ userProfile }) {
    const { currentUser } = useAuth();
    
    // --- ÉTATS ---
    const [stats, setStats] = useState({ eaten: 0, burned: 2000 }); // Default
    const [inputMode, setInputMode] = useState(false);
    const [foodInput, setFoodInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [notification, setNotification] = useState(null);

    // --- 1. CHARGEMENT DONNÉES ---
    // (Ici on simule un chargement depuis Firebase daily_logs)
    useEffect(() => {
        // ... Code pour fetcher les données réelles du jour ...
        // Pour l'exemple, on utilise les valeurs par défaut ou props
    }, []);

    // --- 2. VÉRIFICATION NOTIFICATION 19H ---
    useEffect(() => {
        const goal = userProfile?.goal || 'lose_weight'; // 'lose_weight' ou 'gain_muscle'
        const deficit = stats.burned - stats.eaten;
        
        const advice = getEveningAdvice(goal, deficit, stats.burned);
        if (advice) setNotification(advice);
    }, [stats, userProfile]);

    // --- 3. FONCTIONS AJOUT ---
    const handleManualAdd = async (calories) => {
        setStats(prev => ({ ...prev, eaten: prev.eaten + parseInt(calories) }));
        // TODO: Sauvegarder dans Firebase ici
        setInputMode(false);
        setFoodInput("");
    };

    const handleAIAnalyze = async () => {
        if (!foodInput) return;
        setIsThinking(true);
        const result = await estimateMealCalories(foodInput);
        if (result && result.calories) {
            if(window.confirm(`L'IA estime : ${result.calories} kcal (${result.protein}g Prot). Ajouter ?`)) {
                handleManualAdd(result.calories);
            }
        } else {
            alert("Je n'ai pas pu estimer ce plat. Essaie d'être plus précis.");
        }
        setIsThinking(false);
    };

    // Calculs Visuels
    const balance = stats.burned - stats.eaten;
    const isDeficit = balance > 0;
    const percent = Math.min((stats.eaten / stats.burned) * 100, 100);

    return (
        <Card className="bg-[#1a1a20] border-gray-800 shadow-xl overflow-visible relative">
            
            {/* NOTIFICATION FLOTTANTE (PUSH IN-APP) */}
            {notification && (
                <div className="absolute -top-4 left-4 right-4 bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] p-4 rounded-xl shadow-2xl z-50 animate-in slide-in-from-top duration-500 border border-white/20">
                    <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                            <div className="bg-white/20 p-2 rounded-full h-fit"><BellRing className="text-white h-5 w-5 animate-pulse"/></div>
                            <div>
                                <h4 className="font-black text-white uppercase text-sm">{notification.title}</h4>
                                <p className="text-white/90 text-xs mt-1 leading-snug">{notification.message}</p>
                            </div>
                        </div>
                        <button onClick={() => setNotification(null)} className="text-white/50 hover:text-white"><X size={16}/></button>
                    </div>
                </div>
            )}

            <CardHeader className="pb-2 pt-6">
                <CardTitle className="text-white flex justify-between items-center">
                    <span className="flex items-center gap-2"><Flame className="text-orange-500" /> Calories</span>
                    <span className={`text-[10px] uppercase font-black px-2 py-1 rounded ${isDeficit ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {isDeficit ? "Déficit (Perte)" : "Surplus (Gain)"}
                    </span>
                </CardTitle>
            </CardHeader>
            
            <CardContent>
                {/* Jauge Principale */}
                <div className="flex items-end justify-between mb-2">
                    <div>
                        <span className="text-3xl font-black text-white">{stats.eaten}</span>
                        <span className="text-xs text-gray-500 ml-1">mangées</span>
                    </div>
                    <div className="text-right">
                        <span className="text-sm font-bold text-gray-400">{stats.burned}</span>
                        <span className="text-xs text-gray-500 ml-1">dépensées</span>
                    </div>
                </div>
                
                <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden mb-6">
                    <div 
                        className={`h-full transition-all duration-1000 ${percent > 100 ? 'bg-red-500' : 'bg-[#00f5d4]'}`} 
                        style={{ width: `${percent}%` }}
                    />
                    {/* Marqueur Balance */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-white left-[100%] opacity-50"></div>
                </div>

                {/* Bouton d'ajout */}
                <Button onClick={() => setInputMode(true)} className="w-full bg-[#1a1a20] border border-[#00f5d4]/50 text-[#00f5d4] hover:bg-[#00f5d4] hover:text-black font-bold transition-all">
                    <Plus size={16} className="mr-2"/> Ajouter Repas
                </Button>
            </CardContent>

            {/* MODAL AJOUT INTELLIGENT */}
            <Dialog open={inputMode} onOpenChange={setInputMode}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                    <DialogHeader><DialogTitle>Qu'avez-vous mangé ?</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <Input 
                                placeholder="Ex: Une banane, un Big Mac, 200g de poulet..." 
                                value={foodInput}
                                onChange={(e) => setFoodInput(e.target.value)}
                                className="bg-black border-gray-700"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={handleAIAnalyze} disabled={isThinking || !foodInput} className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-bold">
                                {isThinking ? "Analyse IA..." : <><ScanSearch className="mr-2 h-4 w-4"/> Demander à l'IA</>}
                            </Button>
                            
                            <Button 
    onClick={() => handleManualAdd(parseInt(foodInput) || 0)} 
    variant="outline" 
    className="bg-white text-black hover:bg-gray-200 border-none font-bold"
>
    Ajout Manuel (Kcal)
</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}