import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, addDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // 1. DEMANDER LA PERMISSION PUSH DU NAVIGATEUR
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  // 2. ÉCOUTER LES NOTIFICATIONS EN TEMPS RÉEL
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(notifs);
      
      const unread = notifs.filter(n => n.status === 'unread').length;
      setUnreadCount(unread);

      // Si une nouvelle notif arrive et qu'elle est récente (< 5 sec), on lance un PUSH
      if (notifs.length > 0) {
        const latest = notifs[0];
        const now = new Date();
        const notifTime = new Date(latest.createdAt);
        const isRecent = (now - notifTime) < 5000; // 5 secondes

        if (latest.status === 'unread' && isRecent) {
           sendBrowserNotification(latest.title, latest.message);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 3. MOTEUR DE RAPPELS AUTOMATIQUES (Routines)
  useEffect(() => {
    if (!currentUser) return;

    const checkReminders = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const today = now.toLocaleDateString();
        const lastCheck = localStorage.getItem('kaybee_last_reminder_check');

        // On vérifie une fois par heure maximum pour ne pas spammer
        if (lastCheck === `${today}-${currentHour}`) return;

        // A. Rappel Hydratation (Toutes les 2h entre 10h et 20h)
        if (currentHour >= 10 && currentHour <= 20 && currentHour % 2 === 0) {
            createLocalNotification(currentUser.uid, "Hydratation 💧", "C'est l'heure de boire un verre d'eau !");
        }

        // B. Rappel Entraînement (À 18h si pas fait)
        // (Idéalement, on vérifierait si une séance est complétée dans la DB, ici c'est un rappel générique)
        if (currentHour === 18) {
            createLocalNotification(currentUser.uid, "Training Time 💪", "N'oublie pas ta séance aujourd'hui !");
        }

        // C. Rappel Calories (À 20h)
        if (currentHour === 20) {
            createLocalNotification(currentUser.uid, "Suivi Nutrition 🍎", "As-tu rentré tous tes repas aujourd'hui ?");
        }

        // D. Rappel Planification (Dimanche soir 19h)
        if (now.getDay() === 0 && currentHour === 19) {
            createLocalNotification(currentUser.uid, "Planification 📅", "Pas d'entraînement prévu ? Planifie ta semaine !");
        }

        // Sauvegarde que le check a été fait pour cette heure
        localStorage.setItem('kaybee_last_reminder_check', `${today}-${currentHour}`);
    };

    // Vérifie toutes les minutes
    const interval = setInterval(checkReminders, 60000);
    checkReminders(); // Vérifie direct au chargement

    return () => clearInterval(interval);
  }, [currentUser]);

  // Fonction pour marquer comme lu
  const markAsRead = async (notifId) => {
    try {
      const notifRef = doc(db, "notifications", notifId);
      await updateDoc(notifRef, { status: 'read' });
    } catch (e) { console.error(e); }
  };

  // Fonction pour tout marquer comme lu
  const markAllAsRead = async () => {
    // On ne fait que mettre à jour l'état local pour la réactivité immédiate, 
    // en arrière plan on devrait faire un batch update firebase
    const unread = notifications.filter(n => n.status === 'unread');
    unread.forEach(n => markAsRead(n.id));
  };

  const value = { notifications, unreadCount, markAsRead, markAllAsRead };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// --- UTILITAIRES INTERNES ---

// 1. Envoyer une notif visuelle navigateur (Windows/Mac/Android Notification)
function sendBrowserNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: '/favicon.ico', // Chemin vers ton logo si possible
        });
    }
}

// 2. Créer une notif dans la DB (Pour les rappels auto)
async function createLocalNotification(userId, title, message) {
    try {
        await addDoc(collection(db, "notifications"), {
            recipientId: userId,
            senderId: "system",
            senderName: "Coach Kaybee",
            title: title,
            message: message,
            type: "reminder",
            status: "unread",
            createdAt: new Date().toISOString()
        });
    } catch (e) { console.error("Erreur créa notif auto", e); }
}