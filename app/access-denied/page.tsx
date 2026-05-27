import Link from 'next/link';
import { CreditCard } from 'lucide-react';

/**
 * Billing gate page (students). Shown when a student has TMS permission but
 * has not paid their transport bill. The billing check itself is applied at the
 * application layer, not in the proxy (see TMS-AUTH plan §7.3).
 */
export default function AccessDeniedPage() {
  const myjkknUrl = process.env.NEXT_PUBLIC_MYJKKN_URL || 'https://app.jkkn.ai';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl p-8 space-y-4">
        <div className="inline-flex w-16 h-16 bg-amber-100 rounded-2xl items-center justify-center">
          <CreditCard className="w-9 h-9 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Transport Bill Due</h1>
        <p className="text-gray-600">
          Your transport bill has not been paid. Please clear your transport fee
          to continue using the Transport Management System.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <a
            href={`${myjkknUrl}/billing`}
            className="w-full py-2.5 px-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
          >
            Pay Transport Bill
          </a>
          <Link
            href="/auth/login"
            className="w-full py-2.5 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
