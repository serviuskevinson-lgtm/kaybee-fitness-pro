import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Phone, ArrowLeft, CheckCircle } from 'lucide-react';

const Login = () => {
  const { login, socialLogin, setUpRecaptcha, sendOtp, handleUserInDB } = useAuth();
  const navigate = useNavigate();
  
  // Modes : 'email' (défaut) | 'phone_input' | 'phone_verify'
  const [loginMode, setLoginMode] = useState('email'); 
  
  // États Formulaires
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+1');
  const [otp, setOtp] = useState('');
  const [confirmObj, setConfirmObj] = useState(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Connexion Email
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/');
    } catch (err) {
      if (err.code === 'auth/invalid-credential') setError("Identifiants incorrects.");
      else if (err.code === 'auth/firebase-app-check-token-is-invalid') setError("Erreur de sécurité (App Check). Désactivez App Check dans la console Firebase.");
      else setError("Erreur : " + err.message);
    }
    setLoading(false);
  };

  // 2. Connexion Social (Google/Apple)
  const handleSocial = async (provider) => {
    try {
      setError('');
      setLoading(true);
      await socialLogin(provider);
      navigate('/'); 
    } catch (err) {
      console.error(err);
      setError("Erreur de connexion sociale.");
    }
    setLoading(false);
  };

  // 3. Envoi SMS (Téléphone)
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (phoneNumber.length < 10) return setError("Numéro invalide");

    try {
      setLoading(true);
      const appVerifier = setUpRecaptcha('recaptcha-container');
      const confirmationResult = await sendOtp(phoneNumber, appVerifier);
      setConfirmObj(confirmationResult);
      setLoginMode('phone_verify');
    } catch (err) {
      console.error(err);
      setError("Erreur SMS : " + err.message);
    }
    setLoading(false);
  };

  // 4. Vérification du Code SMS
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setLoading(true);
      const res = await confirmObj.confirm(otp);
      await handleUserInDB(res.user);
      navigate('/');
    } catch (err) {
      setError("Code incorrect.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background & Néons */}
      <div className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat bg-fixed"
        style={{ backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 16, 0.8), rgba(10, 10, 16, 0.95)), url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop')` }}
      />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#7b2cbf] rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-pulse z-0" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00f5d4] rounded-full mix-blend-multiply filter blur-[128px] opacity-30 animate-pulse z-0 delay-1000" />

      <div className="w-full max-w-md z-10 bg-[#0a0a0f]/60 backdrop-blur-xl border border-[#7b2cbf]/30 p-8 rounded-2xl shadow-[0_0_30px_rgba(123,44,191,0.3)]">
        
        {/* LOGO */}
        <div className="flex flex-col items-center mb-6">
          <img src="https://firebasestorage.googleapis.com/v0/b/kaybee-fitness.firebasestorage.app/o/Logo%20.png?alt=media&token=8d0e94d1-3989-4894-b249-10f5945cf172" alt="Logo" className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] mb-2" />
          <h2 className="text-2xl font-bold text-white">Connexion</h2>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* --- MODE EMAIL (Défaut) --- */}
        {loginMode === 'email' && (
          <>
            <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input type="email" placeholder="Email" className="w-full bg-[#0a0a0f]/80 border border-[#7b2cbf]/30 text-white pl-10 pr-4 py-3 rounded-xl focus:border-[#00f5d4] outline-none" onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input type="password" placeholder="Mot de passe" className="w-full bg-[#0a0a0f]/80 border border-[#7b2cbf]/30 text-white pl-10 pr-4 py-3 rounded-xl focus:border-[#00f5d4] outline-none" onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm text-[#00f5d4] hover:underline">Oublié ?</Link>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-white font-bold py-3 px-4 rounded-xl hover:shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all active:scale-[0.98]">
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </>
        )}

        {/* --- MODE TÉLÉPHONE (Saisie Numéro) --- */}
        {loginMode === 'phone_input' && (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
             <button type="button" onClick={() => setLoginMode('email')} className="text-gray-400 text-sm flex items-center gap-1 hover:text-white mb-2"><ArrowLeft size={14}/> Retour Email</button>
             <p className="text-gray-300 text-sm mb-2">Entrez votre numéro pour recevoir un code.</p>
             <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1 514 123 4567" className="w-full bg-[#0a0a0f]/80 border border-[#7b2cbf]/30 text-white pl-10 pr-4 py-3 rounded-xl focus:border-[#00f5d4] outline-none" />
             </div>
             <div id="recaptcha-container"></div>
             <button type="submit" disabled={loading} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200">{loading ? 'Envoi...' : 'Envoyer le Code'}</button>
          </form>
        )}

        {/* --- MODE TÉLÉPHONE (Saisie Code) --- */}
        {loginMode === 'phone_verify' && (
           <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <p className="text-[#00f5d4] text-sm mb-2 flex items-center gap-2"><CheckCircle size={14}/> Code envoyé au {phoneNumber}</p>
              <input type="text" placeholder="Entrez le code (ex: 123456)" onChange={(e) => setOtp(e.target.value)} className="w-full text-center text-2xl tracking-widest bg-[#0a0a0f]/80 border border-[#7b2cbf]/30 text-white py-3 rounded-xl focus:border-[#00f5d4] outline-none" />
              <button type="submit" disabled={loading} className="w-full bg-[#00f5d4] text-black font-bold py-3 rounded-xl hover:shadow-[0_0_20px_rgba(0,245,212,0.4)]">{loading ? 'Vérification...' : 'Valider'}</button>
              <button type="button" onClick={() => setLoginMode('phone_input')} className="text-gray-500 text-xs text-center hover:text-white mt-2">Réessayer / Changer numéro</button>
           </form>
        )}

        {/* SÉPARATEUR & BOUTONS SOCIAUX */}
        {loginMode === 'email' && (
            <>
                <div className="flex items-center gap-4 my-6">
                    <div className="h-[1px] bg-gray-700 flex-1"></div>
                    <span className="text-gray-500 text-xs uppercase">Autres options</span>
                    <div className="h-[1px] bg-gray-700 flex-1"></div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {/* Google */}
                    <button onClick={() => handleSocial('google')} className="flex items-center justify-center p-3 rounded-xl bg-white hover:bg-gray-200 transition" title="Google">
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="Google" />
                    </button>
                    
                    {/* Apple (CORRIGÉ AVEC SVG DIRECT) */}
                    <button onClick={() => handleSocial('apple')} className="flex items-center justify-center p-3 rounded-xl bg-black border border-gray-700 hover:bg-gray-900 transition" title="Apple">
                        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z"/>
                        </svg>
                    </button>

                    {/* Téléphone */}
                    <button onClick={() => setLoginMode('phone_input')} className="flex items-center justify-center p-3 rounded-xl bg-[#2ecc71] hover:bg-[#27ae60] transition" title="Téléphone">
                         <Phone className="w-6 h-6 text-white" />
                    </button>
                </div>

                <p className="mt-8 text-center text-gray-400">
                Pas encore de compte ? <Link to="/signup" className="text-[#00f5d4] font-semibold hover:underline ml-1">Créer un compte</Link>
                </p>
            </>
        )}
      </div>
    </div>
  );
};

export default Login;