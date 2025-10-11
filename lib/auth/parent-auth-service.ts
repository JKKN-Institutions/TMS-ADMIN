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
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;

  constructor() {
    // Use new centralized auth server
    this.api = axios.create({
      baseURL: process.env.NEXT_PUBLIC_AUTH_SERVER_URL || 'https://auth.jkkn.ai',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
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

    // Initialize from storage
    if (typeof window !== 'undefined') {
      this.accessToken = this.getStoredAccessToken();
      this.refreshTokenValue = this.getStoredRefreshToken();
    }
  }

  /**
   * Initiate OAuth login flow (MATCHING PASSENGER APP)
   */
  login(redirectUrl?: string): void {
    console.log('\n🚀 ═══════════════════════════════════════════════════════');
    console.log('📍 TMS-ADMIN: Initiating OAuth Flow');
    console.log('🚀 ═══════════════════════════════════════════════════════');
    
    const authServerUrl = process.env.NEXT_PUBLIC_AUTH_SERVER_URL || 'https://auth.jkkn.ai';
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'tms_admin_portal_mfhsyxnn';
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3001/auth/callback';
    const scope = 'read write profile';
    // SIMPLE STATE - matching passenger app (no encoding!)
    const state = Math.random().toString(36).substring(7);

    console.log('📋 Configuration:');
    console.log('  - Auth Server:', authServerUrl);
    console.log('  - App ID:', appId);
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - Scope:', scope);
    console.log('  - State:', state);

    // Save state for validation (in localStorage like passenger app)
    localStorage.setItem('oauth_state', state);
    console.log('💾 State saved to localStorage');

    if (redirectUrl) {
      sessionStorage.setItem('post_login_redirect', redirectUrl);
      console.log('💾 Post-login redirect URL stored:', redirectUrl);
    }

    // Build authorization URL (EXACTLY like passenger app)
    const authUrl = `${authServerUrl}/api/auth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;

    console.log('\n🔗 Redirecting to auth server...');
    console.log('📍 URL:', authUrl);
    console.log('═══════════════════════════════════════════════════════\n');
    
    window.location.href = authUrl;
  }

  async handleCallback(
    token: string,
    refreshToken?: string
  ): Promise<ParentAppUser | null> {
    try {
      console.log('🔄 Admin HandleCallback called with:', {
        hasToken: !!token,
        tokenStart: token ? token.substring(0, 20) + '...' : 'none',
        hasRefreshToken: !!refreshToken
      });

      // Store tokens
      this.setAccessToken(token);
      if (refreshToken) {
        this.setRefreshToken(refreshToken);
      }

      // Validate the token with auth server
      const validation = await this.validateToken(token);
      console.log('Validation result:', validation);

      if (validation.valid && validation.user) {
        // Debug: Log user details for role checking
        console.log('🔍 User details for role validation:', {
          email: validation.user.email,
          role: validation.user.role,
          is_super_admin: validation.user.is_super_admin,
          permissions: validation.user.permissions
        });

        // Check if user has admin/staff role
        if (!this.isValidAdminRole(validation.user)) {
          console.error('❌ Role validation failed for user:', validation.user.email);
          console.error('❌ User role:', validation.user.role);
          this.clearSession();
          throw new Error('Access denied. Only administrators and staff can access this application.');
        }

        console.log('✅ Admin role validated successfully');

        // Store user and session
        this.setUser(validation.user);
        if (validation.session) {
          this.setSession(validation.session);
        }

        return validation.user;
      }

      return null;
    } catch (error) {
      console.error('Callback handling error:', error);
      throw error;
    }
  }

  /**
   * Validate admin role - VERY permissive for admin app
   */
  private isValidAdminRole(user: ParentAppUser): boolean {
    console.log('🔍 Validating admin role for:', user.email);
    console.log('📋 User data:', {
      role: user.role,
      is_super_admin: user.is_super_admin,
      permissions: user.permissions
    });

    // Check for super admin (multiple variations)
    if (user.is_super_admin === true || 
        (user as any).is_superadmin === true || 
        (user as any).isSuperAdmin === true) {
      console.log('✅ User is super admin (direct flag)');
      return true;
    }

    // Check if role string contains admin/staff/faculty keywords (case insensitive)
    if (user.role) {
      const roleLower = String(user.role).toLowerCase();
      const validKeywords = [
        'admin',
        'staff',
        'faculty',
        'teacher',
        'transport',
        'manager',
        'coordinator',
        'head'
      ];

      const hasValidKeyword = validKeywords.some(keyword => 
        roleLower.includes(keyword)
      );

      if (hasValidKeyword) {
        console.log('✅ User role contains valid keyword:', user.role);
        return true;
      }
    }

    // Check permissions (if any permission exists, allow access)
    if (user.permissions && typeof user.permissions === 'object') {
      const permissionCount = Object.keys(user.permissions).length;
      if (permissionCount > 0) {
        console.log('✅ User has permissions:', permissionCount);
        return true;
      }
    }

    // If institution_id exists, user is likely staff/admin
    if (user.institution_id) {
      console.log('✅ User has institution_id, likely staff/admin');
      return true;
    }

    console.log('❌ User does not meet any admin criteria:', {
      role: user.role,
      is_super_admin: user.is_super_admin,
      has_permissions: !!user.permissions,
      has_institution: !!user.institution_id
    });

    return false;
  }

  async validateToken(token: string): Promise<ValidationResponse> {
    try {
      // Call local API route which validates with auth server
      const response = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        return { valid: false, error: 'Token validation failed' };
      }

      const data = await response.json();
      return {
        valid: data.valid,
        user: data.user,
        session: data.session
      };
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false, error: 'Validation request failed' };
    }
  }

  async validateSession(): Promise<boolean> {
    try {
      const token = this.getAccessToken();
      if (!token) {
        return false;
      }

      const validation = await this.validateToken(token);
      if (validation.valid && validation.user) {
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

  async refreshToken(): Promise<boolean> {
    // Prevent concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._refreshToken();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }

  private async _refreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const response = await this.api.post('/api/auth/refresh', {
        refresh_token: refreshToken,
        app_id: process.env.NEXT_PUBLIC_APP_ID,
        api_key: process.env.API_KEY
      });

      const { access_token, refresh_token, user } = response.data;

      this.setAccessToken(access_token);
      if (refresh_token) {
        this.setRefreshToken(refresh_token);
      }
      if (user) {
        this.setUser(user);
      }

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearSession();
      return false;
    }
  }

  // Token management
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return this.accessToken || this.getStoredAccessToken();
  }

  private getStoredAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('tms_admin_access_token') || 
           Cookies.get('tms_admin_access_token') || 
           null;
  }

  setAccessToken(token: string): void {
    if (typeof window === 'undefined') return;
    this.accessToken = token;
    localStorage.setItem('tms_admin_access_token', token);
    Cookies.set('tms_admin_access_token', token, { 
      expires: 7, 
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return this.refreshTokenValue || this.getStoredRefreshToken();
  }

  private getStoredRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('tms_admin_refresh_token') || 
           Cookies.get('tms_admin_refresh_token') || 
           null;
  }

  setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;
    this.refreshTokenValue = token;
    localStorage.setItem('tms_admin_refresh_token', token);
    Cookies.set('tms_admin_refresh_token', token, { 
      expires: 30, 
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
  }

  // User management
  getUser(): ParentAppUser | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('tms_admin_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  setUser(user: ParentAppUser): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('tms_admin_user', JSON.stringify(user));
  }

  updateUser(user: ParentAppUser): void {
    this.setUser(user);
  }

  // Session management
  getSession(): AuthSession | null {
    if (typeof window === 'undefined') return null;
    const sessionStr = localStorage.getItem('tms_admin_session');
    if (!sessionStr) return null;
    try {
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  }

  setSession(session: AuthSession): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('tms_admin_session', JSON.stringify(session));
  }

  clearSession(): void {
    if (typeof window === 'undefined') return;
    
    // Clear memory
    this.accessToken = null;
    this.refreshTokenValue = null;

    // Clear localStorage
    localStorage.removeItem('tms_admin_access_token');
    localStorage.removeItem('tms_admin_refresh_token');
    localStorage.removeItem('tms_admin_user');
    localStorage.removeItem('tms_admin_session');
    
    // Clear cookies
    Cookies.remove('tms_admin_access_token');
    Cookies.remove('tms_admin_refresh_token');
  }

  // Permission checks
  hasPermission(permission: string): boolean {
    const user = this.getUser();
    return user?.permissions?.[permission] === true;
  }

  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.role?.toLowerCase() === role.toLowerCase();
  }

  hasAnyRole(roles: string[]): boolean {
    const user = this.getUser();
    if (!user?.role) return false;
    return roles.some(role => user.role.toLowerCase() === role.toLowerCase());
  }

  // Utility - removed complex state generation, using simple random string like passenger app
}

// Export singleton instance
const parentAuthService = new ParentAuthService();
export default parentAuthService;
