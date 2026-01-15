import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Mail, Lock, AlertCircle, Calendar, Ruler, Weight, 
  User, Award, ChevronRight, CheckCircle2, Dumbbell 
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const Signup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  
  // --- ÉTATS ---
  const [step, setStep] = useState('role_selection'); // 'role_selection' ou 'form'
  const [selectedRole, setSelectedRole] = useState(null); // 'client' ou 'coach'
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    height: '',
    weight: '',
    weightUnit: 'lbs', 
    sex: 'Homme',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // --- LOGIQUE SÉLECTION RÔLE ---
  const handleRoleClick = (role) => {
    setSelectedRole(role);
    setIsModalOpen(true);
  };

  const confirmRole = () => {
    setIsModalOpen(false);
    setStep('form');
  };

  // --- LOGIQUE FORMULAIRE ---
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
      
      const userProfile = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        full_name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        birthDate: formData.birthDate,
        height: formData.height,
        weight: formData.weight,
        weightUnit: formData.weightUnit,
        sex: formData.sex,
        role: selectedRole, // On utilise le rôle choisi
        // Initialisation stats
        points: 0,
        level: 1,
        workoutsCompleted: 0,
        joinedAt: new Date().toISOString()
      };
      
      // Envoi à Firebase
      await signup(formData.email, formData.password, userProfile);
      
      // REDIRECTION INTELLIGENTE
      if (selectedRole === 'coach') {
        navigate('/coach-onboarding'); // Nouvelle route pour les coachs
      } else {
        navigate('/onboarding'); // Route existante pour les clients
      }
      
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'inscription. Vérifiez que l'email n'est pas déjà utilisé.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Gym */}
      <div className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat bg-fixed"
        style={{ backgroundImage: `linear-gradient(to bottom, rgba(10, 10, 16, 0.85), rgba(10, 10, 16, 0.98)), url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop')` }}
      />
      
      {/* ÉTAPE 1 : SÉLECTION DU RÔLE */}
      {step === 'role_selection' && (
        <div className="z-10 w-full max-w-4xl animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black italic text-white uppercase tracking-tighter mb-4">
              Rejoignez <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4]">Kaybee</span>
            </h1>
            <p className="text-gray-400 text-lg">Choisissez votre voie pour commencer.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CARTE CLIENT */}
            <div 
              onClick={() => handleRoleClick('client')}
              className="bg-[#1a1a20]/80 backdrop-blur-xl border border-gray-800 hover:border-[#00f5d4] p-8 rounded-3xl cursor-pointer group transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,245,212,0.2)] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Dumbbell size={120} className="text-[#00f5d4] rotate-12"/>
              </div>
              <User size={48} className="text-[#00f5d4] mb-4" />
              <h3 className="text-2xl font-black text-white uppercase italic mb-2">Je suis un Athlète</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Je veux transformer mon physique, suivre des programmes d'élite et dépasser mes limites.
              </p>
              <div className="mt-6 flex items-center text-[#00f5d4] font-bold text-sm">
                COMMENCER <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform"/>
              </div>
            </div>

            {/* CARTE COACH */}
            <div 
              onClick={() => handleRoleClick('coach')}
              className="bg-[#1a1a20]/80 backdrop-blur-xl border border-gray-800 hover:border-[#7b2cbf] p-8 rounded-3xl cursor-pointer group transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(123,44,191,0.3)] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Award size={120} className="text-[#7b2cbf] rotate-12"/>
              </div>
              <Award size={48} className="text-[#7b2cbf] mb-4" />
              <h3 className="text-2xl font-black text-white uppercase italic mb-2">Je suis un Entraîneur</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Je suis un professionnel. Je veux gérer mes clients, vendre mes programmes et bâtir mon empire fitness.
              </p>
              <div className="mt-6 flex items-center text-[#7b2cbf] font-bold text-sm">
                REJOINDRE L'ÉQUIPE <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform"/>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-12">
            <p className="text-gray-500">Déjà membre ? <Link to="/login" className="text-white hover:text-[#00f5d4] font-bold">Connexion</Link></p>
          </div>
        </div>
      )}

      {/* ÉTAPE 2 : FORMULAIRE D'INSCRIPTION */}
      {step === 'form' && (
        <div className="w-full max-w-2xl z-10 bg-[#0a0a0f]/90 backdrop-blur-xl border border-gray-800 p-6 md:p-8 rounded-2xl shadow-2xl animate-in slide-in-from-right duration-500">
          
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Créer mon profil <span className={selectedRole === 'coach' ? "text-[#7b2cbf]" : "text-[#00f5d4]"}>{selectedRole === 'coach' ? 'Coach' : 'Athlète'}</span></h2>
              <p className="text-xs text-gray-400">Remplissez vos informations pour commencer.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep('role_selection')} className="text-gray-500 hover:text-white">Retour</Button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* IDENTITÉ */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
               <div>
                  <label className="text-xs text-gray-400 ml-1 mb-1 block">Prénom</label>
                  <input name="firstName" placeholder="Ex: Kevin" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 text-white focus:border-[#00f5d4] outline-none transition" />
               </div>
               <div>
                  <label className="text-xs text-gray-400 ml-1 mb-1 block">Nom</label>
                  <input name="lastName" placeholder="Ex: Servius" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 text-white focus:border-[#00f5d4] outline-none transition" />
               </div>
            </div>

            {/* DATE NAISSANCE & SEXE */}
            <div className="relative">
               <label className="text-xs text-gray-400 ml-1 mb-1 block">Date de naissance</label>
               <div className="relative">
                  <Calendar className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                  <input type="date" name="birthDate" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
               </div>
            </div>
            
            <div>
              <label className="text-xs text-gray-400 ml-1 mb-1 block">Sexe</label>
              <select name="sex" onChange={handleChange} className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 text-white focus:border-[#00f5d4] outline-none">
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
              </select>
            </div>

            {/* PHYSIQUE (Seulement pour Client ou Coach qui veut aussi s'entrainer) */}
            <div className="relative">
              <label className="text-xs text-gray-400 ml-1 mb-1 block">Taille (cm)</label>
              <div className="relative">
                  <Ruler className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                  <input type="number" name="height" placeholder="180" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
              </div>
            </div>

            <div>
               <label className="text-xs text-gray-400 ml-1 mb-1 block">Poids actuel</label>
               <div className="flex gap-2">
                  <div className="relative flex-1">
                      <Weight className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                      <input type="number" name="weight" placeholder="80" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
                  </div>
                  <div className="flex bg-[#1a1a20] rounded-lg border border-gray-700 overflow-hidden">
                      <button type="button" onClick={() => setFormData({...formData, weightUnit: 'lbs'})} className={`px-3 text-sm font-bold transition-colors ${formData.weightUnit === 'lbs' ? 'bg-[#7b2cbf] text-white' : 'text-gray-400 hover:text-white'}`}>LBS</button>
                      <button type="button" onClick={() => setFormData({...formData, weightUnit: 'kg'})} className={`px-3 text-sm font-bold transition-colors ${formData.weightUnit === 'kg' ? 'bg-[#7b2cbf] text-white' : 'text-gray-400 hover:text-white'}`}>KG</button>
                  </div>
               </div>
            </div>

            {/* LOGIN INFO */}
            <div className="md:col-span-2 mt-2 space-y-4">
               <div className="relative">
                  <label className="text-xs text-gray-400 ml-1 mb-1 block">Email</label>
                  <div className="relative">
                      <Mail className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                      <input type="email" name="email" placeholder="exemple@email.com" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                      <label className="text-xs text-gray-400 ml-1 mb-1 block">Mot de passe</label>
                      <div className="relative">
                          <Lock className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                          <input type="password" name="password" placeholder="••••••••" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
                      </div>
                  </div>
                  <div className="relative">
                      <label className="text-xs text-gray-400 ml-1 mb-1 block">Confirmation</label>
                      <div className="relative">
                          <Lock className="absolute left-3 top-3.5 text-gray-500 w-4 h-4" />
                          <input type="password" name="confirmPassword" placeholder="••••••••" onChange={handleChange} required className="w-full bg-[#1a1a20] border border-gray-700 rounded-lg p-3 pl-10 text-white focus:border-[#00f5d4] outline-none" />
                      </div>
                  </div>
               </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading} 
              className={`md:col-span-2 mt-6 text-black font-black py-6 rounded-xl hover:scale-[1.02] transition-transform ${selectedRole === 'coach' ? 'bg-gradient-to-r from-[#7b2cbf] to-[#9d4edd]' : 'bg-gradient-to-r from-[#00f5d4] to-[#7b2cbf]'}`}
            >
               {loading ? 'Création du compte...' : 'VALIDER L\'INSCRIPTION'}
            </Button>

          </form>
        </div>
      )}

      {/* --- MODAL CONFIRMATION RÔLE --- */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className={`text-2xl font-black uppercase italic ${selectedRole === 'coach' ? 'text-[#7b2cbf]' : 'text-[#00f5d4]'}`}>
              {selectedRole === 'coach' ? 'Devenir Entraîneur Kaybee' : 'Devenir Athlète Kaybee'}
            </DialogTitle>
            <DialogDescription className="text-gray-400 pt-2">
              {selectedRole === 'coach' ? (
                <div className="space-y-4">
                  <p>En rejoignant l'équipe Kaybee Fitness en tant qu'entraîneur, vous accédez à :</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#7b2cbf]"/> Outils de gestion clients (CRM)</li>
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#7b2cbf]"/> Création de programmes & diètes</li>
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#7b2cbf]"/> Visibilité sur la Marketplace</li>
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#7b2cbf]"/> Paiements sécurisés & automatisés</li>
                  </ul>
                  <p className="text-xs text-gray-500 italic mt-4 border-t border-gray-800 pt-2">Note: Votre profil sera vérifié avant d'apparaître publiquement.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p>En créant un compte client, vous débloquez votre potentiel :</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#00f5d4]"/> Accès aux programmes d'entraînement</li>
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#00f5d4]"/> Suivi nutritionnel intelligent</li>
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#00f5d4]"/> Système de progression & Gamification</li>
                    <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-[#00f5d4]"/> Accès à la communauté & Défis</li>
                  </ul>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="text-gray-500">Annuler</Button>
            <Button 
              onClick={confirmRole}
              className={`font-bold ${selectedRole === 'coach' ? 'bg-[#7b2cbf] hover:bg-[#9d4edd]' : 'bg-[#00f5d4] text-black hover:bg-[#00f5d4]/80'}`}
            >
              C'est parti !
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Signup;