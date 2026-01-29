import { getDatabase, ref, update, onValue } from "firebase/database";
import { app } from "./firebase";

/**
 * S'abonne aux pas de l'utilisateur dans la RTDB
 */
export const subscribeToSteps = (userId, callback) => {
    if (!userId) return;
    const db = getDatabase(app);
    const stepsRef = ref(db, `users/${userId}/live_data/steps`);

    return onValue(stepsRef, (snapshot) => {
        const steps = snapshot.val() || 0;
        callback(steps);
    });
};

/**
 * Met à jour les pas et gère le reset quotidien
 */
export const syncSteps = async (userId, steps) => {
    if (!userId) return;
    const db = getDatabase(app);
    const today = new Date().toISOString().split('T')[0];

    const updates = {
        steps: steps,
        date: today,
        last_update: Date.now(),
        source: "app"
    };

    await update(ref(db, `users/${userId}/live_data`), updates);
};
