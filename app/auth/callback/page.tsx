'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { AlertTriangle } from 'lucide-react';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleAuthCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    // Prevent duplicate handling
    if (handled) return;

    const handleCallback = async () => {
      setHandled(true);
      try {
        console.log('\n🔄 ═══════════════════════════════════════════════════════');
        console.log('📍 Admin OAuth Callback Handler Started');
        console.log('🔄 ═══════════════════════════════════════════════════════');

        const code = searchParams?.get('code');
        const state = searchParams?.get('state');

        console.log('📋 Received OAuth params:', {
          code: code ? code.substring(0, 8) + '...' : 'missing',
          state: state ? state.substring(0, 20) + '...' : 'missing'
        });
        
        const error = searchParams?.get('error');
        const errorDescription = searchParams?.get('error_description');

        if (error) {
          console.log('❌ OAuth error:', error, errorDescription);
          setError(errorDescription || error);
          setProcessing(false);
          return;
        }

        if (!code) {
          console.log('❌ No authorization code found');
          setError('Authorization code not found');
          setProcessing(false);
          return;
        }

        // Validate state for CSRF protection
        const savedState = sessionStorage.getItem('oauth_state');

        if (!savedState) {
          console.log('❌ No saved state found in session');
          setError('No state found in session - please try logging in again');
          setProcessing(false);
          return;
        }

        if (!state) {
          console.log('❌ No state parameter received');
          setError('No state parameter received from authorization server');
          setProcessing(false);
          return;
        }

        // Enhanced state validation with Base64 decoding
        let stateValid = false;
        let stateData = null;

        try {
          // Try to decode the received state
          const paddedState = state + '='.repeat((4 - (state.length % 4)) % 4);
          stateData = JSON.parse(atob(paddedState));

          // Validate against saved state
          if (state === savedState && stateData?.isChildAppAuth) {
            stateValid = true;
            console.log('✅ Enhanced state validation passed:', {
              isChildAppAuth: stateData.isChildAppAuth,
              appId: stateData.appId
            });
          }
        } catch (error) {
          console.error('⚠️ State decoding failed:', error);
          // Fallback: simple string comparison
          if (state === savedState) {
            stateValid = true;
            console.log('✅ Basic state validation passed (fallback)');
          }
        }

        if (!stateValid) {
          console.error('❌ State mismatch:', {
            received: state.substring(0, 20) + '...',
            expected: savedState.substring(0, 20) + '...',
            decodedData: stateData
          });
          setError('Invalid state parameter - possible CSRF attack detected');
          setProcessing(false);
          return;
        }

        // Clear the saved state after successful validation
        sessionStorage.removeItem('oauth_state');
        console.log('✅ State validated and cleared');

        // Exchange authorization code for tokens
        console.log('\n🔄 Exchanging authorization code for tokens...');
        const response = await fetch('/api/auth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code })
        });

        console.log('📥 Token exchange response:', response.status, response.statusText);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ Token exchange failed:', errorData);
          throw new Error(errorData.error_description || errorData.error || 'Token exchange failed');
        }

        const tokenData = await response.json();
        console.log('✅ Token exchange successful');
        console.log('👤 User:', tokenData.user?.email);
        console.log('🎫 Role:', tokenData.user?.role);

        // Store tokens in localStorage (with tms_admin_ prefix)
        console.log('\n💾 Storing authentication tokens...');
        localStorage.setItem('tms_admin_access_token', tokenData.access_token);
        localStorage.setItem('tms_admin_refresh_token', tokenData.refresh_token || '');
        localStorage.setItem('tms_admin_user', JSON.stringify(tokenData.user));
        localStorage.setItem('tms_admin_token_expires', String(Date.now() + (tokenData.expires_in * 1000)));
        
        // Also store in cookies for SSR
        document.cookie = `tms_admin_access_token=${tokenData.access_token}; path=/; max-age=${tokenData.expires_in}; SameSite=Lax`;
        if (tokenData.refresh_token) {
          document.cookie = `tms_admin_refresh_token=${tokenData.refresh_token}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
        }
        
        console.log('✅ Tokens stored in localStorage and cookies');

        // Small delay to ensure storage is complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Handle the authentication callback
        console.log('\n🔄 Handling authentication callback in context...');
        const success = await handleAuthCallback(
          tokenData.access_token,
          tokenData.refresh_token
        );

        if (success) {
          console.log('✅ Authentication callback handled successfully');
          
          // Clean URL parameters
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          window.history.replaceState({}, '', url.pathname);

          // Check for post-login redirect
          const redirectUrl = sessionStorage.getItem('post_login_redirect');
          const targetPath = redirectUrl || '/dashboard';
          
          console.log('\n🔄 Redirecting to:', targetPath);
          console.log('\n✅ ═══════════════════════════════════════════════════════');
          console.log('📍 OAuth Flow Complete! Redirecting...', targetPath);
          console.log('✅ ═══════════════════════════════════════════════════════\n');

          if (redirectUrl) {
            sessionStorage.removeItem('post_login_redirect');
          }

          // Use full page reload to ensure fresh state
          window.location.href = targetPath;
        } else {
          console.error('❌ Authentication callback failed');
          setError('Authentication failed');
          setProcessing(false);
        }
      } catch (err) {
        console.error('\n❌ Callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setProcessing(false);
      }
    };

    handleCallback();
  }, [searchParams, router, handleAuthCallback, handled]);

  if (processing) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4'></div>
        <p className='text-gray-600'>Processing authentication...</p>
        <p className='text-sm text-gray-500 mt-2'>
          Please wait, you will be redirected shortly.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4'>
        <div className='w-full max-w-md text-center'>
          <AlertTriangle className='mx-auto h-12 w-12 text-red-500 mb-4' />
          <h1 className='text-2xl font-bold text-red-600 mb-2'>
            Authentication Error
          </h1>
          <p className='text-gray-600 mb-6'>{error}</p>
          <button
            onClick={() => router.push('/login')}
            className='px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors'
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className='flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
