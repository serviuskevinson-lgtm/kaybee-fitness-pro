import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase"; 

// 1. Initialiser le service Vertex AI
const vertexAI = getAI(app);

// 2. Choisir le modèle (Flash est rapide et idéal pour le fitness)
const model = getGenerativeModel(vertexAI, { model: "gemini-2.5-flash" });

/**
 * Analyse un repas (Texte) pour donner les calories/macros
 */
export const analyzeFoodWithGemini = async (description) => {
  try {
    const prompt = `
      Agis comme un nutritionniste expert. Analyse ce repas : "${description}".
      
      Retourne UNIQUEMENT un objet JSON valide (sans Markdown, sans texte autour) avec ce format exact :
      {
        "name": "Nom court du plat",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fats": 0,
        "advice": "Court conseil (max 10 mots)"
      }
      Si tu ne peux pas estimer, mets des valeurs approximatives basées sur des portions standards.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonString = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonString);

  } catch (error) {
    console.error("Erreur Gemini (Nutrition):", error);
    throw new Error("Impossible d'analyser ce repas.");
  }
};

/**
 * Générateur de Workout (Placeholder pour l'instant)
 */
export const generateWorkoutWithGemini = async (goal, level, equipment) => {
    return [];
};

/**
 * RECHERCHE COACH INTELLIGENTE (Vraies données + Filtres stricts)
 */
export const searchCoachesWithGemini = async (location, specialty, budget, type) => {
  try {
    // Prompt ultra-spécifique pour forcer des vrais résultats
    const prompt = `
      Agis comme un expert fitness local à "${location}".
      Ta mission : Trouver 5 coachs, studios ou gyms RÉELS et EXISTANTS qui correspondent à ces critères :
      
      1. Discipline : ${specialty}
      2. Budget max : ${budget}$ par séance/mois.
      3. Format : ${type} (ex: Cours Privé, Groupe, Semi-Privé).
      
      Si la ville est grande, précise le quartier.
      Si tu ne trouves pas de correspondance exacte pour le prix, cherche le plus proche mais mentionne le vrai prix.

      Retourne UNIQUEMENT un tableau JSON valide (sans Markdown). Format :
      [
        {
          "full_name": "Nom du Coach/Lieu (Quartier)",
          "bio": "Description courte (inclure mention du prix et du style)",
          "specialty": "${specialty}",
          "location": "Adresse ou Quartier",
          "priceStart": 50, 
          "rating": 4.9,
          "website": "Lien ou 'N/A'"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Nettoyage du JSON (au cas où Gemini met des ```json ...)
    const jsonString = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(jsonString);
    
    // Ajout d'IDs uniques et flags pour le frontend
    return data.map((c, i) => ({ 
        ...c, 
        id: `ai_${Date.now()}_${i}`, 
        isAi: true, 
        isExternal: true 
    }));

  } catch (error) {
    console.error("Erreur Gemini Search:", error);
    return [];
  }
};