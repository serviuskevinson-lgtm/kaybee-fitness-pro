import { db } from './firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { sendNotification } from './notifications';

export const hireCoach = async (currentUser, coach, goals) => {
  if (!currentUser || !coach) return;

  const conversationId = [currentUser.uid, coach.id].sort().join('_');
  const messageText = `Bonjour, je m'appelle ${currentUser.displayName || 'un athlète'}, mes objectifs sont : ${goals}. J'aimerais rejoindre ton équipe.`;

  try {
    // 1. Envoyer le message spécial dans la conversation
    await addDoc(collection(db, "messages"), {
      conversationId,
      senderId: currentUser.uid,
      senderName: currentUser.displayName || "Athlète",
      text: messageText,
      type: "coach_hire_request", // Type spécial pour afficher les boutons
      status: "pending",
      goals: goals,
      createdAt: serverTimestamp(),
      read: false
    });

    // 2. Envoyer une notification au coach
    await sendNotification(
      coach.id,
      currentUser.uid,
      currentUser.displayName || "Athlète",
      "Nouvelle demande de coaching 🚀",
      "Un athlète souhaite rejoindre votre équipe.",
      "coach_request"
    );

    return { success: true };
  } catch (error) {
    console.error("Error hiring coach:", error);
    throw error;
  }
};

export const respondToHireRequest = async (messageId, requestId, coachId, clientId, action) => {
  const conversationId = [coachId, clientId].sort().join('_');
  const coachSnap = await getDoc(doc(db, "users", coachId));
  const coachData = coachSnap.data();
  const coachName = coachData?.full_name || coachData?.displayName || "Coach";

  try {
    if (action === 'accept') {
      // Mettre à jour le profil du client
      await updateDoc(doc(db, "users", clientId), {
        coachId: coachId,
        coachName: coachName,
        joinedCoachAt: new Date().toISOString()
      });

      // Envoyer le message de confirmation
      await addDoc(collection(db, "messages"), {
        conversationId,
        senderId: coachId,
        senderName: coachName,
        text: "Parfait, bienvenue dans mon équipe !",
        createdAt: serverTimestamp(),
        read: false
      });

      // Mettre à jour le message de requête initial
      await updateDoc(doc(db, "messages", messageId), {
        status: "accepted"
      });

    } else if (action === 'refuse') {
      await addDoc(collection(db, "messages"), {
        conversationId,
        senderId: coachId,
        senderName: coachName,
        text: "Désolé, je ne peux pas accepter de nouveaux clients pour le moment.",
        createdAt: serverTimestamp(),
        read: false
      });

      await updateDoc(doc(db, "messages", messageId), {
        status: "rejected"
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error responding to coach request:", error);
    throw error;
  }
};
