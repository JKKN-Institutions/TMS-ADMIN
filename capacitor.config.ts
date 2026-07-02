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
