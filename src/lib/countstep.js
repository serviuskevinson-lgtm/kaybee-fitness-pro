import { getDatabase, ref, onValue, update } from "firebase/database";
import { app } from "./firebase";
import { Plugins } from '@capacitor/core';
// Assure-toi d'avoir enregistré ton plugin
const { WearPlugin } = Plugins; 

/**
 * S'abonne aux pas de l'utilisateur dans la RTDB
 * Gère automatiquement l'affichage que ça vienne de la montre ou du téléphone
 */
export const subscribeToSteps = (userId, callback) => {
    if (!userId) return;

    // IMPORTANT: On informe le plugin natif de l'ID utilisateur
    // Cela active le mode fallback sur le téléphone si la montre coupe
    if(WearPlugin?.setUserId) {
        WearPlugin.setUserId({ userId: userId });
    }

    const db = getDatabase(app);
    const stepsRef = ref(db, `users/${userId}/live_data`);

    return onValue(stepsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback(0);
            return;
        }

        // On vérifie la date pour ne pas afficher les pas d'hier
        const today = new Date().toISOString().split('T')[0];
        if (data.date !== today) {
            // Si la date stockée n'est pas aujourd'hui, on considère 0
            // (La montre ou le téléphone mettra à jour bientôt)
            callback(0);
        } else {
            // On renvoie les pas, peu importe la source (watch ou phone)
            callback(data.steps || 0);
        }
    });
};

/**
 * Cette fonction n'est plus strictement nécessaire si le code natif (Java/Kotlin) fait le travail.
 * Mais on peut la garder pour des updates manuels via l'UI si besoin.
 */
export const syncSteps = async (userId, steps) => {
   // La logique d'écriture est maintenant gérée principalement par :
   // 1. PassiveDataReceiver.kt (Montre)
   // 2. WearPlugin.java (Téléphone)
   // On évite d'écrire depuis le JS pour ne pas créer de conflits, sauf si c'est une saisie manuelle.
};