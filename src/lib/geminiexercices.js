import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

const EXERCISE_MENU = {
  "Pectoraux": [
    "Bench Press", "Incline Dumbbell Press", "Chest Fly", "Dips", "Push-ups",
    "Decline Press", "Cable Crossover", "Pec Deck", "Machine Press", "Diamond Push-ups",
    "Dumbbell Pullover", "Svend Press", "Floor Press", "Guillotine Press", "Landmine Press",
    "Plyometric Push-ups", "Archer Push-ups", "Incline Fly", "Single Arm Press", "Close Grip Press"
  ],
  "Dos": [
    "Pull-ups", "Lat Pulldown", "Bent Over Row", "Deadlift", "Face Pull",
    "T-Bar Row", "Seated Cable Row", "One Arm Dumbbell Row", "Hyperextension", "Chin-ups",
    "Straight Arm Pulldown", "Good Mornings", "Rack Pulls", "Renegade Row", "Reverse Fly",
    "Lat Pushdown", "Pendlay Row", "Yates Row", "Superman", "Bird Dog"
  ],
  "Jambes": [
    "Squat", "Leg Press", "Lunge", "Leg Extension", "Leg Curl",
    "Bulgarian Split Squat", "Romanian Deadlift", "Goblet Squat", "Hack Squat", "Calf Raise",
    "Step-ups", "Sumo Deadlift", "Box Squat", "Wall Sit", "Leg Press Single",
    "Front Squat", "Glute Ham Raise", "Sissy Squat", "Nordic Curl", "Jefferson Squat"
  ],
  "Épaules": [
    "Military Press", "Lateral Raise", "Front Raise", "Arnold Press", "Upright Row",
    "Dumbbell Press", "Push Press", "Rear Delt Fly", "Face Pull", "Landmine Press",
    "Cuban Press", "Bradford Press", "Snatch Balance", "Shrugs", "Handstand Push-ups",
    "Z-Press", "Lateral Cable Raise", "W-Press", "Bus Driver", "Around the World"
  ],
  "Bras": [
    "Biceps Curl", "Hammer Curl", "Triceps Extension", "Skullcrusher", "Triceps Pushdown",
    "Close Grip Bench", "Preacher Curl", "Concentration Curl", "Dips", "Overhead Extension",
    "Kickbacks", "Spider Curl", "21s Curl", "Reverse Curl", "French Press",
    "Rope Pushdown", "Zottman Curl", "Incline Bicep Curl", "Chin-ups (Bicep focus)", "Bench Dips"
  ],
  "Abdominaux": [
    "Plank", "Crunch", "Leg Raise", "Russian Twist", "Bicycle Crunch",
    "Hanging Leg Raise", "Mountain Climbers", "Side Plank", "Ab Wheel Rollout", "V-ups",
    "Flutter Kicks", "Dead Bug", "Woodchoppers", "Reverse Crunch", "Windshield Wipers",
    "Heel Touches", "Toe Touches", "Dragon Flag", "L-Sit", "Vacuum"
  ],
  "Fessiers": [
    "Glute Bridge", "Hip Thrust", "Kettlebell Swing", "Cable Kickback", "Donkey Kicks",
    "Fire Hydrants", "Clamshells", "Single Leg Bridge", "Frog Pump", "Abductor Machine",
    "Deficit Lunge", "Stiff Leg Deadlift", "Curtsy Lunge", "Box Jumps", "Hip Abduction",
    "Monster Walk", "Sumo Squat", "Pull-throughs", "Step-ups High", "Glute Ham Raise"
  ],
  "Cardio / Endurance": [
    "Burpees", "Mountain Climbers", "Jumping Jacks", "High Knees", "Sprints",
    "Rowing Machine", "Jump Rope", "Battle Ropes", "Box Jumps", "Assault Bike",
    "Shadow Boxing", "Cycling", "Skierg", "Treadmill Run", "Elliptical",
    "Bear Crawl", "Stair Climber", "Boxing Heavy Bag", "Swimming", "Burpee Pull-ups"
  ]
};

/**
 * GÉNÉRATION DE SÉANCES (5-6 exercices par jour avec rotation large)
 */
export const autoBuildWorkoutsWithGemini = async (dates, focusAreas, userWeight, weightUnit) => {
  try {
    const prompt = `
      Agis comme un coach sportif expert. Crée un programme pour ces dates : ${dates.join(', ')}.
      Focus demandés : ${focusAreas.join(', ')}. Poids de l'athlète : ${userWeight} ${weightUnit}.

      CONSIGNES STRICTES :
      1. Génère UNE séance par date fournie.
      2. Chaque séance doit contenir entre 5 et 6 exercices.
      3. Choisis UNIQUEMENT dans ce menu très large : ${JSON.stringify(EXERCISE_MENU)}.
      4. Assure une ROTATION pour ne pas avoir les mêmes exercices si plusieurs jours ciblent le même muscle.
      5. Si le focus est "Full Body", pioche harmonieusement dans toutes les catégories.

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
