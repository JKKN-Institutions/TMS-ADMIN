'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  institution_id?: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if we have a token in localStorage
    const token = localStorage.getItem('access_token');
    if (token) {
      validateToken(token);
    }
  }, []);

  const handleLogin = () => {
    console.log('\n🚀 ═══════════════════════════════════════════════════════');
    console.log('📍 CHILD APP: Initiating OAuth Flow');
    console.log('🚀 ═══════════════════════════════════════════════════════');

    const authServerUrl = process.env.NEXT_PUBLIC_AUTH_SERVER_URL;
    const appId = process.env.NEXT_PUBLIC_APP_ID;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;
    const scope = 'read write profile';
    const state = Math.random().toString(36).substring(7);

    console.log('📋 Configuration:');
    console.log('  - Auth Server:', authServerUrl);
    console.log('  - App ID:', appId);
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - Scope:', scope);
    console.log('  - State:', state);

    // Save state for validation
    localStorage.setItem('oauth_state', state);
    console.log('💾 State saved to localStorage');

    // Redirect to auth server (auth server will handle user authentication)
    const authUrl = `${authServerUrl}/api/auth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri!)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

    console.log('\n🔗 Redirecting to auth server...');
    console.log('📍 URL:', authUrl);
    console.log('═══════════════════════════════════════════════════════\n');

    window.location.href = authUrl;
  };

  const validateToken = async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_AUTH_SERVER_URL}/api/auth/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          child_app_id: process.env.NEXT_PUBLIC_APP_ID
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setUser(data.user);
        } else {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    } catch (error) {
      console.error('Token validation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="z-10 w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Test Child App
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            OAuth 2.0 Integration with MyJKKN Auth Server
          </p>
        </div>

        {user ? (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-semibold text-gray-800 dark:text-white">
                Welcome, {user.full_name}!
              </h2>
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xl font-bold">
                {user.full_name?.charAt(0).toUpperCase()}
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Email</p>
                <p className="text-gray-800 dark:text-gray-200 font-medium">{user.email}</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Role</p>
                <p className="text-gray-800 dark:text-gray-200 font-medium capitalize">{user.role}</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">User ID</p>
                <p className="text-gray-800 dark:text-gray-200 font-mono text-sm">{user.id}</p>
              </div>

              {user.institution_id && (
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Institution</p>
                  <p className="text-gray-800 dark:text-gray-200 font-mono text-sm">{user.institution_id}</p>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">
                Click below to authenticate with MyJKKN Auth Server
              </p>
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-lg text-lg transition-all duration-200 transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Login with MyJKKN
            </button>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                <strong>Test Mode:</strong> Using predefined test user credentials
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Powered by MyJKKN Centralized Auth Server</p>
          <p className="mt-2">OAuth 2.0 Authorization Code Flow</p>
        </div>
      </div>
    </main>
  );
}
