// Security Enhancement Module for TMS Admin Application
import React from 'react';

export class SecurityEnhancements {
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
  private static readonly SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour
  private static readonly ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'tms-secure-key';

  // Input sanitization and validation
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
  }

  static validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Rate limiting
  static checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const key = `rate_limit_${identifier}`;
    const now = Date.now();
    
    let requests = JSON.parse(localStorage.getItem(key) || '[]') as number[];
    
    // Remove requests outside the window
    requests = requests.filter(timestamp => now - timestamp < windowMs);
    
    if (requests.length >= maxRequests) {
      return false; // Rate limit exceeded
    }
    
    requests.push(now);
    localStorage.setItem(key, JSON.stringify(requests));
    
    return true;
  }

  // Login attempt tracking
  static trackLoginAttempt(username: string, success: boolean): boolean {
    const key = `login_attempts_${username}`;
    const attempts = JSON.parse(localStorage.getItem(key) || '{"count": 0, "lastAttempt": 0, "lockedUntil": 0}');
    
    const now = Date.now();
    
    // Check if account is currently locked
    if (attempts.lockedUntil > now) {
      return false; // Account is locked
    }
    
    if (success) {
      // Reset on successful login
      localStorage.removeItem(key);
      return true;
    }
    
    // Increment failed attempts
    attempts.count += 1;
    attempts.lastAttempt = now;
    
    // Lock account if max attempts exceeded
    if (attempts.count >= this.MAX_LOGIN_ATTEMPTS) {
      attempts.lockedUntil = now + this.LOCKOUT_DURATION;
    }
    
    localStorage.setItem(key, JSON.stringify(attempts));
    
    return attempts.count < this.MAX_LOGIN_ATTEMPTS;
  }

  static getRemainingLockoutTime(username: string): number {
    const key = `login_attempts_${username}`;
    const attempts = JSON.parse(localStorage.getItem(key) || '{"lockedUntil": 0}');
    
    return Math.max(0, attempts.lockedUntil - Date.now());
  }

  // Session security
  static generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static encryptData(data: any): string {
    // Simple encryption for demo - in production use proper encryption
    const jsonString = JSON.stringify(data);
    return btoa(jsonString);
  }

  static decryptData(encryptedData: string): any {
    try {
      const jsonString = atob(encryptedData);
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Failed to decrypt data:', error);
      return null;
    }
  }

  // Secure session management
  static setSecureSession(userData: any): void {
    const sessionData = {
      ...userData,
      sessionId: this.generateSecureToken(),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.SESSION_TIMEOUT,
      csrfToken: this.generateSecureToken()
    };
    
    const encryptedSession = this.encryptData(sessionData);
    localStorage.setItem('secure_admin_session', encryptedSession);
    
    // Set session expiry check
    this.startSessionExpiryCheck();
  }

  static getSecureSession(): any {
    try {
      const encryptedSession = localStorage.getItem('secure_admin_session');
      if (!encryptedSession) return null;
      
      const sessionData = this.decryptData(encryptedSession);
      if (!sessionData) return null;
      
      // Check if session is expired
      if (Date.now() > sessionData.expiresAt) {
        this.clearSecureSession();
        return null;
      }
      
      return sessionData;
    } catch (error) {
      console.error('Session validation failed:', error);
      this.clearSecureSession();
      return null;
    }
  }

  static clearSecureSession(): void {
    localStorage.removeItem('secure_admin_session');
    localStorage.removeItem('adminUser'); // Clear legacy session
  }

  static refreshSession(): boolean {
    const session = this.getSecureSession();
    if (!session) return false;
    
    // Extend session
    session.expiresAt = Date.now() + this.SESSION_TIMEOUT;
    const encryptedSession = this.encryptData(session);
    localStorage.setItem('secure_admin_session', encryptedSession);
    
    return true;
  }

  private static startSessionExpiryCheck(): void {
    // Check session expiry every minute
    setInterval(() => {
      const session = this.getSecureSession();
      if (!session) {
        // Session expired, redirect to login
        window.location.href = '/login';
      }
    }, 60000);
  }

  // CSRF protection
  static generateCSRFToken(): string {
    return this.generateSecureToken();
  }

  static validateCSRFToken(token: string): boolean {
    const session = this.getSecureSession();
    return session && session.csrfToken === token;
  }

  // XSS protection
  static escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Content Security Policy headers
  static getCSPHeaders(): Record<string, string> {
    return {
      'Content-Security-Policy': `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live;
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com;
        img-src 'self' data: https:;
        connect-src 'self' https://*.supabase.co wss://*.supabase.co;
        frame-ancestors 'none';
        form-action 'self';
        base-uri 'self';
      `.replace(/\s+/g, ' ').trim(),
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
  }

  // Audit logging
  static logSecurityEvent(event: {
    type: 'login' | 'logout' | 'access_denied' | 'suspicious_activity';
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: any;
  }): void {
    const logEntry = {
      ...event,
      timestamp: new Date().toISOString(),
      sessionId: this.getSecureSession()?.sessionId || 'anonymous'
    };
    
    // In production, send to logging service
    console.log('Security Event:', logEntry);
    
    // Store locally for development
    const logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
    logs.push(logEntry);
    
    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }
    
    localStorage.setItem('security_logs', JSON.stringify(logs));
  }

  // Permission checking
  static hasPermission(requiredPermissions: string[], userRole: string): boolean {
    const rolePermissions: Record<string, string[]> = {
      'super_admin': ['*'],
      'transport_manager': ['routes', 'drivers', 'vehicles', 'schedules'],
      'finance_admin': ['payments', 'students', 'analytics'],
      'operations_admin': ['bookings', 'grievances', 'notifications'],
      'data_entry': ['students', 'bookings']
    };
    
    const userPermissions = rolePermissions[userRole] || [];
    
    // Super admin has all permissions
    if (userPermissions.includes('*')) {
      return true;
    }
    
    // Check if user has all required permissions
    return requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
  }

  // File upload security
  static validateFileUpload(file: File): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/csv'];
    
    if (file.size > maxSize) {
      errors.push('File size must be less than 10MB');
    }
    
    if (!allowedTypes.includes(file.type)) {
      errors.push('File type not allowed');
    }
    
    // Check file extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'csv'];
    
    if (!extension || !allowedExtensions.includes(extension)) {
      errors.push('File extension not allowed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Environment security check
  static checkEnvironmentSecurity(): { secure: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Check if running in production
    if (process.env.NODE_ENV !== 'production') {
      warnings.push('Application is not running in production mode');
    }
    
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      warnings.push('Supabase URL not configured');
    }
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      warnings.push('Supabase service role key not configured');
    }
    
    // Check HTTPS
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      warnings.push('Application should use HTTPS in production');
    }
    
    return {
      secure: warnings.length === 0,
      warnings
    };
  }

  // Initialize security features
  static initialize(): void {
    // Set up global error handling
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.logSecurityEvent({
          type: 'suspicious_activity',
          details: {
            error: event.error?.message,
            filename: event.filename,
            lineno: event.lineno
          }
        });
      });
      
      // Detect developer tools
      let devtools = { open: false };
      setInterval(() => {
        if (window.outerHeight - window.innerHeight > 200) {
          if (!devtools.open) {
            devtools.open = true;
            this.logSecurityEvent({
              type: 'suspicious_activity',
              details: { action: 'developer_tools_opened' }
            });
          }
        } else {
          devtools.open = false;
        }
      }, 1000);
    }
  }
}

// React hook for permission-based rendering
export function usePermissions(requiredPermissions: string[]) {
  const [hasAccess, setHasAccess] = React.useState(false);
  
  React.useEffect(() => {
    const session = SecurityEnhancements.getSecureSession();
    const userRole = session?.role || '';
    
    setHasAccess(SecurityEnhancements.hasPermission(requiredPermissions, userRole));
  }, [requiredPermissions]);
  
  return hasAccess;
}

// Security context for React components
export const SecurityContext = React.createContext({
  user: null as any,
  permissions: [] as string[],
  hasPermission: (permissions: string[]) => false,
  refreshSession: () => false
});

// Initialize security on module load
if (typeof window !== 'undefined') {
  SecurityEnhancements.initialize();
} 