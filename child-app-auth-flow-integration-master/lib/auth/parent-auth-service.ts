import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

export interface ParentAppUser {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
  role: string;
  institution_id?: string;
  is_super_admin?: boolean;
  permissions: Record<string, boolean>;
  profile_completed?: boolean;
  avatar_url?: string;
  last_login?: string;
}

export interface AuthSession {
  id: string;
  expires_at: string;
  created_at: string;
  last_used_at?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: ParentAppUser;
}

export interface ValidationResponse {
  valid: boolean;
  user?: ParentAppUser;
  session?: AuthSession;
  error?: string;
}

class ParentAuthService {
  private api: AxiosInstance;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.NEXT_PUBLIC_PARENT_APP_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '' // Changed to lowercase
      }
    });

    // Add request interceptor to include auth header
    this.api.interceptors.request.use((config) => {
      const token = this.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && !error.config._retry) {
          error.config._retry = true;

          const refreshed = await this.refreshToken();
          if (refreshed) {
            const token = this.getAccessToken();
            error.config.headers.Authorization = `Bearer ${token}`;
            return this.api.request(error.config);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initiate OAuth login flow
   */
  login(redirectUrl?: string): void {
    const state = this.generateState();
    sessionStorage.setItem('oauth_state', state);

    if (redirectUrl) {
      sessionStorage.setItem('post_login_redirect', redirectUrl);
    }

    // Use the child app authorization endpoint
    const authUrl = new URL(
      '/auth/child-app/consent',
      process.env.NEXT_PUBLIC_PARENT_APP_URL!
    );
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_APP_ID!);
    authUrl.searchParams.append('app_id', process.env.NEXT_PUBLIC_APP_ID!);
    authUrl.searchParams.append(
      'redirect_uri',
      process.env.NEXT_PUBLIC_REDIRECT_URI!
    );
    authUrl.searchParams.append('scope', 'read write profile');
    authUrl.searchParams.append('state', state);

    // ADD THIS DEBUG LOG
    console.log('🔍 ParentAuthService Login URL:', authUrl.toString());
    console.log('🔍 Environment Variables:', {
      PARENT_APP_URL: process.env.NEXT_PUBLIC_PARENT_APP_URL,
      APP_ID: process.env.NEXT_PUBLIC_APP_ID,
      REDIRECT_URI: process.env.NEXT_PUBLIC_REDIRECT_URI
    });

    window.location.href = authUrl.toString();
  }

  async handleCallback(
    token: string,
    refreshToken?: string
  ): Promise<ParentAppUser | null> {
    try {
      console.log('HandleCallback called with:', {
        hasToken: !!token,
        tokenStart: token ? token.substring(0, 20) + '...' : 'none',
        hasRefreshToken: !!refreshToken
      });

      if (refreshToken) {
        this.setRefreshToken(refreshToken);
      }

      // Validate the token with parent app
      const validation = await this.validateToken(token);
      console.log('Validation result:', validation);

      // Add more detailed logging
      console.log('Validation details:', {
        isValid: validation.valid,
        hasUser: !!validation.user,
        hasSession: !!validation.session,
        userId: validation.user?.id,
        userEmail: validation.user?.email
      });

      if (validation.valid && validation.user) {
        console.log('Setting auth data...');
        this.setAccessToken(token);
        this.setUser(validation.user);

        if (validation.session) {
          this.setSession(validation.session);
        }

        // Clear OAuth state
        sessionStorage.removeItem('oauth_state');

        console.log(
          'Auth callback successful, returning user:',
          validation.user.email
        );
        return validation.user;
      }

      throw new Error(validation.error || 'Token validation failed');
    } catch (error) {
      console.error('Auth callback error:', error);
      this.clearSession();
      throw error;
    }
  }

  /**
   * Validate access token
   */
  async validateToken(token: string): Promise<ValidationResponse> {
    try {
      // Parent app expects only token and child_app_id
      const requestData = {
        token,
        child_app_id: process.env.NEXT_PUBLIC_APP_ID
      };

      console.log('Validating token with parent app:', {
        url: '/api/auth/child-app/validate',
        child_app_id: requestData.child_app_id,
        full_api_key: process.env.NEXT_PUBLIC_API_KEY,
        headers: {
          'x-api-key': process.env.NEXT_PUBLIC_API_KEY ? 'Set' : 'Not set'
        }
      });

      const response = await this.api.post(
        '/api/auth/child-app/validate',
        requestData
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          'Token validation error:',
          error.response?.data || error.message
        );
        console.error('Full error response:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers
        });
        return {
          valid: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          error: error.response?.data?.error || 'Validation failed'
        };
      }

      console.error('Token validation error:', error);
      return {
        valid: false,
        error: 'Validation failed'
      };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefreshToken();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async _doRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.api.post('/api/auth/child-app/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        app_id: process.env.NEXT_PUBLIC_APP_ID
        // API key is sent in header, not body
      });

      const data: TokenResponse = response.data;

      this.setAccessToken(data.access_token);
      this.setUser(data.user);

      // Update refresh token if provided
      if (data.refresh_token) {
        this.setRefreshToken(data.refresh_token);
      }

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearSession();
      return false;
    }
  }

  /**
   * Logout from parent app
   * Enhanced to support seamless re-authentication
   */
  logout(redirectToParent: boolean = true): void {
    console.log('🔍 Logout initiated, redirectToParent:', redirectToParent);

    // Clear local session first
    this.clearSession();

    if (redirectToParent) {
      const logoutUrl = new URL(
        '/api/auth/child-app/logout',
        process.env.NEXT_PUBLIC_PARENT_APP_URL!
      );

      // Enhanced logout with seamless re-auth support
      // The parent app will only clear child app session, not parent session
      window.location.href =
        logoutUrl.toString() +
        `?app_id=${
          process.env.NEXT_PUBLIC_APP_ID
        }&redirect_uri=${encodeURIComponent(
          window.location.origin
        )}&seamless_reauth=true`;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const user = this.getUser();
    return !!(token && user);
  }

  /**
   * Validate current session
   */
  async validateSession(): Promise<boolean> {
    const token = this.getAccessToken();
    if (!token) {
      return false;
    }

    try {
      const validation = await this.validateToken(token);

      if (validation.valid && validation.user) {
        // Update user data in case it changed
        this.setUser(validation.user);

        if (validation.session) {
          this.setSession(validation.session);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    const user = this.getUser();
    return user?.permissions?.[permission] === true;
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role === role;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    const user = this.getUser();
    return user ? roles.includes(user.role) : false;
  }

  // Token management methods
  getAccessToken(): string | null {
    return Cookies.get('access_token') || null;
  }

  private setAccessToken(token: string): void {
    const isProduction = window.location.protocol === 'https:';
    Cookies.set('access_token', token, {
      expires: 1, // 1 day
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });
  }

  private getRefreshToken(): string | null {
    return Cookies.get('refresh_token') || null;
  }

  private setRefreshToken(token: string): void {
    const isProduction = window.location.protocol === 'https:';
    Cookies.set('refresh_token', token, {
      expires: 30, // 30 days
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });
  }

  getUser(): ParentAppUser | null {
    try {
      const userData = localStorage.getItem('user_data');
      // Handle case where localStorage might contain the string "undefined"
      if (userData && userData !== 'undefined') {
        return JSON.parse(userData) as ParentAppUser;
      }
      return null;
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  }

  private setUser(user: ParentAppUser): void {
    try {
      localStorage.setItem('user_data', JSON.stringify(user));
      localStorage.setItem('auth_timestamp', Date.now().toString());
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  }

  getSession(): AuthSession | null {
    try {
      const sessionData = localStorage.getItem('session_data');
      // Handle case where localStorage might contain the string "undefined"
      if (sessionData && sessionData !== 'undefined') {
        return JSON.parse(sessionData) as AuthSession;
      }
      return null;
    } catch (error) {
      console.error('Error getting session data:', error);
      return null;
    }
  }

  private setSession(session: AuthSession): void {
    try {
      localStorage.setItem('session_data', JSON.stringify(session));
    } catch (error) {
      console.error('Error saving session data:', error);
    }
  }

  clearSession(): void {
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('session_data');
    localStorage.removeItem('auth_timestamp');
    sessionStorage.clear();
  }

  getApiClient(): AxiosInstance {
    return this.api;
  }

  private generateState(): string {
    // Enhanced state generation with child app context
    const stateData = {
      random:
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15),
      isChildAppAuth: true,
      timestamp: Date.now(),
      appId: process.env.NEXT_PUBLIC_APP_ID
    };

    // Base64 encode without padding (Google strips '=' characters)
    return btoa(JSON.stringify(stateData)).replace(/=/g, '');
  }
}

export default new ParentAuthService();
