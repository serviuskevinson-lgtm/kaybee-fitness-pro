plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services") apply false
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.kaybeefitness.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kaybeefitness.app"
        minSdk = 30
        targetSdk = 35
        versionCode = 4
        versionName = "4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":shared"))
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation(platform("androidx.compose:compose-bom:2024.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")
    
    val wearComposeVersion = "1.4.0"
    implementation("androidx.wear.compose:compose-material:$wearComposeVersion")
    implementation("androidx.wear.compose:compose-foundation:$wearComposeVersion")
    implementation("androidx.wear.compose:compose-navigation:$wearComposeVersion")
    
    implementation("androidx.wear:wear-tooling-preview:1.0.0")
    implementation("androidx.activity:activity-compose:1.8.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.wear.tiles:tiles:1.4.0")
    implementation("androidx.wear.tiles:tiles-material:1.4.0")
    implementation("androidx.wear.tiles:tiles-tooling-preview:1.4.0")
    
    implementation("com.google.android.horologist:horologist-compose-tools:0.6.17")
    implementation("com.google.android.horologist:horologist-tiles:0.6.17")

    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
    
    implementation("androidx.health:health-services-client:1.0.0-rc01")
    implementation("com.google.guava:guava:31.0.1-android")
    implementation("androidx.concurrent:concurrent-futures-ktx:1.2.0")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.7.2"))
    implementation("com.google.firebase:firebase-database-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
    implementation("com.google.firebase:firebase-auth-ktx")
    
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.09.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    debugImplementation("androidx.wear.tiles:tiles-tooling:1.4.0")
    
    implementation("com.google.code.gson:gson:2.10.1")
}
