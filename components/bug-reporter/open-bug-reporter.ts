// The bug-reporter SDK exposes no way to open its form from code — the open
// state lives inside its floating button. The admin shell hides that button
// (it covered table columns, see .admin-shell rules in globals.css) and offers
// "Report a bug" in the profile menu instead, which clicks the hidden button.
// A display:none element still receives a programmatic click().

const FAB_SELECTOR = '.bug-reporter-floating-btn';

/** True when the SDK widget is mounted (platform configured and user signed in). */
export function isBugReporterAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector(FAB_SELECTOR);
}

/** Opens the bug-report form. Returns false if the widget isn't mounted. */
export function openBugReporter(): boolean {
  const btn = document.querySelector<HTMLButtonElement>(FAB_SELECTOR);
  if (!btn) return false;
  btn.click();
  return true;
}
