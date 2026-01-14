import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, User, Dumbbell, Calendar, Ruler, Weight, Check } from 'lucide-react';

const Signup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  
  // États du formulaire
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    height: '',
    weight: '',
    weightUnit: 'lbs', // ou 'kg'
    sex: 'Homme',
    role: 'client',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Gestion des changements
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      return setError("Les mots de passe ne correspondent pas.");
    }

    try {
      setLoading(true);
      // On prépare l'objet propre pour la DB (sans les mots de passe)
      const { confirmPassword, password, ...userProfile } = formData;
      
      await signup(formData.email, formData.password, userProfile);
      
      // REDIRECTION VERS L'ONBOARDING (et non le dashboard direct)
      navigate('/onboarding');
      
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'inscription. Vérifiez les champs.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Gym */}
      <div className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat bg-fixed"
        style={{ backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 16, 0.8), rgba(10, 10, 16, 0.95)), url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop')` }}
      />
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#7b2cbf]/30 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-2xl z-10 bg-[#0a0a0f]/80 backdrop-blur-xl border border-[#7b2cbf]/30 p-6 md:p-8 rounded-2xl shadow-2xl">
        
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-[#00f5d4]">Créer mon profil</h2>
          <p className="text-gray-400">Commencez votre transformation aujourd'hui</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* IDENTITÉ */}
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
             <input name="firstName" placeholder="Prénom" onChange={handleChange} required className="bg-[#1a1a20] border border-gray-700 rounded-lg p-3 text-white focus:border-[#00f5d4] outline-none transition" />
             <input name="lastName" placeholder="Nom" onChange={handleChange} required className="bg-[#1a1a20] border border-gray-700 rounded-lg p-3 text-white focus:border-[#00f5d4] outline-none transition" />
          </div>

          {/* DATE NAISSANCE & SEXE */}
          <div className="relative">
             <Calendar className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
             <input type="date" name="birthDate" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
          </div>
          
          <select name="sex" onChange={handleChange} className="bg-[#1a1a20] border border-gray-700 rounded-lg p-3 text-white focus:border-[#00f5d4] outline-none">
            <option value="Homme">Homme</option>
            <option value="Femme">Femme</option>
          </select>

          {/* PHYSIQUE */}
          <div className="relative">
            <Ruler className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
            <input type="number" name="height" placeholder="Taille (cm)" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
          </div>

          <div className="flex gap-2">
             <div className="relative flex-1">
               <Weight className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
               <input type="number" name="weight" placeholder="Poids" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
             </div>
             <div className="flex bg-[#1a1a20] rounded-lg border border-gray-700 overflow-hidden">
                <button type="button" onClick={() => setFormData({...formData, weightUnit: 'lbs'})} className={`px-3 text-sm font-bold ${formData.weightUnit === 'lbs' ? 'bg-[#7b2cbf] text-white' : 'text-gray-400 hover:text-white'}`}>LBS</button>
                <button type="button" onClick={() => setFormData({...formData, weightUnit: 'kg'})} className={`px-3 text-sm font-bold ${formData.weightUnit === 'kg' ? 'bg-[#7b2cbf] text-white' : 'text-gray-400 hover:text-white'}`}>KG</button>
             </div>
          </div>

          {/* LOGIN INFO */}
          <div className="md:col-span-2 mt-4 space-y-4">
             <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                <input type="email" name="email" placeholder="Email" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                    <input type="password" name="password" placeholder="Mot de passe" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                    <input type="password" name="confirmPassword" placeholder="Confirmer MDP" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
                </div>
             </div>
          </div>

          <button type="submit" disabled={loading} className="md:col-span-2 mt-6 bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] text-black font-bold py-4 rounded-xl hover:shadow-[0_0_20px_rgba(0,245,212,0.4)] transition-all transform active:scale-[0.98]">
             {loading ? 'Création...' : 'CRÉER MON COMPTE'}
          </button>

        </form>
        <p className="mt-4 text-center text-gray-400 text-sm">Déjà membre ? <Link to="/login" className="text-[#00f5d4]">Se connecter</Link></p>
      </div>
    </div>
  );
};

export default Signup;