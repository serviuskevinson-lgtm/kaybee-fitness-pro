import { getDatabase, ref, onValue } from "firebase/database";
import { app } from "./firebase";

/**
 * S'abonne au rythme cardiaque (BPM) en direct dans la RTDB
 */
export const subscribeToHeartRate = (userId, callback) => {
    if (!userId) return;
    const db = getDatabase(app);
    const hrRef = ref(db, `users/${userId}/live_data/heart_rate`);

    return onValue(hrRef, (snapshot) => {
        const bpm = snapshot.val() || 0;
        callback(bpm);
    });
};
