import { useEffect } from 'react';

/**
 * Custom hook to suppress hydration warnings caused by browser extensions
 * that add attributes like fdprocessedid to form elements
 */
export function useHydrationFix() {
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      // Suppress hydration warnings for browser extension attributes
      if (
        args[0]?.includes?.('hydration') && 
        (args[0]?.includes?.('fdprocessedid') || 
         args[0]?.includes?.('autocomplete') ||
         args[0]?.includes?.('data-form-fill'))
      ) {
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);
} 