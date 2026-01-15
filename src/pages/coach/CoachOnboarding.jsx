import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { Camera, DollarSign, MapPin, Check, Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";

const SPECIALTIES = ["Perte de poids", "Prise de masse", "Powerlifting", "Yoga", "Préparation physique", "CrossFit", "Post-partum", "Seniors"];

export default function CoachOnboarding() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    bio: "",
    city: "",
    specialties: [],
    yearsExperience: "",
    rates: [{ title: "Suivi Mensuel", price: "100", desc: "Plan alimentaire et entraînement" }]
  });

  const updateRate = (index, field, value) => {
    const newRates = [...formData.rates];
    newRates[index][field] = value;
    setFormData({ ...formData, rates: newRates });
  };

  const addRate = () => {
    setFormData({ ...formData, rates: [...formData.rates, { title: "", price: "", desc: "" }] });
  };

  const toggleSpecialty = (spec) => {
    if (formData.specialties.includes(spec)) {
        setFormData({ ...formData, specialties: formData.specialties.filter(s => s !== spec) });
    } else {
        if (formData.specialties.length < 4) {
            setFormData({ ...formData, specialties: [...formData.specialties, spec] });
        }
    }
  };

  const handleFinish = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
        const userRef = doc(db, "users", currentUser.uid);
        
        // 1. Mise à jour du profil User
        await updateDoc(userRef, {
            ...formData,
            onboardingCompleted: true,
            isCoach: true,
            rating: 5.0, // Départ
            reviewCount: 0
        });

        // 2. Création de l'entrée Marketplace (optionnel, peut être fait via Cloud Function aussi)
        // Pour l'instant on met tout dans 'users' car notre page Community lit 'users'
        
        navigate('/'); // Retour au dashboard
    } catch (e) {
        console.error("Erreur save coach", e);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
       <div className="w-full max-w-2xl bg-[#1a1a20] rounded-3xl border border-[#7b2cbf]/30 p-8 shadow-2xl">
          <h1 className="text-3xl font-black text-white italic uppercase mb-2">Profil <span className="text-[#7b2cbf]">Coach</span></h1>
          <p className="text-gray-400 mb-8">Configurez votre profil public pour attirer vos premiers clients.</p>

          <div className="space-y-6">
             {/* BIO & VILLE */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Votre Ville</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-3 text-gray-500 w-4 h-4"/>
                        <input value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} className="w-full bg-black border border-gray-700 rounded-xl p-2.5 pl-10 text-white focus:border-[#7b2cbf] outline-none" placeholder="Ex: Paris"/>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Années d'Exp.</label>
                    <input type="number" value={formData.yearsExperience} onChange={(e) => setFormData({...formData, yearsExperience: e.target.value})} className="w-full bg-black border border-gray-700 rounded-xl p-2.5 text-white focus:border-[#7b2cbf] outline-none" placeholder="Ex: 5"/>
                </div>
             </div>

             <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Biographie (Accroche)</label>
                <textarea value={formData.bio} onChange={(e) => setFormData({...formData, bio: e.target.value})} className="w-full bg-black border border-gray-700 rounded-xl p-3 text-white focus:border-[#7b2cbf] outline-none h-24 resize-none" placeholder="Dites aux clients pourquoi vous êtes le meilleur..."/>
             </div>

             {/* SPECIALITES */}
             <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Spécialités (Max 4)</label>
                <div className="flex flex-wrap gap-2">
                    {SPECIALTIES.map(s => (
                        <button key={s} onClick={() => toggleSpecialty(s)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${formData.specialties.includes(s) ? 'bg-[#7b2cbf] border-[#7b2cbf] text-white' : 'bg-transparent border-gray-700 text-gray-400 hover:border-white'}`}>
                            {s}
                        </button>
                    ))}
                </div>
             </div>

             {/* TARIFS */}
             <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Vos Offres</label>
                <div className="space-y-3">
                    {formData.rates.map((rate, i) => (
                        <div key={i} className="flex gap-2 items-start bg-black/40 p-2 rounded-xl border border-gray-800">
                            <div className="flex-1 space-y-2">
                                <input placeholder="Nom de l'offre" value={rate.title} onChange={(e) => updateRate(i, 'title', e.target.value)} className="w-full bg-transparent text-sm font-bold text-white border-b border-gray-800 focus:border-[#7b2cbf] outline-none"/>
                                <input placeholder="Description courte" value={rate.desc} onChange={(e) => updateRate(i, 'desc', e.target.value)} className="w-full bg-transparent text-xs text-gray-400 outline-none"/>
                            </div>
                            <div className="w-20 relative">
                                <DollarSign className="absolute left-1 top-1.5 w-3 h-3 text-[#00f5d4]"/>
                                <input type="number" placeholder="99" value={rate.price} onChange={(e) => updateRate(i, 'price', e.target.value)} className="w-full bg-gray-900 rounded-lg py-1 pl-5 text-sm font-bold text-[#00f5d4] text-right outline-none"/>
                            </div>
                        </div>
                    ))}
                    <Button variant="ghost" onClick={addRate} className="w-full text-xs text-gray-500 hover:text-white border border-dashed border-gray-800 h-8"><Plus size={14} className="mr-1"/> Ajouter une offre</Button>
                </div>
             </div>

             <Button onClick={handleFinish} disabled={loading} className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] text-white font-black py-6 rounded-xl hover:scale-[1.02] transition-transform mt-4">
                {loading ? "Création..." : "LANCER MON PROFIL COACH"}
             </Button>
          </div>
       </div>
    </div>
  );
}