import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useTranslation } from 'react-i18next'; // <--- IMPORT I18N

// Nouveaux composants de Sidebar
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from './Sidebar';

import { Award } from 'lucide-react';
import NotificationBell from './NotificationBell';

// --- COMPOSANT SELECTEUR DE LANGUE (INTEGRÉ) ---
const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  
  // Style discret pour la navbar
  const btnStyle = (lang) => `text-[10px] font-bold px-2 py-1 rounded transition-colors ${i18n.language === lang ? 'bg-[#9d4edd] text-white' : 'text-gray-500 hover:text-white hover:bg-white/10'}`;

  return (
    <div className="hidden sm:flex items-center bg-black/40 rounded-lg p-1 border border-gray-800 mr-2">
      <button onClick={() => i18n.changeLanguage('fr')} className={btnStyle('fr')}>FR</button>
      <div className="w-[1px] h-3 bg-gray-700 mx-1"></div>
      <button onClick={() => i18n.changeLanguage('en')} className={btnStyle('en')}>EN</button>
      <div className="w-[1px] h-3 bg-gray-700 mx-1"></div>
      <button onClick={() => i18n.changeLanguage('es')} className={btnStyle('es')}>ES</button>
    </div>
  );
};

export default function Layout({ children, currentPageName }) {
  const { currentUser } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const { t } = useTranslation(); // Hook traduction

  useEffect(() => {
    const fetchProfile = async () => {
      if (currentUser?.uid) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          }
        } catch (error) {
          console.error("Erreur chargement profil", error);
        }
      }
    };
    fetchProfile();
  }, [currentUser]);

  const getInitials = () => {
    if (userProfile?.full_name) return userProfile.full_name.split(' ')[0][0];
    if (currentUser?.email) return currentUser.email[0].toUpperCase();
    return 'K';
  };

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --kb-purple: #7b2cbf;
          --kb-glow: #9d4edd;
          --kb-cyan: #00f5d4;
          --kb-dark: #0a0a0f;
          --sidebar-background: #0a0a0f;
          --sidebar-foreground: #ffffff;
          --sidebar-border: rgba(123, 44, 191, 0.3);
          --sidebar-accent: rgba(123, 44, 191, 0.2);
          --sidebar-accent-foreground: #00f5d4;
          --sidebar-ring: #00f5d4;
        }
        
        body {
          background-color: var(--kb-dark);
          background-image: 
            linear-gradient(to bottom, rgba(10, 10, 16, 0.85), rgba(10, 10, 16, 0.95)),
            url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop');
          background-size: cover;
          background-attachment: fixed;
          background-position: center;
          color: white !important;
        }

        h1, h2, h3, h4, h5, h6, p, span, div, li { color: inherit; }
        
        .kb-card {
          background: rgba(20, 20, 25, 0.6);
          border: 1px solid rgba(123, 44, 191, 0.3);
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
          border-radius: 16px;
          transition: all 0.3s ease;
          color: white;
        }
        .kb-card:hover {
          border-color: var(--kb-glow);
          box-shadow: 0 0 25px rgba(123, 44, 191, 0.15);
          transform: translateY(-2px);
        }

        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { 
          background: linear-gradient(var(--kb-purple), var(--kb-cyan)); 
          border-radius: 4px; 
        }
      `}</style>

      <AppSidebar />

      <SidebarInset className="bg-transparent">
        {/* HEADER */}
        <header className="sticky top-0 w-full h-20 border-b border-[#7b2cbf]/30 bg-[#0a0a0f]/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-8 z-50 shadow-[0_0_15px_rgba(123,44,191,0.2)] relative">
          
          {/* Groupe Gauche */}
          <div className="flex items-center gap-4">
            <SidebarTrigger className="text-white hover:text-[#00f5d4] scale-125" />
            <div className="hidden md:block w-[1px] h-6 bg-gray-700 mx-2" />
            {/* Traduction du nom de la page courante si possible */}
            <h1 className="text-xl font-bold text-[#00f5d4] drop-shadow-sm hidden md:block">
              {currentPageName}
            </h1>
          </div>

          {/* LOGO CENTRAL */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none justify-center flex">
            <Link
              to="/"
              className="pointer-events-auto hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_20px_rgba(123,44,191,0.6)]"
            >
              <img 
                src="/logo.png" 
                alt="Kaybee Logo" 
                className="h-8 md:h-12 w-auto object-contain" 
              />
            </Link>
          </div>
        
          {/* Groupe Droite */}
          <div className="flex items-center gap-4">
            
            {/* --- AJOUT DU SÉLECTEUR DE LANGUE ICI --- */}
            <LanguageSwitcher />

            <NotificationBell userEmail={currentUser?.email} />
            
            {userProfile?.level && (
              <div className="hidden md:flex items-center gap-1 bg-[#7b2cbf]/20 border border-[#7b2cbf] px-3 py-1 rounded-full shadow-[0_0_10px_rgba(123,44,191,0.3)]">
                <Award className="w-4 h-4 text-[#fdcb6e]" />
                <span className="text-xs font-bold text-[#e0e0e0]">Niv. {userProfile.level}</span>
              </div>
            )}
            
            <Link to="/profile">
              <div className="w-10 h-10 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] rounded-full flex items-center justify-center font-bold text-black ring-2 ring-white/10 hover:ring-[#00f5d4] transition shadow-lg">
                {getInitials()}
              </div>
            </Link>
          </div>
        </header>

        {/* CONTENU DE LA PAGE */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
           {children}
        </main>

      </SidebarInset>
    </SidebarProvider>
  );
}