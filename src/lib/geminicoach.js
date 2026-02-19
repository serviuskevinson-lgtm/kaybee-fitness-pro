import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

// 1. CONFIGURATION DU MODÈLE (Gemini 2.5 Flash Lite)
const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

/**
 * RECHERCHE HYBRIDE : Harmonise les résultats de Google et de Kaybee
 * Gemini sert ici d'intelligence pour "qualifier" les établissements réels
 */
export const searchCoachesWithGemini = async (location, specialty, budget, type, internalCoaches = [], googleResults = []) => {
  try {
    // Si on n'a aucun résultat, on demande à Gemini d'en suggérer de nouveaux
    const hasResults = internalCoaches.length > 0 || googleResults.length > 0;

    const prompt = `
      Tu es un expert fitness à ${location}.
      On cherche des établissements ou coachs pour : ${specialty}.
      Budget: ${budget}$. Type: ${type}.

      Voici les résultats actuels trouvés :
      KAYBEE (Internes): ${JSON.stringify(internalCoaches.map(c => ({ name: c.full_name, bio: c.bio })))}
      GOOGLE (Réels): ${JSON.stringify(googleResults.map(g => ({ name: g.full_name, rating: g.rating, address: g.address })))}

      TA MISSION :
      1. Analyse si les lieux Google correspondent bien à la discipline "${specialty}".
      2. Si tu connais d'autres lieux RÉELS et CÉLÈBRES à ${location} qui manquent, ajoute-les.
      3. Pour chaque lieu, génère une "bio_ai" accrocheuse de 10 mots max.

      Format de réponse (JSON uniquement) :
      [
        {
          "name": "Nom exact",
          "bio_ai": "Description courte",
          "match_score": 95,
          "is_recommended": true
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const aiAnalysis = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");

    // Fusion et enrichissement
    const enrichedResults = [...internalCoaches.map(c => ({ ...c, isExternal: false, source: 'Kaybee Certified' }))];

    googleResults.forEach(gr => {
        const analysis = aiAnalysis.find(a => a.name.toLowerCase() === gr.full_name.toLowerCase());
        enrichedResults.push({
            ...gr,
            bio: analysis?.bio_ai || gr.bio || "Établissement de fitness réputé.",
            matchScore: analysis?.match_score || 80,
            isRecommended: analysis?.is_recommended || false
        });
    });

    return enrichedResults.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } catch (error) {
    console.error("Erreur Recherche Gemini Coach:", error);
    return [...internalCoaches, ...googleResults];
  }
};
