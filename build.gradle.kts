plugins {
    id("com.android.library") version "8.1.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    id("io.github.gradle-nexus.publish-plugin") version "1.3.0"
}

// ── Maven Central staging + release ──────────────────────────────────────────
// Credentials come from env vars (CI) or ~/.gradle/gradle.properties (local).
//
// New accounts (created after Feb 2024) use the Central Publisher Portal:
//   nexusUrl = "https://central.sonatype.com/api/v1/publisher/"
//
// Legacy OSSRH accounts (created before Feb 2024) use:
//   nexusUrl = "https://s01.oss.sonatype.org/service/local/"
nexusPublishing {
    repositories {
        sonatype {
            nexusUrl.set(uri("https://s01.oss.sonatype.org/service/local/"))
            snapshotRepositoryUrl.set(uri("https://s01.oss.sonatype.org/content/repositories/snapshots/"))
            username.set(providers.environmentVariable("OSSRH_USERNAME"))
            password.set(providers.environmentVariable("OSSRH_PASSWORD"))
        }
    }
}
