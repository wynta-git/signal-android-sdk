plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("maven-publish")
    id("signing")
}

android {
    namespace = "com.signalsdk"
    compileSdk = 34

    defaultConfig {
        minSdk = 21
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
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
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
            withJavadocJar()
        }
    }
}

dependencies {
    // Lifecycle — ProcessLifecycleOwner for foreground/background detection
    implementation("androidx.lifecycle:lifecycle-process:2.7.0")
    implementation("androidx.lifecycle:lifecycle-common:2.7.0")

    // Coroutines — async HTTP calls and internal scope
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}

// ── Maven Central publishing ──────────────────────────────────────────────────

val sdkVersion: String = project.findProperty("VERSION_NAME") as String? ?: "1.0.0"
val sdkGroup:   String = project.findProperty("GROUP")        as String? ?: "com.signalsdk"

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                groupId    = sdkGroup
                artifactId = "signal-android-sdk"
                version    = sdkVersion

                from(components["release"])

                pom {
                    name.set("Signal Android SDK")
                    description.set("Signal Android SDK for player analytics and marketing automation.")
                    url.set("https://github.com/signal-sdk/android-sdk")

                    licenses {
                        license {
                            name.set("MIT License")
                            url.set("https://opensource.org/licenses/MIT")
                        }
                    }

                    developers {
                        developer {
                            id.set("signal")
                            name.set("Signal SDK")
                            email.set("support@signal-sdk.com")
                        }
                    }

                    scm {
                        connection.set("scm:git:github.com/signal-sdk/android-sdk.git")
                        developerConnection.set("scm:git:ssh://github.com/signal-sdk/android-sdk.git")
                        url.set("https://github.com/signal-sdk/android-sdk/tree/main")
                    }
                }
            }
        }
    }

    // Signing is required by Maven Central.
    // CI: set SIGNING_KEY (ASCII-armored GPG key) + SIGNING_PASSWORD env vars.
    // Local: set signing.key / signing.password in ~/.gradle/gradle.properties
    signing {
        val signingKey      = providers.environmentVariable("SIGNING_KEY").orNull
        val signingPassword = providers.environmentVariable("SIGNING_PASSWORD").orNull
        if (signingKey != null && signingPassword != null) {
            useInMemoryPgpKeys(signingKey, signingPassword)
        }
        sign(publishing.publications["release"])
    }
}
