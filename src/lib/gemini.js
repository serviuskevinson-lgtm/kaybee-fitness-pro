import { getAI, getGenerativeModel } from "firebase/ai";
import { app } from "./firebase";

// 1. CONFIGURATION DU MODÈLE (Gemini 2.5 Flash Lite)
const vertexAI = getAI(app);
const model = getGenerativeModel(vertexAI, {
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

// 2. CLÉ API GOOGLE PLACES
const GOOGLE_PLACES_API_KEY = "AIzaSyAm3R3rPgdPDZI31p-ov5XkrNiI9c3UqU";

// 3. MENU D'EXERCICES OFFICIEL
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
 * FONCTION 1 : GÉNÉRATION DE SÉANCES (5-6 exercices par jour)
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

/**
 * FONCTION 2 : ANALYSE ALIMENTAIRE CONVERSATIONNELLE (Mode Chat)
 */
export const analyzeFoodChat = async (input, history = [], isImage = false) => {
  try {
    const prompt = isImage
      ? `Analyse cette image de nourriture.
         1. Décompose chaque élément visible.
         2. Pour chaque élément, estime : Quantité -> Calories et Macros.
         3. Donne une décomposition claire dans "analysisBreakdown".
         4. Retourne les totaux numériques dans "data".
         CONSIGNE NOMBRES : Uniquement des nombres entiers, pas de texte dans les valeurs.

         FORMAT JSON :
         {
           "success": true,
           "needsMoreInfo": false,
           "message": "Confirmation",
           "analysisBreakdown": "Détail du calcul...",
           "data": { "name": "Nom", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "sugar": 0 }
         }`
      : `Analyse ce repas : "${input}". Historique: ${JSON.stringify(history)}.
         CONSIGNES :
         1. Décompose chaque ingrédient. Si 3 tranches de pain, calcule 1 tranche * 3.
         2. Écris le raisonnement dans "analysisBreakdown".
         3. Si flou, demande une précision dans "message" et mets needsMoreInfo:true.
         CONSIGNE NOMBRES : Uniquement des nombres entiers.

         FORMAT JSON :
         {
           "success": true,
           "needsMoreInfo": false,
           "message": "Confirmation",
           "analysisBreakdown": "Raisonnement du calcul...",
           "data": { "name": "Nom", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0, "sugar": 0 }
         }`;

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

// Wrappers pour compatibilité balance énergétique
export const analyzeFoodWithGemini = async (description) => {
  const res = await analyzeFoodChat(description);
  return res.success ? res.data : null;
};

export const analyzeFoodImageWithGemini = async (base64Image) => {
  const res = await analyzeFoodChat(base64Image, [], true);
  return res.success ? res.data : null;
};

/**
 * FONCTION 3 : ACCOUNTABILITY QUOTIDIENNE (3 Modes)
 */
export const generateDailyAccountability = async (profile, liveStats, history = [], mode = "accountability", lng = "fr") => {
  try {
    let modePrompt = "";
    if (mode === "nutrition") {
      modePrompt = lng === "en" ?
        `Expert Nutritionist. List precise intakes (Calories, Protein, Carbs, Fats) for target ${profile.targetWeight}${profile.weightUnit}.` :
        `Nutritionniste expert. Liste les apports précis (Calories, Protéines, Glucides, Lipides) pour l'objectif de ${profile.targetWeight}${profile.weightUnit}.`;
    } else if (mode === "training") {
      modePrompt = lng === "en" ?
        `Performance Coach. Describe training style and intensity (load, rest, RPE).` :
        `Coach de performance. Décris le style et l'intensité d'entraînement (charge, repos, RPE).`;
    } else {
      modePrompt = lng === "en" ?
        `Accountability Coach. Analyze data and tell the athlete what's wrong and what to improve.` :
        `Coach d'accountability strict. Analyse les données et dis à l'athlète ce qui ne va pas et ce qu'il doit améliorer.`;
    }

    const prompt = `
      ${modePrompt} Langue: ${lng === "en" ? "English" : "French"}.
      PROFIL: ${JSON.stringify(profile)}
      STATS: ${JSON.stringify(liveStats)}
      HISTORIQUE: ${JSON.stringify(history.slice(-7))}

      Retourne UNIQUEMENT JSON:
      { "status": "success"|"warning"|"critical", "primaryNeed": "TITRE", "recommendation": "Texte", "improveWidget": "Nom" }
    `;
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) { return null; }
};

/**
 * FONCTION 5 : FEEDBACK DE SÉANCE
 */
export const generateWorkoutFeedback = async (workout, stats) => {
  try {
    const prompt = `
      Agis comme un coach sportif motivant et expert.
      L'athlète vient de terminer la séance suivante : ${JSON.stringify(workout)}.
      Statistiques de la séance : ${JSON.stringify(stats)}.

      Analyse les performances (durée, calories, volume) et donne un feedback court (2 phrases max),
      très motivant et personnalisé. Utilise le tutoiement.

      Retourne UNIQUEMENT une chaîne de caractères simple (pas de JSON).
    `;

    // Pour cette fonction on n'utilise pas le format JSON forcé pour avoir un texte brut propre
    const modelText = getGenerativeModel(vertexAI, { model: "gemini-2.5-flash-lite" });
    const result = await modelText.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Erreur Feedback Gemini:", error);
    return "Super séance ! Ta régularité va payer, continue comme ça !";
  }
};

/**
 * FONCTION 4 : RECHERCHE HYBRIDE DE COACHS (Kaybee + Google Places)
 */
export const searchCoachesWithGemini = async (location, specialty, budget, type, currentCoaches = []) => {
  try {
    const targetTotal = 24;
    const internalLimit = Math.floor(targetTotal * 0.75);
    const kaybeeCoaches = currentCoaches.slice(0, internalLimit);
    const neededFromGoogle = targetTotal - kaybeeCoaches.length;

    const prompt = `
      Recherche de coachs réels à "${location}" pour "${specialty}". Budget: ${budget}$.
      Trouve ${neededFromGoogle} centres fitness ou coachs RÉELS.
      POUR CHAQUE RÉSULTAT, TROUVE : Nom, Adresse, Téléphone, Site Web, Note, Prix, Bio.

      Retourne UNIQUEMENT un tableau JSON:
      [{"name": "...", "location": "...", "phone": "...", "website": "...", "rating": 4.5, "priceStart": 60, "bio": "...", "specialty": "..."}]
    `;

    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\[[\s\S]*\]/);
    const googleResults = JSON.parse(jsonMatch ? jsonMatch[0] : result.response.text());

    const internalFormatted = kaybeeCoaches.map(c => ({ ...c, isAi: false, isExternal: false, source: 'Kaybee Certified' }));
    const externalFormatted = googleResults.map((c, i) => ({ ...c, id: `google_${Date.now()}_${i}`, full_name: c.name, isAi: true, isExternal: true, source: 'Google Places' }));

    return [...internalFormatted, ...externalFormatted];
  } catch (error) { return currentCoaches; }
};
