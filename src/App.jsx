import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import MyCoach from '@/pages/client/MyCoach'; 
import Privacy from './pages/Privacy';

// --- IMPORTS CONTEXT ---
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ClientProvider } from '@/context/ClientContext';
import { NotificationProvider } from '@/context/NotificationContext'; 

import Login from '@/pages/Login';       
import Signup from '@/pages/Signup';
import Onboarding from '@/pages/Onboarding';
import CoachOnboarding from '@/pages/coach/CoachOnboarding';
import Payments from '@/pages/coach/Payments'; 

import Layout from '@/components/Layout'; 

import Dashboard from '@/pages/Dashboard';
import Coach from '@/pages/Coach';
import Community from '@/pages/Community';
import Profile from '@/pages/Profile';
import UserProfile from '@/pages/UserProfile';
import Exercises from '@/pages/Exercises';
import Run from '@/pages/Run';
import Meals from '@/pages/Meals';
import Nutrition from '@/pages/Nutrition';
import Session from '@/pages/Session';
import Performance from '@/pages/Performance';
import Gallery from '@/pages/Gallery';
import Messages from '@/pages/Messages';
import Challenges from '@/pages/Challenges';
import MyTeam from '@/pages/MyTeam';
import WorkoutAgenda from '@/pages/WorkoutAgenda';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import CommunityGuidelines from '@/pages/CommunityGuidelines';
import Copyright from '@/pages/Copyright';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { App as CapacitorApp } from '@capacitor/app';

const queryClient = new QueryClient();

const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-[#0a0a0f] text-white font-black italic uppercase animate-pulse">Chargement Kaybee...</div>;
  return currentUser ? children : <Navigate to="/login" />;
};

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const backListener = CapacitorApp.addListener('backButton', (e) => {
      const backEvent = new CustomEvent('kbBackButton', { cancelable: true });
      window.dispatchEvent(backEvent);

      if (backEvent.defaultPrevented) {
        return;
      }

      if (location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/login') {
        CapacitorApp.exitApp();
      } else {
        navigate(-1);
      }
    });

    return () => {
      backListener.then(handler => handler.remove());
    };
  }, [location, navigate]);

  const getPageName = (path) => {
    const cleanPath = path.split('/')[1] || 'dashboard';
    if (path === '/' || path === '/dashboard') return 'Elite Dashboard';
    if (path.includes('workout-agenda')) return 'Agenda';
    if (path.includes('payments')) return 'Finance';
    if (path.includes('coach-onboarding')) return 'Configuration Coach';
    if (path.includes('nutrition')) return 'Macros';
    if (path.includes('run')) return 'Run Tracker';
    if (path.includes('session')) return 'Séance Live';
    return cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);
  };

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

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

      <Route path="/*" element={
        <PrivateRoute>
          <Layout currentPageName={getPageName(location.pathname)}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/workout-agenda" element={<WorkoutAgenda />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/community" element={<Community />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:userId" element={<UserProfile />} />
              <Route path="/exercises" element={<Exercises />} />
              <Route path="/run" element={<Run />} />
              <Route path="/meals" element={<Meals />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/session" element={<Session />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/mon-coach" element={<MyCoach />} />
              <Route path="/my-team" element={<MyTeam />} />
              <Route path="/coach/payments" element={<Payments />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/guidelines" element={<CommunityGuidelines />} />
              <Route path="/copyright" element={<Copyright />} />
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
          <NotificationProvider> 
            <Router>
              <AppContent />
              <Toaster />
            </Router>
          </NotificationProvider>
        </ClientProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
