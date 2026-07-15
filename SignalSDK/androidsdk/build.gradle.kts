plugins {
    id("com.android.library") version "8.2.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    id("io.github.gradle-nexus.publish-plugin") version "1.3.0"
}

// The Nexus publish plugin looks up the staging profile via project.group, which Gradle
// only auto-populates from a property literally named "group" — this project uses "GROUP"
// (for the Maven publication's groupId in signalsdk/build.gradle.kts), so project.group was
// left blank, causing "Failed to find staging profile for package group: " (empty).
group = providers.gradleProperty("GROUP").getOrElse("io.github.wynta-git")

// ── Maven Central staging + release ──────────────────────────────────────────
// Credentials come from env vars (CI) or ~/.gradle/gradle.properties (local).
//
// Central Portal accounts (created after Feb 2024, incl. this one) don't expose the
// old Nexus staging-profile API that this plugin needs — central.sonatype.com is a
// web app, not that API. Sonatype instead runs a compatibility bridge at
// ossrh-staging-api.central.sonatype.com specifically so this plugin keeps working:
// https://central.sonatype.org/publish/publish-portal-ossrh-staging-api/
nexusPublishing {
    repositories {
        sonatype {
            nexusUrl.set(uri("https://ossrh-staging-api.central.sonatype.com/service/local/"))
            snapshotRepositoryUrl.set(uri("https://central.sonatype.com/repository/maven-snapshots/"))
            username.set(providers.environmentVariable("OSSRH_USERNAME").orElse(providers.gradleProperty("ossrhUsername")))
            password.set(providers.environmentVariable("OSSRH_PASSWORD").orElse(providers.gradleProperty("ossrhPassword")))
        }
    }
}
