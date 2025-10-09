'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      console.log('\n🔄 ═══════════════════════════════════════════════════════');
      console.log('📍 CHILD APP: Callback Handler');
      console.log('🔄 ═══════════════════════════════════════════════════════');

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      const savedState = localStorage.getItem('oauth_state');

      console.log('📋 Callback parameters:', {
        code: code ? code.substring(0, 8) + '...' : 'None',
        state: state,
        error: error,
        errorDescription: errorDescription
      });
      console.log('📋 Saved state from localStorage:', savedState);

      // Check for OAuth errors from auth server
      if (error) {
        const errorMessage = errorDescription || 'Authorization failed';
        console.log('❌ OAuth error received from auth server');
        console.error('💥 Error:', error, errorDescription);
        setError(errorMessage);
        return;
      }

      // Validate state
      console.log('\n🔍 Validating state parameter...');
      if (state !== savedState) {
        console.log('❌ State validation failed - possible CSRF attack!');
        console.log('  Expected:', savedState);
        console.log('  Received:', state);
        setError('Invalid state parameter - possible CSRF attack');
        return;
      }
      console.log('✅ State validated');

      if (!code) {
        console.log('❌ No authorization code received');
        setError('No authorization code received');
        return;
      }

      console.log('✅ Authorization code received');

      try {
        // Exchange code for tokens
        console.log('\n🔄 Exchanging code for tokens...');
        const response = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });

        console.log('📥 Token response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.log('❌ Token exchange failed');
          console.error('💥 Error:', errorData);
          throw new Error(errorData.error_description || 'Token exchange failed');
        }

        const data = await response.json();
        console.log('✅ Tokens received successfully!');
        console.log('📋 User:', data.user?.email);

        // Save tokens
        console.log('\n💾 Saving tokens to localStorage...');
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        console.log('✅ Tokens saved');

        // Clear state
        localStorage.removeItem('oauth_state');
        console.log('🧹 OAuth state cleared');

        // Redirect to home
        console.log('🔄 Redirecting to home page...');
        console.log('✅ ═══════════════════════════════════════════════════════');
        console.log('📍 OAuth Flow Complete!');
        console.log('✅ ═══════════════════════════════════════════════════════\n');
        router.push('/');
      } catch (err) {
        console.log('❌ Callback handler error');
        console.error('💥 Error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center max-w-md bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-red-200 dark:border-red-800">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
            Authentication Error
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center max-w-md bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
          Authenticating...
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Please wait while we complete your login.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-75"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-150"></div>
        </div>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
