import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { calculateBMR, calculateTDEE } from '@/lib/fitnessCalculations';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Footprints, Target, Plus, Minus, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next'; // <--- IMPORT

export default function HealthTracker({ userProfile }) {
    const { currentUser } = useAuth();
    const { t } = useTranslation(); // <--- HOOK
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // États Données
    const [stats, setStats] = useState({
        steps: 0,
        caloriesConsumed: 0,
        water: 0,
        activityCalories: 0
    });
    
    const [isUpdateOpen, setIsUpdateOpen] = useState(false);
    const [tempSteps, setTempSteps] = useState(0);

    // Calculs
    const bmr = calculateBMR(userProfile?.gender || 'homme', userProfile?.weight, userProfile?.height, userProfile?.age || 30);
    const tdee = calculateTDEE(bmr, userProfile?.activityLevel || 'moderate');
    
    const totalBurned = tdee + stats.activityCalories;
    const deficit = totalBurned - stats.caloriesConsumed;
    const stepGoal = userProfile?.stepGoal || 10000;

    useEffect(() => {
        const fetchDailyStats = async () => {
            if (!currentUser) return;
            const docRef = doc(db, "users", currentUser.uid, "daily_logs", today);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setStats(docSnap.data());
            }
        };
        fetchDailyStats();
    }, [currentUser, today]);

    const updateSteps = async () => {
        const newSteps = stats.steps + parseInt(tempSteps);
        const docRef = doc(db, "users", currentUser.uid, "daily_logs", today);
        const data = { ...stats, steps: newSteps, date: today };
        await setDoc(docRef, data, { merge: true });
        setStats(data);
        setIsUpdateOpen(false);
        setTempSteps(0);
    };

    const updateWater = async (amount) => {
        const newWater = Math.max(0, (stats.water || 0) + amount);
        const docRef = doc(db, "users", currentUser.uid, "daily_logs", today);
        const data = { ...stats, water: newWater, date: today };
        await setDoc(docRef, data, { merge: true });
        setStats(data);
    };

    const isDeficit = deficit > 0;

    return (
        <div className="space-y-6">
            
            {/* CARTE DÉFICIT CALORIQUE */}
            <Card className="bg-[#1a1a20] border-gray-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <Target className="text-[#00f5d4]"/> {t('energy_balance')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-center mb-4 text-center">
                        <div>
                            <p className="text-gray-400 text-xs uppercase">{t('eaten')}</p>
                            <p className="text-xl font-bold text-white">{stats.caloriesConsumed}</p>
                        </div>
                        <div className="text-center px-4">
                            <p className="text-xs text-gray-500 uppercase mb-1">{isDeficit ? t('deficit') : t('surplus')}</p>
                            <span className={`text-2xl font-black ${isDeficit ? 'text-[#00f5d4]' : 'text-red-500'}`}>
                                {isDeficit ? '-' : '+'}{Math.abs(Math.round(deficit))}
                            </span>
                            <p className="text-[10px] text-gray-500">kcal</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-xs uppercase">{t('burned_tdee')}</p>
                            <p className="text-xl font-bold text-white">{Math.round(totalBurned)}</p>
                        </div>
                    </div>
                    {/* Jauge visuelle */}
                    <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                            className="absolute top-0 left-0 h-full bg-white transition-all duration-500" 
                            style={{ width: `${Math.min((stats.caloriesConsumed / totalBurned) * 100, 100)}%` }}
                        />
                        <div className="absolute top-0 bottom-0 w-1 bg-[#00f5d4] left-[80%] z-10"></div>
                    </div>
                    <p className="text-xs text-center mt-2 text-gray-500">
                        {isDeficit ? t('balance_msg_deficit') : t('balance_msg_surplus')}
                    </p>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* CARTE PAS */}
                <Card className="bg-[#1a1a20] border-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white flex justify-between items-center">
                            <span className="flex items-center gap-2"><Footprints className="text-[#7b2cbf]"/> {t('steps')}</span>
                            <Button size="sm" variant="ghost" onClick={() => setIsUpdateOpen(true)} className="h-6 text-xs text-[#7b2cbf] border border-[#7b2cbf]/30">{t('add')}</Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between mb-2">
                            <span className="text-3xl font-black text-white">{stats.steps.toLocaleString()}</span>
                            <span className="text-sm text-gray-500 mb-1">/ {stepGoal.toLocaleString()}</span>
                        </div>
                        <Progress value={(stats.steps / stepGoal) * 100} className="h-2 bg-gray-800 [&>div]:bg-[#7b2cbf]" />
                    </CardContent>
                </Card>

                {/* CARTE EAU */}
                <Card className="bg-[#1a1a20] border-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white flex items-center gap-2">
                            <Droplets className="text-blue-400"/> {t('hydration')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <Button size="icon" variant="outline" onClick={() => updateWater(-0.25)} className="border-gray-700 hover:bg-gray-800"><Minus size={16}/></Button>
                            <div className="text-center">
                                <span className="text-3xl font-black text-white">{stats.water.toFixed(2)}</span>
                                <span className="text-sm text-gray-500 ml-1">L</span>
                            </div>
                            <Button size="icon" variant="outline" onClick={() => updateWater(0.25)} className="border-gray-700 hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500"><Plus size={16}/></Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* MODAL AJOUT PAS */}
            <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
                <DialogContent className="bg-[#1a1a20] border-gray-800 text-white">
                    <DialogHeader>
                        <DialogTitle>{t('add_steps')}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input 
                            type="number" 
                            placeholder="Ex: 2500" 
                            value={tempSteps} 
                            onChange={(e) => setTempSteps(e.target.value)}
                            className="bg-black border-gray-700 text-white text-lg"
                        />
                        <p className="text-xs text-gray-500 mt-2">{t('steps_hint')}</p>
                    </div>
                    <DialogFooter>
                        <Button onClick={updateSteps} className="w-full bg-[#7b2cbf] text-white font-bold">{t('validate')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}