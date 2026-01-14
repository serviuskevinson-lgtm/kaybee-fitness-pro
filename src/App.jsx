import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';

// --- IMPORTS AUTHENTIFICATION ---
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import CoachDashboard from '@/pages/CoachDashboard';

// --- IMPORTS EXISTANTS ---
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
import ForgotPassword from '@/pages/ForgotPassword';
import Onboarding from '@/pages/Onboarding'; // <--- Import

const queryClient = new QueryClient();

// --- COMPOSANT DE SÉCURITÉ (Le Gardien) ---
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  // Si pas d'utilisateur, on renvoie vers le login
  return currentUser ? children : <Navigate to="/login" />;
};

// --- COMPOSANT DE SÉCURITÉ COACH ---
const CoachRoute = ({ children }) => {
  const { userRole } = useAuth();
  // Si c'est un coach, on affiche, sinon retour accueil
  return userRole === 'coach' ? children : <Navigate to="/" />;
};

const AppContent = () => {
  const location = useLocation();

  // Fonction pour le titre (inchangée)
  const getPageName = (path) => {
    // Si on est dans une sous-route (ex: /exercises/squat), on garde juste le premier mot
    const cleanPath = path.split('/')[1] || 'dashboard';
    
    if (path === '/' || path === '/dashboard') return 'Dashboard';
    return cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);
  };

  return (
    <Routes>
      {/* --- ROUTES PUBLIQUES (Pas de Layout, Pas de protection) --- */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* --- ROUTE COACH (Protection Spéciale) --- */}
      <Route path="/coach-dashboard" element={
        <PrivateRoute>
          <CoachRoute>
             <CoachDashboard />
          </CoachRoute>
        </PrivateRoute>
      } />

      {/* --- ROUTES CLIENT / APPLICATION PRINCIPALE (Protégées + Layout) --- */}
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
              <Route path="/unauthorized" element={<UserNotRegisteredError />} />
              {/* --- ROUTES PUBLIQUES --- */}
<Route path="/login" element={<Login />} />
<Route path="/signup" element={<Signup />} />
<Route path="/forgot-password" element={<ForgotPassword />} /> {/* <--- AJOUTE ÇA */}
{/* Route Onboarding (Protégée mais sans Layout Sidebar) */}
<Route path="/onboarding" element={
  <PrivateRoute>
    <Onboarding />
  </PrivateRoute>
} />
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
      <AuthProvider> {/* On enveloppe tout avec l'Auth */}
        <Router>
          <AppContent />
          <Toaster />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}