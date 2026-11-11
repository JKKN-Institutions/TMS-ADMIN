'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { runInstallPrompt, useInstallPrompt } from '@/lib/pwa/install-prompt';

/**
 * "Install App" at the foot of the admin sidebar (where Sign Out used to be;
 * Sign out stays in the header's user menu).
 *
 * Renders nothing once the app is running installed. When the browser has not
 * offered a prompt (Safari, Firefox, or a prompt already used on this page) the
 * button stays and explains how to install from the browser's own menu, so it
 * never looks broken.
 */
export function SidebarInstallButton() {
  const prompt = useInstallPrompt();
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    setInstalled(standalone);

    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (!prompt) {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
      toast(
        isIos
          ? 'To install: tap Share, then "Add to Home Screen".'
          : 'To install: open the browser menu and choose "Install app" (or the install icon in the address bar).',
        { duration: 6000 },
      );
      return;
    }
    const outcome = await runInstallPrompt();
    if (outcome === 'accepted') toast.success('Installing JKKN TMS…');
  };

  return (
    <div className="sidebar-user">
      <button
        type="button"
        onClick={handleInstall}
        className="btn-secondary w-full text-green-700 hover:text-green-800 hover:bg-green-50"
        title="Install App"
      >
        <Download className="w-4 h-4 mr-2" aria-hidden="true" />
        <span className="sidebar-label">Install App</span>
      </button>
    </div>
  );
}
