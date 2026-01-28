import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

// 1. CONFIGURATION DU MODÈLE (Gemini 2.5 Flash Lite)
const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

/**
 * RECHERCHE HYBRIDE DE COACHS ET ÉTABLISSEMENTS RÉELS VIA GEMINI AI
 * Cette version utilise l'IA pour trouver des lieux réels au lieu d'appels API directs potentiellement bloqués.
 */
export const searchCoachesWithGemini = async (location, specialty, budget, type, currentCoaches = []) => {
  try {
    const targetTotal = 12;
    const internalLimit = 6;

    // On limite les coachs internes pour laisser de la place aux résultats externes
    const kaybeeCoaches = currentCoaches.slice(0, internalLimit);
    const neededFromAI = targetTotal - kaybeeCoaches.length;

    // Si on a déjà assez de coachs et pas de localisation, on s'arrête
    if (!location || location.length < 2) {
        return kaybeeCoaches.map(c => ({ ...c, isExternal: false, source: 'Kaybee Certified' }));
    }

    // Prompt pour Gemini afin de trouver de vrais lieux
    const prompt = `
      En tant qu'expert fitness local, trouve ${neededFromAI} établissements de sport ou coachs RÉELS et EXISTANTS à "${location}".
      Discipline : ${specialty}.
      Budget indicatif : ${budget}$ (session ou abonnement).

      IMPORTANT : Donne des noms de vraies entreprises ou studios que l'on peut trouver sur Google Maps à ${location}.

      Format de réponse (JSON uniquement) :
      [
        {
          "name": "Nom de l'établissement ou du coach",
          "location": "Adresse ou quartier précis à ${location}",
          "phone": "Téléphone format local",
          "website": "URL réelle du site web",
          "rating": 4.5,
          "priceStart": 50,
          "bio": "Une phrase courte décrivant leur expertise à ${location}.",
          "specialty": "${specialty}"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Nettoyage et parsing du JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const aiResults = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    // Formattage des résultats internes
    const internalFormatted = kaybeeCoaches.map(c => ({
        ...c,
        isAi: false,
        isExternal: false,
        source: 'Kaybee Certified'
    }));

    // Formattage des résultats externes (IA)
    const externalFormatted = aiResults.map((c, i) => ({
        ...c,
        id: `ai_${Date.now()}_${i}`,
        full_name: c.name,
        isAi: true,
        isExternal: true,
        source: 'Gemini AI Search',
        coverImage: `https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80`
    }));

    return [...internalFormatted, ...externalFormatted];
  } catch (error) {
    console.error("Erreur Recherche Gemini Coach:", error);
    // Retourne au moins les coachs internes en cas d'échec de l'IA
    return currentCoaches.map(c => ({ ...c, isExternal: false, source: 'Kaybee Certified' }));
  }
};
