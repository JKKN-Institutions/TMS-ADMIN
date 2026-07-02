# Driver Native Background GPS Tracking (Capacitor · Android) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the driver's bus keep sending GPS to the existing backend even when the phone screen is off / the app is backgrounded, by shipping the driver portal as a native Android app (Capacitor) with a native background-geolocation service.

**Architecture:** Wrap the *existing deployed* Next.js app in a Capacitor Android shell (WebView loads the live site via `server.url` — no static export, SSR/API routes keep working). Login switches to **native Google Sign-In → `supabase.auth.signInWithIdToken`** inside the WebView (Google blocks OAuth in embedded WebViews). A native **`@capacitor-community/background-geolocation`** watcher runs under an Android **foreground service**; its JS callback POSTs to the **unchanged** `/api/driver/location` using the WebView session cookie. Everything server-side (endpoint, `tms_vehicle`/`tms_driver`/`gps_location_history`, monotonic guard, Leaflet/OSM maps, Track-All, student live-track) is reused untouched.

**Tech Stack:** Next.js (existing) · Capacitor (latest stable major) · `@capacitor/android` · `@capacitor-community/background-geolocation` · `@codetrix-studio/capacitor-google-auth` · `@capacitor/app` · `@supabase/ssr` (existing) · Android Studio / Gradle · Vitest (existing, for logic units).

## Global Constraints

- **Android only.** No iOS in this plan (no `@capacitor/ios`, no Mac tooling).
- **Zero recurring cost.** Keep Leaflet + OpenStreetMap. Free MIT background-geolocation plugin. No paid GPS hardware, no Google Maps billing, no transistorsoft license.
- **No backend/schema changes.** Do NOT modify `/api/driver/location`, `tms_vehicle`, `tms_driver`, `gps_location_history`, `proxy.ts`, or `withAuth`. The native app must satisfy the *existing* cookie-auth + POST contract. (If a change ever seems required, STOP and escalate — it means the approach drifted.)
- **One codebase, two runtimes.** Every change must keep the app working as a normal website in a desktop/mobile browser (`Capacitor.isNativePlatform() === false` path) AND as the native app. Never assume native.
- **Package manager: Bun.** This repo is managed with Bun (`bun.lock` is the active lockfile; `node_modules/.bin/next.bunx` present). Use `bun add` / `bun add -d` for deps and `bunx cap ...` for the Capacitor CLI. Do NOT run `npm install` (it would desync `bun.lock`). Commit `bun.lock` (not `package-lock.json`). Any `npm install`/`npx` command shown in a task below is shorthand — translate it to `bun add`/`bunx`.
- **Capacitor major alignment.** Let Bun resolve the current Capacitor major, then install plugins compatible with THAT major. If `@codetrix-studio/capacitor-google-auth` or `@capacitor-community/background-geolocation` lack support for it, pin all `@capacitor/*` to the highest major both plugins support and report the pin. Task 1 is the compatibility spike — surface a mismatch as DONE_WITH_CONCERNS or BLOCKED rather than forcing an incompatible install.
- **FOUNDATION DECISION (2026-07-02, after compat check):** Bun resolved **Capacitor 8.4.1** and we KEEP it. Compat verified via `npm view … peerDependencies`: `@capacitor-community/background-geolocation@1.2.26` peers `>=3.0.0` (✅ Cap 8), but `@codetrix-studio/capacitor-google-auth@3.4.0-rc.4` peers `^6.0.0` (❌ Cap 6 only). **Therefore the Google-auth plugin is `@capgo/capacitor-social-login` (peers `>=8.0.0`, ✅ Cap 8), NOT codetrix.** Task 5 below is updated: use capgo's `SocialLogin` API (`initialize({ google: { webClientId } })` → `login({ provider: 'google' })` → `result.idToken`) instead of `GoogleAuth.signIn()`. Everything else in Task 5 (branch on `isNativeApp()`, `supabase.auth.signInWithIdToken`) is unchanged. Native Android *build* compat of the geolocation plugin on Cap 8 is still to be confirmed on-device at Task 2/7.
- **App identity:** `appId = in.ac.jkkn.tms.driver`, `appName = "JKKN TMS Driver"`.
- **Server URL:** the WebView loads the deployed driver app origin (the production URL used today). Referred to below as `<APP_ORIGIN>` — fill in the real HTTPS origin at Task 2; never hardcode `localhost`.
- **Commit style:** end each commit message with the repo's `Co-Authored-By: Claude ...` trailer. Commit `android/` source (manifest/gradle are hand-edited) but gitignore build outputs (`android/app/build`, `android/build`, `.gradle`, `*.keystore`). Never commit a keystore or secrets.
- **Verification reality:** native background behavior CANNOT be unit-tested. For native tasks the "test" is an on-device observation with an explicit expected outcome (DB rows / Track-All state). Logic-only helpers (platform detection, payload mapping) DO get Vitest tests first (TDD).

---

## File Structure

**New:**
- `capacitor.config.ts` — Capacitor config (appId, appName, `server.url`, plugin config).
- `native-shell/index.html` — tiny offline fallback shown if `<APP_ORIGIN>` is unreachable (Capacitor `webDir`).
- `lib/native/platform.ts` — `isNativeApp()` + `getPlatform()` thin wrappers over `@capacitor/core`.
- `lib/native/platform.test.ts` — unit test for the above.
- `lib/native/background-location.ts` — `startBackgroundWatch()` / `stopBackgroundWatch()` + `mapPluginLocationToFix()`; wraps the plugin, emits `DriverFix`-shaped fixes.
- `lib/native/background-location.test.ts` — unit test for `mapPluginLocationToFix()`.
- `lib/native/google-auth.ts` — `nativeGoogleSignIn()` returning a Google ID token; `nativeGoogleSignOut()`.
- `android/` — generated native project; hand-edited files: `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `android/app/src/main/res/values/strings.xml`, `android/variables.gradle`, `android/app/capacitor.build.gradle` (generated), release signing block.

**Modified:**
- `lib/driver/use-live-tracking.ts` — branch capture source: native watcher when `isNativeApp()`, else `watchPosition` (unchanged web path).
- `app/auth/login/page.tsx` — branch: native → `nativeGoogleSignIn()` + `signInWithIdToken`; web → existing `signInWithOAuth`.
- `app/driver/location/page.tsx` — swap the "keep screen on / web limitation" caveat for background-enabled copy when native.
- `package.json` — deps + `cap:*` scripts.
- `.gitignore` — Android build outputs + keystores.

---

## Task 1: Add Capacitor and its config

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `capacitor.config.ts`
- Create: `native-shell/index.html`

**Interfaces:**
- Produces: `capacitor.config.ts` default export (consumed by the Capacitor CLI in every later task); `<APP_ORIGIN>` placeholder to be finalized in Task 2.

- [ ] **Step 1: Install Capacitor core + CLI + Android**

Run (versions resolve to the current stable major; keep all `@capacitor/*` on the SAME major):
```bash
npm install @capacitor/core @capacitor/app
npm install -D @capacitor/cli
npm install @capacitor/android
```
Expected: packages added, no peer-dep errors. Record the installed Capacitor major (e.g. 7) — every plugin below must match it.

- [ ] **Step 2: Add the offline fallback shell (Capacitor `webDir`)**

Create `native-shell/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>JKKN TMS Driver</title>
    <style>
      body { margin:0; font-family: system-ui, sans-serif; background:#0a0a0a; color:#e5e5e5;
             display:flex; min-height:100vh; align-items:center; justify-content:center; text-align:center; padding:24px; }
      .card { max-width:320px }
      h1 { font-size:18px; margin:0 0 8px }
      p  { font-size:14px; color:#a3a3a3; margin:0 }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>JKKN TMS Driver</h1>
      <p>Connecting… If this screen stays, check your internet connection and reopen the app.</p>
    </div>
  </body>
</html>
```

- [ ] **Step 3: Create `capacitor.config.ts`**

Create `capacitor.config.ts` (leave `server.url` commented until Task 2 confirms the origin):
```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.ac.jkkn.tms.driver',
  appName: 'JKKN TMS Driver',
  webDir: 'native-shell',
  server: {
    // Set in Task 2 to the deployed driver app origin, e.g. 'https://tms.jkkn.ac.in'
    // url: '<APP_ORIGIN>',
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
```

- [ ] **Step 4: Add npm scripts**

In `package.json` `"scripts"`, add:
```json
"cap:sync": "cap sync android",
"cap:open": "cap open android",
"cap:run": "cap run android"
```

- [ ] **Step 5: Gitignore Android build outputs**

Append to `.gitignore`:
```gitignore
# Capacitor / Android build artifacts
/android/app/build/
/android/build/
/android/.gradle/
/android/app/release/
/android/app/debug/
*.keystore
*.jks
android/app/google-services.json
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json capacitor.config.ts native-shell/index.html .gitignore
git commit -m "chore(native): add Capacitor + Android config and offline shell"
```

---

## Task 2: Add the Android platform and load the app in the WebView

**Files:**
- Create: `android/**` (generated by `cap add android`)
- Modify: `capacitor.config.ts` (uncomment + set `server.url`)
- Modify: `android/app/src/main/res/values/strings.xml` (app name)

**Interfaces:**
- Consumes: `capacitor.config.ts` from Task 1.
- Produces: a runnable debug APK; the confirmed `<APP_ORIGIN>` value used by all later tasks.

- [ ] **Step 1: Generate the Android project**

```bash
npx cap add android
```
Expected: `android/` directory created; `Android platform added` message.

- [ ] **Step 2: Point the WebView at the deployed app**

In `capacitor.config.ts`, set the real origin (the URL drivers use today — confirm with the user/deploy config; do NOT invent one):
```ts
  server: {
    url: 'https://tms.jkkn.ac.in',   // <APP_ORIGIN> — replace with the real production origin
    androidScheme: 'https',
    cleartext: false,
  },
```

- [ ] **Step 3: Sync config into the native project**

```bash
npx cap sync android
```
Expected: `sync` completes; plugins listed.

- [ ] **Step 4: Build & run a debug build on a real device**

Connect an Android phone (USB debugging on), then:
```bash
npx cap run android
```
(or `npx cap open android` and Run from Android Studio.)

- [ ] **Step 5: Verify — the app loads the real driver portal**

On the device: the app opens `<APP_ORIGIN>` and shows the login page (or, if a browser session isn't shared, the login page). 
Expected: you see the real "Welcome Back / Continue with Google" screen from `app/auth/login/page.tsx`, NOT the offline shell. (Login itself is expected to FAIL here — that's Task 5. This step only proves the WebView loads the site.)

- [ ] **Step 6: Commit**

```bash
git add android capacitor.config.ts
git commit -m "feat(native): add Android platform loading the deployed driver portal"
```

---

## Task 3: Platform-detection helper

**Files:**
- Create: `lib/native/platform.ts`
- Test: `lib/native/platform.test.ts`

**Interfaces:**
- Produces: `isNativeApp(): boolean`, `getPlatform(): 'web' | 'ios' | 'android'`. Consumed by Tasks 5 and 8.

- [ ] **Step 1: Write the failing test**

Create `lib/native/platform.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => globalThis.__native ?? false,
    getPlatform: () => globalThis.__platform ?? 'web',
  },
}));

import { isNativeApp, getPlatform } from './platform';

describe('platform helpers', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__native = false;
    (globalThis as Record<string, unknown>).__platform = 'web';
  });

  it('reports web by default', () => {
    expect(isNativeApp()).toBe(false);
    expect(getPlatform()).toBe('web');
  });

  it('reports native android when Capacitor says so', () => {
    (globalThis as Record<string, unknown>).__native = true;
    (globalThis as Record<string, unknown>).__platform = 'android';
    expect(isNativeApp()).toBe(true);
    expect(getPlatform()).toBe('android');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/native/platform.test.ts`
Expected: FAIL — `Cannot find module './platform'`.

- [ ] **Step 3: Implement the helper**

Create `lib/native/platform.ts`:
```ts
import { Capacitor } from '@capacitor/core';

/** True only inside the Capacitor native shell (Android app), false in any browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'android' | 'ios' | 'web' — used to gate native-only capture/auth paths. */
export function getPlatform(): 'web' | 'ios' | 'android' {
  return Capacitor.getPlatform() as 'web' | 'ios' | 'android';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/native/platform.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/native/platform.ts lib/native/platform.test.ts
git commit -m "feat(native): add Capacitor platform-detection helper"
```

---

## Task 4: Configure Google Cloud + Supabase for native ID-token sign-in

**Files:** none (external console config) — documented here for reproducibility.

**Interfaces:**
- Produces: an **Android OAuth client ID** and the existing **Web client ID**, both trusted by Supabase. Consumed by Tasks 5 (`serverClientId` = Web client ID) and the plugin config.

- [ ] **Step 1: Get the signing certificate SHA-1**

For debug testing:
```bash
keytool -list -v -keystore "$HOME/.android/debug.keystore" -alias androiddebugkey -storepass android -keypass android
```
Record the `SHA1:` fingerprint. (Repeat later for the RELEASE keystore in Task 12 and add that SHA-1 too.)

- [ ] **Step 2: Create the Android OAuth client ID**

Google Cloud Console → the SAME project backing the existing Supabase Google login → APIs & Services → Credentials → Create Credentials → OAuth client ID → **Android**. Package name = `in.ac.jkkn.tms.driver`; SHA-1 = from Step 1.

- [ ] **Step 3: Note the Web client ID**

Copy the existing **Web application** OAuth client ID (already used by Supabase's Google provider). This is the `serverClientId` the native plugin must request the ID token for so Supabase accepts it.

- [ ] **Step 4: Trust both client IDs in Supabase**

Supabase Dashboard → Authentication → Providers → Google → add BOTH the Web and Android client IDs to **Authorized Client IDs**. Save.

- [ ] **Step 5: Verify**

No code yet — verification is that both client IDs exist and are listed in Supabase. Confirmed by inspection. (End-to-end proof happens in Task 5, Step 6.)

- [ ] **Step 6: Record the IDs**

Add the Web + Android client IDs to the team secret store / `.env` notes (NOT committed). Document in the plan's execution log which project they belong to.

---

## Task 5: Native Google Sign-In → Supabase session

**Files:**
- Create: `lib/native/google-auth.ts`
- Modify: `app/auth/login/page.tsx` (branch native vs web)
- Modify: `android/app/src/main/res/values/strings.xml` (server client id) and plugin config in `capacitor.config.ts`

**Interfaces:**
- Consumes: `isNativeApp()` (Task 3); Web client ID (Task 4).
- Produces: `nativeGoogleSignIn(): Promise<{ idToken: string; nonce?: string }>`; a logged-in WebView session (cookies) that `proxy.ts`/`withAuth` accept — consumed implicitly by every driver route.

- [ ] **Step 1: Install the native Google auth plugin (matching Capacitor major)**

```bash
npm install @codetrix-studio/capacitor-google-auth
npx cap sync android
```

- [ ] **Step 2: Configure the plugin with the Web (server) client ID**

In `capacitor.config.ts`, add:
```ts
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '<WEB_CLIENT_ID_FROM_TASK_4>', // Web OAuth client ID
      forceCodeForRefreshToken: true,
    },
  },
```
Then `npx cap sync android`.

- [ ] **Step 3: Write the native sign-in helper**

Create `lib/native/google-auth.ts`:
```ts
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

/**
 * Native (system-level) Google Sign-In. Returns the Google ID token to exchange
 * with Supabase via signInWithIdToken. Used ONLY inside the Capacitor Android app,
 * because Google blocks the web OAuth redirect flow in embedded WebViews.
 */
export async function nativeGoogleSignIn(): Promise<{ idToken: string }> {
  const user = await GoogleAuth.signIn();
  const idToken = user.authentication?.idToken;
  if (!idToken) throw new Error('No Google ID token returned from native sign-in');
  return { idToken };
}

export async function nativeGoogleSignOut(): Promise<void> {
  try {
    await GoogleAuth.signOut();
  } catch {
    /* already signed out / unsupported — ignore */
  }
}
```

- [ ] **Step 4: Branch the login page to use it when native**

In `app/auth/login/page.tsx`, add the import and replace the body of `handleGoogleLogin` to branch. New imports:
```ts
import { isNativeApp } from '@/lib/native/platform';
import { nativeGoogleSignIn } from '@/lib/native/google-auth';
```
Replace `handleGoogleLogin` with:
```ts
  async function handleGoogleLogin() {
    setIsLoading(true);
    try {
      const supabase = createClientSupabaseClient();

      if (isNativeApp()) {
        // Native app: system Google Sign-In → exchange ID token for a Supabase
        // session. @supabase/ssr's browser client writes the session to cookies,
        // so proxy.ts / withAuth authenticate the driver exactly like the web flow.
        const { idToken } = await nativeGoogleSignIn();
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) {
          console.error('Native sign-in error:', error.message);
          setIsLoading(false);
          return;
        }
        router.replace(redirect);
        return;
      }

      // Web: unchanged OAuth redirect flow.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) {
        console.error('OAuth error:', error.message);
        setIsLoading(false);
      }
    } catch (e) {
      console.error('Login error:', e);
      setIsLoading(false);
    }
  }
```

- [ ] **Step 5: Initialize GoogleAuth on native app start**

The plugin needs `GoogleAuth.initialize()` on native before `signIn()`. Add to `app/auth/login/page.tsx` inside the existing `useEffect` (guard on native so web is untouched):
```ts
  useEffect(() => {
    if (isNativeApp()) {
      import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
        GoogleAuth.initialize();
      });
    }
    const supabase = createClientSupabaseClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }: { data: { user: User | null } }) => {
        if (user) router.replace(redirect);
      });
  }, [router, redirect]);
```

- [ ] **Step 6: Sync, rebuild, and verify sign-in on device**

```bash
npx cap sync android && npx cap run android
```
On the device, tap "Continue with Google": the NATIVE Google account picker appears (not a WebView page), you pick the driver account, and you land on the driver portal (`/driver/...`).
Expected: no "disallowed_useragent" error; driver reaches an authenticated driver page. If "no_profile"/"no_tms_access" shows, that's an account-data issue (see memory `project_auth_identity_contract`), not a native bug.

- [ ] **Step 7: Commit**

```bash
git add lib/native/google-auth.ts app/auth/login/page.tsx capacitor.config.ts android
git commit -m "feat(native): native Google Sign-In via signInWithIdToken in the Android app"
```

---

## Task 6: Native background-location abstraction

**Files:**
- Create: `lib/native/background-location.ts`
- Test: `lib/native/background-location.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure wrapper).
- Produces:
  - `mapPluginLocationToFix(loc): { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; timestamp: number }`
  - `startBackgroundWatch(onFix, onError): Promise<string>` (returns a watcher id)
  - `stopBackgroundWatch(id: string): Promise<void>`
  Consumed by Task 8.

- [ ] **Step 1: Install the background-geolocation plugin (matching Capacitor major)**

```bash
npm install @capacitor-community/background-geolocation
npx cap sync android
```

- [ ] **Step 2: Write the failing test for the pure mapper**

Create `lib/native/background-location.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapPluginLocationToFix } from './background-location';

describe('mapPluginLocationToFix', () => {
  it('maps plugin fields to the DriverFix shape', () => {
    const out = mapPluginLocationToFix({
      latitude: 11.44, longitude: 77.72, accuracy: 8, speed: 4.2, bearing: 90, time: 1_700_000_000_000,
    });
    expect(out).toEqual({
      lat: 11.44, lng: 77.72, accuracy: 8, speed: 4.2, heading: 90, timestamp: 1_700_000_000_000,
    });
  });

  it('nulls missing optional fields and defaults timestamp when absent', () => {
    const out = mapPluginLocationToFix({ latitude: 1, longitude: 2 });
    expect(out.accuracy).toBeNull();
    expect(out.speed).toBeNull();
    expect(out.heading).toBeNull();
    expect(typeof out.timestamp).toBe('number');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/native/background-location.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 4: Implement the wrapper**

Create `lib/native/background-location.ts`:
```ts
import { registerPlugin } from '@capacitor/core';

/** Minimal shape of the plugin's location callback payload we consume. */
interface PluginLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  bearing?: number | null;
  time?: number | null;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage: string;
      backgroundTitle: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (location?: PluginLocation, error?: { code: string; message: string }) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export interface NativeFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

/** Pure mapping from the plugin payload to our fix shape (unit-tested). */
export function mapPluginLocationToFix(loc: PluginLocation): NativeFix {
  return {
    lat: loc.latitude,
    lng: loc.longitude,
    accuracy: loc.accuracy ?? null,
    speed: loc.speed ?? null,
    heading: loc.bearing ?? null,
    timestamp: loc.time ?? Date.now(),
  };
}

/**
 * Start a background-capable GPS watch. Runs under an Android foreground service
 * (persistent notification), so the callback keeps firing with the screen off /
 * app backgrounded. Returns a watcher id to pass to stopBackgroundWatch.
 */
export async function startBackgroundWatch(
  onFix: (fix: NativeFix) => void,
  onError: (err: { code: string; message: string }) => void
): Promise<string> {
  return BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'JKKN TMS Driver — On Duty',
      backgroundMessage: 'Sharing your location with the transport office.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
    },
    (location, error) => {
      if (error) return onError(error);
      if (location) onFix(mapPluginLocationToFix(location));
    }
  );
}

export async function stopBackgroundWatch(id: string): Promise<void> {
  await BackgroundGeolocation.removeWatcher({ id });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/native/background-location.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/native/background-location.ts lib/native/background-location.test.ts package.json package-lock.json android
git commit -m "feat(native): background-geolocation wrapper + fix mapper"
```

---

## Task 7: Android manifest — background location permissions + foreground service

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: the plugin from Task 6.
- Produces: an app that can request "Allow all the time" location and run the location foreground service.

- [ ] **Step 1: Add permissions and the foreground-service type**

In `android/app/src/main/AndroidManifest.xml`, inside `<manifest>` (above `<application>`) add:
```xml
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
```

- [ ] **Step 2: Declare the plugin's foreground service with `location` type**

Inside `<application>` add (per the plugin's README for the current Android target):
```xml
        <service
            android:name="com.equimaps.capacitorblgeolocation.BackgroundGeolocationService"
            android:foregroundServiceType="location"
            android:enabled="true"
            android:exported="false" />
```
(Confirm the exact service class name against the installed plugin version's README during the spike; adjust if renamed.)

- [ ] **Step 3: Sync and rebuild**

```bash
npx cap sync android && npx cap run android
```

- [ ] **Step 4: Verify the permission prompt path**

On the device, trigger location (temporarily call the watcher, or wait for Task 8). Android must offer **"Allow all the time"** (background) — on Android 11+ this is a two-step grant (While-using → then Allow all the time in settings).
Expected: the OS location permission dialog appears and background ("all the time") can be granted.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat(native): background-location permissions + foreground service in manifest"
```

---

## Task 8: Route driver capture through the native watcher

**Files:**
- Modify: `lib/driver/use-live-tracking.ts`
- Modify: `app/driver/location/page.tsx`

**Interfaces:**
- Consumes: `isNativeApp()` (Task 3); `startBackgroundWatch`/`stopBackgroundWatch`/`NativeFix` (Task 6).
- Produces: on native, GPS fixes flow from the plugin into the SAME `sendPing()` → `/api/driver/location` pipeline; on web, behavior is unchanged.

- [ ] **Step 1: Import the native capture in the hook**

In `lib/driver/use-live-tracking.ts`, add:
```ts
import { isNativeApp } from '@/lib/native/platform';
import { startBackgroundWatch, stopBackgroundWatch, type NativeFix } from '@/lib/native/background-location';
```
And a ref to hold the native watcher id (near the other refs):
```ts
  const nativeWatchIdRef = useRef<string | null>(null);
```

- [ ] **Step 2: Feed native fixes into the existing pipeline**

Still in `start()`, AFTER `abortRef.current = new AbortController();` and BEFORE the `getCurrentPosition`/`watchPosition` block, branch. Wrap the existing web capture block in an `else`:
```ts
    if (isNativeApp()) {
      // Native background watcher: keeps firing with screen off / app backgrounded.
      const applyNativeFix = (nf: NativeFix) => {
        latestFixRef.current = {
          coords: {
            latitude: nf.lat, longitude: nf.lng,
            accuracy: nf.accuracy ?? 0, speed: nf.speed, heading: nf.heading,
            altitude: null, altitudeAccuracy: null,
          },
          timestamp: nf.timestamp,
        } as GeolocationPosition;
        dispatch({ type: 'fix', atMs: Date.now() });
        setFix({ lat: nf.lat, lng: nf.lng, accuracy: nf.accuracy, speed: nf.speed });
        void sendPing();
      };
      nativeWatchIdRef.current = await startBackgroundWatch(
        applyNativeFix,
        (err) => dispatch({ type: 'geoError', code: err.code === 'NOT_AUTHORIZED' ? 1 : 2 })
      );
      tickTimerRef.current = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), TICK_INTERVAL_MS);
      startedRef.current = true;
    } else {
      // ── existing web capture (unchanged) ──
      const onPos = (pos: GeolocationPosition) => { /* ...unchanged... */ };
      const onErr = (err: GeolocationPositionError) => dispatch({ type: 'geoError', code: err.code });
      const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 };
      navigator.geolocation.getCurrentPosition((pos) => { onPos(pos); void sendPing(); }, onErr, opts);
      watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
      sendTimerRef.current = setInterval(() => void sendPing(), SEND_INTERVAL_MS);
      tickTimerRef.current = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), TICK_INTERVAL_MS);
      startedRef.current = true;
    }
```
(Keep the existing `onPos`/`onErr` bodies verbatim inside the `else`.)

- [ ] **Step 3: Tear down the native watcher too**

In `teardown()`, alongside the `clearWatch` block, add:
```ts
    if (nativeWatchIdRef.current) {
      try { await stopBackgroundWatch(nativeWatchIdRef.current); } catch { /* ignore */ }
      nativeWatchIdRef.current = null;
    }
```

- [ ] **Step 4: Update the driver page copy for native**

In `app/driver/location/page.tsx`, replace the static caveat paragraph (`Keep this page open with the screen on…`) with a native-aware version. Add `import { isNativeApp } from '@/lib/native/platform';` and render:
```tsx
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isNativeApp()
              ? 'Location keeps sharing in the background while you are On Duty — you can lock the phone or switch apps. A notification shows while sharing.'
              : 'Keep this page open with the screen on while driving. Sharing pauses if you switch apps or the screen locks — that’s a limitation of web browsers.'}
          </p>
```

- [ ] **Step 5: Verify the existing web path still builds/tests**

Run: `npx tsc --noEmit -p tsconfig.json` (filter to changed files if noisy — see memory `env_eslint_broken`).
Then run the tracking unit tests: `npx vitest run lib/driver`.
Expected: type-check clean for changed files; existing tracking tests still PASS.

- [ ] **Step 6: Sync + rebuild**

```bash
npx cap sync android && npx cap run android
```

- [ ] **Step 7: Commit**

```bash
git add lib/driver/use-live-tracking.ts app/driver/location/page.tsx
git commit -m "feat(native): drive live tracking via native background watcher on Android"
```

---

## Task 9: Device acceptance test — tracking survives lock/background

**Files:** none (verification).

**Interfaces:** Consumes the full stack from Tasks 1–8.

- [ ] **Step 1: Go On Duty and grant "Allow all the time"**

In the app, open Live Location → select the route → "Go On Duty". Grant fine location AND background ("Allow all the time"). Confirm the persistent "JKKN TMS Driver — On Duty" notification appears.

- [ ] **Step 2: Baseline — confirm fixes arrive (foreground)**

Query the DB (Supabase MCP `execute_sql`) for the route's vehicle:
```sql
select last_gps_update, last_capture_at, current_latitude, current_longitude
from tms_vehicle where id = '<VEHICLE_ID>';
select count(*), max(timestamp) from gps_location_history
where vehicle_id = '<VEHICLE_ID>' and timestamp > now() - interval '5 minutes';
```
Expected: `last_gps_update` within seconds of now; history count rising.

- [ ] **Step 3: The real test — lock the phone for 10 minutes while moving**

Lock the screen (or switch to another app) and physically move (or drive). Wait 10 minutes.

- [ ] **Step 4: Verify tracking continued through the lock**

Re-run the Step 2 queries.
Expected: `gps_location_history` has NEW rows spread across the 10-minute locked window (not a single burst then silence), coordinates advanced, and `last_gps_update` is fresh. On the admin **Track All** page the driver shows **online/green** the whole time (NOT Paused/Offline). **This is the acceptance criterion for the whole plan.**

- [ ] **Step 5: Verify Go Off Duty stops cleanly**

Tap "Go Off Duty". Notification disappears; `tms_driver.location_sharing_enabled` flips to false; no further history rows.
Expected: clean stop, matching the web behavior in `app/api/driver/location/route.ts` DELETE.

- [ ] **Step 6: Record the result in the execution log**

Note pass/fail + any OEM-specific behavior (see Task 10). If FAIL (fixes stop when locked), STOP and debug the foreground service before proceeding — do not continue to hardening on a broken core.

---

## Task 10: Battery-optimization & OEM-killer hardening

**Files:**
- Modify: `app/driver/location/page.tsx` (guidance UI when native)
- Possibly add: a tiny `@capacitor/app`-based check or a settings deep-link helper.

**Interfaces:** Consumes Task 8/9.

- [ ] **Step 1: Add an in-app "keep tracking reliable" note for native**

In `app/driver/location/page.tsx`, when `isNativeApp()` and `onDuty`, render a one-time info banner advising the driver to disable battery optimization for the app (critical on Xiaomi/Oppo/Vivo/Realme, common in the fleet):
```tsx
          {isNativeApp() && onDuty && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/50">
              For uninterrupted tracking, allow this app to run in the background:
              Settings → Apps → JKKN TMS Driver → Battery → Unrestricted.
            </div>
          )}
```

- [ ] **Step 2: Verify the guidance shows on device and the setting resolves the OEM kill**

On an aggressive-OEM device: without the exemption, background may die after screen-off; with "Unrestricted" set, Task 9's 10-minute test passes.
Expected: documented before/after on at least one OEM device.

- [ ] **Step 3: Commit**

```bash
git add app/driver/location/page.tsx
git commit -m "feat(native): battery-optimization guidance for reliable background tracking"
```

---

## Task 11: Restart/reboot resilience & notification polish

**Files:**
- Modify: `app/driver/location/page.tsx` and/or `lib/driver/use-live-tracking.ts` (resume-on-return)

**Interfaces:** Consumes Task 8.

- [ ] **Step 1: Resume watcher state when the app returns to foreground**

Confirm the existing `visibilitychange` effect in `use-live-tracking.ts` re-syncs the controller on native return. If the native watcher id was lost (process killed), detect `onDuty && !nativeWatchIdRef.current` on resume and restart the watch. Add inside the visibility effect (native branch):
```ts
      if (visible && isNativeApp() && isSharing(state.status) && !nativeWatchIdRef.current) {
        void start();
      }
```

- [ ] **Step 2: Verify recovery**

Force-stop the app from Android recents while On Duty, reopen it.
Expected: the driver is prompted or auto-resumes On Duty; tracking continues. Document actual behavior; if auto-resume is out of scope, ensure the UI clearly shows "not sharing" so the driver knows to tap On Duty again (honesty over silent failure).

- [ ] **Step 3: Commit**

```bash
git add lib/driver/use-live-tracking.ts app/driver/location/page.tsx
git commit -m "feat(native): resume background tracking after app return/restart"
```

---

## Task 12: Release signing & versioning

**Files:**
- Modify: `android/app/build.gradle` (versionCode/versionName + signingConfigs)
- Create (NOT committed): a release keystore.

**Interfaces:** Consumes Tasks 1–11.

- [ ] **Step 1: Generate a release keystore (store securely, never commit)**

```bash
keytool -genkey -v -keystore jkkn-tms-driver-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jkkn-tms-driver
```
Store it + passwords in the team secret vault. Add its SHA-1 (`keytool -list -v ...`) to the Android OAuth client (Task 4) so native sign-in works in release builds.

- [ ] **Step 2: Wire signing via Gradle properties (no secrets in git)**

In `android/app/build.gradle`, add a `signingConfigs.release` reading from `~/.gradle/gradle.properties` (or env), set `versionCode`/`versionName`, and apply to `buildTypes.release`. Keep values out of source control.

- [ ] **Step 3: Build a signed release bundle**

```bash
cd android && ./gradlew bundleRelease
```
Expected: `android/app/build/outputs/bundle/release/app-release.aab` produced and signed.

- [ ] **Step 4: Smoke test the release build**

Install the release APK/AAB (via bundletool or an internal-testing upload) and repeat Task 5 (sign-in) + a short Task 9 (background) check on release signing.
Expected: sign-in works (release SHA-1 registered) and background tracking works.

- [ ] **Step 5: Commit the gradle changes (no secrets)**

```bash
git add android/app/build.gradle android/variables.gradle
git commit -m "chore(native): release signing config + app versioning"
```

---

## Task 13: Play Store background-location compliance

**Files:** none (Play Console + a hosted privacy policy).

**Interfaces:** Consumes Task 12's AAB.

- [ ] **Step 1: Publish a privacy policy URL** covering GPS collection, purpose (fleet tracking for the transport office), retention, and that it runs in the background. Host on the JKKN site.

- [ ] **Step 2: Complete the Play Console Data safety form** — declare location collection + background use.

- [ ] **Step 3: Complete the background-location permission declaration** — record a short screen video showing the On-Duty flow + the persistent notification, justify why "all the time" is required (continuous route tracking while driving).

- [ ] **Step 4: Verify** the app passes pre-launch report and the declaration is accepted (may take review time).

---

## Task 14: Internal testing rollout

**Files:** none (Play Console) — or sideload distribution if preferred first.

**Interfaces:** Consumes Task 12/13.

- [ ] **Step 1: Upload the signed AAB to an Internal Testing track**; add driver test accounts.

- [ ] **Step 2: Drivers install from the test link**; run the Task 9 acceptance test in the field for a full trip.

- [ ] **Step 3: Verify Track-All stays live for the whole trip** across a few real drivers/OEMs; collect issues.

- [ ] **Step 4: Promote to production** (or wider sideload) once field tests pass. Update memory `project_live_tracking_foreground_limit` to note the native app is live.

---

## Self-Review

**Spec coverage:** Goal (background tracking with screen off) → Tasks 6–9 (native watcher + foreground service + acceptance). Android-only constraint → no iOS tasks. Zero-cost → free plugin + OSM retained (no Task adds paid deps). No-backend-change → capture/auth reuse the existing `/api/driver/location` + cookie session (Tasks 5, 8). Play Store (user has account) → Tasks 12–14. WebView-OAuth risk → Tasks 4–5. OEM battery killers → Task 10. Recovery → Task 11.

**Placeholder scan:** `<APP_ORIGIN>`, `<WEB_CLIENT_ID_FROM_TASK_4>`, `<VEHICLE_ID>` are intentional environment values, each with an explicit task/step that resolves them — not vague TODOs. The plugin service class name in Task 7 is flagged to confirm against the installed version (native APIs shift between majors). Everything else contains concrete code/commands.

**Type consistency:** `NativeFix` (Task 6) is consumed with the same field names in Task 8 (`nf.lat/lng/accuracy/speed/heading/timestamp`). `isNativeApp()` (Task 3) is used identically in Tasks 5 and 8. `startBackgroundWatch`/`stopBackgroundWatch` signatures match their Task 8 usage.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-driver-native-background-tracking.md`. Two execution options:
1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with review checkpoints.
