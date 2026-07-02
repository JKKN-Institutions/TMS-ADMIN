import { SocialLogin } from '@capgo/capacitor-social-login';

let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const webClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured');
  }
  await SocialLogin.initialize({ google: { webClientId } });
  initialized = true;
}

/**
 * Native (system-level) Google Sign-In via @capgo/capacitor-social-login. Returns the Google
 * ID token to exchange with Supabase (signInWithIdToken). Used ONLY inside the Capacitor Android
 * app — Google blocks the web OAuth redirect flow in embedded WebViews.
 */
export async function nativeGoogleSignIn(): Promise<{ idToken: string }> {
  await ensureInitialized();
  const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  // GoogleLoginResponse is a discriminated union (online has idToken, offline only has
  // serverAuthCode); narrow with the `in` operator instead of an `as` cast.
  const idToken = 'idToken' in res.result ? res.result.idToken : null;
  if (!idToken) throw new Error('No Google ID token returned from native sign-in');
  return { idToken };
}

export async function nativeGoogleSignOut(): Promise<void> {
  try {
    await SocialLogin.logout({ provider: 'google' });
  } catch {
    /* not signed in / unsupported — ignore */
  }
}
