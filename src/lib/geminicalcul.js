import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-1.5-flash-latest",
  generationConfig: { responseMimeType: "application/json" }
});

/**
 * ANALYSE DE NOURRITURE CONVERSATIONNELLE
 */
export const analyzeFoodChat = async (input, history = [], isImage = false) => {
  try {
    const prompt = isImage
      ? `Analyse cette image de nourriture. Décompose chaque élément visible et estime Calories/Macros.
         CONSIGNE NOMBRES : Uniquement des nombres entiers dans les champs data.
         Retourne JSON: { "success": true, "analysisBreakdown": "...", "data": { "name": "...", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "sugar": 0 } }`
      : `Analyse ce repas : "${input}". Historique: ${JSON.stringify(history)}.
         CONSIGNES : Décompose chaque ingrédient. Calcule précisément les sommes.
         Si flou, demande une précision dans "message" et mets needsMoreInfo:true.
         Retourne JSON: { "success": true, "needsMoreInfo": false, "message": "...", "analysisBreakdown": "...", "data": { "name": "...", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "sugar": 0 } }`;

    const result = await model.generateContent(isImage ? [prompt, { inlineData: { data: input.split(',')[1], mimeType: "image/jpeg" } }] : prompt);
    const response = JSON.parse(result.response.text());

    if (response.data) {
      ["calories", "protein", "carbs", "fats", "fiber", "sugar"].forEach(key => {
        if (typeof response.data[key] === 'string') {
          response.data[key] = parseInt(response.data[key].replace(/[^0-9]/g, '')) || 0;
        }
        response.data[key] = response.data[key] || 0; // Fallback to 0 if NaN
      });
    }
    return response;
  } catch (error) {
    return { success: false, needsMoreInfo: true, message: "Détaille un peu plus ton plat svp." };
  }
};

/**
 * Obtient les informations nutritionnelles complètes pour un repas donné.
 */
export const getNutritionalInfoForMeal = async (mealName, ingredients = []) => {
  try {
    const prompt = `Analyse ce plat: "${mealName}". Les ingrédients connus sont: ${ingredients.join(', ')}. Estime précisément les valeurs nutritionnelles pour une portion de ce plat. Retourne UNIQUEMENT un objet JSON valide avec les clés suivantes (en nombres entiers, sans texte ni unités): "calories", "protein", "carbs", "fats", "fiber", "sugar". Exemple de retour: { "calories": 550, "protein": 30, "carbs": 45, "fats": 20, "fiber": 8, "sugar": 12 }`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const data = JSON.parse(responseText);

    Object.keys(data).forEach(key => {
      data[key] = parseInt(data[key]) || 0;
    });

    return { success: true, data };

  } catch (error) {
    console.error("Erreur getNutritionalInfoForMeal:", error);
    return { success: false, data: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0 } };
  }
};

// Fonctions de compatibilité
export const analyzeFoodWithGemini = async (description) => {
  const res = await analyzeFoodChat(description);
  return res.success ? res.data : null;
};

export const analyzeFoodImageWithGemini = async (base64Image) => {
  const res = await analyzeFoodChat(base64Image, [], true);
  return res.success ? res.data : null;
};
