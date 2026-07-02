import { Capacitor } from '@capacitor/core';

/** True only inside the Capacitor native shell (Android app), false in any browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'android' | 'ios' | 'web' — used to gate native-only capture/auth paths. */
export function getPlatform(): 'web' | 'ios' | 'android' {
  return Capacitor.getPlatform() as 'web' | 'ios' | 'android';
}
