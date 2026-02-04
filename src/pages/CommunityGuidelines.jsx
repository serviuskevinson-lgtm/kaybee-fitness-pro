import React from 'react';
import { ShieldAlert, Image, MessageSquare, Ban, Heart, UserX, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CommunityGuidelines = () => {
  const navigate = useNavigate();

  const rules = [
    {
      title: "Politique contre la nudité et le contenu sexuel",
      icon: <Ban className="text-red-500" />,
      content: "Kaybee Fitness est une plateforme familiale et professionnelle. Sont strictement interdits : la nudité totale ou partielle, les sous-vêtements suggestifs, et tout contenu à caractère sexuel. Les photos de progression doivent être prises en tenue de sport décente (brassière de sport, short de compression, etc.)."
    },
    {
      title: "Respect et Harcèlement",
      icon: <UserX className="text-orange-500" />,
      content: "Tout comportement agressif, commentaire haineux ou harcèlement via la messagerie ou sous les publications de la galerie entraînera un bannissement immédiat. Respectez le parcours de chacun."
    },
    {
      title: "Authenticité des Photos",
      icon: <Image className="text-blue-500" />,
      content: "Nous encourageons le partage de vrais progrès. L'utilisation de photos ne vous appartenant pas ou l'usurpation d'identité est interdite."
    },
    {
      title: "Échanges et Messagerie",
      icon: <MessageSquare className="text-green-500" />,
      content: "La messagerie doit rester un lieu d'entraide et de motivation. Le spam, la promotion de produits non autorisés ou le partage de liens malveillants sont proscrits."
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
          <div className="p-3 bg-red-500/20 rounded-2xl">
            <ShieldAlert className="text-red-500" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Règles de la Communauté</h1>
            <p className="text-gray-400">Pour un environnement sain et motivant.</p>
          </div>
        </div>

        <div className="space-y-6">
          {rules.map((rule, index) => (
            <div
              key={index}
              className="bg-[#1a1a20] border border-gray-800 p-6 rounded-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                {rule.icon}
                <h2 className="text-xl font-bold">{rule.title}</h2>
              </div>
              <p className="text-gray-400 leading-relaxed">
                {rule.content}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 p-8 rounded-3xl bg-gradient-to-r from-[#7b2cbf]/20 to-[#00f5d4]/10 border border-[#7b2cbf]/30 text-center">
          <Heart className="mx-auto mb-4 text-[#00f5d4]" size={40} />
          <h3 className="text-2xl font-black mb-2">MODÉRATION ACTIVE</h3>
          <p className="text-gray-300">
            Notre système utilise l'IA pour scanner les photos dès leur publication. Tout contenu détecté comme inapproprié sera automatiquement supprimé et votre compte pourra faire l'objet d'un examen manuel.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CommunityGuidelines;
