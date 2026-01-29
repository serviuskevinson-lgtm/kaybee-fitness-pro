import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-1.5-flash",
  generationConfig: { responseMimeType: "application/json" }
});

/**
 * GÉNÈRE DES CONSEILS 100% PERSONNALISÉS SELON L'UTILISATEUR
 */
export const generateDailyAccountability = async (profile, liveStats, history = [], mode = "accountability", lng = "fr") => {
  try {
    // Construction d'un contexte ultra-personnalisé basé sur TOUTES les données du profil
    const userContext = `
      Nom: ${profile.firstName} ${profile.lastName}
      Âge/Sexe: ${profile.birthDate} / ${profile.sex}
      Biométrie: ${profile.height}cm, ${profile.weight}${profile.weightUnit} (Cible: ${profile.targetWeight}${profile.weightUnit})
      Santé: Blessures: ${profile.injuries || 'Aucune'}, Allergies: ${profile.allergies || 'Aucune'}
      Objectifs choisis: ${profile.selectedGoals?.join(', ') || 'Remise en forme'}
      Précisions utilisateur: "${profile.customGoals || 'Non spécifié'}"
      Disponibilités: ${profile.availability?.join(', ') || 'Non spécifiées'}
      Zone: ${profile.location?.city}, ${profile.location?.country}
    `;

    let modePrompt = "";
    if (mode === "nutrition") {
      modePrompt = lng === "en" ?
        `As a dedicated Personal Nutritionist for ${profile.firstName}, provide a 100% tailored meal strategy. Consider their allergies (${profile.allergies}) and injuries (${profile.injuries}) when suggesting nutrient sources. Use their precise weight (${profile.weight}) to calculate macros for reaching ${profile.targetWeight}.` :
        `En tant que nutritionniste personnel dédié pour ${profile.firstName}, fournis une stratégie alimentaire 100% sur mesure. Prends en compte ses allergies (${profile.allergies}) et ses blessures (${profile.injuries}) pour suggérer des sources de nutriments. Utilise son poids précis (${profile.weight}) pour calculer les macros afin d'atteindre ${profile.targetWeight}.`;
    } else if (mode === "training") {
      modePrompt = lng === "en" ?
        `As ${profile.firstName}'s High-Performance Coach, design a session strategy for today. Account for their injuries (${profile.injuries}) and availability (${profile.availability?.join(', ')}). Target their specific goal: ${profile.selectedGoals?.join(', ')}.` :
        `En tant que coach de haute performance de ${profile.firstName}, conçois une stratégie de séance pour aujourd'hui. Tiens compte de ses blessures (${profile.injuries}) et de ses disponibilités (${profile.availability?.join(', ')}). Vise son objectif spécifique : ${profile.selectedGoals?.join(', ')}.`;
    } else {
      modePrompt = lng === "en" ?
        `As an Elite Accountability Coach, talk directly to ${profile.firstName}. Analyze if their daily stats match their target of ${profile.targetWeight}. Be direct, personal, and use their custom goals ("${profile.customGoals}") to motivate or challenge them.` :
        `En tant que coach d'accountability d'élite, parle directement à ${profile.firstName}. Analyse si ses stats du jour correspondent à son objectif de ${profile.targetWeight}. Sois direct, personnel, et utilise ses précisions d'objectifs ("${profile.customGoals}") pour le motiver ou le recadrer.`;
    }

    const prompt = `
      CONTEXTE UTILISATEUR:
      ${userContext}

      CONSIGNE:
      ${modePrompt} Langue: ${lng}.

      STATS DU JOUR ACTUELLES: ${JSON.stringify(liveStats)}
      HISTORIQUE RÉCENT: ${JSON.stringify(history.slice(-7))}

      IMPORTANT: Parle à l'utilisateur à la deuxième personne ("Tu"). Utilise son prénom. Tes conseils doivent être impossibles à donner à quelqu'un d'autre. Si l'utilisateur a des blessures, tes conseils DOIVENT en tenir compte.

      Retourne UNIQUEMENT un JSON:
      {
        "status": "success" | "warning" | "critical",
        "primaryNeed": "TITRE ULTRA-PERSONNALISÉ",
        "recommendation": "Message 100% personnel de 2-3 phrases mentionnant ses objectifs spécifiques",
        "improveWidget": "Nom du domaine à améliorer"
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
