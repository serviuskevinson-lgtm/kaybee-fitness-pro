/**
 * Génère un conseil personnalisé basé sur l'heure et le déficit
 * Accepte maintenant la fonction 't' pour la traduction
 */
export const getEveningAdvice = (goal, deficit, caloriesBurned, t) => {
    // Si 't' n'est pas fourni, on retourne null pour éviter les crashs
    if (!t) return null;

    const isEvening = new Date().getHours() >= 19;
    // Pour le test, tu peux commenter la ligne suivante :
    if (!isEvening) return null;

    // SCÉNARIO 1 : PERTE DE POIDS
    if (goal === 'lose_weight') {
        if (deficit > 200) {
            return {
                title: t('champ_title'),
                message: t('champ_msg'),
                type: "success"
            };
        } else if (deficit > 0) {
            return {
                title: t('razor_title'),
                message: t('razor_msg'),
                type: "warning"
            };
        } else {
            // Surplus
            const stepsNeeded = Math.abs(deficit) * 20; 
            return {
                title: t('alert_surplus_title'),
                message: t('alert_surplus_msg', { amount: Math.abs(deficit), steps: Math.round(stepsNeeded) }),
                type: "alert"
            };
        }
    }

    // SCÉNARIO 2 : PRISE DE MASSE
    if (goal === 'gain_muscle') {
        if (deficit < -200 && deficit > -500) {
            return {
                title: t('growth_title'),
                message: t('growth_msg'),
                type: "success"
            };
        } else if (deficit > 0) {
            // En déficit (Mauvais pour la prise)
            return {
                title: t('stagnation_title'),
                message: t('stagnation_msg'),
                type: "alert"
            };
        }
    }

    return null;
};