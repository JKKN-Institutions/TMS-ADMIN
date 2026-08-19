'use client';

import { useEffect, useState } from 'react';
import { Bus, Check, Loader2, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/providers/auth-provider';
import RemovalBillNotice from '@/components/boarding/removal-bill-notice';

/**
 * One-time willingness toggle for a bus_required staffer.
 *
 * Accepting auto-assigns their OWN route — the server resolves it from the staff
 * master, this page never names a route. Declining stores NOTHING: an active
 * tms_staff_route_assignment row IS "willing", so no row means "not willing (or
 * undecided)", and the toggle simply returns on the next login. That also means the
 * declined view must live HERE rather than in the layout, which still computes
 * 'choose' for a decliner.
 *
 * The layout centres this page in the viewport, so it renders a plain card and owns
 * no page-level spacing of its own.
 */

/**
 * One of the two fee outcomes, shown lit when it is the one Confirm will commit to.
 *
 * Confirm reads "Confirm" in both states, so without this the screen never says what
 * pressing it will do — an unlit "Not willing? / Transport fees apply." is the only
 * thing standing between a staffer and a fee they didn't mean to accept.
 *
 * Paying the fee is a legitimate choice, not a failure, so the fees outcome lights up
 * in neutral slate rather than a warning colour. Tinting it red or amber would lean on
 * staff to accept the duty.
 */
function Outcome({
  active,
  tone,
  question,
  consequence,
}: {
  active: boolean;
  tone: 'duty' | 'fees';
  question: string;
  consequence: string;
}) {
  const shell = !active
    ? 'border-gray-200 bg-transparent dark:border-gray-800'
    : tone === 'duty'
      ? 'border-green-300 bg-green-50 dark:border-green-500/40 dark:bg-green-500/10'
      : 'border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800/60';

  const dot = !active
    ? 'border-gray-300 dark:border-gray-600'
    : tone === 'duty'
      ? 'border-green-600 bg-green-600 dark:border-green-500 dark:bg-green-500'
      : 'border-gray-500 bg-gray-500 dark:border-gray-400 dark:bg-gray-400';

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors sm:p-4 ${shell} ${
        active ? '' : 'opacity-60'
      }`}
    >
      <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${dot}`} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{question}</span>
        <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-300">{consequence}</span>
      </span>
    </div>
  );
}

export default function InChargePage() {
  const { signOut } = useAuth();
  const [willing, setWilling] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [saving, setSaving] = useState(false);

  // The layout already redirected here on 'choose' | 'pledge' | 'must_pay', but it
  // deliberately doesn't thread that decision down (see layout.tsx) -- this page
  // re-fetches for itself and decides which of the three screens to show.
  const [gate, setGate] = useState<'choose' | 'pledge' | 'must_pay' | null>(null);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/boarding/access', {
        cache: 'no-store', credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      const g = json?.data?.gate;
      setGate(g === 'pledge' || g === 'must_pay' ? g : 'choose');
      setAmount(Number(json?.data?.outstandingAmount ?? 0));
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAcceptPledge = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/boarding/incharge-pledge', {
        method: 'POST', credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to accept the commitment');
      toast.success('Commitment accepted — you are the bus in-charge again');
      // Hard nav: the layout caches its gate decision in state, so a soft
      // router.replace() would bounce off the stale 'pledge' redirect.
      window.location.assign('/boarding/attendance');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept the commitment');
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!willing) {
      setDeclined(true);
      return;
    }
    setSaving(true);
    try {
      // No body: the server resolves the route from the staff master.
      const res = await fetch('/api/boarding/self-assign', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to set you as bus in-charge');
      toast.success('You are now the in-charge of your bus');
      // Hard nav: the boarding layout caches its 'access' decision in state keyed off
      // [loading, user, profile], so a soft router.replace() here would hit the
      // layout's stale 'choose' redirect and bounce back to this screen. A full page
      // load forces the layout to remount and recompute access fresh.
      window.location.assign('/boarding/attendance');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set you as bus in-charge');
      setSaving(false);
    }
  };

  if (gate === 'must_pay' || (gate === 'pledge' && declined)) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
            <Bus className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
            Transport fees are due
          </h1>
          {amount > 0 && (
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              ₹{amount.toLocaleString('en-IN')}
            </p>
          )}
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            Once you pay the fees you can continue the transport service.
            Please contact the transport office.
          </p>
          <button
            onClick={() => signOut()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto sm:px-5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (gate === 'pledge') {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 sm:h-14 sm:w-14">
              <Bus className="h-6 w-6 text-white sm:h-7 sm:w-7" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
              Transport fee bill
            </h1>
            {amount > 0 && (
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                ₹{amount.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-500/40 dark:bg-green-500/10">
            <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-100">
              If you mark attendance for your bus <strong>every service day</strong> from
              today until the end of this month, this bill will be{' '}
              <strong>cancelled</strong> and you continue as bus in-charge.
            </p>
          </div>

          <button
            onClick={handleAcceptPledge}
            disabled={saving}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Accepting…' : 'OK, I accept'}
          </button>
          <button
            onClick={() => setDeclined(true)}
            disabled={saving}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Not OK
          </button>
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="w-full max-w-md">
        {/* Shown in BOTH states: a removed in-charge who then declines still has
            a bill to understand, and this is the only screen that reaches them. */}
        <RemovalBillNotice />
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
            <Bus className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">Transport fees apply</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            You&apos;ve opted out of being a bus in-charge, so transport fees apply to your travel.
            Please contact the transport office.
          </p>
          <button
            onClick={() => signOut()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-900 sm:w-auto sm:px-5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <RemovalBillNotice />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 sm:h-14 sm:w-14">
            <Bus className="h-6 w-6 text-white sm:h-7 sm:w-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Bus in-charge</h1>
        </div>

        <div className="mt-5 space-y-2.5 sm:mt-6">
          <Outcome
            active={willing}
            tone="duty"
            question="Willing to be the bus in-charge?"
            consequence="You will not pay transport fees."
          />
          <Outcome
            active={!willing}
            tone="fees"
            question="Not willing?"
            consequence="Transport fees apply."
          />
        </div>

        {/* The whole row is the label, so the text is a tap target too — on a phone the
            switch alone is a 44x24 sliver, and this is the screen's only control. */}
        <label
          htmlFor="willing"
          className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 sm:mt-6"
        >
          <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">
            I&apos;m willing to be the bus in-charge
          </span>
          {/* `relative` lives here, not on the label: the knob is positioned with
              after:absolute and would otherwise anchor to the whole row. */}
          <span className="relative inline-flex shrink-0 items-center">
            <input
              id="willing"
              type="checkbox"
              checked={willing}
              onChange={(e) => setWilling(e.target.checked)}
              className="sr-only peer"
            />
            <span className="h-6 w-11 rounded-full bg-gray-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-green-500 peer-focus-visible:ring-offset-2 dark:bg-gray-700 dark:peer-focus-visible:ring-offset-gray-900" />
          </span>
        </label>

        <button
          onClick={handleConfirm}
          disabled={saving}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Setting…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
