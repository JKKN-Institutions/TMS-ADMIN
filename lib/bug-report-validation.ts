import { z } from 'zod';

// Validation schemas for bug reports
export const bugReportSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters long')
    .max(255, 'Title must be less than 255 characters')
    .trim(),
  
  description: z.string()
    .min(10, 'Description must be at least 10 characters long')
    .max(5000, 'Description must be less than 5000 characters')
    .trim(),
  
  category: z.enum(['ui_ux', 'functionality', 'performance', 'security', 'data', 'other'], {
    errorMap: () => ({ message: 'Invalid category selected' })
  }),
  
  priority: z.enum(['low', 'medium', 'high', 'critical'], {
    errorMap: () => ({ message: 'Invalid priority level selected' })
  }),
  
  reportedBy: z.string()
    .uuid('Invalid user ID format'),
  
  reporterType: z.enum(['student', 'admin'], {
    errorMap: () => ({ message: 'Invalid reporter type' })
  }),
  
  reporterName: z.string()
    .min(1, 'Reporter name is required')
    .max(255, 'Reporter name is too long')
    .optional(),
  
  reporterEmail: z.string()
    .email('Invalid email format')
    .optional(),
  
  pageUrl: z.string()
    .url('Invalid page URL format')
    .optional(),
  
  browserInfo: z.string()
    .max(1000, 'Browser info is too long')
    .optional(),
  
  deviceInfo: z.string()
    .max(1000, 'Device info is too long')
    .optional(),
  
  screenResolution: z.string()
    .regex(/^\d+x\d+$/, 'Invalid screen resolution format')
    .optional(),
  
  userAgent: z.string()
    .max(2000, 'User agent is too long')
    .optional()
});

export const bugUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'duplicate', 'wont_fix']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigned_to: z.string().uuid().optional(),
  resolution_notes: z.string().max(2000, 'Resolution notes are too long').optional(),
  resolved_at: z.string().datetime().optional()
});

export const bugCommentSchema = z.object({
  comment: z.string()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment is too long')
    .trim(),
  
  is_internal: z.boolean().optional().default(false),
  
  author_id: z.string()
    .uuid('Invalid author ID format'),
  
  author_type: z.enum(['student', 'admin'], {
    errorMap: () => ({ message: 'Invalid author type' })
  }),
  
  author_name: z.string()
    .min(1, 'Author name is required')
    .max(255, 'Author name is too long')
});

// File validation for screenshots
export const validateScreenshotFile = (file: File): { isValid: boolean; error?: string } => {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'
    };
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File size too large. Maximum allowed size is 5MB.'
    };
  }

  // Check file name
  if (file.name.length > 255) {
    return {
      isValid: false,
      error: 'File name is too long. Maximum 255 characters allowed.'
    };
  }

  return { isValid: true };
};

// Sanitize HTML content to prevent XSS
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Rate limiting helper
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }

  getResetTime(identifier: string): number {
    const requests = this.requests.get(identifier) || [];
    if (requests.length === 0) return 0;
    
    const oldestRequest = Math.min(...requests);
    return oldestRequest + this.windowMs;
  }
}

// Create rate limiter instances
export const bugReportRateLimiter = new RateLimiter(5, 60000); // 5 bug reports per minute
export const commentRateLimiter = new RateLimiter(20, 60000); // 20 comments per minute

// Error response helper
export const createErrorResponse = (
  message: string,
  status: number = 400,
  details?: any
) => {
  return {
    error: message,
    status,
    details,
    timestamp: new Date().toISOString()
  };
};

// Success response helper
export const createSuccessResponse = (
  data: any,
  message: string = 'Operation successful'
) => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};
