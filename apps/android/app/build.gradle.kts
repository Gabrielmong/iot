plugins {
    alias(libs.plugins.android.application)
}

/** Release signing only when CI provides the keystore; otherwise the release APK is left unsigned. */
val keystoreFile: String? = System.getenv("HOME_KEYSTORE_FILE")

android {
    namespace = "home.control.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "home.control.app"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("HOME_VERSION_CODE") ?: "1").toInt()
        versionName = "1.$versionCode"
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("HOME_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HOME_KEY_ALIAS")
                keyPassword = System.getenv("HOME_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.org.json)
}
