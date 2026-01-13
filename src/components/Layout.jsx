import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '../lib/utils';
import { base44 } from '@/api/base44Client';
import { 
  Home, Dumbbell, UtensilsCrossed, Zap, TrendingUp, 
  Image, Users, Trophy, LogOut, Menu, X, Award, MessageCircle
} from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const location = useLocation();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      const profile = await base44.entities.User.filter({ email: currentUser.email });
      if (profile && profile.length > 0) setUserProfile(profile[0]);
    } catch (error) { console.error('Error loading user:', error); }
  };

  const handleLogout = async () => { await base44.auth.logout(); };

  const menuItems = [
    { name: 'Dashboard', icon: Home, page: 'Dashboard' },
    { name: 'Exercices', icon: Dumbbell, page: 'Exercises' },
    { name: 'Repas', icon: UtensilsCrossed, page: 'Meals' },
    { name: 'Session', icon: Zap, page: 'Session' },
    { name: 'Performance', icon: TrendingUp, page: 'Performance' },
    { name: 'Galerie', icon: Image, page: 'Gallery' },
    { name: 'Coach', icon: Users, page: 'Coach' },
    { name: 'Messages', icon: MessageCircle, page: 'Messages' },
    { name: 'Communauté', icon: Users, page: 'Community' },
    { name: 'Défis', icon: Trophy, page: 'Challenges' }
  ];

  const getInitials = () => user?.full_name?.split(' ')[0][0] || 'K';

  return (
    <div className="min-h-screen text-white relative font-sans selection:bg-[#00f5d4] selection:text-black">
      {/* GLOBAL STYLES & BACKGROUND */}
      <style>{`
        :root {
          --kb-purple: #7b2cbf;
          --kb-glow: #9d4edd;
          --kb-cyan: #00f5d4;
          --kb-dark: #0a0a0f;
        }
        
        /* BACKGROUND FIXE */
        body {
          background-color: var(--kb-dark);
          background-image: 
            linear-gradient(to bottom, rgba(10, 10, 16, 0.85), rgba(10, 10, 16, 0.95)),
            url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop');
          background-size: cover;
          background-attachment: fixed;
          background-position: center;
          color: white !important; /* Force le blanc partout */
        }

        /* FORCE TEXTE BLANC SUR LES ÉLÉMENTS QUI SERAIENT NOIRS */
        h1, h2, h3, h4, h5, h6, p, span, div, li {
           color: inherit;
        }
        
        /* CARDS AVEC GLASSMORPHISM & NEON */
        .kb-card {
          background: rgba(20, 20, 25, 0.6);
          border: 1px solid rgba(123, 44, 191, 0.3);
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
          border-radius: 16px;
          transition: all 0.3s ease;
          color: white; /* Assure que le texte dans les cartes est blanc */
        }

        .kb-card:hover {
          border-color: var(--kb-glow);
          box-shadow: 0 0 25px rgba(123, 44, 191, 0.15);
          transform: translateY(-2px);
        }

        /* SCROLLBAR CUSTOM */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { 
          background: linear-gradient(var(--kb-purple), var(--kb-cyan)); 
          border-radius: 4px; 
        }
      `}</style>

      {/* HEADER */}
      <header className="fixed top-0 w-full h-20 border-b border-[#7b2cbf]/30 bg-[#0a0a0f]/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-8 z-50 shadow-[0_0_15px_rgba(123,44,191,0.2)]">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-2xl hover:text-[#00f5d4] transition p-2">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
        
        {/* LOGO ORIGINAL REMIS ICI */}
        <Link to={createPageUrl('Dashboard')} className="flex flex-col items-center hover:scale-105 transition-transform duration-300">
           <img 
            src="https://firebasestorage.googleapis.com/v0/b/kaybee-fitness.firebasestorage.app/o/Logo%20.png?alt=media&token=8d0e94d1-3989-4894-b249-10f5945cf172" 
            alt="KAYBEE FITNESS" 
            className="h-14 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
          />
        </Link>
        
        <div className="flex items-center gap-4">
          <NotificationBell userEmail={user?.email} />
          {userProfile?.level && (
            <div className="hidden md:flex items-center gap-1 bg-[#7b2cbf]/20 border border-[#7b2cbf] px-3 py-1 rounded-full shadow-[0_0_10px_rgba(123,44,191,0.3)]">
              <Award className="w-4 h-4 text-[#fdcb6e]" />
              <span className="text-xs font-bold text-[#e0e0e0]">Niv. {userProfile.level}</span>
            </div>
          )}
          <Link to={createPageUrl('Profile')}>
            <div className="w-10 h-10 bg-gradient-to-br from-[#7b2cbf] to-[#00f5d4] rounded-full flex items-center justify-center font-bold text-black ring-2 ring-white/10 hover:ring-[#00f5d4] transition shadow-lg">
              {getInitials()}
            </div>
          </Link>
        </div>
      </header>

      {/* SIDEBAR */}
      <nav className={`fixed left-0 top-20 w-72 h-[calc(100vh-80px)] bg-[#0a0a0f]/95 border-r border-[#7b2cbf]/30 transition-transform duration-300 z-40 backdrop-blur-xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="py-6 flex flex-col h-full">
          <div className="space-y-1 px-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === createPageUrl(item.page) || (item.page === 'Dashboard' && location.pathname === '/');
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-4 px-6 py-4 font-bold text-sm rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#7b2cbf]/20 to-transparent text-[#00f5d4] border-l-4 border-[#00f5d4]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-[#00f5d4] drop-shadow-[0_0_5px_rgba(0,245,212,0.5)]' : ''}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
          
          <div className="mt-auto px-6 pb-8">
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-6 py-4 font-bold text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition border border-red-900/30">
              <LogOut className="w-5 h-5" />
              Déconnexion
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className={`pt-28 pb-10 px-4 md:px-8 max-w-7xl mx-auto transition-all duration-300 ${sidebarOpen ? 'md:ml-72' : ''}`}>
        {children}
      </main>

      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}