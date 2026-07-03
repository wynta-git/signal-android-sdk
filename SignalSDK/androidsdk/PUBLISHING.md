# Signal Android SDK — Publish Guide (Maven Central)

---

## Prerequisites

Before publishing for the first time:

1. **Sonatype account** — Register at [central.sonatype.com](https://central.sonatype.com)
2. **Namespace claim** — Claim `com.signalsdk` (Sonatype verifies domain or GitHub org ownership)
3. **GPG key** — Required to sign all artifacts

### Generate a GPG key

```bash
gpg --gen-key
# Select RSA, 4096 bits, no expiry

# List your key ID
gpg --list-secret-keys --keyid-format=long
# Output: sec rsa4096/ABCD1234EFGH5678 ...
#                      ^^^^^^^^^^^^^^^^ this is your key ID

# Upload the public key to a keyserver
gpg --keyserver keyserver.ubuntu.com --send-keys ABCD1234EFGH5678
```

### Export the private key for CI

```bash
# Export ASCII-armored private key
gpg --armor --export-secret-keys ABCD1234EFGH5678 > signing-key.asc
cat signing-key.asc
# Copy the entire output — this becomes SIGNING_KEY in CI
```

---

## Environment Variables

Set these in your CI system (GitHub Actions, Bitbucket Pipelines, etc.) and optionally in `~/.gradle/gradle.properties` for local publishing.

| Variable | Description |
|---|---|
| `OSSRH_USERNAME` | Sonatype username or user token |
| `OSSRH_PASSWORD` | Sonatype password or user token |
| `SIGNING_KEY` | Full ASCII-armored GPG private key |
| `SIGNING_PASSWORD` | GPG key passphrase |

**For local publishing only** — add to `~/.gradle/gradle.properties` (never commit this file):

```properties
ossrhUsername=your_sonatype_username
ossrhPassword=your_sonatype_password
signing.key=-----BEGIN PGP PRIVATE KEY BLOCK-----\n...
signing.password=your_gpg_passphrase
```

---

## Building the Release AAR

```bash
cd androidsdk
./gradlew :signalsdk:assembleRelease
# Output: signalsdk/build/outputs/aar/signalsdk-release.aar
```

---

## Publishing to Maven Central

### Step 1 — Bump the version

Edit `gradle.properties`:

```properties
VERSION_NAME=1.0.1   # patch | 1.1.0 minor | 2.0.0 major
```

### Step 2 — Publish to staging

```bash
./gradlew publishToSonatype
```

This builds, signs, and uploads the artifacts (`.aar`, `-sources.jar`, `-javadoc.jar`, `.pom`) to the Sonatype staging repository.

### Step 3 — Close and release

```bash
./gradlew closeAndReleaseSonatypeStagingRepository
```

This closes the staging repo and triggers Maven Central promotion. Propagation to Maven Central takes **10–30 minutes**.

### Step 4 — Tag the release

```bash
git tag -a v1.0.1 -m "Release 1.0.1"
git push origin v1.0.1
```

---

## One-command publish (CI)

```bash
./gradlew publishToSonatype closeAndReleaseSonatypeStagingRepository
```

---

## Verify the publish

```bash
# Check Maven Central search (allow 15–30 min after publish)
# https://central.sonatype.com/artifact/com.signalsdk/signal-android-sdk

# Or resolve via Gradle
./gradlew dependencies --configuration releaseRuntimeClasspath \
    | grep signal-android-sdk
```

---

## Consumer integration (after publish)

```kotlin
// app/build.gradle.kts
dependencies {
    implementation("com.signalsdk:signal-android-sdk:1.0.1")
}
```

No extra repository config needed — Maven Central is the default.

---

## Local AAR distribution (no Maven Central)

For private/internal distribution without a registry:

```bash
./gradlew :signalsdk:assembleRelease
# Distribute: signalsdk/build/outputs/aar/signalsdk-release.aar
```

Consumer `build.gradle.kts`:

```kotlin
dependencies {
    implementation(files("libs/signalsdk-release.aar"))
    implementation("androidx.lifecycle:lifecycle-process:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

---

## Version strategy

| Bump | When |
|---|---|
| Patch (`1.0.x`) | Bug fixes, no API changes |
| Minor (`1.x.0`) | New features, backwards compatible |
| Major (`x.0.0`) | Breaking API changes |

---

## New Sonatype Central Portal (accounts created after Feb 2024)

If your Sonatype account was created after February 2024, you use the **Central Publisher Portal** instead of OSSRH. Update `build.gradle.kts` (root):

```kotlin
nexusPublishing {
    repositories {
        sonatype {
            // New portal endpoint
            nexusUrl.set(uri("https://central.sonatype.com/api/v1/publisher/"))
            snapshotRepositoryUrl.set(uri("https://central.sonatype.com/api/v1/publisher/"))
            username.set(providers.environmentVariable("OSSRH_USERNAME"))
            password.set(providers.environmentVariable("OSSRH_PASSWORD"))
        }
    }
}
```

Everything else (signing, gradle commands) remains the same.
