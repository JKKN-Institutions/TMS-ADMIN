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
        'x-api-key': process.env.NEXT_PUBLIC_API_KEY || ''
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

      if (validation.valid && validation.user) {
        // Debug: Log user details for role checking
        console.log('🔍 User details for role validation:', {
          email: validation.user.email,
          role: validation.user.role,
          is_super_admin: validation.user.is_super_admin,
          permissions: validation.user.permissions,
          full_user: validation.user
        });

        // Check if user has Super Administrator role
        if (!this.isValidAdminRole(validation.user)) {
          console.error('❌ Role validation failed for user:', validation.user.email);
          console.error('❌ User role:', validation.user.role);
          console.error('❌ Is super admin:', validation.user.is_super_admin);
          throw new Error('Access denied. Only Super Administrators can access this application.');
        }

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
   * Check if user has valid admin role (Super Administrator)
   */
  private isValidAdminRole(user: ParentAppUser): boolean {
    console.log('🔍 Checking admin role for user:', {
      email: user.email,
      role: user.role,
      is_super_admin: user.is_super_admin,
      roleType: typeof user.role,
      isSuperAdminType: typeof user.is_super_admin
    });

    // Primary check: exact role name from parent app
    if (user.role === 'super_admin') {
      console.log('✅ User has super_admin role');
      return true;
    }

    // Secondary check: is_super_admin flag (boolean)
    if (user.is_super_admin === true || user.is_super_admin === 'true') {
      console.log('✅ User has is_super_admin flag set to true');
      return true;
    }

    // Fallback checks for other possible formats
    const validRoles = [
      'Super Administrator',
      'super_administrator', 
      'super administrator',
      'SuperAdministrator',
      'SUPER_ADMINISTRATOR'
    ];

    // Check role string (case-insensitive)
    if (user.role && validRoles.some(validRole => 
      user.role.toLowerCase().trim() === validRole.toLowerCase()
    )) {
      console.log('✅ User has valid admin role:', user.role);
      return true;
    }

    // Check permissions for admin-related permissions
    if (user.permissions) {
      const adminPermissions = ['admin', 'super_admin', 'all', '*'];
      const hasAdminPermission = adminPermissions.some(perm => 
        user.permissions[perm] === true || 
        user.permissions[perm] === 'true' ||
        Object.keys(user.permissions).some(key => 
          key.toLowerCase().includes('admin') && user.permissions[key] === true
        )
      );
      
      if (hasAdminPermission) {
        console.log('✅ User has admin permissions:', user.permissions);
        return true;
      }
    }

    console.log('❌ User does not have valid admin role. Expected: super_admin, Got:', user.role);
    return false;
  }

  /**
   * Validate access token
   */
  async validateToken(token: string): Promise<ValidationResponse> {
    try {
      const requestData = {
        token,
        child_app_id: process.env.NEXT_PUBLIC_APP_ID
      };

      console.log('Validating token with parent app:', {
        url: '/api/auth/child-app/validate',
        child_app_id: requestData.child_app_id,
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
        return {
          valid: false,
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
      });

      const data: TokenResponse = response.data;

      // Check role again on refresh
      if (!this.isValidAdminRole(data.user)) {
        throw new Error('Access denied. Only Super Administrators can access this application.');
      }

      this.setAccessToken(data.access_token);
      this.setUser(data.user);

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
   */
  logout(redirectToParent: boolean = false): void {
    console.log('🔍 Logout initiated, redirectToParent:', redirectToParent);

    // Clear local session first
    this.clearSession();

    if (redirectToParent) {
      const logoutUrl = new URL(
        '/api/auth/child-app/logout',
        process.env.NEXT_PUBLIC_PARENT_APP_URL!
      );

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
    return !!(token && user && this.isValidAdminRole(user));
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

      if (validation.valid && validation.user && this.isValidAdminRole(validation.user)) {
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
      const userData = localStorage.getItem('parent_user_data');
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
      localStorage.setItem('parent_user_data', JSON.stringify(user));
      localStorage.setItem('parent_auth_timestamp', Date.now().toString());
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  }

  getSession(): AuthSession | null {
    try {
      const sessionData = localStorage.getItem('parent_session_data');
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
      localStorage.setItem('parent_session_data', JSON.stringify(session));
    } catch (error) {
      console.error('Error saving session data:', error);
    }
  }

  clearSession(): void {
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('parent_user_data');
    localStorage.removeItem('parent_session_data');
    localStorage.removeItem('parent_auth_timestamp');
    sessionStorage.clear();
  }

  getApiClient(): AxiosInstance {
    return this.api;
  }

  private generateState(): string {
    const stateData = {
      random:
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15),
      isChildAppAuth: true,
      timestamp: Date.now(),
      appId: process.env.NEXT_PUBLIC_APP_ID
    };

    return btoa(JSON.stringify(stateData)).replace(/=/g, '');
  }
}

export default new ParentAuthService();
