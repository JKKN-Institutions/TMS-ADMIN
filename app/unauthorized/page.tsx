import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  no_tms_access: {
    title: 'No Transport Access',
    body: 'Your account does not have access to the Transport Management System. Please contact your administrator to request access.',
  },
  no_profile: {
    title: 'Profile Not Found',
    body: 'We could not find your JKKN profile. Please sign in to MyJKKN first to set up your account.',
  },
  inactive: {
    title: 'Account Inactive',
    body: 'Your account has been deactivated. Please contact your administrator.',
  },
};

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message =
    (reason && REASON_MESSAGES[reason]) || REASON_MESSAGES.no_tms_access;
  const myjkknUrl = process.env.NEXT_PUBLIC_MYJKKN_URL || 'https://jkkn.ai';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl p-8 space-y-4">
        <div className="inline-flex w-16 h-16 bg-red-100 rounded-2xl items-center justify-center">
          <ShieldAlert className="w-9 h-9 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{message.title}</h1>
        <p className="text-gray-600">{message.body}</p>
        <div className="flex flex-col gap-2 pt-2">
          <Link
            href="/auth/login"
            className="w-full py-2.5 px-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
          >
            Back to Sign In
          </Link>
          <a
            href={myjkknUrl}
            className="w-full py-2.5 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Go to MyJKKN
          </a>
        </div>
      </div>
    </div>
  );
}
