// Performance Optimization Utilities for TMS Admin Application
import React from 'react';
import { supabase } from './supabase';

export class PerformanceOptimizer {
  private static cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private static readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  // Cache management
  static setCache(key: string, data: any, ttl: number = this.DEFAULT_TTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  static getCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > cached.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  static clearCache(pattern?: string) {
    if (pattern) {
      const keysToDelete = Array.from(this.cache.keys()).filter(key => 
        key.includes(pattern)
      );
      keysToDelete.forEach(key => this.cache.delete(key));
    } else {
      this.cache.clear();
    }
  }

  // Database query optimization
  static async optimizedQuery<T>(
    queryFn: () => Promise<T>,
    cacheKey: string,
    ttl?: number
  ): Promise<T> {
    // Check cache first
    const cached = this.getCache(cacheKey);
    if (cached) {
      console.log(`Cache hit for: ${cacheKey}`);
      return cached;
    }

    // Execute query
    console.log(`Cache miss, executing query for: ${cacheKey}`);
    const startTime = performance.now();
    
    try {
      const result = await queryFn();
      const endTime = performance.now();
      
      console.log(`Query executed in ${endTime - startTime}ms for: ${cacheKey}`);
      
      // Cache the result
      this.setCache(cacheKey, result, ttl);
      
      return result;
    } catch (error) {
      console.error(`Query failed for ${cacheKey}:`, error);
      throw error;
    }
  }

  // Batch operations for better performance
  static async batchQuery<T>(
    queries: Array<{
      key: string;
      query: () => Promise<T>;
      ttl?: number;
    }>
  ): Promise<Record<string, T>> {
    const results: Record<string, T> = {};
    const uncachedQueries: typeof queries = [];

    // Check cache for all queries
    for (const query of queries) {
      const cached = this.getCache(query.key);
      if (cached) {
        results[query.key] = cached;
      } else {
        uncachedQueries.push(query);
      }
    }

    // Execute uncached queries in parallel
    if (uncachedQueries.length > 0) {
      const promises = uncachedQueries.map(async (query) => {
        try {
          const result = await query.query();
          this.setCache(query.key, result, query.ttl);
          return { key: query.key, result };
        } catch (error) {
          console.error(`Batch query failed for ${query.key}:`, error);
          throw error;
        }
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ key, result }) => {
        results[key] = result;
      });
    }

    return results;
  }

  // Database connection pooling simulation
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError!;
  }

  // Optimized dashboard data fetching
  static async getDashboardDataOptimized() {
    const queries = [
      {
        key: 'dashboard-stats',
        query: async () => {
          const [students, drivers, routes, vehicles, bookings, payments] = await Promise.all([
            supabase.from('students').select('id', { count: 'exact', head: true }),
            supabase.from('drivers').select('id', { count: 'exact', head: true }),
            supabase.from('routes').select('id', { count: 'exact', head: true }),
            supabase.from('vehicles').select('id', { count: 'exact', head: true }),
            supabase.from('bookings').select('id', { count: 'exact', head: true }),
            supabase.from('payments').select('amount').eq('status', 'completed')
          ]);

          return {
            totalStudents: students.count || 0,
            totalDrivers: drivers.count || 0,
            totalRoutes: routes.count || 0,
            totalVehicles: vehicles.count || 0,
            totalBookings: bookings.count || 0,
            totalRevenue: payments.data?.reduce((sum, p) => sum + p.amount, 0) || 0
          };
        },
        ttl: 2 * 60 * 1000 // 2 minutes
      },
      {
        key: 'recent-activities',
        query: async () => {
          const { data } = await supabase
            .from('bookings')
            .select(`
              id,
              created_at,
              status,
              students(student_name),
              routes(route_name)
            `)
            .order('created_at', { ascending: false })
            .limit(10);
          
          return data || [];
        },
        ttl: 1 * 60 * 1000 // 1 minute
      },
      {
        key: 'critical-alerts',
        query: async () => {
          // Mock critical alerts - in real app, this would check various conditions
          return [
            {
              id: 'maintenance-alert',
              type: 'maintenance',
              message: 'Vehicle maintenance due',
              severity: 'high'
            }
          ];
        },
        ttl: 5 * 60 * 1000 // 5 minutes
      }
    ];

    return await this.batchQuery(queries);
  }

  // Image optimization
  static optimizeImageUrl(url: string, width?: number, height?: number, quality: number = 80): string {
    if (!url) return url;
    
    // For Supabase storage or other image services
    const params = new URLSearchParams();
    if (width) params.append('width', width.toString());
    if (height) params.append('height', height.toString());
    params.append('quality', quality.toString());
    
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${params.toString()}`;
  }

  // Debounce utility for search inputs
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Throttle utility for scroll events
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Virtual scrolling helper for large lists
  static calculateVisibleItems(
    scrollTop: number,
    containerHeight: number,
    itemHeight: number,
    totalItems: number,
    overscan: number = 5
  ) {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      totalItems - 1,
      Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    return {
      startIndex,
      endIndex,
      visibleItems: endIndex - startIndex + 1
    };
  }

  // Memory usage monitoring
  static getMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1048576), // MB
        total: Math.round(memory.totalJSHeapSize / 1048576), // MB
        limit: Math.round(memory.jsHeapSizeLimit / 1048576) // MB
      };
    }
    return null;
  }

  // Performance monitoring
  static startPerformanceTimer(label: string) {
    performance.mark(`${label}-start`);
  }

  static endPerformanceTimer(label: string) {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    
    const measures = performance.getEntriesByName(label);
    const latestMeasure = measures[measures.length - 1];
    
    console.log(`Performance: ${label} took ${latestMeasure.duration.toFixed(2)}ms`);
    
    // Clean up marks and measures
    performance.clearMarks(`${label}-start`);
    performance.clearMarks(`${label}-end`);
    performance.clearMeasures(label);
    
    return latestMeasure.duration;
  }

  // Bundle size analysis helper
  static async analyzeBundleSize() {
    if (process.env.NODE_ENV === 'development') {
      const chunks = document.querySelectorAll('script[src]');
      let totalSize = 0;
      
      for (const chunk of chunks) {
        try {
          const src = (chunk as HTMLScriptElement).src;
          const response = await fetch(src, { method: 'HEAD' });
          const size = parseInt(response.headers.get('content-length') || '0');
          totalSize += size;
        } catch (error) {
          console.warn('Could not analyze chunk size:', error);
        }
      }
      
      console.log(`Total JavaScript bundle size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      return totalSize;
    }
    return 0;
  }

  // Cleanup utilities
  static cleanup() {
    this.clearCache();
    
    // Clear performance entries
    if (performance.clearResourceTimings) {
      performance.clearResourceTimings();
    }
    
    console.log('Performance optimizer cleanup completed');
  }
}

// React hook for optimized data fetching
export function useOptimizedQuery<T>(
  queryFn: () => Promise<T>,
  cacheKey: string,
  dependencies: any[] = [],
  ttl?: number
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await PerformanceOptimizer.optimizedQuery(
          queryFn,
          cacheKey,
          ttl
        );
        
        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, dependencies);

  return { data, loading, error };
}

// Export for global use
if (typeof window !== 'undefined') {
  (window as any).PerformanceOptimizer = PerformanceOptimizer;
} 