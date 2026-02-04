import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Flame, Utensils, Activity, Plus, ScanSearch, BellRing, X, Zap, Camera, Upload, History, ChefHat, Loader2, Sparkles, Send, MessageSquare, AlertCircle, Trash2, Eye, ShieldCheck } from 'lucide-react';
import { doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { getDatabase, ref as dbRef, update, onValue } from "firebase/database";
import { db, app } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { analyzeFoodChat } from '@/lib/geminicalcul';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { moderateImage } from '@/lib/moderation';

export default function SmartCalorieWidget({ userProfile, consumed = 0, burned = 0 }) {
    const { currentUser } = useAuth();
    const { t } = useTranslation();
    const rtdb = getDatabase(app);

    const [inputMode, setInputMode] = useState(false);
    const [foodInput, setFoodInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const fileInputRef = useRef(null);

    // États pour le Chat IA
    const [chatMode, setChatMode] = useState(false);
    const [chatHistory, setChatHistory] = useState([]);
    const [aiMessage, setAiMessage] = useState("");
    const [pendingData, setPendingData] = useState(null);
    const [moderationError, setModerationError] = useState(null);

    // États Historique
    const [dailyMeals, setDailyMeals] = useState([]);
    const [selectedMealDetail, setSelectedMealDetail] = useState(null);

    const [todayMacros, setTodayMacros] = useState({
        protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, calories: 0
    });

    const baseGoal = userProfile?.nutritionalGoal || 2000;
    const safeConsumed = Number(consumed) || 0;
    const safeBurned = Number(burned) || 0;
    const totalNeeds = baseGoal + safeBurned;
    const remaining = Math.round(totalNeeds - safeConsumed);
    const progressPercent = totalNeeds > 0 ? Math.min(100, (safeConsumed / totalNeeds) * 100) : 0;

    useEffect(() => {
        if (!currentUser) return;

        const today = new Date().toISOString().split('T')[0];
        const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);
        const nutritionRef = dbRef(rtdb, `users/${currentUser.uid}/live_data/nutrition`);

        const unsubscribe = onValue(nutritionRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();

                // Vérification du changement de jour pour le reset
                if (data.date && data.date !== today) {
                    update(rtdbLiveRef, {
                        calories_consumed: 0,
                        nutrition: {
                            protein: 0,
                            carbs: 0,
                            fats: 0,
                            fiber: 0,
                            sugar: 0,
                            calories: 0,
                            meals: [],
                            date: today,
                            timestamp: Date.now()
                        }
                    });
                    return;
                }

                setTodayMacros({
                    protein: Number(data.protein) || 0,
                    carbs: Number(data.carbs) || 0,
                    fats: Number(data.fats) || 0,
                    fiber: Number(data.fiber) || 0,
                    sugar: Number(data.sugar) || 0,
                    calories: Number(data.calories) || 0,
                    meals: data.meals || []
                });
                setDailyMeals(data.meals || []);
            } else {
                update(nutritionRef, { date: today });
            }
        });
        return () => unsubscribe();
    }, [currentUser, rtdb]);

    const saveNutritionToFirebase = async (data) => {
        if (!currentUser || !data) return;
        const today = new Date().toISOString().split('T')[0];
        const userRef = doc(db, "users", currentUser.uid);
        const historyRef = doc(db, "users", currentUser.uid, "nutrition_history", today);
        const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);

        const cleanData = {
            id: Date.now().toString(),
            name: data.name || "Repas",
            calories: Number(data.calories) || 0,
            protein: Number(data.protein) || 0,
            carbs: Number(data.carbs) || 0,
            fats: Number(data.fats) || 0,
            fiber: Number(data.fiber) || 0,
            sugar: Number(data.sugar) || 0,
            timestamp: Date.now()
        };

        try {
            await updateDoc(userRef, { dailyCalories: increment(cleanData.calories), lastActiveDate: today });
            const currentHistory = await getDoc(historyRef);
            const historyData = currentHistory.data() || {};
            const updatedMacros = {
                calories: (Number(historyData.calories) || 0) + cleanData.calories,
                protein: (Number(historyData.protein) || 0) + cleanData.protein,
                carbs: (Number(historyData.carbs) || 0) + cleanData.carbs,
                fats: (Number(historyData.fats) || 0) + cleanData.fats,
                fiber: (Number(historyData.fiber) || 0) + cleanData.fiber,
                sugar: (Number(historyData.sugar) || 0) + cleanData.sugar,
                date: today,
                timestamp: Date.now(),
                meals: [...(historyData.meals || []), cleanData]
            };
            await setDoc(historyRef, updatedMacros);
            await update(rtdbLiveRef, { calories_consumed: (Number(todayMacros.calories) || 0) + cleanData.calories, nutrition: updatedMacros });

            setFoodInput("");
            setInputMode(false);
            setChatMode(false);
            setChatHistory([]);
            setPendingData(null);
        } catch (e) { console.error("Erreur save nutrition:", e); }
    };

    const handleInitialAnalyze = async (isImage = false, base64 = null) => {
        setIsThinking(true);
        setModerationError(null);
        try {
            // 1. Modération de l'image si c'est une image
            if (isImage) {
                const modResult = await moderateImage(base64);
                if (!modResult.isSafe) {
                    setModerationError(modResult.reason || "Image inappropriée détectée.");
                    setIsThinking(false);
                    return;
                }
            }

            const input = isImage ? base64 : foodInput;
            const response = await analyzeFoodChat(input, [], isImage);

            if (response.needsMoreInfo) {
                setChatMode(true);
                setAiMessage(response.message);
                setChatHistory([{ role: 'ai', text: response.message }]);
            } else if (response.success) {
                setChatMode(true);
                setPendingData(response.data);
                setAiMessage(`J'ai analysé : ${response.analysisBreakdown || "C'est prêt."}. Je l'ajoute ?`);
                setChatHistory([{ role: 'ai', text: response.analysisBreakdown || "Analyse terminée." }]);
            }
        } catch (e) { console.error(e); }
        finally { setIsThinking(false); }
    };

    const handleChatFollowUp = async () => {
        if (!foodInput || isThinking) return;
        const userMsg = foodInput;
        setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
        setFoodInput("");
        setIsThinking(true);

        try {
            const response = await analyzeFoodChat(userMsg, chatHistory);
            if (response.needsMoreInfo) {
                setAiMessage(response.message);
                setChatHistory(prev => [...prev, { role: 'ai', text: response.message }]);
            } else if (response.success) {
                setPendingData(response.data);
                setAiMessage(`Parfait ! ${response.analysisBreakdown}. On valide ?`);
                setChatHistory(prev => [...prev, { role: 'ai', text: response.analysisBreakdown }]);
            }
        } catch (e) { console.error(e); }
        finally { setIsThinking(false); }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-[#1a1a20] border-gray-800 rounded-2xl overflow-hidden relative shadow-lg">
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Zap size={16} className="text-[#fdcb6e]" /> Balance Énergétique
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="text-[#7b2cbf]" onClick={() => { setInputMode(true); setTimeout(() => fileInputRef.current?.click(), 100); }}>
                            <Camera size={18} />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-5 relative z-10">
                    <div className="flex justify-between items-end mb-4">
                        <div>
                            <span className="text-3xl font-black text-white" style={{ color: remaining < 0 ? '#ef4444' : (remaining < 300 ? '#eab308' : '#00f5d4') }}>
                                {isNaN(remaining) ? 0 : remaining}
                            </span>
                            <span className="text-xs font-bold text-gray-500 block uppercase tracking-tighter mt-1">Kcal Restantes</span>
                        </div>
                        <Button size="sm" onClick={() => setInputMode(true)} className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white rounded-xl h-10 px-4 font-bold shadow-lg">
                            <Plus size={18} className="mr-1"/> Ajouter
                        </Button>
                    </div>

                    <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden mb-6">
                        <div className="absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full" style={{ width: `${progressPercent}%`, background: remaining < 0 ? '#ef4444' : 'linear-gradient(90deg, #00f5d4, #7b2cbf)' }} />
                    </div>

                    {/* HISTORIQUE RAPIDE DU JOUR */}
                    <div className="space-y-2 mb-6">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><History size={12}/> Historique du jour</p>
                        <div className="max-h-32 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                            {dailyMeals.length > 0 ? dailyMeals.map((meal) => (
                                <div key={meal.id} onClick={() => setSelectedMealDetail(meal)} className="flex justify-between items-center bg-black/20 p-2 rounded-xl border border-white/5 cursor-pointer hover:border-[#7b2cbf]/50 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-[#7b2cbf]" />
                                        <p className="text-xs font-bold text-white truncate w-32">{meal.name}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-[#00f5d4]">{meal.calories} KCAL</span>
                                        <Eye size={14} className="text-gray-600 group-hover:text-white" />
                                    </div>
                                </div>
                            )) : <p className="text-[10px] text-gray-600 italic">Aucun repas enregistré.</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/10 text-red-400"><Utensils size={18} /></div>
                            <div><p className="text-xs text-gray-500 font-bold uppercase">Mangé</p><p className="text-lg font-black text-white">{safeConsumed}</p></div>
                        </div>
                        <div className="flex items-center gap-3 justify-end text-right">
                            <div><p className="text-xs text-gray-500 font-bold uppercase">Brûlé</p><p className="text-lg font-black text-white text-[#00f5d4]">+{safeBurned}</p></div>
                            <div className="p-2 rounded-lg bg-[#00f5d4]/10 text-[#00f5d4]"><Flame size={18} /></div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <MacroItem label="Protéines" value={todayMacros.protein} unit="g" color="#3b82f6" />
                <MacroItem label="Glucides" value={todayMacros.carbs} unit="g" color="#00f5d4" />
                <MacroItem label="Lipides" value={todayMacros.fats} unit="g" color="#f59e0b" />
                <MacroItem label="Fibres" value={todayMacros.fiber} unit="g" color="#10b981" />
                <MacroItem label="Sucre" value={todayMacros.sugar} unit="g" color="#ec4899" />
            </div>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                setPreviewImage(URL.createObjectURL(file));
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onloadend = () => handleInitialAnalyze(true, reader.result);
            }} />

            {/* MODALE D'AJOUT IA AVEC MODÉRATION */}
            <Dialog open={inputMode} onOpenChange={(open) => { if(!isThinking) { setInputMode(open); if(!open) { setChatMode(false); setChatHistory([]); setPendingData(null); setPreviewImage(null); setModerationError(null); } } }}>
                <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white overflow-hidden max-w-sm p-0 rounded-3xl shadow-3xl">
                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase italic tracking-tighter">
                                {moderationError ? <ShieldCheck className="text-red-500" /> : chatMode ? <MessageSquare className="text-[#00f5d4]" /> : <ChefHat className="text-[#7b2cbf]" />}
                                {moderationError ? "Sécurité" : chatMode ? "Détails IA" : "Nutrition Intelligent"}
                            </DialogTitle>
                        </DialogHeader>

                        {moderationError ? (
                            <div className="flex flex-col items-center py-6 text-center">
                                <AlertCircle size={48} className="text-red-500 mb-4" />
                                <h3 className="text-lg font-bold mb-2">Contenu non autorisé</h3>
                                <p className="text-gray-400 text-sm mb-6">{moderationError}</p>
                                <Button onClick={() => setInputMode(false)} className="w-full bg-gray-800 hover:bg-gray-700">Compris</Button>
                            </div>
                        ) : isThinking ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-6">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center"><Utensils className="text-white animate-bounce" size={32} /></div>
                                </div>
                                <div className="text-center">
                                    <p className="text-[#00f5d4] font-black italic animate-pulse uppercase text-sm">Analyse sécurisée en cours...</p>
                                </div>
                            </div>
                        ) : (
                            // Reste du contenu original de la modale...
                            <div className="space-y-4">
                                {previewImage && (
                                    <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-gray-800 mb-4">
                                        <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                                        <Button size="icon" variant="destructive" className="absolute top-2 right-2 rounded-full h-8 w-8" onClick={() => { setPreviewImage(null); setChatMode(false); }}>
                                            <X size={16} />
                                        </Button>
                                    </div>
                                )}

                                {chatMode ? (
                                    <div className="space-y-4">
                                        <div className="max-h-40 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                            {chatHistory.map((msg, i) => (
                                                <div key={i} className={`p-3 rounded-2xl text-sm ${msg.role === 'ai' ? 'bg-[#7b2cbf]/20 text-[#dcdde1] border-l-4 border-[#7b2cbf]' : 'bg-white/5 text-white text-right ml-8'}`}>
                                                    {msg.text}
                                                </div>
                                            ))}
                                        </div>
                                        {pendingData ? (
                                            <div className="flex gap-2">
                                                <Button className="flex-1 bg-[#00f5d4] text-black font-black uppercase italic" onClick={() => saveNutritionToFirebase(pendingData)}>Confirmer (+{pendingData.calories} kcal)</Button>
                                                <Button variant="ghost" className="text-red-400" onClick={() => { setChatMode(false); setPendingData(null); }}><Trash2 size={20}/></Button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <Input value={foodInput} onChange={(e) => setFoodInput(e.target.value)} placeholder="Précise ici..." className="bg-black/40 border-gray-800 rounded-xl" onKeyPress={(e) => e.key === 'Enter' && handleChatFollowUp()} />
                                                <Button onClick={handleChatFollowUp} className="bg-[#7b2cbf] rounded-xl px-3"><Send size={18}/></Button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative group">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
                                            <Input value={foodInput} onChange={(e) => setFoodInput(e.target.value)} placeholder="Ex: Une omelette 3 oeufs et un café..." className="relative bg-[#0a0a0f] border-gray-800 h-14 rounded-2xl text-lg pl-4 pr-12 focus:border-[#00f5d4] transition-all" onKeyPress={(e) => e.key === 'Enter' && handleInitialAnalyze(false)} />
                                            <Sparkles className="absolute right-4 top-4 text-[#7b2cbf] animate-pulse" size={24} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Button variant="outline" className="h-16 rounded-2xl border-dashed border-gray-700 hover:border-[#7b2cbf] flex flex-col gap-1 group" onClick={() => fileInputRef.current?.click()}>
                                                <Camera size={20} className="text-gray-500 group-hover:text-[#7b2cbf]" />
                                                <span className="text-[10px] font-black uppercase text-gray-500">Photo</span>
                                            </Button>
                                            <Button disabled={!foodInput} onClick={() => handleInitialAnalyze(false)} className="h-16 rounded-2xl bg-gradient-to-br from-[#7b2cbf] to-[#6c5ce7] text-white font-black uppercase italic tracking-tighter shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">
                                                Analyser
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Détails du repas (Modal secondaire) */}
            <Dialog open={!!selectedMealDetail} onOpenChange={() => setSelectedMealDetail(null)}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-xs">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black italic uppercase tracking-tighter flex items-center justify-between">
                            Détails du repas
                            <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteMeal(selectedMealDetail.id)}>
                                <Trash2 size={18} />
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    {selectedMealDetail && (
                        <div className="space-y-4 py-4">
                            <div className="p-4 bg-black/40 rounded-2xl border border-[#7b2cbf]/30">
                                <h4 className="text-[#00f5d4] font-black uppercase mb-1">{selectedMealDetail.name}</h4>
                                <p className="text-3xl font-black">{selectedMealDetail.calories} <span className="text-sm font-normal text-gray-500">kcal</span></p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 bg-white/5 rounded-xl"><p className="text-[10px] uppercase text-gray-500 font-bold">Prot</p><p className="font-bold">{selectedMealDetail.protein}g</p></div>
                                <div className="p-2 bg-white/5 rounded-xl"><p className="text-[10px] uppercase text-gray-500 font-bold">Gluc</p><p className="font-bold">{selectedMealDetail.carbs}g</p></div>
                                <div className="p-2 bg-white/5 rounded-xl"><p className="text-[10px] uppercase text-gray-500 font-bold">Lip</p><p className="font-bold">{selectedMealDetail.fats}g</p></div>
                                <div className="p-2 bg-white/5 rounded-xl"><p className="text-[10px] uppercase text-gray-500 font-bold">Fibres</p><p className="font-bold">{selectedMealDetail.fiber}g</p></div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function MacroItem({ label, value, unit, color }) {
    return (
        <div className="bg-[#1a1a20] p-3 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center shadow-md hover:border-gray-700 transition-all">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter mb-1">{label}</span>
            <span className="text-sm font-black text-white">{Math.round(value)}{unit}</span>
            <div className="w-8 h-1 mt-2 rounded-full" style={{ backgroundColor: color, opacity: 0.3 }} />
        </div>
    );
}
