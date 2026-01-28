import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

// 1. CONFIGURATION DU MODÈLE (Gemini 2.5 Flash Lite)
const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

// 2. CLÉ API GOOGLE PLACES (Pour référence ou usage futur par l'IA)
const GOOGLE_PLACES_API_KEY = "AIzaSyAm3R3rPgdPDZI31p-ov5XkrNiI9c3UqU";

/**
 * RECHERCHE HYBRIDE DE COACHS (Kaybee Certified + Google Places)
 *
 * @param {string} location - Ville ou zone de recherche
 * @param {string} specialty - Discipline (Musculation, Boxe, etc.)
 * @param {number} budget - Budget mensuel max
 * @param {string} type - Format (privé, semi, groupe, distance)
 * @param {Array} currentCoaches - Liste des coachs Kaybee déjà filtrés
 * @returns {Promise<Array>} - Un tableau de 24 résultats maximum
 */
export const searchCoachesWithGemini = async (location, specialty, budget, type, currentCoaches = []) => {
  try {
    const targetTotal = 24;
    const internalLimit = 18; // On prend au maximum 3/4 de coachs Kaybee (18/24)

    // Sélection des coachs Kaybee (Priorité)
    const kaybeeCoaches = currentCoaches.slice(0, internalLimit);

    // Calcul du nombre de résultats à trouver sur Google pour atteindre 24 au total
    const neededFromGoogle = targetTotal - kaybeeCoaches.length;

    const prompt = `
      Tu es un assistant de recherche expert spécialisé dans le fitness.
      Utilise tes capacités de recherche en temps réel (via Google Places API : ${GOOGLE_PLACES_API_KEY}) pour identifier des établissements de sport, gyms, studios ou coachs RÉELS à "${location}" spécialisés en "${specialty}".
      Le budget de l'utilisateur est de ${budget}$ par mois et le format souhaité est "${type}".

      OBJECTIF : Trouver ${neededFromGoogle} résultats externes réels.

      POUR CHAQUE RÉSULTAT RÉEL TROUVÉ, EXTRAIS :
      - "name": Nom exact de l'établissement ou du professionnel.
      - "location": Adresse physique précise à ${location}.
      - "phone": Numéro de téléphone valide.
      - "website": Site Web officiel (URL complète).
      - "rating": Note moyenne Google (ex: 4.8).
      - "priceStart": Estimation du prix mensuel (nombre pur, ex: 75).
      - "bio": Une description de 2 phrases sur leurs services et l'intensité.
      - "specialty": "${specialty}".

      CONSIGNES CRITIQUES :
      - Ne génère QUE des lieux qui existent RÉELLEMENT à ${location}.
      - Si tu ne trouves pas assez de résultats correspondant exactement, élargis aux gyms généralistes à proximité.
      - Retourne UNIQUEMENT un tableau JSON. Pas de texte avant ou après.

      FORMAT JSON ATTENDU :
      [
        {
          "name": "...",
          "location": "...",
          "phone": "...",
          "website": "...",
          "rating": 4.5,
          "priceStart": 60,
          "bio": "...",
          "specialty": "..."
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Nettoyage et parsing du JSON renvoyé par l'IA
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const googleResults = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    // 3. Formatage des résultats Kaybee (Internes)
    const internalFormatted = kaybeeCoaches.map(c => ({
        ...c,
        isAi: false,
        isExternal: false,
        source: 'Kaybee Certified'
    }));

    // 4. Formatage des résultats Google (Externes)
    const externalFormatted = googleResults.map((c, i) => ({
        ...c,
        id: `google_${Date.now()}_${i}`,
        full_name: c.name,
        isAi: true,
        isExternal: true,
        source: 'Google Places'
    }));

    // 5. Fusion finale : Kaybee d'abord, puis Google pour compléter jusqu'à 24
    const finalResults = [...internalFormatted, ...externalFormatted];

    return finalResults.slice(0, targetTotal);
  } catch (error) {
    console.error("Erreur Recherche Hybride Coach:", error);
    // En cas d'erreur de l'IA, on retourne au moins les coachs internes Kaybee
    return currentCoaches.slice(0, 24);
  }
};
