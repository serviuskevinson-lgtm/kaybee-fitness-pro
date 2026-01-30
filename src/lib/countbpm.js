import { getDatabase, ref, onValue } from "firebase/database";
import { app } from "./firebase";

/**
 * S'abonne au BPM en direct.
 * Gère automatiquement l'expiration : si aucune donnée reçue depuis 1 min, retourne 0.
 */
export const subscribeToHeartRate = (userId, callback) => {
    if (!userId) return;
    const db = getDatabase(app);
    const liveDataRef = ref(db, `users/${userId}/live_data`);

    return onValue(liveDataRef, (snapshot) => {
        const data = snapshot.val();
        
        if (!data || !data.heart_rate) {
            callback(0);
            return;
        }

        // Vérification de la "fraîcheur" de la donnée
        // Si la dernière mise à jour date de plus de 60 secondes, on considère le capteur inactif
        const now = Date.now();
        const lastUpdate = data.last_update || 0;
        const timeDiff = now - lastUpdate;

        if (timeDiff > 60000) { // 60 000 ms = 1 minute
            callback(0);
        } else {
            callback(data.heart_rate);
        }
    });
};