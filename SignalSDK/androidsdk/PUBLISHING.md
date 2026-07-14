# Signal Android SDK — Publish Guide (Public Distribution)

This guide is written so that anyone on the team — not just whoever set it up originally —
can follow it and successfully publish a new version.

**In plain terms**: publishing means turning this SDK's source code into a downloadable
package and uploading it to **Maven Central**, a public library store. Once published,
any Android app in the world can add one line to their project and pull in the SDK — no
login, no password, no asking anyone for access. This is the same distribution channel
MoEngage's Android SDK (`com.moengage:moe-android-sdk`) uses.

> **Live coordinates (as of this doc)**
> - **groupId**: `io.github.wynta-git`
> - **artifactId**: `signal-android-sdk`
> - **Public source repo**: `github.com/wynta-git/signal-android-sdk`
> - Both `signalsdk/build.gradle.kts` and `gradle.properties` already use these values —
>   nothing to fill in for future publishes.

---

## Why public, and what that costs

- **Credential flow**: `clientId` / `clientSecret` are supplied per-app at `initSDK()` —
  same model as MoEngage's per-app API key. They are **not** baked into the binary, so
  publishing publicly doesn't leak any one client's secret.
- **Environment routing**: the `QA_` prefix convention and the literal QA/PROD backend URLs
  (`qa-app.fozilpartners.com`, `api.wynta.com`) are hardcoded constants in `SignalSDK.kt`.
  Going public makes these two hostnames world-visible, permanently — Maven Central has no
  un-publish. Accepted tradeoff: they're reachable endpoints anyway, not secrets in
  themselves.
- **Decompilation risk, mitigated**: the release build sets `isMinifyEnabled = true`
  (`signalsdk/build.gradle.kts`), with `proguard-rules.pro` keeping only the intentional
  public API (`SignalSDK`, `config.*`, `models.*`, `ApiLogEntry`) readable. Every internal
  class is Kotlin `internal` with no keep rule, so R8 renames/inlines/strips it — decompiling
  the published `.aar` no longer hands back clean, readable internals.
- **Cross-platform parity**: this SDK mirrors the iOS and React Native SDKs' public API and
  event schema 1:1.

---

## One-time setup (already done — kept here so the next person understands it)

### 1. Pick a public identity Sonatype can verify

Maven Central requires proof you own whatever name you publish under. Two options:
- **`io.github.<name>` namespace** (what we used) — verified automatically against a
  GitHub account/org you control, no DNS needed. We used the `wynta-git` GitHub org, so our
  groupId is `io.github.wynta-git`.
- **Reverse-domain groupId** (e.g. `com.wynta`) — only possible if you control that domain's
  DNS to add a Sonatype-issued TXT record. More setup, not needed here.

### 2. Create the public GitHub repo

A public GitHub repo is required both for the `io.github.*` verification and so the
source is publicly visible per Maven Central's rules.

```bash
git subtree split --prefix=SignalSDK/androidsdk -b android-sdk-export
git push https://github.com/wynta-git/signal-android-sdk.git android-sdk-export:main
```

This copies just the `androidsdk` folder's history into its own repo — it doesn't touch
this PAM/Bitbucket repo at all.

**If you get "Invalid username or token. Password authentication is not supported"**:
GitHub no longer accepts your account password over HTTPS git operations. Either:
- Install GitHub's CLI and log in through the browser: `brew install gh && gh auth login`, or
- Generate a Personal Access Token at github.com/settings/tokens/new (check the `repo`
  scope) and use it as the password: `git push https://<username>:<token>@github.com/...`

### 3. Create a Sonatype Central Portal account and claim the namespace

1. Go to [central.sonatype.com](https://central.sonatype.com) and sign up/log in.
2. Go to **Namespaces** → add `io.github.wynta-git`.
3. Sonatype checks you control that GitHub account/org and approves it — usually within
   minutes.

**If you get "This namespace already exists"**: check your own **Namespaces** list first —
you may have already registered it in an earlier attempt (nothing to do if so). If it truly
belongs to someone else, you'll need a different GitHub org/account name instead — namespaces
are first-come and Sonatype never releases an abandoned one.

### 4. Generate a GPG signing key

Maven Central requires every artifact to be digitally signed — like a wax seal proving it
really came from you.

```bash
# Install GPG if you don't have it
brew install gnupg

# Generate a key — follow the interactive prompts (real name, email, a passphrase)
gpg --gen-key

# Find your key's fingerprint
gpg --list-secret-keys --keyid-format=long

# Publish the public half so Sonatype/consumers can verify your signature
gpg --keyserver keyserver.ubuntu.com --send-keys <FINGERPRINT>

# Export the private key to a file you'll use for signing
gpg --export-secret-keys --armor <FINGERPRINT> > signing-key.asc
```

⚠️ **`signing-key.asc` and your passphrase are secrets.** Never commit them to git. Save
them in a password manager immediately — this key is used for every future release, so
losing it is a real problem, not just an inconvenience.

Use a project identity for the key (e.g. `Wynta Software <support@wynta.com>`), not a
personal name — that way any teammate can use the same key for future releases without it
being tied to one person.

### 5. Generate a Sonatype User Token

This is **not** your Sonatype login password — it's a separate token specifically for
publishing. Go to central.sonatype.com → your account → **Generate User Token**. It gives
you a username/password pair — copy both.

### 6. Save all 4 credentials in `~/.gradle/gradle.properties`

This file lives outside this repo (in your home folder) and is read automatically by
Gradle on every run, in every terminal window — so you only set this up once, ever, per
machine.

```properties
ossrhUsername=<sonatype user token username>
ossrhPassword=<sonatype user token password>
signing.key=<contents of signing-key.asc, with each line ending in a literal \n>
signing.password=<gpg key passphrase>
```

The `signing.key` line needs the whole multi-line key file turned into one line with
literal `\n` between the original lines. This one command does it for you:

```bash
mkdir -p ~/.gradle
{
  echo "ossrhUsername=PASTE_TOKEN_USERNAME"
  echo "ossrhPassword=PASTE_TOKEN_PASSWORD"
  printf "signing.key="
  awk '{printf "%s\\n", $0}' ~/path/to/signing-key.asc
  echo
  echo "signing.password=PASTE_YOUR_PASSPHRASE"
} >> ~/.gradle/gradle.properties
chmod 600 ~/.gradle/gradle.properties
```

Then open the file in a normal text editor (`open -e ~/.gradle/gradle.properties` on Mac)
and swap in your real token values in place of the placeholders.

Both `androidsdk/build.gradle.kts` (OSSRH credentials) and `signalsdk/build.gradle.kts`
(signing key) are wired to read from this file automatically, falling back to environment
variables `OSSRH_USERNAME` / `OSSRH_PASSWORD` / `SIGNING_KEY` / `SIGNING_PASSWORD` if you'd
rather use those instead (e.g. in CI).

---

## Publishing a new version

### Step 1 — Make sure the Gradle wrapper exists

Check that `./gradlew` exists in `androidsdk/`. If you get
`zsh: no such file or directory: ./gradlew`, it means the wrapper files were never
committed — regenerate them once with:

```bash
brew install gradle   # if you don't have a global gradle
cd androidsdk
gradle wrapper --gradle-version 8.2
```

### Step 2 — Bump the version

Edit `gradle.properties`:

```properties
VERSION_NAME=1.0.1
```

### Step 3 — Build, sign, and publish

```bash
cd androidsdk
./gradlew :signalsdk:publishToSonatype closeAndReleaseSonatypeStagingRepository
```

This one command builds the `.aar` (R8-minified per `proguard-rules.pro`), signs it and
the `-sources.jar`/`-javadoc.jar`/`.pom` with your GPG key, uploads everything to
Sonatype, then releases it straight to Maven Central. Look for `BUILD SUCCESSFUL` at the
end — that means it worked.

Propagation to `search.maven.org` (the search website) typically takes 10–30 minutes;
direct resolution by Gradle/Maven from `repo1.maven.org` is near-immediate.

### Step 4 — Tag the release on the public GitHub repo

```bash
git tag 1.0.1
git push https://github.com/wynta-git/signal-android-sdk.git 1.0.1
```

### Step 5 — Verify it actually resolves

Create a throwaway Android project (or use an existing test one) with `mavenCentral()` in
`settings.gradle.kts` and add:
```kotlin
implementation("io.github.wynta-git:signal-android-sdk:1.0.1")
```
If Gradle sync succeeds, the release is live and working.

---

## Troubleshooting — real errors you may hit, and what they actually mean

| Error | What it means | Fix |
|---|---|---|
| `zsh: no such file or directory: ./gradlew` | The Gradle wrapper files were never committed | Run `gradle wrapper --gradle-version 8.2` once (see Step 1 above) |
| `404` from `central.sonatype.com/api/v1/publisher/` when running `initializeSonatypeStagingRepository` | That URL is the Central Portal *website*, not an API this plugin can talk to | `nexusUrl` must point at `https://ossrh-staging-api.central.sonatype.com/service/local/` — a compatibility bridge Sonatype runs specifically for this plugin. Already fixed in `build.gradle.kts`. |
| `401` from the staging-profile lookup | Your `OSSRH_USERNAME`/`OSSRH_PASSWORD` (or `ossrhUsername`/`ossrhPassword`) aren't actually set, or are wrong | Confirm with `echo "${OSSRH_USERNAME:+yes}"` in the same terminal, or check `~/.gradle/gradle.properties`. Make sure you used the **User Token**, not your login password. |
| `Failed to find staging profile for package group: ` (blank) | Gradle only auto-fills `project.group` from a property literally named `group` (lowercase) — this project uses `GROUP` for the Maven publication, but the root project's `group` was never set, so the plugin searched for an empty group | Already fixed — `build.gradle.kts` now explicitly sets `group = providers.gradleProperty("GROUP")...` at the root. |
| `Invalid username or token. Password authentication is not supported` (on `git push` to GitHub) | GitHub disabled plain password auth for git in 2021 | Use `gh auth login` or a Personal Access Token (see setup step 2 above) |

If the Gradle Daemon seems to be reusing an old, already-fixed error after you've edited a
build file, run `./gradlew --stop` to kill it and retry — Gradle daemons occasionally hold
onto stale in-memory state.

---

## Letting a teammate publish too

Two options:
- **CI-based (recommended)**: add a GitHub Actions workflow on the public repo that runs
  the publish command on a tag push, with the 4 credentials stored as encrypted GitHub
  Actions secrets. Nobody needs to see the raw secrets to trigger a release.
- **Direct access**: invite them as a member of the `io.github.wynta-git` namespace from
  Sonatype's namespace/team settings, and separately share the GPG signing key + passphrase
  with them (harder to revoke later if they leave — prefer CI for that reason).

---

## Consumer integration (after publish)

See [INTEGRATION.md](INTEGRATION.md) for full usage — the short version:

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}
```

```kotlin
// app/build.gradle.kts
dependencies {
    implementation("io.github.wynta-git:signal-android-sdk:1.0.1")
}
```

No credentials, no Bitbucket app password, no repo access grant — same install experience
as any public Maven Central artifact.

---

## Local AAR distribution (no Maven Central round-trip)

Still useful for a quick handoff before a real publish, or a build you don't want on
Central yet:

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

## Release checklist

- [ ] Bump `VERSION_NAME` in `gradle.properties`
- [ ] Confirm `~/.gradle/gradle.properties` has valid, current credentials
- [ ] `./gradlew :signalsdk:publishToSonatype closeAndReleaseSonatypeStagingRepository`
- [ ] Look for `BUILD SUCCESSFUL`
- [ ] Tag and push the public GitHub repo
- [ ] Verify the new version resolves from `mavenCentral()` in a clean test project
- [ ] Notify consuming teams of the new version

---

## Appendix — private-repo distribution (superseded, kept for reference)

Before this SDK went public, versions were published to a private Bitbucket Maven repo
gated behind an app password, to avoid exposing unminified source and hardcoded backend
URLs. That rationale (see git history of this file) still applies if this SDK is ever
pulled back to private-only distribution — the private-repo mechanics (two-tier repo
model, Bitbucket raw-content-as-Maven-repo, app password auth) are unchanged and can be
restored from git history if needed.
