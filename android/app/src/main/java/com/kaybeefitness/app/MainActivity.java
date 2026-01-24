package com.kaybeefitness.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Méthode manuelle pour enregistrer le plugin
        registerPlugin(WearPlugin.class);
    }
}
