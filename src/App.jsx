import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import MyCoach from '@/pages/client/MyCoach'; // Assure-toi de créer le dossier client/

// --- IMPORTS CONTEXT ---
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ClientProvider } from '@/context/ClientContext';

// --- CORRECTION DES IMPORTS (Chemins simplifiés) ---
import Login from '@/pages/Login';       
import Signup from '@/pages/Signup';
import Onboarding from '@/pages/Onboarding';

// Note : Si ces fichiers sont aussi directement dans "pages", enlevez "/coach"
import CoachOnboarding from '@/pages/coach/CoachOnboarding';
import Payments from '@/pages/coach/Payments'; 

// --- LAYOUT ---
// Si votre fichier est directement dans components, gardez cette ligne :
import Layout from '@/components/Layout'; 
// Sinon, si vous avez créé le dossier layout, utilisez : '@/components/layout/Layout'

// --- PAGES PRINCIPALES ---
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
import UserNotRegisteredError from '@/components/UserNotRegisteredError'; // Vérifiez ce chemin aussi

// --- SÉCURITÉ ---
const queryClient = new QueryClient();

const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-[#0a0a0f] text-white">Chargement...</div>;
  return currentUser ? children : <Navigate to="/login" />;
};

const AppContent = () => {
  const location = useLocation();

  const getPageName = (path) => {
    const cleanPath = path.split('/')[1] || 'dashboard';
    
    if (path === '/' || path === '/dashboard') return 'Tableau de Bord';
    if (path.includes('payments')) return 'Finance';
    if (path.includes('coach-onboarding')) return 'Configuration Coach';
    
    return cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);
  };

  return (
    <Routes>
      {/* --- ROUTES PUBLIQUES --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* --- ONBOARDING --- */}
      <Route path="/onboarding" element={
        <PrivateRoute>
          <Onboarding />
        </PrivateRoute>
      } />
      
      <Route path="/coach-onboarding" element={
        <PrivateRoute>
          <CoachOnboarding />
        </PrivateRoute>
      } />

      {/* --- APPLICATION PRINCIPALE --- */}
      <Route path="/*" element={
        <PrivateRoute>
          <Layout currentPageName={getPageName(location.pathname)}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              
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
              <Route path="/mon-coach" element={<MyCoach />} />
              {/* Route Finance */}
              <Route path="/coach/payments" element={<Payments />} />

              <Route path="/unauthorized" element={<UserNotRegisteredError />} />
              <Route path="*" element={<Navigate to="/" />} />
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