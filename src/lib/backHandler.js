import { App as CapacitorApp } from '@capacitor/app';

const callbacks = [];

// Listener global unique activé dès le chargement de l'app
CapacitorApp.addListener('backButton', (data) => {
  if (callbacks.length > 0) {
    // Priorité aux callbacks enregistrés (ex: fermer une modale)
    const lastCallback = callbacks[callbacks.length - 1];
    lastCallback(data);
  } else {
    // Comportement par défaut pour tout l'app
    const path = window.location.pathname;

    // Si on est sur une page racine, on quitte l'app
    if (path === '/' || path === '/dashboard' || path === '/login') {
      CapacitorApp.exitApp();
    } else {
      // Sinon on revient en arrière dans l'historique du navigateur
      window.history.back();
    }
  }
});

/**
 * Enregistre un callback pour le bouton back.
 * @param {Function} callback - La fonction à exécuter lors de l'appui sur Back
 * @returns {Function} - Fonction pour désenregistrer le callback (à appeler dans le cleanup du useEffect)
 */
export const registerBackHandler = (callback) => {
  callbacks.push(callback);
  return () => {
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  };
};
