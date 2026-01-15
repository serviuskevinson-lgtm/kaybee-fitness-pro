import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';

// --- IMPORTS AUTHENTIFICATION & CONTEXT ---
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ClientProvider } from '@/context/ClientContext'; // <--- NOUVEAU : Cerveau du mode Coach

// --- PAGES AUTH ---
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import Onboarding from '@/pages/Onboarding';

// --- PAGES COACH (NOUVEAU) ---
import CoachOnboarding from '@/pages/coach/CoachOnboarding';
import Payments from '@/pages/coach/Payments';
import CoachDashboard from '@/pages/CoachDashboard'; // Je garde ton import existant au cas où

// --- PAGES PRINCIPALES ---
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Coach from '@/pages/Coach';
import Community from '@/pages/Community';
import Profile from '@/pages/Profile';
import Exercises from '@/pages/Exercises';
import Meals from '@/pages/Meals';
import Session from '@/pages/Session';
import Performance from '@/pages/Performance';
import Gallery from '@/pages/Gallery';
import Messages from '@/pages/Messages';
import Challenges from '@/pages/Challenges';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AdminSeed from '@/pages/AdminSeed';

const queryClient = new QueryClient();

// --- COMPOSANT DE SÉCURITÉ (Le Gardien) ---
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

// --- COMPOSANT DE SÉCURITÉ COACH ---
const CoachRoute = ({ children }) => {
  const { userRole } = useAuth();
  // Si c'est un coach, on affiche, sinon retour accueil
  // Note: Assure-toi que userRole est bien dispo dans ton AuthContext, sinon utilise une vérif Firestore
  return userRole === 'coach' ? children : <Navigate to="/" />;
};

const AppContent = () => {
  const location = useLocation();

  // Fonction pour le titre (inchangée)
  const getPageName = (path) => {
    const cleanPath = path.split('/')[1] || 'dashboard';
    
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    if (cleanPath === 'coach-onboarding') return 'Configuration Coach';
    if (cleanPath === 'payments') return 'Finance';

    return cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);
  };

  return (
    <Routes>
      {/* --- ROUTES PUBLIQUES (Pas de Layout, Pas de protection) --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* --- ROUTES ONBOARDING (Protégées mais sans Layout Sidebar) --- */}
      <Route path="/onboarding" element={
        <PrivateRoute>
          <Onboarding />
        </PrivateRoute>
      } />
      
      {/* NOUVEAU : Onboarding Spécifique Coach */}
      <Route path="/coach-onboarding" element={
        <PrivateRoute>
          <CoachOnboarding />
        </PrivateRoute>
      } />

      {/* --- ROUTE COACH DÉDIÉE (Si tu veux garder une page séparée) --- */}
      <Route path="/coach-dashboard" element={
        <PrivateRoute>
          <CoachRoute>
             <CoachDashboard />
          </CoachRoute>
        </PrivateRoute>
      } />

      {/* --- ROUTES APPLICATION PRINCIPALE (Protégées + Layout) --- */}
      <Route path="/*" element={
        <PrivateRoute>
          <Layout currentPageName={getPageName(location.pathname)}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              
              {/* Pages Fonctionnelles */}
              <Route path="/coach" element={<Coach />} />
              <Route path="/community" element={<Community />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/exercises" element={<Exercises />} />
              <Route path="/meals" element={<Meals />} />
              <Route path="/session" element={<Session />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/challenges" element={<Challenges />} />
              
              {/* NOUVEAU : Page de Paiements pour Coach */}
              <Route path="/payments" element={<Payments />} />

              {/* Pages Admin / Utilitaires */}
              <Route path="/unauthorized" element={<UserNotRegisteredError />} />
              <Route path="/admin-seed" element={<AdminSeed />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />
    </Routes>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider> 
        {/* NOUVEAU : ClientProvider encapsule les routes pour partager l'état Coach/Client */}
        <ClientProvider>
          <Router>
            <AppContent />
            <Toaster />
          </Router>
        </ClientProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}