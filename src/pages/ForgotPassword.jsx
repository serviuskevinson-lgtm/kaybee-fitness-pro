import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // Assure-toi que le chemin est bon (@/lib/firebase)
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setMessage('');
      setError('');
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      setMessage('Un lien de réinitialisation a été envoyé à votre adresse email.');
    } catch (err) {
      setError("Impossible d'envoyer le mail. Vérifiez l'adresse.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background identique */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat bg-fixed"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 16, 0.8), rgba(10, 10, 16, 0.95)), url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop')`
        }}
      />
      
      {/* Néons */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#7b2cbf] rounded-full mix-blend-multiply filter blur-[150px] opacity-20 animate-pulse z-0"></div>

      <div className="w-full max-w-md z-10 bg-[#0a0a0f]/60 backdrop-blur-xl border border-[#7b2cbf]/30 p-8 rounded-2xl shadow-[0_0_30px_rgba(123,44,191,0.3)]">
        
        <div className="mb-6">
            <Link to="/login" className="flex items-center text-gray-400 hover:text-white transition-colors mb-4 text-sm">
                <ArrowLeft size={16} className="mr-1" /> Retour connexion
            </Link>
            <h2 className="text-2xl font-bold text-white">Récupération</h2>
            <p className="text-gray-400 text-sm mt-1">Entrez votre email pour recevoir un lien.</p>
        </div>

        {/* Message Succès */}
        {message && (
          <div className="bg-green-500/20 border border-green-500/50 text-green-200 p-4 rounded-lg mb-6 flex items-start gap-3">
            <CheckCircle size={20} className="mt-0.5" />
            <p className="text-sm">{message}</p>
          </div>
        )}

        {/* Message Erreur */}
        {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 text-sm">
                {error}
            </div>
        )}
        
        {!message && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input 
                type="email" 
                placeholder="Votre Email" 
                className="w-full bg-[#0a0a0f]/80 border border-[#7b2cbf]/30 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-[#00f5d4] focus:ring-1 focus:ring-[#00f5d4] transition-all"
                onChange={(e) => setEmail(e.target.value)}
                required
                />
            </div>

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-white font-bold py-3 px-4 rounded-xl hover:shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all active:scale-[0.98]"
            >
                {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
            </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;