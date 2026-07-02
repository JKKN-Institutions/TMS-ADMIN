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
  plugins: {
    // We only use Google sign-in. Disabling the other providers keeps their native
    // SDKs (and the Facebook app-id / config they'd demand at build time) out of the APK.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
