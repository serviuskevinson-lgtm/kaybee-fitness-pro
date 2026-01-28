import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

/**
 * GÉNÈRE LES CONSEILS QUOTIDIENS (3 MODES)
 */
export const generateDailyAccountability = async (profile, liveStats, history = [], mode = "accountability", lng = "fr") => {
  try {
    let modePrompt = "";
    if (mode === "nutrition") {
      modePrompt = lng === "en" ?
        `Expert Nutritionist. List precise intakes (Calories, Protein, Carbs, Fats) for target ${profile.targetWeight}${profile.weightUnit}. Explain why.` :
        `Nutritionniste expert. Liste les apports précis (Calories, Protéines, Glucides, Lipides) pour l'objectif de ${profile.targetWeight}${profile.weightUnit}. Explique pourquoi.`;
    } else if (mode === "training") {
      modePrompt = lng === "en" ?
        `Performance Coach. Describe training style and intensity (load, rest, RPE) for target ${profile.targetWeight}${profile.weightUnit}.` :
        `Coach de performance. Décris le style et l'intensité d'entraînement (charge, repos, RPE) pour l'objectif de ${profile.targetWeight}${profile.weightUnit}.`;
    } else {
      modePrompt = lng === "en" ?
        `High-level Accountability Coach. Analyze data and tell the athlete what's wrong, what they're doing bad, and what to improve.` :
        `Coach d'accountability strict. Analyse les données et dis à l'athlète ce qui ne va pas, ce qu'il fait de mal et ce qu'il doit améliorer.`;
    }

    const prompt = `
      ${modePrompt} Langue: ${lng}.
      PROFIL: ${JSON.stringify(profile)}
      STATS DU JOUR: ${JSON.stringify(liveStats)}
      HISTORIQUE: ${JSON.stringify(history.slice(-7))}

      Retourne UNIQUEMENT un JSON:
      {
        "status": "success" | "warning" | "critical",
        "primaryNeed": "TITRE COURT",
        "recommendation": "Message personnalisé de 2-3 phrases",
        "improveWidget": "Nom du domaine"
      }
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (error) {
    console.error("AI Advice Error:", error);
    return null;
  }
};
