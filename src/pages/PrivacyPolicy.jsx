import React from 'react';
import { Shield, MapPin, Camera, MessageSquare, Lock, EyeOff, FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  const sections = [
    {
      title: "Géolocalisation",
      icon: <MapPin className="text-[#00f5d4]" />,
      content: "Nous utilisons votre localisation uniquement pour calculer vos parcours de course et suggérer des défis locaux. Vos données de position ne sont jamais partagées avec des tiers sans votre consentement explicite et ne sont pas stockées de manière permanente sur nos serveurs une fois l'activité terminée."
    },
    {
      title: "Photos et Médias",
      icon: <Camera className="text-[#7b2cbf]" />,
      content: "L'accès à votre caméra et galerie est utilisé pour analyser vos repas via l'IA et partager vos progrès dans la galerie. Nous ne téléchargeons aucune photo sans votre action volontaire. Les photos de profil et de progression sont stockées de manière sécurisée sur Firebase Storage."
    },
    {
      title: "Échanges de Messages",
      icon: <MessageSquare className="text-[#3b82f6]" />,
      content: "Vos conversations avec l'IA Kaybee ou avec d'autres coachs sont privées. Elles sont chiffrées lors du transfert. Nous utilisons ces données uniquement pour améliorer vos recommandations personnalisées."
    },
    {
      title: "Protection des Données",
      icon: <Lock className="text-[#f59e0b]" />,
      content: "Conformément au RGPD et aux lois locales, vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Vos informations de santé sont traitées avec la plus haute confidentialité."
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6 pb-20">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft size={20} /> Retour
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-[#7b2cbf]/20 rounded-2xl">
            <Shield className="text-[#7b2cbf]" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Confidentialité</h1>
            <p className="text-gray-400">Votre sécurité est notre priorité absolue.</p>
          </div>
        </div>

        <div className="space-y-6">
          {sections.map((section, index) => (
            <div
              key={index}
              className="bg-[#1a1a20] border border-gray-800 p-6 rounded-2xl hover:border-[#7b2cbf]/50 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                {section.icon}
                <h2 className="text-xl font-bold">{section.title}</h2>
              </div>
              <p className="text-gray-400 leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 bg-gradient-to-br from-[#7b2cbf]/10 to-transparent border border-[#7b2cbf]/20 rounded-2xl">
          <div className="flex items-center gap-3 mb-2">
            <EyeOff className="text-[#00f5d4]" size={20} />
            <h3 className="font-bold">Contrôle Total</h3>
          </div>
          <p className="text-sm text-gray-400">
            Vous pouvez révoquer les permissions de localisation ou d'accès aux photos à tout moment dans les réglages de votre téléphone. Cela pourrait limiter certaines fonctionnalités de l'application.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
