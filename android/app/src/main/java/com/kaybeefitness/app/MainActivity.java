package com.kaybeefitness.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registration of the plugin
        registerPlugin(WearPlugin.class);

        super.onCreate(savedInstanceState);
    }
}
