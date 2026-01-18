import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Target, Calendar, TrendingUp, ChevronRight } from 'lucide-react';

const GOALS_OPTIONS = [
  "Hypertrophy (Building Muscle Size)",
  "Maximum Strength",
  "The 'V-Taper' Physique",
  "Athletic Performance",
  "Fat Loss & Lean Muscle",
  "Lower Body Development (Glutes & Legs)",
  "'Toning' without 'Bulking'",
  "Flexibility & Core Strength"
];

export default function Onboarding() {
  const { currentUser, updateUserProfile } = useAuth();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Données de l'utilisateur (pour récupérer le poids actuel)
  const [userData, setUserData] = useState(null);

  // Réponses
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [otherGoal, setOtherGoal] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [hasTargetDate, setHasTargetDate] = useState(null); // null, true, false
  const [targetDate, setTargetDate] = useState("");

  // Charger les données initiales (poids de départ)
  useEffect(() => {
    const fetchUser = async () => {
        if(currentUser) {
            const snap = await getDoc(doc(db, "users", currentUser.uid));
            if(snap.exists()) {
                setUserData(snap.data());
                setTargetWeight(snap.data().weight); // Pré-remplir avec poids actuel
            }
        }
    }
    fetchUser();
  }, [currentUser]);

  const toggleGoal = (goal) => {
    if (selectedGoals.includes(goal)) {
      setSelectedGoals(selectedGoals.filter(g => g !== goal));
    } else {
      setSelectedGoals([...selectedGoals, goal]);
    }
  };

  const calculateWeightDiff = () => {
    if (!userData || !targetWeight) return null;
    const current = parseFloat(userData.weight);
    const target = parseFloat(targetWeight);
    const diff = target - current;
    
    if (diff === 0) return "Maintenir le poids";
    return diff > 0 
      ? `Gagner +${diff.toFixed(1)} ${userData.weightUnit}` 
      : `Perdre ${diff.toFixed(1)} ${userData.weightUnit}`;
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
        const finalGoals = otherGoal ? [...selectedGoals, otherGoal] : selectedGoals;
        
        await updateUserProfile({
            goals: finalGoals,
            targetWeight: targetWeight,
            targetDate: hasTargetDate ? targetDate : null,
            onboardingCompleted: true // Marque l'onboarding comme fini !
        });
        
        navigate('/'); // Direction Dashboard
    } catch (error) {
        console.error("Erreur sauvegarde", error);
    }
    setLoading(false);
  };

  if (!userData) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Chargement...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]" />
      
      <div className="max-w-xl w-full z-10">
        
        {/* BARRE DE PROGRESSION */}
        <div className="flex gap-2 mb-8">
            {[1, 2, 3].map(i => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-all ${step >= i ? 'bg-[#00f5d4]' : 'bg-gray-800'}`} />
            ))}
        </div>

        {/* ÉTAPE 1 : OBJECTIFS */}
        {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right duration-500">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <Target className="text-[#7b2cbf]" /> Quel est votre objectif ?
                </h1>
                <p className="text-gray-400 mb-6">Sélectionnez une ou plusieurs options.</p>
                
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    {GOALS_OPTIONS.map(goal => (
                        <button
                            key={goal}
                            onClick={() => toggleGoal(goal)}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${
                                selectedGoals.includes(goal) 
                                ? 'bg-[#7b2cbf]/20 border-[#00f5d4] text-white shadow-[0_0_10px_rgba(0,245,212,0.2)]' 
                                : 'bg-[#1a1a20] border-gray-800 text-gray-400 hover:border-gray-600'
                            }`}
                        >
                            {goal}
                        </button>
                    ))}
                    <input 
                        type="text" 
                        placeholder="Autre (Précisez...)"
                        value={otherGoal}
                        onChange={(e) => setOtherGoal(e.target.value)}
                        className="w-full p-4 rounded-xl bg-[#1a1a20] border border-gray-800 focus:border-[#00f5d4] outline-none text-white"
                    />
                </div>
                
                <button 
                    onClick={() => setStep(2)} 
                    disabled={selectedGoals.length === 0 && !otherGoal}
                    className="w-full mt-6 bg-white text-black font-bold py-4 rounded-xl hover:bg-[#00f5d4] transition disabled:opacity-50"
                >
                    Suivant
                </button>
            </div>
        )}

        {/* ÉTAPE 2 : POIDS CIBLE */}
        {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right duration-500">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <TrendingUp className="text-[#7b2cbf]" /> Objectif de Poids
                </h1>
                <p className="text-gray-400 mb-8">Définissons votre cible.</p>

                <div className="bg-[#1a1a20] p-6 rounded-2xl border border-gray-800 text-center mb-6">
                    <p className="text-sm text-gray-500 mb-1">Poids Actuel</p>
                    <p className="text-2xl font-bold">{userData.weight} <span className="text-sm text-[#7b2cbf]">{userData.weightUnit}</span></p>
                </div>

                <div className="space-y-4">
                    <label className="block text-sm text-gray-400">Poids Cible ({userData.weightUnit})</label>
                    <input 
                        type="number" 
                        value={targetWeight}
                        onChange={(e) => setTargetWeight(e.target.value)}
                        className="w-full text-center text-4xl font-bold bg-transparent border-b-2 border-[#7b2cbf] focus:border-[#00f5d4] outline-none py-2 text-white"
                    />
                    
                    {/* Calcul de la différence */}
                    <div className="text-center py-4">
                        <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
                            parseFloat(targetWeight) < parseFloat(userData.weight) ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'
                        }`}>
                            {calculateWeightDiff()}
                        </span>
                    </div>
                </div>

                <div className="flex gap-4 mt-8">
                    <button onClick={() => setStep(1)} className="flex-1 py-4 text-gray-400 hover:text-white">Retour</button>
                    <button onClick={() => setStep(3)} className="flex-[2] bg-white text-black font-bold py-4 rounded-xl hover:bg-[#00f5d4] transition">Suivant</button>
                </div>
            </div>
        )}

        {/* ÉTAPE 3 : DATE CIBLE */}
        {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right duration-500">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <Calendar className="text-[#7b2cbf]" /> Une date limite ?
                </h1>
                <p className="text-gray-400 mb-8">Visez-vous une date précise pour cet objectif ?</p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <button 
                        onClick={() => setHasTargetDate(false)}
                        className={`p-6 rounded-xl border text-center transition ${hasTargetDate === false ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white' : 'bg-[#1a1a20] border-gray-800 text-gray-400'}`}
                    >
                        Non, pas de pression
                    </button>
                    <button 
                        onClick={() => setHasTargetDate(true)}
                        className={`p-6 rounded-xl border text-center transition ${hasTargetDate === true ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white' : 'bg-[#1a1a20] border-gray-800 text-gray-400'}`}
                    >
                        Oui, j'ai une date
                    </button>
                </div>

                {hasTargetDate && (
                    <div className="animate-in slide-in-from-top fade-in mb-8">
                        <label className="block text-sm text-gray-400 mb-2">Sélectionnez la date</label>
                        <input 
                            type="date" 
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            className="w-full bg-[#1a1a20] border border-gray-700 rounded-xl p-4 text-white focus:border-[#00f5d4] outline-none"
                        />
                    </div>
                )}

                <button 
                    onClick={handleFinish} 
                    disabled={loading || (hasTargetDate && !targetDate)}
                    className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-bold py-4 rounded-xl hover:shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all flex items-center justify-center gap-2"
                >
                    {loading ? 'Finalisation...' : <>Terminer <ChevronRight size={20}/></>}
                </button>
            </div>
        )}

      </div>
    </div>
  );
}