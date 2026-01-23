import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Flame, Utensils, Activity, Plus, ScanSearch, BellRing, X, Zap } from 'lucide-react';
import { doc, updateDoc, increment, getDoc } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
// J'ai gardé tes imports d'IA
import { analyzeFoodWithGemini } from '@/lib/gemini'; 
import { getEveningAdvice } from '@/lib/coachingEngine';

export default function SmartCalorieWidget({ userProfile, consumed = 0, burned = 0 }) {
    const { currentUser } = useAuth();
    
    // --- ÉTATS ---
    // On n'utilise plus de "stats" local pour les chiffres, on utilise les props (consumed, burned)
    const [inputMode, setInputMode] = useState(false);
    const [foodInput, setFoodInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [notification, setNotification] = useState(null);

    // 1. CALCUL DE LA BALANCE ÉNERGÉTIQUE
    // Métabolisme de base (défaut 2000 si non défini) + Activité (burned)
    const baseGoal = userProfile?.nutritionalGoal || 2000;
    const totalNeeds = baseGoal + burned; 
    
    // Ce qu'il reste à manger
    const remaining = Math.round(totalNeeds - consumed);
    
    // Pourcentage de la barre (mangé / total besoins)
    const progressPercent = totalNeeds > 0 ? Math.min(100, (consumed / totalNeeds) * 100) : 0;

    // Couleur dynamique
    let statusColor = "#00f5d4"; // Vert
    if (remaining < 0) statusColor = "#ef4444"; // Rouge (Dépassement)
    else if (remaining < 300) statusColor = "#eab308"; // Jaune (Attention)

    // 2. LOGIQUE DE NOTIFICATION COACHING
    useEffect(() => {
        const checkAdvice = async () => {
            const advice = await getEveningAdvice(remaining, userProfile?.goalType);
            if (advice) setNotification(advice);
        };
        // Vérifier seulement le soir ou si gros changement
        if (new Date().getHours() > 18) checkAdvice();
    }, [remaining]);

    // 3. SAUVEGARDE DANS FIREBASE (C'est ça qui met à jour le Dashboard)
    const saveCaloriesToFirebase = async (amount, foodName) => {
        if (!currentUser) return;
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                dailyCalories: increment(amount),
                lastActiveDate: new Date().toISOString().split('T')[0] // Confirme l'activité du jour
            });
            // Reset input
            setFoodInput("");
            setInputMode(false);
        } catch (e) {
            console.error("Erreur save calories:", e);
        }
    };

    // 4. GESTION DES ENTRÉES
    const handleManualAdd = () => {
        const amount = parseInt(foodInput);
        if (amount > 0) {
            saveCaloriesToFirebase(amount, "Manuel");
        }
    };

    const handleAIAnalyze = async () => {
        setIsThinking(true);
        try {
            // Simulation de ton appel IA (remplace par ton vrai appel si besoin)
            // const result = await analyzeFoodWithGemini(foodInput); 
            // Pour l'exemple, supposons que l'IA renvoie un chiffre :
            const estimatedCalories = await analyzeFoodWithGemini(foodInput) || 500; // Fallback si erreur
            
            await saveCaloriesToFirebase(estimatedCalories, foodInput);
        } catch (e) {
            console.error("Erreur IA", e);
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden relative shadow-lg">
            {/* Décoration de fond */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#7b2cbf]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Zap size={16} className="text-[#fdcb6e]" /> Balance Énergétique
                    </CardTitle>
                    {notification && (
                        <Badge className="bg-red-500 animate-pulse cursor-pointer" onClick={() => alert(notification)}>
                            <BellRing size={12} className="mr-1"/> Conseil
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-5 relative z-10">
                {/* --- COMPTEUR PRINCIPAL --- */}
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <span className="text-3xl font-black text-white" style={{ color: statusColor }}>
                            {remaining}
                        </span>
                        <span className="text-xs font-bold text-gray-500 block">Kcal Restantes</span>
                    </div>
                    <Button 
                        size="sm" 
                        onClick={() => setInputMode(true)}
                        className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white rounded-xl h-10 px-4 font-bold shadow-[0_0_15px_rgba(123,44,191,0.3)]"
                    >
                        <Plus size={18} className="mr-1"/> Ajouter
                    </Button>
                </div>

                {/* --- BARRE DE PROGRESSION VISUELLE --- */}
                <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
                    <div 
                        className="absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full"
                        style={{ 
                            width: `${progressPercent}%`,
                            background: remaining < 0 ? '#ef4444' : 'linear-gradient(90deg, #00f5d4, #7b2cbf)'
                        }}
                    />
                </div>

                {/* --- DÉTAILS CONSOMMÉ vs BRÛLÉ --- */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                            <Utensils size={18} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">Mangé</p>
                            <p className="text-lg font-black text-white">{consumed}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 justify-end text-right">
                        <div>
                            <p className="text-xs text-gray-500 font-bold uppercase">Brûlé (Actif)</p>
                            <p className="text-lg font-black text-white text-[#00f5d4]">+{burned}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-[#00f5d4]/10 text-[#00f5d4]">
                            <Flame size={18} />
                        </div>
                    </div>
                </div>
            </CardContent>

            {/* --- MODALE D'AJOUT (Gardée Intacte) --- */}
            <Dialog open={inputMode} onOpenChange={setInputMode}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                    <DialogHeader><DialogTitle>Qu'avez-vous mangé ?</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <Input 
                                placeholder="Ex: Une banane, un Big Mac, 200g de poulet..." 
                                value={foodInput}
                                onChange={(e) => setFoodInput(e.target.value)}
                                className="bg-black border-gray-700 text-white"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={handleAIAnalyze} disabled={isThinking || !foodInput} className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-bold">
                                {isThinking ? "Analyse IA..." : <><ScanSearch className="mr-2 h-4 w-4"/> Analyser (IA)</>}
                            </Button>
                            
                            <Button 
                                onClick={handleManualAdd} 
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