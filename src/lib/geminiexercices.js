import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

const EXERCISE_MENU = {
  "Pectoraux": ["Bench Press", "Incline Dumbbell Press", "Chest Fly", "Dips", "Push-ups"],
  "Dos": ["Pull-ups", "Lat Pulldown", "Bent Over Row", "Deadlift", "Face Pull"],
  "Jambes": ["Squat", "Leg Press", "Lunge", "Leg Extension", "Leg Curl"],
  "Épaules": ["Military Press", "Lateral Raise", "Front Raise", "Arnold Press"],
  "Bras": ["Biceps Curl", "Hammer Curl", "Triceps Extension", "Skullcrusher"],
  "Abdominaux": ["Plank", "Crunch", "Leg Raise"],
  "Fessiers": ["Glute Bridge", "Hip Thrust", "Bulgarian Split Squat", "Stiff Leg Deadlift"],
  "Cardio / Endurance": ["Burpees", "Mountain Climbers", "Jumping Jacks", "High Knees"],
  "Haut du corps": ["Push-ups", "Pull-ups", "Shoulder Press", "Dumbbell Row"],
  "Bas du corps": ["Squat", "Lunge", "Calf Raise", "Glute Bridge"]
};

/**
 * GÉNÉRATION DE SÉANCES (5-6 exercices par jour)
 */
export const autoBuildWorkoutsWithGemini = async (dates, focusAreas, userWeight, weightUnit) => {
  try {
    const prompt = `
      Agis comme un coach sportif expert. Crée un programme pour ces dates : ${dates.join(', ')}.
      Focus demandés : ${focusAreas.join(', ')}. Poids de l'athlète : ${userWeight} ${weightUnit}.

      CONSIGNES STRICTES :
      1. Génère UNE séance par date fournie.
      2. Chaque séance doit contenir entre 5 et 6 exercices.
      3. Choisis UNIQUEMENT dans ce menu d'exercices : ${JSON.stringify(EXERCISE_MENU)}.
      4. Si le focus est "Full Body", pioche dans toutes les catégories.

      Retourne UNIQUEMENT un tableau JSON:
      [{"name": "Nom de la séance", "date": "YYYY-MM-DD", "tip": "Conseil coach", "exercises": [{"name": "Nom exact du menu", "sets": "4", "reps": "12", "rest": "60"}]}]
    `;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (error) {
    console.error("Erreur AutoBuild Gemini:", error);
    throw error;
  }
};
