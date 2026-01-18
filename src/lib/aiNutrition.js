import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Nécessaire pour une Web App sans backend dédié
});

export const estimateMealCalories = async (description) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Tu es un expert nutritionniste. Analyse le texte et retourne UNIQUEMENT un objet JSON : { calories: number, protein: number, carbs: number, fat: number }. Estime pour une portion standard si non précisé."
        },
        {
          role: "user",
          content: `J'ai mangé : ${description}`
        }
      ],
      temperature: 0.3,
    });

    const text = response.choices[0].message.content;
    return JSON.parse(text);
  } catch (error) {
    console.error("Erreur IA:", error);
    return null;
  }
};