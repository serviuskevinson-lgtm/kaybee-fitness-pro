// Calcule le Métabolisme de Base (BMR) : Calories brûlées au repos complet
export const calculateBMR = (gender, weight, height, age) => {
    // Poids en kg, Taille en cm, Age en années
    if (!weight || !height || !age) return 1600; // Valeur par défaut

    if (gender === 'homme') {
        return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
        return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }
};

// Calcule la dépense totale (TDEE) en fonction de l'activité
export const calculateTDEE = (bmr, activityLevel) => {
    const multipliers = {
        sedentary: 1.2,      // Peu ou pas d'exercice
        light: 1.375,        // Exercice léger 1-3 jours/semaine
        moderate: 1.55,      // Exercice modéré 3-5 jours/semaine
        active: 1.725,       // Exercice intense 6-7 jours/semaine
        extreme: 1.9         // Exercice très intense + job physique
    };
    return Math.round(bmr * (multipliers[activityLevel] || 1.2));
};