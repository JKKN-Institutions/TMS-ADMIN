'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || this.state.error?.toString() || 'Unknown error';
      const isEnvironmentError = errorMessage.includes('Missing Supabase environment variables');
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            
            {isEnvironmentError ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Configuration Error
                </h2>
                <p className="text-gray-600 mb-4">
                  The application is missing required environment variables for database connection.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
                  <h3 className="font-semibold text-yellow-800 mb-2">Missing Environment Variables:</h3>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• <code>NEXT_PUBLIC_SUPABASE_URL</code></li>
                    <li>• <code>SUPABASE_SERVICE_ROLE_KEY</code></li>
                  </ul>
                  <p className="text-sm text-yellow-700 mt-3">
                    Please add these variables to your deployment environment or .env.local file.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Something went wrong
                </h2>
                <p className="text-gray-600 mb-6">
                  An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
                </p>
              </>
            )}
            
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh Page</span>
              </button>
              
              <details className="text-left">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Technical Details
                </summary>
                <pre className="mt-2 text-xs text-gray-600 bg-gray-50 p-3 rounded border overflow-auto max-h-40">
                  {errorMessage}
                </pre>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 