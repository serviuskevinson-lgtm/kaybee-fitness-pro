import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const getLocalNotifications = async () => {
  try {
    const { LocalNotifications } = await import(/* @vite-ignore */ '@capacitor/local-notifications');
    return LocalNotifications;
  } catch (e) {
    return null;
  }
};

/**
 * Envoie une notification persistante dans Firestore.
 * TYPES POSSIBLES:
 * 'message', 'vote', 'challenge', 'invoice', 'plan_workout', 'plan_nutrition',
 * 'friend_request', 'friend_accept', 'reminder'
 */
export const sendNotification = async (recipientId, currentUserId, senderName, title, message, type) => {
  if (!recipientId || recipientId === currentUserId) return;

  try {
    await addDoc(collection(db, "notifications"), {
      recipientId,
      senderId: currentUserId,
      senderName,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

export const NotificationManager = {
  async scheduleStepReminders() {
    const LocalNotifications = await getLocalNotifications();
    if (!LocalNotifications) return;

    try {
      const perms = await LocalNotifications.checkPermissions();
      if (perms.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.cancel({ notifications: [{ id: 201 }, { id: 202 }, { id: 203 }] });

      await LocalNotifications.schedule({
        notifications: [
          {
            title: "Motive-toi ! 👟",
            body: "C'est le moment de faire quelques pas pour lancer ta journée.",
            id: 201,
            schedule: { on: { hour: 10, minute: 0 }, repeats: true },
            importance: 3
          },
          {
            title: "Check tes pas ! 📊",
            body: "Où en es-tu de ton objectif de 10 000 pas ? Une petite marche ?",
            id: 202,
            schedule: { on: { hour: 14, minute: 30 }, repeats: true },
            importance: 3
          },
          {
            title: "Dernière ligne droite ! 🔥",
            body: "Il reste quelques heures pour valider ton objectif quotidien. Go !",
            id: 203,
            schedule: { on: { hour: 19, minute: 0 }, repeats: true },
            importance: 4
          }
        ]
      });
    } catch (e) {
      console.warn("Erreur lors de la planification des notifications de pas", e);
    }
  }
};
