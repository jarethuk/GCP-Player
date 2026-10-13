import java.util.Properties

// Release signing credentials live in local.properties, which is gitignored,
// and name a keystore kept outside the repo entirely so it cannot be
// committed by accident. A checkout without them still builds; the release
// APK just comes out unsigned. That keeps CI and a fresh clone working
// rather than failing on a key they are not meant to hold.
val signingProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val releaseKeystore = signingProps.getProperty("RELEASE_STORE_FILE")
    ?.let { rootProject.file(it) }
    ?.takeIf { it.exists() }

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.bencreswell.gcpplayer"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.bencreswell.gcpplayer"
        // 26 is where notification channels and the modern foreground
        // service model start, both of which media playback needs.
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Where the catalogue API lives. A build variable rather than a
        // constant so a debug build can be pointed at a local checkout without
        // touching code — note that the emulator reaches the host machine on
        // 10.0.2.2, never on localhost, which is the emulator itself.
        //
        // `-PapiBaseUrl=http://localhost:7331` overrides it for one build, the
        // counterpart of the iOS app's `-APIBaseURL` launch argument.
        val apiBaseUrl = providers.gradleProperty("apiBaseUrl").orNull ?: "https://gcp-player-api.vercel.app"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    // Room writes the schema out as JSON so a future migration has the
    // previous version to diff against. Checked in.
    ksp {
        arg("room.schemaLocation", "$projectDir/schemas")
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = signingProps.getProperty("RELEASE_STORE_PASSWORD")
                keyAlias = signingProps.getProperty("RELEASE_KEY_ALIAS")
                keyPassword = signingProps.getProperty("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Null when the credentials are absent, which leaves the release
            // APK unsigned rather than breaking the build.
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        // Media3's offline, session and library-service APIs are all marked
        // @UnstableApi and have been for years — there is no stable
        // alternative to build a downloading, car-aware player on. The
        // opt-in is a deliberate choice, taken once here, with media3
        // pinned to an exact version in the catalogue, rather than repeated
        // as an annotation on every class that touches the player.
        disable += "UnsafeOptInUsageError"
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

// Every string the app shows comes from copy/strings.yaml at the repo root —
// shared with the iOS app, and turned into res/values/copy.xml here before each
// build. See copy/README.md. The script only rewrites the file when its
// contents would change, so an untouched YAML leaves the build up to date.
val generateCopy by tasks.registering(Exec::class) {
    val repo = rootProject.projectDir.parentFile
    val script = repo.resolve("scripts/generate-copy.py")
    inputs.file(repo.resolve("copy/strings.yaml"))
    inputs.file(script)
    outputs.file(layout.projectDirectory.file("src/main/res/values/copy.xml"))
    commandLine("python3", script.path, "--platform", "android")
}
tasks.named("preBuild") { dependsOn(generateCopy) }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.splashscreen)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.navigation.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)

    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.androidx.media3.common)
    implementation(libs.androidx.media3.datasource.okhttp)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.guava)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.media3.session)
    androidTestImplementation(libs.kotlinx.coroutines.guava)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
