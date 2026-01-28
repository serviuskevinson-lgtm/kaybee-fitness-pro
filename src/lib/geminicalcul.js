import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

/**
 * ANALYSE DE NOURRITURE CONVERSATIONNELLE (ANTI-NaN)
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
      });
    }
    return response;
  } catch (error) {
    return { success: false, needsMoreInfo: true, message: "Détaille un peu plus ton plat svp." };
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
