package com.kaybeefitness.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Enregistrement des deux noms pour garantir la compatibilité
        registerPlugin(WearPlugin.class);
        registerPlugin(WearConnectivity.class);

        super.onCreate(savedInstanceState);
    }
}
