# JKKN TMS Driver — Android build & release runbook

Operational guide for building, testing, and shipping the native driver app on branch
`feature/driver-native-android-tracking` (PR #4). The full rationale/design is in
`docs/superpowers/plans/2026-07-02-driver-native-background-tracking.md`; this file is the
"just build it" checklist plus the caveats discovered during implementation.

## What's already in the repo (done)
- Capacitor 8 project (`android/`), Google-only social-login, offline shell.
- `lib/native/`: platform detection, background-location wrapper, native Google auth (unit-tested).
- Native GPS capture wired into `lib/driver/use-live-tracking.ts` (web path unchanged).
- Manifest `ACCESS_BACKGROUND_LOCATION`; release signing config; battery/OEM guidance;
  restart-on-foreground resilience; privacy-policy draft (`docs/legal/`).

## Prerequisites (install once)
- **JDK 17** and **Android Studio** (includes the Android SDK + platform-tools). Confirm
  `java -version` works and `ANDROID_HOME` is set. *(The environment used to write the code had
  neither — that's why the steps below must be run on your machine.)*
- An **Android phone** with Developer Options → USB debugging on.
- Package manager is **Bun** (`bun` / `bunx`). Do NOT use npm here.

## 1. Credentials (no device needed — can do first)
1. Get the debug signing SHA-1:
   ```bash
   keytool -list -v -keystore "$HOME/.android/debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```
2. Google Cloud Console (same project as the existing Supabase Google login) → Credentials →
   Create OAuth client ID → **Android**: package `in.ac.jkkn.tms.driver`, SHA-1 from step 1.
3. Copy the existing **Web** OAuth client ID (used by Supabase).
4. Supabase → Authentication → Providers → Google → add **both** the Android and Web client IDs
   to **Authorized Client IDs**. Save.
5. Set the env var the app reads for native sign-in:
   ```
   NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the Web OAuth client ID>
   ```
   (Add to `.env` and to the deployment's env so the deployed app the WebView loads has it.)

## 2. Point the app at your deployment & build
1. In `capacitor.config.ts`, uncomment `server.url` and set it to the **deployed** driver app
   origin (the HTTPS URL drivers use — NOT localhost):
   ```ts
   server: { url: 'https://<your-deployed-origin>', androidScheme: 'https', cleartext: false },
   ```
2. Sync + run on the connected phone:
   ```bash
   bunx cap sync android
   bunx cap run android      # or: bunx cap open android  → Run in Android Studio
   ```
3. The app should load your real login page. Tap **Continue with Google** → the **native**
   account picker appears (not a WebView page) → you land on the driver portal.

## 3. Acceptance test (the pass/fail gate)
1. Live Location → select route → **Go On Duty** → grant **"Allow all the time"** location.
2. Confirm the persistent "JKKN TMS Driver — On Duty" notification.
3. **Lock the phone / switch apps and move (or drive) for ~10 minutes.**
4. Verify tracking continued (Supabase SQL):
   ```sql
   select last_gps_update, current_latitude, current_longitude from tms_vehicle where id = '<vehicle id>';
   select count(*), max(timestamp) from gps_location_history
     where vehicle_id = '<vehicle id>' and timestamp > now() - interval '11 minutes';
   ```
   Expected: history rows spread across the locked window (not one burst then silence);
   `last_gps_update` fresh; admin **Track All** shows the driver **online** the whole time.

## 4. Release (Play Store)
1. Create a release keystore (store securely, never commit):
   ```bash
   keytool -genkey -v -keystore jkkn-tms-driver-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jkkn-tms-driver
   ```
   Add its SHA-1 to the Android OAuth client (step 1.2) so native sign-in works in release builds.
2. Create `android/keystore.properties` (gitignored):
   ```
   storeFile=C:/absolute/path/to/jkkn-tms-driver-release.jks
   storePassword=...
   keyAlias=jkkn-tms-driver
   keyPassword=...
   ```
3. Build the signed bundle:
   ```bash
   cd android && ./gradlew bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
   ```
4. Play Console: host the privacy policy (`docs/legal/privacy-policy-driver-app.md`, fill the
   placeholders + publish to a public URL), complete the **Data safety** form and the
   **background-location declaration** (justification text is in that same file), then upload the
   AAB to an **Internal testing** track and roll out.

## Caveats to verify at first Gradle build
These were set up correctly but could NOT be build-verified without the Android SDK:
- **capgo provider flags:** we only use Google. The flags are asserted manually in
  `android/gradle.properties` because the capgo cap-sync hook did not run under Bun. If a
  `bunx cap sync` ever overwrites them and the build pulls the **Facebook SDK**, the app can crash
  at launch (Facebook's auto-init needs an app id). Fix: re-assert
  `socialLogin.facebook.include=false` (+ apple/twitter) or run `cap sync` once under npm.
- **background-geolocation native build:** `@capacitor-community/background-geolocation@1.2.26`
  peer-depends `@capacitor/core >=3` (accepts Cap 8), but its native Android build against Cap 8's
  Gradle is unverified here. If Gradle fails on this plugin, report the error.
- **OEM battery killers:** on Xiaomi/Oppo/Vivo/Realme, set the app to **Battery → Unrestricted**
  (the app shows this hint while On Duty) or background tracking dies after screen-off.

## Troubleshooting
- Google sign-in shows "disallowed_useragent": you're on the web OAuth path, not native — confirm
  `isNativeApp()` is true (running the built app, not a browser) and native sign-in is wired.
- "No JKKN profile found" after sign-in: an account-data issue, not a native bug — see the
  auth-identity notes (profiles.id must equal auth.users.id).
- Bus goes offline while locked despite all the above: check `gps_location_history` gaps and the
  OEM battery setting; confirm the foreground-service notification stays up.
