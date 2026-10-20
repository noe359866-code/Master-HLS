plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.vibeflix.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vibeflix.tv"
        minSdk = 23
        targetSdk = 36
        versionCode = 4
        versionName = "0.1.0"

        // URL del servidor Vibe Flix. En el emulador de Android es 10.0.2.2.
        buildConfigField(
            "String",
            "DEFAULT_SERVER_URL",
            "\"${project.findProperty("vibeFlix.serverUrl") ?: "http://10.0.2.2:8181"}\""
        )
    }

    signingConfigs {
        create("release") {
            // Producción: lee keystore desde propiedades o variables de entorno.
            // Si no hay keystore configurado, el CI genera uno efímero (no sube a Play Store con esa clave).
            val storeFileProp = project.findProperty("vibeFlix.releaseStoreFile") as String?
                ?: System.getenv("VIBFLIX_RELEASE_STORE_FILE")
                ?: System.getenv("ANDROID_RELEASE_KEYSTORE")
            val storePassword = project.findProperty("vibeFlix.releaseStorePassword") as String?
                ?: System.getenv("VIBFLIX_RELEASE_STORE_PASSWORD")
                ?: System.getenv("ANDROID_RELEASE_KEYSTORE_PASSWORD")
            val keyAlias = project.findProperty("vibeFlix.releaseKeyAlias") as String?
                ?: System.getenv("VIBFLIX_RELEASE_KEY_ALIAS")
                ?: "vibeflix"
            val keyPassword = project.findProperty("vibeFlix.releaseKeyPassword") as String?
                ?: System.getenv("VIBFLIX_RELEASE_KEY_PASSWORD")
                ?: storePassword

            if (storeFileProp != null && storePassword != null) {
                val f = file(storeFileProp)
                if (f.exists()) {
                    storeFile = f
                    this.storePassword = storePassword
                    this.keyAlias = keyAlias
                    this.keyPassword = keyPassword
                }
            }
            // si no existe, no se asigna storeFile -> el build de release fallbackeará en CI
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            // Usa firma release si está configurada; si no, usa debug para no romper CI efímero.
            signingConfig = signingConfigs.findByName("release")?.takeIf { it.storeFile != null }
                ?: signingConfigs.getByName("debug")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            isDebuggable = false
            enableAndroidTestCoverage = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.tv.foundation)
    implementation(libs.androidx.tv.material)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    implementation(libs.retrofit)
    implementation(libs.retrofit.moshi)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.moshi)
    implementation(libs.moshi.kotlin)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.coil.compose)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.ui)
    implementation(libs.media3.datasource)
    implementation(libs.media3.datasource.okhttp)
    implementation(libs.media3.database)

    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.junit)
}
