import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

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

    const baseGoal = Number(userProfile?.nutritionalGoal) || 2000;
    const safeConsumed = Number(consumed) || 0;
    const safeBurned = Number(burned) || 0;
    const totalBurned = baseGoal + safeBurned;
    const balance = safeConsumed - totalBurned;

    useEffect(() => {
        if (!currentUser) return;

        const today = new Date().toISOString().split('T')[0];
        const rtdbLiveRef = dbRef(rtdb, `users/${currentUser.uid}/live_data`);
        const nutritionRef = dbRef(rtdb, `users/${currentUser.uid}/live_data/nutrition`);

        const unsubscribe = onValue(nutritionRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.date && data.date !== today) {
                    update(rtdbLiveRef, {
                        calories_consumed: 0,
                        nutrition: { protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, calories: 0, meals: [], date: today, timestamp: Date.now() }
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
            <Card className="bg-[#1a1a20] border-gray-800 rounded-3xl overflow-hidden relative shadow-2xl">
                <CardHeader className="pb-2 border-b border-white/5 bg-white/5">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                            <Zap size={16} className="text-[#fdcb6e] animate-pulse" /> Balance Énergétique
                        </CardTitle>
                        <Button variant="ghost" size="sm" className="text-[#7b2cbf] hover:bg-white/5" onClick={() => { setInputMode(true); setTimeout(() => fileInputRef.current?.click(), 100); }}>
                            <Camera size={18} />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
                        {/* GRAPHIQUE CIRCULAIRE (Style Capture 1) */}
                        <div className="relative w-44 h-44">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={[{value: safeConsumed}, {value: totalBurned}]} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        <Cell fill="#00f5d4" />
                                        <Cell fill="#ff7675" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`text-3xl font-black italic ${balance >= 0 ? 'text-[#00f5d4]' : 'text-[#ff7675]'}`}>{balance > 0 ? '+' : ''}{Math.round(balance)}</span>
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Balance</span>
                            </div>
                        </div>

                        {/* STATS & BOUTON (Style Capture 2 Mixé) */}
                        <div className="flex-1 w-full space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">État Actuel</h4>
                                    <p className="text-sm font-bold text-gray-300 italic">
                                        {balance > 200 ? "Surplus calorique (Prise de masse)" : balance < -200 ? "Déficit calorique (Sèche)" : "Maintenance"}
                                    </p>
                                </div>
                                <Button onClick={() => setInputMode(true)} className="bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] hover:scale-105 transition-transform text-white font-black uppercase italic rounded-2xl h-12 px-6 shadow-xl flex items-center gap-2">
                                    <Plus size={20} /> Ajouter
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-[#00f5d4]/30 transition-all">
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">Mangé</span>
                                    <div className="flex items-center gap-2 text-[#00f5d4]">
                                        <Utensils size={14} />
                                        <span className="text-2xl font-black italic">{safeConsumed}</span>
                                        <span className="text-[10px] font-bold text-gray-600">KCAL</span>
                                    </div>
                                </div>
                                <div className="p-4 bg-black/40 rounded-2xl border border-white/5 group hover:border-[#ff7675]/30 transition-all">
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">Brûlé (Est.)</span>
                                    <div className="flex items-center gap-2 text-[#ff7675]">
                                        <Flame size={14} />
                                        <span className="text-2xl font-black italic">{Math.round(totalBurned)}</span>
                                        <span className="text-[10px] font-bold text-gray-600">KCAL</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* HISTORIQUE DU JOUR */}
                    <div className="space-y-3 pt-6 border-t border-white/5">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2"><History size={12}/> Historique du jour</p>
                            <Badge variant="outline" className="bg-[#7b2cbf]/10 text-[#9d4edd] border-[#7b2cbf]/20 text-[9px]">{dailyMeals.length} Repas</Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                            {dailyMeals.length > 0 ? dailyMeals.map((meal) => (
                                <div key={meal.id} onClick={() => setSelectedMealDetail(meal)} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-black/40 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#7b2cbf]" />
                                        <p className="text-xs font-bold text-white truncate uppercase">{meal.name}</p>
                                    </div>
                                    <span className="text-[10px] font-black text-[#00f5d4] group-hover:scale-110 transition-transform">{meal.calories} KCAL</span>
                                </div>
                            )) : <p className="text-[10px] text-gray-600 italic py-2">Aucun repas enregistré aujourd'hui.</p>}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* MACROS */}
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
            <Dialog open={inputMode} onOpenChange={(open) => { if(!isThinking) { setInputMode(open); if(!open) { setChatMode(false); setChatHistory([]); setPendingData(null); setPreviewImage(null); setModerationError(null); } } }}>
                <DialogContent className="bg-[#0a0a0f] border-gray-800 text-white overflow-hidden max-w-sm p-0 rounded-[2rem] shadow-3xl">
                    <div className="p-8">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="flex items-center gap-3 text-2xl font-black italic uppercase tracking-tighter">
                                {moderationError ? <ShieldCheck className="text-red-500" /> : chatMode ? <MessageSquare className="text-[#00f5d4]" /> : <ChefHat className="text-[#7b2cbf]" />}
                                {moderationError ? "Sécurité" : chatMode ? "IA Expert" : "Nutrition IA"}
                            </DialogTitle>
                        </DialogHeader>

                        {moderationError ? (
                            <div className="flex flex-col items-center py-6 text-center space-y-4">
                                <AlertCircle size={60} className="text-red-500 animate-bounce" />
                                <h3 className="text-xl font-bold">Contenu non autorisé</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">{moderationError}</p>
                                <Button onClick={() => setInputMode(false)} className="w-full bg-gray-800 hover:bg-gray-700 py-6 rounded-2xl font-black uppercase tracking-widest">Compris</Button>
                            </div>
                        ) : isThinking ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-8">
                                <div className="relative w-32 h-32">
                                    <div className="absolute inset-0 border-4 border-[#7b2cbf] border-t-transparent rounded-full animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center"><Utensils className="text-white animate-bounce" size={40} /></div>
                                </div>
                                <p className="text-[#00f5d4] font-black italic animate-pulse uppercase tracking-widest">Analyse en cours...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {previewImage && (
                                    <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-gray-800 mb-4 shadow-2xl">
                                        <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                                        <Button size="icon" variant="destructive" className="absolute top-3 right-3 rounded-full h-10 w-10 shadow-xl" onClick={() => { setPreviewImage(null); setChatMode(false); }}>
                                            <X size={20} />
                                        </Button>
                                    </div>
                                )}

                                {chatMode ? (
                                    <div className="space-y-6">
                                        <div className="max-h-48 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                            {chatHistory.map((msg, i) => (
                                                <div key={i} className={`p-4 rounded-2xl text-sm font-bold ${msg.role === 'ai' ? 'bg-[#7b2cbf]/20 text-gray-200 border-l-4 border-[#7b2cbf]' : 'bg-white/5 text-[#00f5d4] text-right ml-12 italic'}`}>
                                                    {msg.text}
                                                </div>
                                            ))}
                                        </div>
                                        {pendingData ? (
                                            <div className="flex gap-3">
                                                <Button className="flex-1 bg-[#00f5d4] hover:bg-[#00f5d4]/80 text-black font-black uppercase italic py-7 rounded-2xl shadow-[0_0_20px_rgba(0,245,212,0.3)]" onClick={() => saveNutritionToFirebase(pendingData)}>Confirmer (+{pendingData.calories} kcal)</Button>
                                                <Button variant="ghost" className="h-auto px-4 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-2xl" onClick={() => { setChatMode(false); setPendingData(null); }}><Trash2 size={24}/></Button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-3">
                                                <Input value={foodInput} onChange={(e) => setFoodInput(e.target.value)} placeholder="Précise ici..." className="bg-black/40 border-gray-800 rounded-2xl h-14" onKeyPress={(e) => e.key === 'Enter' && handleChatFollowUp()} />
                                                <Button onClick={handleChatFollowUp} className="bg-[#7b2cbf] rounded-2xl px-5 h-14"><Send size={24}/></Button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="relative group">
                                            <div className="absolute -inset-1 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] rounded-[2rem] blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
                                            <Input value={foodInput} onChange={(e) => setFoodInput(e.target.value)} placeholder="Décrivez votre repas..." className="relative bg-[#0a0a0f] border-gray-800 h-16 rounded-2xl text-lg pl-6 pr-14 focus:border-[#00f5d4] transition-all" onKeyPress={(e) => e.key === 'Enter' && handleInitialAnalyze(false)} />
                                            <Sparkles className="absolute right-5 top-5 text-[#7b2cbf] animate-pulse" size={28} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Button variant="outline" className="h-20 rounded-3xl border-dashed border-gray-700 hover:border-[#7b2cbf] flex flex-col gap-2 group transition-all" onClick={() => fileInputRef.current?.click()}>
                                                <Camera size={24} className="text-gray-500 group-hover:text-[#7b2cbf] group-hover:scale-110 transition-transform" />
                                                <span className="text-[10px] font-black uppercase text-gray-500">Photo Repas</span>
                                            </Button>
                                            <Button disabled={!foodInput} onClick={() => handleInitialAnalyze(false)} className="h-20 rounded-3xl bg-gradient-to-br from-[#7b2cbf] to-[#6c5ce7] text-white font-black uppercase italic tracking-tighter shadow-2xl hover:scale-105 active:scale-95 transition-all">
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

            {/* DÉTAILS REPAS */}
            <Dialog open={!!selectedMealDetail} onOpenChange={() => setSelectedMealDetail(null)}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white rounded-[2rem] max-w-xs p-8 shadow-3xl">
                    <DialogHeader className="mb-6">
                        <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter flex items-center justify-between">
                            Détails
                            <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/10 rounded-full" onClick={() => setSelectedMealDetail(null)}>
                                <X size={20} />
                            </Button>
                        </DialogTitle>
                    </DialogHeader>
                    {selectedMealDetail && (
                        <div className="space-y-6">
                            <div className="p-6 bg-black/40 rounded-3xl border border-[#7b2cbf]/30 text-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5"><Utensils size={60} /></div>
                                <h4 className="text-[#00f5d4] font-black uppercase text-lg mb-2">{selectedMealDetail.name}</h4>
                                <p className="text-5xl font-black italic tracking-tighter">{selectedMealDetail.calories} <span className="text-xs font-black text-gray-500 uppercase tracking-widest">kcal</span></p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <MacroDetail label="Prot" value={selectedMealDetail.protein} color="#3b82f6" />
                                <MacroDetail label="Gluc" value={selectedMealDetail.carbs} color="#00f5d4" />
                                <MacroDetail label="Lip" value={selectedMealDetail.fats} color="#f59e0b" />
                                <MacroDetail label="Fib" value={selectedMealDetail.fiber} color="#10b981" />
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
        <div className="bg-[#1a1a20] p-4 rounded-3xl border border-gray-800 flex flex-col items-center justify-center text-center shadow-lg hover:border-[#7b2cbf]/30 transition-all group">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 group-hover:text-gray-300 transition-colors">{label}</span>
            <span className="text-sm font-black text-white italic">{Math.round(value)}{unit}</span>
            <div className="w-10 h-1 mt-3 rounded-full" style={{ backgroundColor: color, opacity: 0.2 }} />
        </div>
    );
}

function MacroDetail({ label, value, color }) {
    return (
        <div className="p-3 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center">
            <p className="text-[9px] uppercase text-gray-500 font-black tracking-widest mb-1">{label}</p>
            <p className="font-black text-lg italic">{value}g</p>
            <div className="w-6 h-0.5 mt-2 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
        </div>
    );
}
