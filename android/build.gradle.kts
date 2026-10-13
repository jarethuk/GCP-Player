// Plugins are declared here with `apply false` so the version is stated
// once and the modules below just name them.
//
// Note there is no `org.jetbrains.kotlin.android`: since AGP 9 the Android
// plugin compiles Kotlin itself, and applying the Kotlin plugin as well
// fails the build outright. Most setup guides you'll find still list both.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.compose.compiler) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
}
