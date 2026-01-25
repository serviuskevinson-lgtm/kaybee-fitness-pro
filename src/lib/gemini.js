import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase"; 

// 1. Initialiser le service Vertex AI
const vertexAI = getAI(app);

// 2. Choisir le modèle
const model = getGenerativeModel(vertexAI, { model: "gemini-1.5-flash" });

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
        "fiber": 0,
        "sugar": 0,
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
 * Analyse une IMAGE de repas pour extraire les macros
 */
export const analyzeFoodImageWithGemini = async (base64Image) => {
  try {
    const prompt = `
      Regarde cette image de nourriture. Agis comme un nutritionniste expert.
      Identifie le plat et estime les portions pour calculer les macronutriments.

      Retourne UNIQUEMENT un objet JSON valide (sans Markdown) avec ce format exact :
      {
        "name": "Nom du plat identifié",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fats": 0,
        "fiber": 0,
        "sugar": 0,
        "advice": "Un conseil nutritionnel court sur ce plat."
      }
    `;

    const imagePart = {
      inlineData: {
        data: base64Image.split(',')[1],
        mimeType: "image/jpeg"
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text();
    const jsonString = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonString);

  } catch (error) {
    console.error("Erreur Gemini Image:", error);
    throw new Error("L'IA n'a pas pu analyser l'image.");
  }
};

/**
 * GÉNÉRATEUR DE SÉANCES AUTOMATIQUE (Auto Build)
 * Inclut la logique 70/30 (Populaire / Nouveau) et dates précises.
 */
export const autoBuildWorkoutsWithGemini = async (dates, focusAreas, userWeight, weightUnit) => {
  try {
    const prompt = `
      Agis comme un coach sportif expert de renommée mondiale.
      Ta mission : Créer un programme d'entraînement de ${dates.length} séances.

      INFOS CLIENT :
      - Dates : ${dates.join(', ')}
      - Focus : ${focusAreas.join(', ')}
      - Poids : ${userWeight} ${weightUnit}

      RÈGLES DE CONSTRUCTION :
      1. LOGIQUE D'EXERCICES :
         - 70% d'exercices MONDIALEMENT POPULAIRES (ex: Bench Press, Squat, Deadlift, Pull-ups).
         - 30% d'exercices MOINS CONNUS ou originaux pour la nouveauté.
      2. REGROUPEMENT : Combine intelligemment (ex: Pectoraux/Triceps, Dos/Biceps).
      3. PARAMÈTRES : Défini Sets, Reps et Rest selon l'objectif.
      4. COACH TIP : Donne un conseil court (ex: "Go heavy for less weight" ou "Focus on reps").

      Retourne UNIQUEMENT un tableau JSON valide (sans Markdown) au format suivant :
      [
        {
          "name": "Nom de la séance",
          "date": "YYYY-MM-DD (doit être une des dates fournies)",
          "tip": "Conseil (max 15 mots)",
          "exercises": [
            {
              "name": "Nom de l'exercice",
              "sets": "4",
              "reps": "8-10",
              "rest": "90"
            }
          ]
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonString = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonString);

  } catch (error) {
    console.error("Erreur Gemini AutoBuild:", error);
    throw new Error("L'IA n'a pas pu générer le programme.");
  }
};

/**
 * RECHERCHE COACH INTELLIGENTE
 */
export const searchCoachesWithGemini = async (location, specialty, budget, type) => {
  try {
    const prompt = `
      Agis comme un expert fitness local à "${location}".
      Ta mission : Trouver 5 coachs RÉELS.
      Retourne UNIQUEMENT un tableau JSON valide.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonString = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(jsonString);
    return data.map((c, i) => ({ ...c, id: `ai_${Date.now()}_${i}`, isAi: true, isExternal: true }));
  } catch (error) {
    console.error("Erreur Gemini Search:", error);
    return [];
  }
};
