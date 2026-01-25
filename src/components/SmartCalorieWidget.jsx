import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Flame, Utensils, Activity, Plus, ScanSearch, BellRing, X, Zap, Camera, Upload, History } from 'lucide-react';
import { doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { getDatabase, ref as dbRef, update, onValue } from "firebase/database";
import { db, app } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { analyzeFoodWithGemini, analyzeFoodImageWithGemini } from '@/lib/gemini';
import { getEveningAdvice } from '@/lib/coachingEngine';
import { useTranslation } from 'react-i18next';

export default function SmartCalorieWidget({ userProfile, consumed = 0, burned = 0 }) {
    const { currentUser } = useAuth();
    const { t } = useTranslation();
    const rtdb = getDatabase(app);

    const [inputMode, setInputMode] = useState(false);
    const [foodInput, setFoodInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [notification, setNotification] = useState(null);
    const fileInputRef = useRef(null);

    // Données nutritionnelles du jour
    const [todayMacros, setTodayMacros] = useState({
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        sugar: 0
    });

    // 1. CALCUL DE LA BALANCE ÉNERGÉTIQUE
    const baseGoal = userProfile?.nutritionalGoal || 2000;
    const totalNeeds = baseGoal + burned; 
    const remaining = Math.round(totalNeeds - consumed);
    const progressPercent = totalNeeds > 0 ? Math.min(100, (consumed / totalNeeds) * 100) : 0;

    let statusColor = "#00f5d4";
    if (remaining < 0) statusColor = "#ef4444";
    else if (remaining < 300) statusColor = "#eab308";

    // Charger les macros du jour depuis la RTDB
    useEffect(() => {
        if (!currentUser) return;
        const nutritionRef = dbRef(rtdb, `users/${currentUser.uid}/live_data/nutrition`);

        const unsubscribe = onValue(nutritionRef, (snapshot) => {
            if (snapshot.exists()) {
                setTodayMacros(snapshot.val());
            }
        });

        return () => unsubscribe();
    }, [currentUser, rtdb]);

    const saveNutritionToFirebase = async (data) => {
        if (!currentUser) return;
        const today = new Date().toISOString().split('T')[0];
        const userRef = doc(db, "users", currentUser.uid);
        const historyRef = doc(db, "users", currentUser.uid, "nutrition_history", today);
        const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);

        try {
            // 1. Firestore (Profil principal)
            await updateDoc(userRef, {
                dailyCalories: increment(data.calories),
                lastActiveDate: today
            });

            // 2. Firestore (Historique détaillé)
            const currentHistory = await getDoc(historyRef);
            const historyData = currentHistory.data() || {};
            const updatedMacros = {
                calories: (historyData.calories || 0) + data.calories,
                protein: (historyData.protein || 0) + (data.protein || 0),
                carbs: (historyData.carbs || 0) + (data.carbs || 0),
                fats: (historyData.fats || 0) + (data.fats || 0),
                fiber: (historyData.fiber || 0) + (data.fiber || 0),
                sugar: (historyData.sugar || 0) + (data.sugar || 0),
                date: today,
                timestamp: Date.now()
            };
            await setDoc(historyRef, updatedMacros);

            // 3. RTDB (Calcul correct sans Firestore.increment)
            await update(rtdbLiveRef, {
                calories_consumed: consumed + data.calories,
                nutrition: updatedMacros
            });

            setFoodInput("");
            setInputMode(false);
        } catch (e) {
            console.error("Erreur save nutrition:", e);
        }
    };

    const handleAIAnalyze = async () => {
        if (!foodInput) return;
        setIsThinking(true);
        try {
            const result = await analyzeFoodWithGemini(foodInput);
            await saveNutritionToFirebase(result);
        } catch (e) {
            console.error("Erreur IA", e);
        } finally {
            setIsThinking(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsThinking(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = async () => {
                const base64Image = reader.result;
                const result = await analyzeFoodImageWithGemini(base64Image);
                await saveNutritionToFirebase(result);
            };
        } catch (e) {
            console.error("Erreur analyse image", e);
            setIsThinking(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden relative shadow-lg">
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Zap size={16} className="text-[#fdcb6e]" /> Balance Énergétique
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="text-[#7b2cbf]" onClick={() => fileInputRef.current.click()}>
                            <Camera size={18} />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-5 relative z-10">
                    <div className="flex justify-between items-end mb-4">
                        <div>
                            <span className="text-3xl font-black text-white" style={{ color: statusColor }}>{remaining}</span>
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

                    <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
                        <div
                            className="absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full"
                            style={{
                                width: `${progressPercent}%`,
                                background: remaining < 0 ? '#ef4444' : 'linear-gradient(90deg, #00f5d4, #7b2cbf)'
                            }}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/10 text-red-400"><Utensils size={18} /></div>
                            <div><p className="text-xs text-gray-500 font-bold uppercase">Mangé</p><p className="text-lg font-black text-white">{consumed}</p></div>
                        </div>
                        <div className="flex items-center gap-3 justify-end text-right">
                            <div><p className="text-xs text-gray-500 font-bold uppercase">Brûlé</p><p className="text-lg font-black text-white text-[#00f5d4]">+{burned}</p></div>
                            <div className="p-2 rounded-lg bg-[#00f5d4]/10 text-[#00f5d4]"><Flame size={18} /></div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* --- WIDGETS MACROS --- */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <MacroItem label="Protéines" value={todayMacros.protein} unit="g" color="#3b82f6" />
                <MacroItem label="Glucides" value={todayMacros.carbs} unit="g" color="#00f5d4" />
                <MacroItem label="Lipides" value={todayMacros.fats} unit="g" color="#f59e0b" />
                <MacroItem label="Fibres" value={todayMacros.fiber} unit="g" color="#10b981" />
                <MacroItem label="Sucre" value={todayMacros.sugar} unit="g" color="#ec4899" />
            </div>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />

            <Dialog open={inputMode} onOpenChange={setInputMode}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                    <DialogHeader><DialogTitle>Enregistrer un repas</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <Input
                            placeholder="Décrivez votre repas..."
                            value={foodInput}
                            onChange={(e) => setFoodInput(e.target.value)}
                            className="bg-black border-gray-700 text-white"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={handleAIAnalyze} disabled={isThinking || !foodInput} className="bg-[#7b2cbf] text-white font-bold">
                                {isThinking ? "Analyse..." : <><ScanSearch className="mr-2 h-4 w-4"/> Texte (IA)</>}
                            </Button>
                            <Button onClick={() => fileInputRef.current.click()} disabled={isThinking} className="bg-[#00f5d4] text-black font-bold">
                                <Camera className="mr-2 h-4 w-4"/> Photo (IA)
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function MacroItem({ label, value, unit, color }) {
    return (
        <div className="bg-[#1a1a20] border border-gray-800 p-3 rounded-xl text-center">
            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{label}</p>
            <p className="text-lg font-black text-white" style={{ color }}>{Math.round(value)}<span className="text-[10px] ml-0.5">{unit}</span></p>
        </div>
    );
}
