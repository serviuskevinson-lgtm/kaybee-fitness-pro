import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'; // <--- AJOUT updateDoc
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  MapPin, Search, Star, Globe, Instagram, Loader2, CheckCircle, ExternalLink, Sparkles, Handshake
} from 'lucide-react';
import { motion } from 'framer-motion';

// --- CONFIGURATION API ---
// ⚠️ TA CLÉ OPENAI
const OPENAI_API_KEY = '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';

const SPORTS_LIST = [
  "Musculation", "CrossFit", "Yoga", "Pilates", "Boxe", "MMA",
  "Running", "Powerlifting", "Calisthenics", "Perte de poids", "Réhabilitation"
];

export default function Community() {
  const { currentUser } = useAuth();
  
  // --- ÉTATS ---
  const [coaches, setCoaches] = useState([]);
  const [realWorldResults, setRealWorldResults] = useState([]); 
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [isHiring, setIsHiring] = useState(false); // État pour le chargement du bouton d'embauche

  // --- FILTRES ---
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState([150]); 
  const [selectedSport, setSelectedSport] = useState('all');
  const [sessionType, setSessionType] = useState('all'); 

  // --- 1. CHARGEMENT INITIAL ---
  useEffect(() => {
    searchCoaches();
  }, []);

  const searchCoaches = async () => {
    setIsLoading(true);
    setRealWorldResults([]); 

    try {
      // A. RECHERCHE INTERNE (Coachs Kaybee inscrits)
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("role", "==", "coach")); 
      const snap = await getDocs(q);
      
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filtrage Local
      if (selectedSport !== 'all') {
        results = results.filter(c => c.specialties && c.specialties.includes(selectedSport));
      }
      if (location) {
        results = results.filter(c => c.city && c.city.toLowerCase().includes(location.toLowerCase()));
      }
      results = results.filter(c => (c.priceStart || 0) <= budget[0]);
      // Note: Pour sessionType, il faudrait que les coachs aient ce champ dans leur profil

      setCoaches(results);

      // B. RECHERCHE INTELLIGENTE (OPENAI)
      if (location && location.length > 2) {
        await searchRealPlacesWithAI(location, selectedSport);
      }

    } catch (e) {
      console.error("Erreur recherche coachs", e);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2. FONCTION RECHERCHE IA ---
  const searchRealPlacesWithAI = async (loc, sport) => {
    setIsAiLoading(true);
    const sportTerm = sport === 'all' ? 'Fitness Gyms' : sport;
    const prompt = `Tu es un assistant de recherche locale.
    Trouve 3 VRAIS studios, gyms ou clubs de sport existants à ${loc} spécialisés dans : ${sportTerm}.
    Réponds en JSON STRICT format :
    {
      "results": [
        {
          "name": "Nom du lieu",
          "bio": "Courte description réelle",
          "address": "Adresse approximative",
          "rating": 4.8,
          "specialties": ["Tag1", "Tag2"],
          "estimated_price": 50
        }
      ]
    }`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{role: "user", content: prompt}],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0]) {
        const parsed = JSON.parse(data.choices[0].message.content);
        const enrichedResults = parsed.results.map((place, index) => ({
          ...place,
          id: `ai_real_${index}`,
          isExternal: true,
          avatar: `https://source.unsplash.com/random/200x200?gym,logo&sig=${index}`,
          coverImage: `https://source.unsplash.com/random/800x600?gym,interior&sig=${index}`,
          instagramLink: `https://www.instagram.com/explore/tags/${place.name.replace(/\s/g, '').toLowerCase()}/`,
          googleLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + loc)}`
        }));
        setRealWorldResults(enrichedResults);
      }
    } catch (error) {
      console.error("Erreur IA:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- 3. FONCTION D'EMBAUCHE (LE LIEN CRUCIAL) ---
  const handleHireCoach = async () => {
    if (!currentUser || !selectedCoach) return;
    
    // Confirmation simple
    if(!window.confirm(`Voulez-vous engager ${selectedCoach.full_name || selectedCoach.name} comme votre coach ?`)) return;

    setIsHiring(true);
    try {
        // Mise à jour de MON profil utilisateur
        const myProfileRef = doc(db, "users", currentUser.uid);
        
        await updateDoc(myProfileRef, {
            coachId: selectedCoach.id, // <--- C'est ICI que la magie opère
            coachName: selectedCoach.full_name || selectedCoach.name,
            joinedCoachAt: new Date().toISOString()
        });

        alert(`Félicitations ! Vous faites maintenant partie de l'équipe de ${selectedCoach.full_name || selectedCoach.name}.`);
        setSelectedCoach(null); // Fermer le modal
        
    } catch (e) {
        console.error("Erreur hiring", e);
        alert("Une erreur est survenue lors de la connexion avec le coach.");
    }
    setIsHiring(false);
  };

  // --- 4. GÉOLOCALISATION ---
  const handleGeolocation = () => {
    if ("geolocation" in navigator) {
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
        setTimeout(() => {
          setLocation("Montréal"); 
          setIsLoading(false);
          alert("Localisation (Simulée) : Montréal. Cliquez sur 'Lancer Recherche'.");
        }, 800);
      }, () => {
        alert("Impossible de récupérer la position.");
        setIsLoading(false);
      });
    } else {
      alert("Géolocalisation non supportée.");
    }
  };

  return (
    <div className="space-y-6 pb-20 min-h-screen">
      
      {/* HEADER */}
      <div className="relative overflow-hidden bg-[#1a1a20] p-8 rounded-3xl border border-gray-800">
        <div className="relative z-10">
          <h1 className="text-4xl font-black italic uppercase text-white flex items-center gap-3">
            <Globe className="text-[#00f5d4] w-10 h-10"/> Trouver un Coach
          </h1>
          <p className="text-gray-400 mt-2 max-w-xl">
            Recherchez parmi nos coachs certifiés ou découvrez les meilleurs spots recommandés par notre IA.
          </p>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#7b2cbf]/20 to-transparent pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* --- SIDEBAR FILTRES --- */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="kb-card bg-[#1a1a20] border-gray-800 sticky top-4">
            <CardHeader><CardTitle className="text-white uppercase text-sm font-black">Filtres de Recherche</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              
              {/* Localisation */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Région / Ville</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="ex: Paris, Lyon..." 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="bg-black border-gray-700 text-white"
                  />
                  <Button size="icon" onClick={handleGeolocation} className="bg-[#7b2cbf] hover:bg-[#9d4edd] text-white border-none transition-colors">
                    <MapPin size={18}/>
                  </Button>
                </div>
              </div>

              {/* Sport */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Discipline</label>
                <Select value={selectedSport} onValueChange={setSelectedSport}>
                  <SelectTrigger className="bg-black border-gray-700 text-white">
                    <SelectValue placeholder="Choisir un sport" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a20] text-white border-gray-700">
                    <SelectItem value="all">Tous les sports</SelectItem>
                    {SPORTS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Budget */}
              <div className="space-y-4">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-gray-500 uppercase">Budget Max</label>
                  <span className="text-xs font-bold text-[#00f5d4]">{budget[0]}$</span>
                </div>
                <Slider defaultValue={[150]} max={300} step={10} value={budget} onValueChange={setBudget} className="py-4" />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {['private', 'semi', 'group', 'remote'].map(type => {
                    const labels = { private: 'Privé', semi: 'Semi', group: 'Groupe', remote: 'Distance' };
                    return (
                      <Button 
                        key={type}
                        variant={sessionType === type ? 'default' : 'outline'} 
                        onClick={() => setSessionType(type)} 
                        className={`text-xs ${sessionType === type 
                          ? 'bg-[#7b2cbf] text-white border-none' 
                          : 'bg-[#7b2cbf]/20 text-white border border-[#7b2cbf]/50 hover:bg-[#7b2cbf]/40'}`}
                      >
                        {labels[type]}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Button onClick={searchCoaches} className="w-full bg-[#7b2cbf] text-white font-black hover:bg-[#9d4edd] hover:scale-105 transition-transform" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin mr-2"/> : <Search className="mr-2" size={18}/>}
                LANCER RECHERCHE
              </Button>

            </CardContent>
          </Card>
        </div>

        {/* --- RÉSULTATS --- */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Section Coachs Kaybee (Certifiés) */}
          {coaches.length > 0 && (
            <div>
              <h2 className="text-2xl font-black text-white italic uppercase mb-4 flex items-center gap-2">
                <CheckCircle className="text-[#00f5d4]"/> Coachs Certifiés
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {coaches.map((coach) => (
                  <motion.div key={coach.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-[#7b2cbf] transition-all cursor-pointer group overflow-hidden h-full" onClick={() => setSelectedCoach(coach)}>
                      <div className="h-32 bg-gray-800 relative">
                        <img src={coach.coverImage || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80"} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[#00f5d4] font-black text-sm">
                          {coach.priceStart ? `dès ${coach.priceStart}$` : "Sur devis"}
                        </div>
                      </div>
                      <CardContent className="relative pt-0 px-4 pb-4">
                        <div className="flex justify-between items-end -mt-10 mb-3">
                           <Avatar className="w-20 h-20 border-4 border-[#1a1a20]">
                             <AvatarImage src={coach.avatar} />
                             <AvatarFallback className="bg-[#7b2cbf] text-white font-black">{coach.full_name?.[0] || coach.name?.[0] || "C"}</AvatarFallback>
                           </Avatar>
                           <div className="flex gap-1 flex-wrap justify-end">
                              {coach.specialties?.slice(0, 2).map(s => (<Badge key={s} className="bg-white/10 text-white hover:bg-[#7b2cbf] border-none">{s}</Badge>))}
                           </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <h3 className="text-xl font-bold text-white group-hover:text-[#00f5d4] transition-colors">{coach.full_name || coach.name}</h3>
                            <div className="flex items-center text-[#ffd700] text-sm font-bold"><Star size={14} className="fill-[#ffd700] mr-1"/> {coach.rating || "5.0"}</div>
                          </div>
                          <p className="text-gray-400 text-xs flex items-center gap-1 mb-3"><MapPin size={12}/> {coach.city || "Ville non spécifiée"}</p>
                          <p className="text-sm text-gray-300 line-clamp-2">{coach.bio || "Coach passionné prêt à vous aider à atteindre vos objectifs."}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Section Résultats IA (VRAIS LIEUX) */}
          {(realWorldResults.length > 0 || isAiLoading) && (
            <div className={coaches.length > 0 ? "pt-8 border-t border-gray-800" : ""}>
               <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-black text-white italic uppercase flex items-center gap-2">
                    <Sparkles className="text-[#9d4edd]"/> Découvertes AI à {location}
                  </h2>
                  <Badge variant="outline" className="text-xs text-gray-500 border-gray-700">Recherche Web</Badge>
               </div>
               
               {isAiLoading ? (
                 <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="animate-spin text-[#9d4edd] w-8 h-8 mb-2"/>
                    <p className="text-gray-400 text-sm">L'IA scanne les meilleurs spots à {location}...</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {realWorldResults.map((result) => (
                     <motion.div key={result.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                       <Card className="kb-card bg-[#1a1a20] border-gray-800 hover:border-[#9d4edd] transition-all cursor-pointer group h-full" onClick={() => setSelectedCoach(result)}>
                          <div className="flex h-full">
                             {/* Image à gauche */}
                             <div className="w-1/3 bg-gray-900 relative">
                               <img src={result.coverImage} className="w-full h-full object-cover opacity-80" />
                             </div>
                             {/* Contenu à droite */}
                             <div className="flex-1 p-4 flex flex-col justify-between">
                                <div>
                                  <div className="flex justify-between items-start">
                                    <h4 className="text-white font-bold group-hover:text-[#9d4edd] transition-colors line-clamp-1">{result.name}</h4>
                                    <span className="text-[#ffd700] text-xs font-bold flex items-center shrink-0"><Star size={10} className="fill-[#ffd700] mr-1"/>{result.rating}</span>
                                  </div>
                                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><MapPin size={10}/> {result.address}</p>
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {result.specialties?.slice(0, 2).map(s => <span key={s} className="text-[10px] bg-white/5 text-gray-300 px-1.5 py-0.5 rounded">{s}</span>)}
                                  </div>
                                </div>
                                <div className="flex justify-between items-end mt-2">
                                   <div>
                                      <p className="text-[10px] text-gray-500">Est.</p>
                                      <p className="text-white font-black">~{result.estimated_price}$</p>
                                   </div>
                                   <Button size="sm" variant="outline" className="h-7 text-xs border-gray-600 hover:bg-[#9d4edd] hover:text-white hover:border-[#9d4edd]">
                                     <ExternalLink size={12} className="mr-1"/> Infos
                                   </Button>
                                </div>
                             </div>
                          </div>
                       </Card>
                     </motion.div>
                   ))}
                 </div>
               )}
            </div>
          )}

          {/* État vide total */}
          {coaches.length === 0 && realWorldResults.length === 0 && !isLoading && !isAiLoading && (
            <div className="p-12 text-center text-gray-500 bg-black/20 rounded-xl border border-dashed border-gray-800">
              <Search className="mx-auto mb-4 opacity-20" size={48} />
              <p>Entrez une ville (ex: "Paris", "Montreal") pour lancer la recherche.</p>
            </div>
          )}

        </div>
      </div>

      {/* MODAL PROFIL COACH (UNIFIÉ) */}
      <Dialog open={!!selectedCoach} onOpenChange={() => setSelectedCoach(null)}>
        <DialogContent className="bg-[#1a1a20] border-gray-800 text-white max-w-3xl overflow-hidden p-0 rounded-3xl">
          {selectedCoach && (
            <div className="flex flex-col md:flex-row h-[80vh] md:h-[600px]">
              {/* Colonne Gauche : Visuel */}
              <div className="md:w-5/12 bg-gray-900 relative">
                 <img src={selectedCoach.coverImage || selectedCoach.avatar || "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800"} className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-90"></div>
                 <div className="absolute bottom-6 left-6 right-6">
                    <h2 className="text-2xl font-black text-white leading-tight mb-1">{selectedCoach.full_name || selectedCoach.name}</h2>
                    <p className="text-[#00f5d4] font-bold text-xs uppercase mb-4">{selectedCoach.specialties?.join(' • ')}</p>
                    
                    {selectedCoach.isExternal ? (
                      <div className="space-y-2">
                        <Button onClick={() => window.open(selectedCoach.googleLink, '_blank')} className="w-full bg-[#9d4edd] hover:bg-white hover:text-black font-black rounded-full text-xs">
                          <MapPin size={14} className="mr-2"/> VOIR SUR MAPS
                        </Button>
                        <Button onClick={() => window.open(selectedCoach.instagramLink, '_blank')} variant="outline" className="w-full border-gray-600 hover:bg-[#E1306C] hover:text-white hover:border-[#E1306C] font-black rounded-full text-xs">
                          <Instagram size={14} className="mr-2"/> RECHERCHER INSTA
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-col">
                         {/* BOUTON D'EMBAUCHE (Pour Coachs Internes) */}
                         <Button 
                            onClick={handleHireCoach} 
                            disabled={isHiring}
                            className="w-full bg-gradient-to-r from-[#7b2cbf] to-[#00f5d4] hover:scale-105 transition-transform font-black rounded-full text-black"
                         >
                            {isHiring ? <Loader2 className="animate-spin mr-2"/> : <Handshake className="mr-2 h-5 w-5"/>}
                            ENGAGER CE COACH
                         </Button>
                         
                         {/* Option secondaire : Message */}
                         <Button variant="outline" className="w-full border-gray-600 hover:bg-white hover:text-black rounded-full">
                            ENVOYER MESSAGE
                         </Button>
                      </div>
                    )}
                 </div>
              </div>

              {/* Colonne Droite : Infos */}
              <div className="flex-1 p-6 overflow-y-auto">
                 <Tabs defaultValue="about">
                    <TabsList className="bg-black/50 w-full mb-4">
                      <TabsTrigger value="about" className="flex-1">Profil</TabsTrigger>
                      <TabsTrigger value="details" className="flex-1">Détails</TabsTrigger>
                    </TabsList>

                    <TabsContent value="about" className="space-y-4">
                       <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-bold text-white">Bio</h4>
                            <p className="text-gray-300 text-sm mt-1 leading-relaxed">{selectedCoach.bio}</p>
                          </div>
                       </div>
                       
                       {selectedCoach.address && (
                         <div className="p-3 bg-black/30 rounded-lg border border-gray-800 flex items-center gap-3">
                            <MapPin className="text-[#00f5d4]"/>
                            <div>
                               <p className="text-xs text-gray-500 uppercase font-bold">Adresse</p>
                               <p className="text-white text-sm font-bold">{selectedCoach.address}</p>
                            </div>
                         </div>
                       )}

                       <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="p-3 bg-black/30 rounded-lg border border-gray-800 text-center">
                             <p className="text-[10px] text-gray-500 uppercase font-bold">Avis</p>
                             <p className="text-white font-bold flex justify-center items-center gap-1">{selectedCoach.rating} <Star size={12} className="fill-white"/></p>
                          </div>
                          <div className="p-3 bg-black/30 rounded-lg border border-gray-800 text-center">
                             <p className="text-[10px] text-gray-500 uppercase font-bold">Années d'Exp.</p>
                             <p className="text-[#00f5d4] font-bold">{selectedCoach.yearsExperience || "N/A"}</p>
                          </div>
                       </div>
                    </TabsContent>

                    <TabsContent value="details" className="space-y-4">
                       {selectedCoach.isExternal ? (
                         <div className="text-center py-10">
                            <Globe size={48} className="mx-auto text-gray-600 mb-4"/>
                            <p className="text-gray-400 text-sm mb-4">Ce lieu a été identifié par notre IA comme correspondant à vos critères.</p>
                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-500 text-xs text-left">
                               Note : Les tarifs et disponibilités peuvent varier. Vérifiez directement via Google Maps ou leur site officiel.
                            </div>
                         </div>
                       ) : (
                         <div className="space-y-3">
                            <h4 className="font-bold text-white text-sm">Tarifs & Offres</h4>
                            {selectedCoach.rates && selectedCoach.rates.length > 0 ? (
                                selectedCoach.rates.map((rate, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-gray-800">
                                        <div>
                                            <p className="text-white font-bold text-sm">{rate.title}</p>
                                            <p className="text-[10px] text-gray-500">{rate.desc}</p>
                                        </div>
                                        <p className="text-[#00f5d4] font-black">{rate.price}$</p>
                                    </div>
                                ))
                            ) : (
                                <div className="text-gray-500 text-sm italic">Aucun tarif affiché</div>
                            )}
                            
                            <h4 className="font-bold text-white text-sm mt-4">Disponibilités</h4>
                            <div className="grid grid-cols-2 gap-2">
                               <div className="p-2 bg-black/30 rounded border border-gray-800 text-center">
                                  <p className="text-xs text-gray-500">Semaine</p>
                                  <p className="text-white font-bold text-sm">Sur RDV</p>
                               </div>
                            </div>
                         </div>
                       )}
                    </TabsContent>
                 </Tabs>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}