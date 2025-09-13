'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode
} from 'react';
import parentAuthService, {
  ParentAppUser,
  AuthSession
} from './parent-auth-service';

interface AuthContextType {
  user: ParentAppUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (redirectUrl?: string) => void;
  logout: (redirectToParent?: boolean) => void;
  refreshSession: () => Promise<boolean>;
  validateSession: () => Promise<boolean>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  handleAuthCallback: (
    token: string,
    refreshToken?: string
  ) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  autoValidate?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onAuthChange?: (user: ParentAppUser | null) => void;
  onSessionExpired?: () => void;
}

export function AuthProvider({
  children,
  autoValidate = true,
  autoRefresh = true,
  refreshInterval = 10 * 60 * 1000, // 10 minutes
  onAuthChange,
  onSessionExpired
}: AuthProviderProps) {
  const [user, setUser] = useState<ParentAppUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get stored user and session
        const storedUser = parentAuthService.getUser();
        const storedSession = parentAuthService.getSession();

        if (storedUser && storedSession) {
          setUser(storedUser);
          setSession(storedSession);

          // Validate session if auto-validate is enabled
          if (autoValidate) {
            const isValid = await parentAuthService.validateSession();
            if (!isValid) {
              setUser(null);
              setSession(null);
            } else {
              // Update with fresh data
              const freshUser = parentAuthService.getUser();
              const freshSession = parentAuthService.getSession();
              setUser(freshUser);
              setSession(freshSession);
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError('Failed to initialize authentication');
        setUser(null);
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [autoValidate]);

  // Auto-refresh token
  useEffect(() => {
    if (!autoRefresh || !user || !session) return;

    const refreshTimer = setInterval(async () => {
      try {
        const refreshed = await parentAuthService.refreshToken();
        if (refreshed) {
          const freshUser = parentAuthService.getUser();
          const freshSession = parentAuthService.getSession();
          setUser(freshUser);
          setSession(freshSession);
        } else {
          // Refresh failed, session expired
          setUser(null);
          setSession(null);
          if (onSessionExpired) {
            onSessionExpired();
          }
        }
      } catch (err) {
        console.error('Auto-refresh error:', err);
      }
    }, refreshInterval);

    return () => clearInterval(refreshTimer);
  }, [autoRefresh, user, session, refreshInterval, onSessionExpired]);

  // Notify auth changes
  useEffect(() => {
    if (onAuthChange) {
      onAuthChange(user);
    }
  }, [user, onAuthChange]);

  // Check auth callback params on mount
  useEffect(() => {
    const checkAuthCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const refreshToken = params.get('refresh_token');

      // Skip if we're on the callback page (it will handle itself)
      if (window.location.pathname === '/auth/callback') {
        return;
      }

      if (token) {
        try {
          setIsLoading(true);
          const authUser = await parentAuthService.handleCallback(
            token,
            refreshToken || undefined
          );

          if (authUser) {
            setUser(authUser);
            const newSession = parentAuthService.getSession();
            setSession(newSession);

            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            url.searchParams.delete('refresh_token');
            window.history.replaceState({}, '', url.toString());

            // Handle post-login redirect
            const redirectUrl = sessionStorage.getItem('post_login_redirect');
            if (redirectUrl) {
              sessionStorage.removeItem('post_login_redirect');
              window.location.href = redirectUrl;
              return;
            }
          }
        } catch (err) {
          console.error('Auth callback error:', err);
          setError('Authentication failed');
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkAuthCallback();
  }, []);

  const login = (redirectUrl?: string) => {
    parentAuthService.login(redirectUrl);
  };

  const logout = async (redirectToParent: boolean = false) => {
    console.log(
      '🔍 Admin app logout initiated, redirectToParent:',
      redirectToParent
    );

    try {
      // Call the child app logout endpoint to preserve parent session
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_PARENT_APP_URL}/api/auth/child-app/logout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app_id: process.env.NEXT_PUBLIC_APP_ID,
            session_id: session?.id,
            access_token: parentAuthService.getAccessToken(),
            redirect_uri: redirectToParent
              ? process.env.NEXT_PUBLIC_PARENT_APP_URL
              : window.location.origin
          })
        }
      );

      console.log('🔍 Logout response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Logout response data:', data);
      }
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with local cleanup even if API call fails
    }

    // Clear local state and storage
    setUser(null);
    setSession(null);
    setError(null);

    // Clear stored tokens using parentAuthService method
    parentAuthService.clearSession();

    console.log('🔍 Local session cleared');

    // Redirect appropriately
    if (redirectToParent) {
      window.location.href =
        process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://my.jkkn.ac.in';
    } else {
      window.location.href = '/login';
    }
  };

  const refreshSession = async (): Promise<boolean> => {
    try {
      const success = await parentAuthService.refreshToken();
      if (success) {
        const freshUser = parentAuthService.getUser();
        const freshSession = parentAuthService.getSession();
        setUser(freshUser);
        setSession(freshSession);
      } else {
        setUser(null);
        setSession(null);
      }
      return success;
    } catch (err) {
      console.error('Refresh session error:', err);
      setUser(null);
      setSession(null);
      return false;
    }
  };

  const validateSession = async (): Promise<boolean> => {
    try {
      const isValid = await parentAuthService.validateSession();
      if (isValid) {
        const freshUser = parentAuthService.getUser();
        const freshSession = parentAuthService.getSession();
        setUser(freshUser);
        setSession(freshSession);
      } else {
        setUser(null);
        setSession(null);
      }
      return isValid;
    } catch (err) {
      console.error('Validate session error:', err);
      setUser(null);
      setSession(null);
      return false;
    }
  };

  const handleAuthCallback = async (
    token: string,
    refreshToken?: string
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const authUser = await parentAuthService.handleCallback(
        token,
        refreshToken
      );
      if (authUser) {
        setUser(authUser);
        const newSession = parentAuthService.getSession();
        setSession(newSession);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Handle auth callback error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return parentAuthService.hasPermission(permission);
  };

  const hasRole = (role: string): boolean => {
    return parentAuthService.hasRole(role);
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return parentAuthService.hasAnyRole(roles);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!user,
        error,
        login,
        logout,
        refreshSession,
        validateSession,
        hasPermission,
        hasRole,
        hasAnyRole,
        handleAuthCallback
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Additional hooks for convenience
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
}

export function useCurrentUser(): ParentAppUser | null {
  const { user } = useAuth();
  return user;
}

export function usePermission(permission: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

export function useRole(role: string): boolean {
  const { hasRole } = useAuth();
  return hasRole(role);
}

export function useAnyRole(roles: string[]): boolean {
  const { hasAnyRole } = useAuth();
  return hasAnyRole(roles);
}

export function useAuthLoading(): boolean {
  const { isLoading } = useAuth();
  return isLoading;
}

export function useAuthError(): string | null {
  const { error } = useAuth();
  return error;
}

export function useSession() {
  const { session, validateSession, refreshSession } = useAuth();
  return { session, validateSession, refreshSession };
}
