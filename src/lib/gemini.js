import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase"; // Assure-toi que le chemin vers firebase.js est correct

// 1. Initialiser le service Vertex AI
const vertexAI = getAI(app);

// 2. Choisir le modèle (Flash est rapide et pas cher, parfait pour le fitness)
const model = getGenerativeModel(vertexAI, { model: "gemini-2.5-flash" });

/**
 * Analyse un repas (Texte) pour donner les calories/macros
 * @param {string} description - Ex: "2 oeufs et une toast"
 */
export const analyzeFoodWithGemini = async (description) => {
  try {
    const prompt = `
      Agis comme un nutritionniste expert. Analyse ce repas : "${description}".
      
      Retourne UNIQUEMENT un objet JSON valide (sans Markdown, sans texte autour) avec ce format exact :
      {
        "name": "Nom court du plat",
        "calories": 0, // Nombre entier
        "protein": 0, // en grammes
        "carbs": 0, // en grammes
        "fats": 0, // en grammes
        "advice": "Court conseil (max 10 mots)"
      }
      Si tu ne peux pas estimer précisément, mets des valeurs approximatives basées sur des portions standards.
    `;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Nettoyage du JSON (Gemini met parfois ```json ... ``` autour)
    const jsonString = text.replace(/```json|```/g, "").trim();
    
    return JSON.parse(jsonString);

  } catch (error) {
    console.error("Erreur Gemini (Nutrition):", error);
    throw new Error("Impossible d'analyser ce repas.");
  }
};

/**
 * Générateur de Workout personnalisé
 * @param {string} goal - Ex: "Prise de masse"
 * @param {string} level - Ex: "Débutant"
 * @param {string} equipment - Ex: "Haltères seulement"
 */
export const generateWorkoutWithGemini = async (goal, level, equipment) => {
  try {
    const prompt = `
      Crée un entraînement unique pour un niveau ${level}, objectif ${goal}, avec le matériel suivant : ${equipment}.
      
      Retourne UNIQUEMENT un tableau JSON valide d'exercices. Format :
      [
        {
          "name": "Nom de l'exercice",
          "sets": 3,
          "reps": "10-12",
          "rest": 60,
          "notes": "Court conseil technique"
        }
      ]
      Ne mets pas de texte avant ou après le JSON.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonString = text.replace(/```json|```/g, "").trim();

    return JSON.parse(jsonString);

  } catch (error) {
    console.error("Erreur Gemini (Workout):", error);
    return [];
  }
};

/**
 * Recherche des coachs via IA (Simulation pour la Communauté)
 * @param {string} location - Ville ou région (ex: "Montréal")
 * @param {string} specialty - Spécialité (ex: "Bodybuilding")
 */
export const searchCoachesWithGemini = async (location, specialty) => {
  try {
    const prompt = `
      Agis comme un moteur de recherche de fitness local.
      Je cherche des coachs sportifs à "${location}" spécialisés en "${specialty}".
      
      Retourne UNIQUEMENT un tableau JSON valide contenant 3 profils recommandés (fictifs ou basés sur des profils types).
      
      Format JSON attendu :
      [
        {
          "id": "ai_1", 
          "full_name": "Prénom Nom",
          "bio": "Courte description accrocheuse (15 mots max)",
          "specialty": "${specialty}",
          "location": "${location}",
          "isVerified": false,
          "isAi": true
        }
      ]
      Ne mets pas de texte avant ou après le JSON.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonString = text.replace(/```json|```/g, "").trim();
    
    // On ajoute des IDs uniques au cas où
    const data = JSON.parse(jsonString);
    return data.map((c, i) => ({ ...c, id: `ai_${Date.now()}_${i}` }));

  } catch (error) {
    console.error("Erreur Gemini (Recherche Coach):", error);
    return []; // Retourne une liste vide en cas d'erreur pour ne pas bloquer l'UI
  }
};