import React, { useState, useEffect } from 'react';
import { useClient } from '@/context/ClientContext';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, User } from 'lucide-react';

export default function ClientSelector() {
  const { currentUser } = useAuth();
  const { selectedClient, selectClient } = useClient();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Charger la liste des clients du coach
  useEffect(() => {
    const fetchClients = async () => {
      if (!currentUser) return;
      try {
        // On cherche les users qui ont 'coachId' == mon ID
        // NOTE: Il faudra ajouter ce champ 'coachId' aux clients quand ils s'abonnent
        const q = query(collection(db, "users"), where("coachId", "==", currentUser.uid));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClients(list);
      } catch (e) {
        console.error("Erreur loading clients", e);
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, [currentUser]);

  return (
    <div className="w-full md:w-64">
      <Select 
        value={selectedClient ? selectedClient.id : "me"} 
        onValueChange={(val) => {
            if (val === "me") selectClient(null);
            else selectClient(clients.find(c => c.id === val));
        }}
      >
        <SelectTrigger className={`border-none font-bold ${selectedClient ? 'bg-[#00f5d4] text-black' : 'bg-[#7b2cbf] text-white'}`}>
          <div className="flex items-center gap-2 truncate">
            {selectedClient ? <Users size={16}/> : <User size={16}/>}
            <SelectValue placeholder="Mon Profil" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a20] border-gray-800 text-white">
          <SelectItem value="me" className="font-bold text-[#7b2cbf]">Mon Tableau de Bord</SelectItem>
          {clients.length > 0 && <div className="h-[1px] bg-gray-700 my-2 opacity-50"/>}
          {clients.map(client => (
            <SelectItem key={client.id} value={client.id} className="focus:bg-[#00f5d4] focus:text-black">
              {client.full_name || client.email}
            </SelectItem>
          ))}
          {clients.length === 0 && !loading && (
             <div className="p-2 text-xs text-gray-500 italic text-center">Aucun client actif</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}