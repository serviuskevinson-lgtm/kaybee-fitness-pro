package com.kaybeefitness.app;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import android.widget.TextView;
import android.view.View;
import android.widget.Button;

public class PermissionsRationaleActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Simple UI to explain why we need Health Connect permissions
        setContentView(R.layout.activity_permissions_rationale);
        
        Button closeButton = findViewById(R.id.btn_close_rationale);
        closeButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
    }
}
