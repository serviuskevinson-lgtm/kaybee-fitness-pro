import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const SESSION_START_KEY = 'session_start_time';
const REST_END_KEY = 'rest_end_time';

// Aide pour charger dynamiquement le plugin s'il existe
const getLocalNotifications = async () => {
  try {
    // On ajoute /* @vite-ignore */ pour empêcher Vite de bloquer si le package est absent
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');
    return LocalNotifications;
  } catch (e) {
    // Silencieux au cas où le plugin n'est pas là
    return null;
  }
};

export const TimerManager = {
  // --- SESSION TIMER ---
  async startSession() {
    const startTime = Date.now();
    await Preferences.set({ key: SESSION_START_KEY, value: startTime.toString() });
    return startTime;
  },

  async getSessionElapsed() {
    const { value } = await Preferences.get({ key: SESSION_START_KEY });
    if (!value) return 0;
    return Math.floor((Date.now() - parseInt(value)) / 1000);
  },

  async stopSession() {
    await Preferences.remove({ key: SESSION_START_KEY });
    await Preferences.remove({ key: REST_END_KEY });
    const LocalNotifications = await getLocalNotifications();
    if (LocalNotifications) {
        try { await LocalNotifications.cancel({ notifications: [{ id: 101 }] }); } catch (e) {}
    }
  },

  // --- REST TIMER ---
  async startRest(durationInSeconds) {
    const endTime = Date.now() + durationInSeconds * 1000;
    await Preferences.set({ key: REST_END_KEY, value: endTime.toString() });

    // Planifier une notification de fin de repos s'il est disponible
    const LocalNotifications = await getLocalNotifications();
    if (LocalNotifications) {
      try {
        const perms = await LocalNotifications.checkPermissions();
        if (perms.display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }
        await LocalNotifications.schedule({
          notifications: [
            {
              title: "REPOS TERMINÉ !",
              body: "Il est temps de reprendre ta série. Go !",
              id: 101,
              schedule: { at: new Date(endTime) },
              sound: 'rest_end.wav',
              importance: 5,
              allowWhileIdle: true,
              foreground: true
            }
          ]
        });
      } catch (e) { console.warn("Notification non planifiée:", e); }
    }

    return endTime;
  },

  async getRestRemaining() {
    const { value } = await Preferences.get({ key: REST_END_KEY });
    if (!value) return 0;
    const remaining = Math.floor((parseInt(value) - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  },

  async clearRest() {
    await Preferences.remove({ key: REST_END_KEY });
    const LocalNotifications = await getLocalNotifications();
    if (LocalNotifications) {
        try { await LocalNotifications.cancel({ notifications: [{ id: 101 }] }); } catch (e) {}
    }
  },

  async playEndSignal() {
    try {
      await Haptics.notification({ type: ImpactStyle.Heavy });
    } catch (e) {
      console.error("Haptics error", e);
    }
  }
};
