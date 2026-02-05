import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Flame, Clock, Camera, Scale, ChevronRight, CheckCircle2, Star, MessageSquareQuote } from 'lucide-react';
import { generateWorkoutFeedback } from '@/lib/gemini';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { motion, AnimatePresence } from 'framer-motion';

export default function PostSession({ isOpen, stats, workout, userId, onComplete }) {
  const [step, setStep] = useState(1); // 1: Summary/AI, 2: Weight, 3: Photo
  const [aiFeedback, setAiFeedback] = useState("");
  const [loadingAI, setLoadingAI] = useState(true);
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && step === 1 && !aiFeedback) {
      const getFeedback = async () => {
        try {
          const feedback = await generateWorkoutFeedback(workout, stats);
          setAiFeedback(feedback);
        } catch (e) {
          setAiFeedback("Super séance ! Continue comme ça, la régularité est la clé du succès.");
        } finally {
          setLoadingAI(false);
        }
      };
      getFeedback();
    }
  }, [isOpen, step]);

  const handleNext = () => setStep(step + 1);

  const handleSaveWeight = async () => {
    if (weight) {
      try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
          weight: parseFloat(weight),
          weightHistory: arrayUnion({
            date: new Date().toISOString(),
            value: parseFloat(weight)
          })
        });
      } catch (e) { console.error("Error saving weight", e); }
    }
    handleNext();
  };

  const takePhoto = async () => {
    try {
      const image = await CapCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      // Simulation de sauvegarde dans la galerie privée
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        gallery: arrayUnion({
          url: image.dataUrl,
          date: new Date().toISOString(),
          type: 'post_workout',
          private: true
        })
      });

      onComplete();
    } catch (e) {
      console.error("Camera error", e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-[#0a0a0f] border-none text-white max-w-lg p-0 overflow-hidden rounded-3xl">
        <div className="max-h-[90vh] overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="inline-flex p-3 bg-[#00f5d4]/20 rounded-full text-[#00f5d4] mb-2">
                    <Star size={32} fill="currentColor" />
                  </div>
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter">Séance Terminée !</h2>
                  <p className="text-gray-400 font-bold">Excellent travail aujourd'hui.</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#1a1a20] p-4 rounded-2xl border border-white/5 text-center">
                    <Clock size={20} className="mx-auto mb-2 text-[#7b2cbf]" />
                    <p className="text-[10px] text-gray-500 uppercase font-black">Temps</p>
                    <p className="text-lg font-black">{Math.floor(stats.time / 60)}m</p>
                  </div>
                  <div className="bg-[#1a1a20] p-4 rounded-2xl border border-white/5 text-center">
                    <Flame size={20} className="mx-auto mb-2 text-orange-500" />
                    <p className="text-[10px] text-gray-500 uppercase font-black">Calories</p>
                    <p className="text-lg font-black">{stats.calories}</p>
                  </div>
                  <div className="bg-[#1a1a20] p-4 rounded-2xl border border-white/5 text-center">
                    <Activity size={20} className="mx-auto mb-2 text-[#00f5d4]" />
                    <p className="text-[10px] text-gray-500 uppercase font-black">Séries</p>
                    <p className="text-lg font-black">{stats.sets}</p>
                  </div>
                </div>

                <div className="bg-[#7b2cbf]/10 border border-[#7b2cbf]/20 p-5 rounded-3xl space-y-3 relative overflow-hidden">
                  <MessageSquareQuote size={40} className="absolute -right-2 -bottom-2 text-[#7b2cbf]/20" />
                  <p className="text-[10px] font-black text-[#7b2cbf] uppercase tracking-widest">L'IA de Kaybee dit :</p>
                  {loadingAI ? (
                    <div className="space-y-2">
                      <div className="h-4 bg-white/5 rounded animate-pulse w-full"></div>
                      <div className="h-4 bg-white/5 rounded animate-pulse w-3/4"></div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium italic leading-relaxed text-gray-200">
                      "{aiFeedback}"
                    </p>
                  )}
                </div>

                <Button onClick={handleNext} className="w-full h-16 bg-[#00f5d4] text-black font-black text-xl italic rounded-2xl shadow-xl hover:scale-[1.02] transition-all">
                  CONCLURE LA SÉANCE <ChevronRight className="ml-2" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="weight"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 space-y-8 text-center"
              >
                <div className="bg-[#fdcb6e]/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-[#fdcb6e]">
                  <Scale size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black italic uppercase">Nouvelle Pesée ?</h3>
                  <p className="text-gray-400">Enregistre ton poids actuel pour suivre ton évolution.</p>
                </div>

                <div className="relative max-w-[200px] mx-auto">
                  <Input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="00.0"
                    className="h-20 bg-[#1a1a20] border-2 border-gray-800 rounded-3xl text-center text-4xl font-black text-white focus:border-[#fdcb6e] transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-black">KG</span>
                </div>

                <div className="flex flex-col gap-3">
                  <Button onClick={handleSaveWeight} className="h-16 bg-[#fdcb6e] text-black font-black text-lg italic rounded-2xl">
                    VALIDER LE POIDS
                  </Button>
                  <Button variant="ghost" onClick={handleNext} className="text-gray-500 font-bold">
                    PAS MAINTENANT
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="photo"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 space-y-8 text-center"
              >
                <div className="bg-[#a29bfe]/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-[#a29bfe]">
                  <Camera size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black italic uppercase">Photo Post-Workout</h3>
                  <p className="text-gray-400">Capture ton effort ! La photo sera enregistrée dans ta galerie privée.</p>
                </div>

                <div className="flex flex-col gap-4">
                  <Button onClick={takePhoto} className="h-24 bg-gradient-to-r from-[#7b2cbf] to-[#a29bfe] text-white font-black text-xl italic rounded-3xl shadow-lg flex flex-col items-center justify-center gap-2">
                    <Camera size={28} />
                    PRENDRE LA PHOTO
                  </Button>
                  <Button variant="ghost" onClick={onComplete} className="text-gray-500 font-bold">
                    PROCHAINE FOIS
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
