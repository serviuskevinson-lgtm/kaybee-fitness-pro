import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { registerPlugin } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Watch, Smartphone, CheckCircle2, RefreshCcw, Wifi, Bluetooth } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from "@/components/ui/use-toast";

// On utilise le nom exact déclaré dans l'annotation Java @CapacitorPlugin(name = "WearPlugin")
const WearPlugin = registerPlugin('WearPlugin');

export default function WatchPairing() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pairingCode, setPairingCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    let successListener;

    const setupListener = async () => {
        try {
            successListener = await WearPlugin.addListener('onPairSuccess', () => {
              setIsSuccess(true);
              setIsPairing(false);
              toast({
                title: "Succès !",
                description: "Votre montre est maintenant connectée.",
                variant: "default",
              });
            });
        } catch (e) {
            console.error("Impossible d'ajouter l'écouteur WearPlugin", e);
        }
    };

    setupListener();

    return () => {
      if (successListener) successListener.remove();
    };
  }, [toast]);

  const handlePairing = async () => {
    if (pairingCode.length !== 6) {
      toast({
        title: "Erreur",
        description: "Le code doit comporter 6 chiffres.",
        variant: "destructive",
      });
      return;
    }

    setIsPairing(true);
    try {
      // Vérification si le plugin est disponible avant l'appel
      if (!WearPlugin) {
        throw new Error("Plugin WearPlugin non chargé");
      }

      await WearPlugin.pairWatch({
        pairingCode: pairingCode,
        userId: currentUser.uid
      });

      toast({
        title: "Demande envoyée",
        description: "Vérifiez votre montre pour la confirmation.",
      });
    } catch (error) {
      setIsPairing(false);
      console.error("Erreur Appel pairWatch:", error);
      toast({
        title: "Erreur de connexion",
        description: error.message || "Impossible de joindre la montre.",
        variant: "destructive",
      });
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle2 size={48} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Montre Connectée !</h2>
        <p className="text-gray-400 mb-8 max-w-xs">
          Vos données de santé seront désormais synchronisées en temps réel.
        </p>
        <Button
          className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white px-8"
          onClick={() => window.history.back()}
        >
          Retour au profil
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="bg-[#1a1a20] border-gray-800">
        <CardHeader className="text-center">
          <div className="flex justify-center gap-4 mb-4">
            <Smartphone className="text-gray-500" size={32} />
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-[#00f5d4] rounded-full animate-ping" />
              <span className="w-8 h-[2px] bg-gradient-to-r from-gray-700 via-[#00f5d4] to-gray-700" />
            </div>
            <Watch className="text-[#9d4edd]" size={32} />
          </div>
          <CardTitle className="text-2xl font-black text-white uppercase">
            Connecter ma Montre
          </CardTitle>
          <CardDescription className="text-gray-400">
            Saisissez le code affiché sur votre montre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
              Code de jumelage (6 chiffres)
            </label>
            <Input
              type="number"
              placeholder="000 000"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.slice(0, 6))}
              className="bg-black border-gray-800 text-center text-2xl font-black tracking-[10px] h-16 text-[#00f5d4] focus:border-[#7b2cbf]"
              disabled={isPairing}
            />
          </div>

          <Button
            className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] hover:opacity-90 text-white font-bold h-12 shadow-[0_0_20px_rgba(123,44,191,0.4)]"
            onClick={handlePairing}
            disabled={isPairing || pairingCode.length !== 6}
          >
            {isPairing ? (
              <><RefreshCcw className="mr-2 animate-spin" size={18} /> Connexion...</>
            ) : (
              "VALIDER LE CODE"
            )}
          </Button>

          <div className="pt-6 border-t border-gray-800">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Aide</h4>
            <div className="space-y-3">
              <div className="flex gap-3 text-sm text-gray-400 italic">
                Note: Assurez-vous que l'application Kaybee est ouverte sur la montre.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
