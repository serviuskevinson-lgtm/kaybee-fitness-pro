import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

/**
 * TYPES POSSIBLES: 
 * 'message', 'vote', 'challenge', 'invoice', 'plan_workout', 'plan_nutrition', 
 * 'friend_request', 'friend_accept', 'reminder'
 */
export const sendNotification = async (recipientId, currentUserId, senderName, title, message, type) => {
  if (!recipientId || recipientId === currentUserId) return; // Pas de notif à soi-même

  try {
    await addDoc(collection(db, "notifications"), {
      recipientId,
      senderId: currentUserId || 'system',
      senderName: senderName || "Système",
      title,
      message,
      type: type || 'info',
      status: "unread",
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Erreur envoi notification:", error);
  }
};