import React from 'react';
import { Copyright as CopyrightIcon, FileText, Scale, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Copyright = () => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

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
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <CopyrightIcon className="text-blue-500" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Propriété Intellectuelle</h1>
            <p className="text-gray-400">Mentions légales et droits d'auteur.</p>
          </div>
        </div>

        <div className="space-y-8 text-gray-400">
          <section className="bg-[#1a1a20] border border-gray-800 p-6 rounded-2xl">
            <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
              <ShieldCheck className="text-[#00f5d4]" size={20} />
              © {currentYear} Kaybee Fitness Pro
            </h2>
            <p className="leading-relaxed">
              Tous les contenus présents sur l'application Kaybee Fitness Pro, incluant, sans limitation, les graphismes, images, textes, vidéos, animations, sons, logos, gifs et icônes ainsi que leur mise en forme sont la propriété exclusive de Kaybee Fitness Pro, à l'exception des marques, logos ou contenus appartenant à d'autres sociétés partenaires ou auteurs.
            </p>
          </section>

          <section className="p-6">
            <h2 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <Scale size={20} className="text-[#7b2cbf]" /> Usage Restreint
            </h2>
            <p>
              Toute reproduction, distribution, modification, adaptation, retransmission ou publication, même partielle, de ces différents éléments est strictement interdite sans l'accord exprès par écrit de Kaybee Fitness Pro. Cette représentation ou reproduction, par quelque procédé que ce soit, constitue une contrefaçon sanctionnée par les lois en vigueur sur la propriété intellectuelle.
            </p>
          </section>

          <section className="p-6 border-t border-gray-800">
            <h2 className="text-white text-lg font-bold mb-3 flex items-center gap-2">
              <FileText size={20} className="text-blue-500" /> Crédits Tiers
            </h2>
            <p className="text-sm">
              L'application utilise des technologies open-source (React, Capacitor, Firebase, Tailwind CSS) et des bibliothèques d'icônes (Lucide React). Les images d'illustration proviennent de sources libres de droits (Unsplash, Pexels) sauf mention contraire.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Copyright;
