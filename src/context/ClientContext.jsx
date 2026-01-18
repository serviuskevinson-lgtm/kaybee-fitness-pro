import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ClientContext = createContext();

export function useClient() {
  return useContext(ClientContext);
}

export function ClientProvider({ children }) {
  const { currentUser } = useAuth();
  
  // Le client actuellement sélectionné par le coach
  const [selectedClient, setSelectedClient] = useState(null);
  
  // Est-ce qu'on est en mode "Vue Coach" (c-à-d on regarde le profil d'un client)
  // Si selectedClient est null, on est en mode "Personnel"
  const isCoachView = !!selectedClient;

  // Si on se déconnecte, on reset
  useEffect(() => {
    if (!currentUser) setSelectedClient(null);
  }, [currentUser]);

  // Fonction pour basculer (si on passe null, on revient à la vue perso)
  const selectClient = (client) => {
    setSelectedClient(client);
  };

  const value = {
    selectedClient,
    selectClient,
    isCoachView,
    // Helper pour savoir quel ID utiliser dans les requêtes Firebase
    targetUserId: selectedClient ? selectedClient.id : currentUser?.uid
  };

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}