import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { useTranslation } from 'react-i18next';

// Nouveaux composants de Sidebar
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from './Sidebar';

import { Award, AlertCircle, Lock } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  const [profileComplete, setProfileComplete] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsub = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserProfile(data);

        // Vérification du profil complet pour les clients ayant un coach
        if (data.role !== 'coach' && !!data.coachId) {
          const isComplete = !!(
            (data.first_name || data.firstName) &&
            (data.last_name || data.lastName) &&
            data.height &&
            data.weight &&
            (data.birth_date || data.birthDate) &&
            data.sex &&
            data.goals
          );
          setProfileComplete(isComplete);
        } else {
          setProfileComplete(true);
        }
      }
    });

    return () => unsub();
  }, [currentUser]);

  const getInitials = () => {
    if (userProfile?.full_name) return userProfile.full_name.split(' ')[0][0];
    if (userProfile?.first_name) return userProfile.first_name[0].toUpperCase();
    if (currentUser?.email) return currentUser.email[0].toUpperCase();
    return 'K';
  };

  const showLockScreen = !profileComplete && userProfile?.role !== 'coach';

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
                src="https://firebasestorage.googleapis.com/v0/b/kaybee-fitness.firebasestorage.app/o/Logo%20.png?alt=media&token=8d0e94d1-3989-4894-b249-10f5945cf172"
                alt="Kaybee Logo"
                className="h-8 md:h-12 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Groupe Droite */}
          <div className="flex items-center gap-4">
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
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full relative">
           {showLockScreen ? (
              <div className="fixed inset-0 z-[60] bg-[#0a0a0f]/95 flex items-center justify-center p-4 backdrop-blur-sm">
                <Card className="kb-card max-w-md border-[#7b2cbf] animate-in zoom-in-95 duration-300">
                  <CardContent className="pt-8 text-center space-y-6">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto ring-4 ring-red-500/10">
                      <Lock className="w-10 h-10 text-red-500" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-black uppercase text-white">Profil Incomplet</h2>
                      <p className="text-gray-400">
                        Votre coach a besoin de toutes vos informations (taille, poids, buts, etc.) pour commencer votre programme.
                      </p>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-gray-800 text-left">
                      <p className="text-xs font-bold text-[#00f5d4] uppercase mb-2 flex items-center gap-2">
                        <AlertCircle size={14} /> Manquant :
                      </p>
                      <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
                        <li>Informations biométriques</li>
                        <li>Objectifs détaillés</li>
                        <li>Date de naissance et Sexe</li>
                      </ul>
                    </div>
                    <Button asChild className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd] font-black uppercase py-6">
                      <Link to="/profile">Compléter mon Profil</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : children}
        </main>

      </SidebarInset>
    </SidebarProvider>
  );
}
