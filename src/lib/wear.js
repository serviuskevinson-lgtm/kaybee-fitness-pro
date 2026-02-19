import { registerPlugin } from '@capacitor/core';

// On enregistre le plugin UNE SEULE FOIS ici
let WearPlugin;
try {
    WearPlugin = registerPlugin('WearPlugin');
} catch (e) {
    console.warn("WearPlugin non disponible");
    WearPlugin = {
        sendDataToWatch: async () => { console.log("Simulated watch data send"); },
        setUserId: async () => { console.log("Simulated setUserId"); },
        pairWatch: async () => { console.log("Simulated pairWatch"); },
        writeRunToHealthConnect: async (data) => { console.log("Simulated Health Connect Write", data); },
        getRunHistory: async () => { return { history: [] }; }
    };
}

export { WearPlugin };
