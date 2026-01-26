import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { registerPlugin } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Watch, Smartphone, CheckCircle2, RefreshCcw, Wifi, Bluetooth, Battery, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from "@/components/ui/use-toast";

const WearPlugin = registerPlugin('WearPlugin');

export default function WatchPairing() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pairingCode, setPairingCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [watchStatus, setWatchStatus] = useState({
    connected: false,
    name: '',
    battery: null
  });

  useEffect(() => {
    let successListener;
    let statusListener;

    const setupListeners = async () => {
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

            statusListener = await WearPlugin.addListener('onStatusUpdate', (data) => {
              setWatchStatus(prev => ({
                ...prev,
                connected: true,
                battery: data.batteryLevel
              }));
            });

            // Vérifier la connexion actuelle au chargement
            const result = await WearPlugin.getConnectedNodes();
            if (result.connected) {
              setWatchStatus({
                connected: true,
                name: result.name,
                battery: result.batteryLevel || null
              });
              setIsSuccess(true);
            }
        } catch (e) {
            console.error("Erreur WearPlugin", e);
        }
    };

    setupListeners();

    return () => {
      if (successListener) successListener.remove();
      if (statusListener) statusListener.remove();
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

  if (isSuccess || watchStatus.connected) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="bg-[#1a1a20] border-gray-800 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4">
             <div className="flex items-center gap-1 bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-green-500/20">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Connecté
             </div>
          </div>

          <CardHeader className="text-center pt-12 pb-8">
            <div className="flex justify-center mb-6 relative">
              <div className="w-24 h-24 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] rounded-full flex items-center justify-center p-1 shadow-[0_0_30px_rgba(123,44,191,0.3)]">
                <div className="w-full h-full bg-[#1a1a20] rounded-full flex items-center justify-center">
                   <Watch size={48} className="text-white" />
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#00f5d4] text-black p-2 rounded-xl shadow-lg">
                 <CheckCircle2 size={20} />
              </div>
            </div>
            <CardTitle className="text-3xl font-black text-white uppercase italic tracking-tighter">
              {watchStatus.name || "Ma Montre"}
            </CardTitle>
            <CardDescription className="text-gray-400 font-medium">
              Synchronisation active
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
             <div className="grid grid-cols-1 gap-4">
                <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                         <Battery size={20} />
                      </div>
                      <div>
                         <p className="text-[10px] font-bold text-gray-500 uppercase">Niveau Batterie</p>
                         <p className="text-xl font-black text-white">{watchStatus.battery !== null ? `${watchStatus.battery}%` : '--'}</p>
                      </div>
                   </div>
                   {watchStatus.battery !== null && (
                      <div className="w-12 h-6 bg-gray-800 rounded-md p-1 border border-white/10">
                         <div
                            className={`h-full rounded-sm transition-all duration-1000 ${watchStatus.battery > 20 ? 'bg-[#00f5d4]' : 'bg-red-500'}`}
                            style={{ width: `${watchStatus.battery}%` }}
                         />
                      </div>
                   )}
                </div>

                <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex items-center gap-3">
                   <div className="p-2 bg-[#7b2cbf]/10 rounded-lg text-[#9d4edd]">
                      <RefreshCcw size={20} />
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">Dernière Sync</p>
                      <p className="text-sm font-bold text-white italic">À l'instant</p>
                   </div>
                </div>
             </div>

             <div className="bg-yellow-500/5 border border-yellow-500/20 p-4 rounded-2xl flex gap-3">
                <Info size={20} className="text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-500/80 leading-relaxed italic">
                   L'option de saisie manuelle a été désactivée pour éviter les conflits. La montre gère désormais vos pas automatiquement via le podomètre.
                </p>
             </div>

             <Button
                className="w-full bg-white/5 hover:bg-white/10 text-gray-400 font-bold h-12 rounded-xl"
                onClick={() => setIsSuccess(false)}
              >
                DÉCONNECTER LA MONTRE
              </Button>
          </CardContent>
        </Card>
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
          <CardTitle className="text-2xl font-black text-white uppercase italic">
            Connecter ma Montre
          </CardTitle>
          <CardDescription className="text-gray-400">
            Saisissez le code à 6 chiffres affiché sur votre montre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">
              Code de jumelage
            </label>
            <Input
              type="number"
              placeholder="000 000"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.slice(0, 6))}
              className="bg-black border-gray-800 text-center text-2xl font-black tracking-[10px] h-16 text-[#00f5d4] focus:border-[#7b2cbf] rounded-2xl"
              disabled={isPairing}
            />
          </div>

          <Button
            className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] hover:opacity-90 text-white font-black h-14 shadow-[0_0_20px_rgba(123,44,191,0.4)] rounded-2xl text-lg italic"
            onClick={handlePairing}
            disabled={isPairing || pairingCode.length !== 6}
          >
            {isPairing ? (
              <><RefreshCcw className="mr-2 animate-spin" size={18} /> CONNEXION...</>
            ) : (
              "VALIDER LE CODE"
            )}
          </Button>

          <div className="pt-6 border-t border-gray-800">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">Guide Rapide</h4>
            <div className="space-y-4">
               <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-gray-400 border border-white/10 shrink-0">1</div>
                  <p className="text-xs text-gray-500 leading-tight italic">Ouvrez l'application <span className="text-white font-bold">KAYBEE</span> sur votre montre.</p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-gray-400 border border-white/10 shrink-0">2</div>
                  <p className="text-xs text-gray-500 leading-tight italic">Un code de jumelage s'affichera automatiquement.</p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-gray-400 border border-white/10 shrink-0">3</div>
                  <p className="text-xs text-gray-500 leading-tight italic">Saisissez-le ci-dessus pour activer la synchronisation.</p>
               </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
