import { registerPlugin } from '@capacitor/core';

// On enregistre le plugin UNE SEULE FOIS ici
let WearConnectivity;
try {
    WearConnectivity = registerPlugin('WearConnectivity');
} catch (e) {
    console.warn("WearConnectivity non disponible");
    WearConnectivity = {
        sendDataToWatch: async () => { console.log("Simulated watch data send"); }
    };
}

export { WearConnectivity };
