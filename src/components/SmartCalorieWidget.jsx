import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Flame, Utensils, Activity, Plus, ScanSearch, BellRing, X, Zap, Camera, Upload, History, ChefHat, Loader2, Sparkles, Send, MessageSquare, AlertCircle, Trash2, Eye } from 'lucide-react';
import { doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { getDatabase, ref as dbRef, update, onValue } from "firebase/database";
import { db, app } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { analyzeFoodChat } from '@/lib/geminicalcul';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

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
        const nutritionRef = dbRef(rtdb, `users/${currentUser.uid}/live_data/nutrition`);
        const unsubscribe = onValue(nutritionRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
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
            await update(rtdbLiveRef, { calories_consumed: safeConsumed + cleanData.calories, nutrition: updatedMacros });

            setFoodInput("");
            setInputMode(false);
            setChatMode(false);
            setChatHistory([]);
            setPendingData(null);
        } catch (e) { console.error("Erreur save nutrition:", e); }
    };

    const deleteMeal = async (mealId) => {
        if (!currentUser) return;
        const today = new Date().toISOString().split('T')[0];
        const mealToDelete = dailyMeals.find(m => m.id === mealId);
        if (!mealToDelete) return;

        const newMeals = dailyMeals.filter(m => m.id !== mealId);
        const userRef = doc(db, "users", currentUser.uid);
        const historyRef = doc(db, "users", currentUser.uid, "nutrition_history", today);
        const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);

        try {
            const updatedMacros = {
                calories: Math.max(0, todayMacros.calories - mealToDelete.calories),
                protein: Math.max(0, todayMacros.protein - mealToDelete.protein),
                carbs: Math.max(0, todayMacros.carbs - mealToDelete.carbs),
                fats: Math.max(0, todayMacros.fats - mealToDelete.fats),
                fiber: Math.max(0, todayMacros.fiber - mealToDelete.fiber),
                sugar: Math.max(0, todayMacros.sugar - mealToDelete.sugar),
                date: today,
                meals: newMeals,
                timestamp: Date.now()
            };

            await updateDoc(userRef, { dailyCalories: updatedMacros.calories });
            await setDoc(historyRef, updatedMacros);
            await update(rtdbLiveRef, { calories_consumed: updatedMacros.calories, nutrition: updatedMacros });
            setSelectedMealDetail(null);
        } catch (e) { console.error("Erreur suppression:", e); }
    };

    const handleInitialAnalyze = async (isImage = false, base64 = null) => {
        setIsThinking(true);
        try {
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

            {/* MODALE D'AJOUT IA */}
            <Dialog open={inputMode} onOpenChange={(open) => { if(!isThinking) { setInputMode(open); if(!open) { setChatMode(false); setChatHistory([]); setPendingData(null); setPreviewImage(null); } } }}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white overflow-hidden max-w-sm p-0 rounded-3xl shadow-3xl">
                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="flex items-center gap-2 text-xl font-black italic uppercase italic tracking-tighter">
                                {chatMode ? <MessageSquare className="text-[#00f5d4]" /> : <ChefHat className="text-[#7b2cbf]" />}
                                {chatMode ? "Détails IA" : "Nutrition Intelligent"}
                            </DialogTitle>
                        </DialogHeader>

                        {isThinking ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-6">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center"><Utensils className="text-white animate-bounce" size={32} /></div>
                                </div>
                                <div className="text-center">
                                    <p className="text-[#00f5d4] font-black italic animate-pulse uppercase text-sm">Calcul en cours...</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">L'IA décompose tes ingrédients</p>
                                </div>
                            </div>
                        ) : chatMode ? (
                            <div className="space-y-4">
                                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 max-h-64 overflow-y-auto space-y-4 custom-scrollbar">
                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                                            <div className={`max-w-[90%] p-3 rounded-2xl text-xs font-bold leading-relaxed shadow-lg ${msg.role === 'ai' ? 'bg-[#1a1a20] text-gray-300 border border-[#7b2cbf]/30' : 'bg-[#00f5d4] text-black'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {pendingData ? (
                                    <div className="space-y-3">
                                        <div className="bg-[#00f5d4]/5 p-3 rounded-xl border border-[#00f5d4]/20 flex justify-between items-center">
                                            <p className="text-xs font-black text-[#00f5d4] uppercase">Total estimé</p>
                                            <p className="text-lg font-black text-white">{pendingData.calories} kcal</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <Button onClick={() => { setChatMode(false); setPendingData(null); }} variant="ghost" className="flex-1 text-gray-500 font-bold">Annuler</Button>
                                            <Button onClick={() => saveNutritionToFirebase(pendingData)} className="flex-1 bg-[#00f5d4] text-black font-black rounded-xl shadow-lg">CONFIRMER</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Input placeholder="Ajoute des détails..." value={foodInput} onChange={(e) => setFoodInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChatFollowUp()} className="bg-black border-gray-800 pr-12 h-12 rounded-xl text-white font-bold" />
                                        <button onClick={handleChatFollowUp} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00f5d4] hover:scale-110 transition-transform"><Send size={20}/></button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Décrivez votre repas</p>
                                    <Input placeholder="Ex: 3 tranches de pain complet..." value={foodInput} onChange={(e) => setFoodInput(e.target.value)} className="bg-black border-gray-800 h-14 rounded-2xl text-lg font-bold" />
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    <Button onClick={() => handleInitialAnalyze(false)} disabled={!foodInput} className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-black h-14 rounded-2xl shadow-xl hover:scale-[1.02] transition-transform">ANALYSER LE REPAS</Button>
                                    <div className="relative flex items-center py-2"><div className="flex-grow border-t border-gray-800"></div><span className="mx-4 text-gray-600 text-[10px] font-black uppercase">OU</span><div className="flex-grow border-t border-gray-800"></div></div>
                                    <Button onClick={() => fileInputRef.current.click()} className="bg-white text-black font-black h-14 rounded-2xl shadow-xl hover:scale-[1.02] transition-transform"><Camera className="mr-2 h-5 w-5"/> PRENDRE UNE PHOTO</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* MODALE DÉTAIL D'UN REPAS ENREGISTRÉ */}
            <Dialog open={!!selectedMealDetail} onOpenChange={() => setSelectedMealDetail(null)}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-3xl max-w-xs p-6 shadow-3xl">
                    {selectedMealDetail && (
                        <div className="space-y-6 text-center">
                            <div>
                                <h3 className="text-xl font-black italic uppercase text-white mb-1">{selectedMealDetail.name}</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase">{new Date(selectedMealDetail.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <DetailMacro label="PROT" value={selectedMealDetail.protein} color="#3b82f6" />
                                <DetailMacro label="GLUC" value={selectedMealDetail.carbs} color="#00f5d4" />
                                <DetailMacro label="LIP" value={selectedMealDetail.fats} color="#f59e0b" />
                                <DetailMacro label="FIBRE" value={selectedMealDetail.fiber} color="#10b981" />
                            </div>

                            <div className="pt-4 border-t border-gray-800 flex gap-3">
                                <Button onClick={() => deleteMeal(selectedMealDetail.id)} variant="destructive" className="flex-1 h-12 rounded-xl font-black"><Trash2 size={18} className="mr-2"/> SUPPRIMER</Button>
                                <Button onClick={() => setSelectedMealDetail(null)} variant="ghost" className="h-12 text-gray-500 font-bold">Fermer</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function MacroItem({ label, value, unit, color }) {
    const safeVal = Number(value) || 0;
    return (
        <div className="bg-[#1a1a20] border border-gray-800 p-3 rounded-xl text-center shadow-md">
            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{label}</p>
            <p className="text-lg font-black text-white" style={{ color }}>{Math.round(safeVal)}<span className="text-[10px] ml-0.5">{unit}</span></p>
        </div>
    );
}

function DetailMacro({ label, value, color }) {
    return (
        <div className="bg-black/40 p-3 rounded-xl border border-white/5">
            <p className="text-[8px] font-black text-gray-500 uppercase mb-1">{label}</p>
            <p className="text-sm font-black" style={{ color }}>{value}g</p>
        </div>
    );
}
