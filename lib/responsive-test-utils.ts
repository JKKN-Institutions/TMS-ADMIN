// Responsive testing utilities for development and testing

export interface ViewportSize {
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
}

export const COMMON_VIEWPORTS: ViewportSize[] = [
  // Mobile
  { name: 'iPhone SE', width: 375, height: 667, type: 'mobile' },
  { name: 'iPhone 12', width: 390, height: 844, type: 'mobile' },
  { name: 'iPhone 12 Pro Max', width: 428, height: 926, type: 'mobile' },
  { name: 'Samsung Galaxy S20', width: 360, height: 800, type: 'mobile' },
  
  // Tablet
  { name: 'iPad', width: 768, height: 1024, type: 'tablet' },
  { name: 'iPad Pro', width: 1024, height: 1366, type: 'tablet' },
  { name: 'Surface Pro', width: 912, height: 1368, type: 'tablet' },
  
  // Desktop
  { name: 'MacBook Air', width: 1366, height: 768, type: 'desktop' },
  { name: 'Full HD', width: 1920, height: 1080, type: 'desktop' },
  { name: '4K', width: 3840, height: 2160, type: 'desktop' }
];

export interface ResponsiveIssue {
  element: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  viewport: string;
  recommendation: string;
}

export class ResponsiveChecker {
  private issues: ResponsiveIssue[] = [];

  // Check for horizontal scroll on mobile
  checkHorizontalScroll(): ResponsiveIssue[] {
    const issues: ResponsiveIssue[] = [];
    const body = document.body;
    
    if (body.scrollWidth > window.innerWidth) {
      issues.push({
        element: 'body',
        issue: 'Horizontal scroll detected',
        severity: 'high',
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        recommendation: 'Add overflow-x-hidden or fix element widths'
      });
    }

    return issues;
  }

  // Check for touch target sizes
  checkTouchTargets(): ResponsiveIssue[] {
    const issues: ResponsiveIssue[] = [];
    const clickableElements = document.querySelectorAll('button, a, input[type="checkbox"], input[type="radio"]');
    
    clickableElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const minSize = 44; // WCAG recommendation
      
      if (rect.width < minSize || rect.height < minSize) {
        issues.push({
          element: element.tagName.toLowerCase(),
          issue: `Touch target too small: ${rect.width}x${rect.height}px`,
          severity: 'medium',
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          recommendation: `Increase size to at least ${minSize}x${minSize}px`
        });
      }
    });

    return issues;
  }

  // Check for text readability
  checkTextReadability(): ResponsiveIssue[] {
    const issues: ResponsiveIssue[] = [];
    const textElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6');
    
    textElements.forEach((element) => {
      const styles = window.getComputedStyle(element);
      const fontSize = parseFloat(styles.fontSize);
      
      if (fontSize < 16 && window.innerWidth < 768) {
        issues.push({
          element: element.tagName.toLowerCase(),
          issue: `Text too small on mobile: ${fontSize}px`,
          severity: 'medium',
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          recommendation: 'Use minimum 16px font size on mobile'
        });
      }
    });

    return issues;
  }

  // Check for overflowing content
  checkOverflow(): ResponsiveIssue[] {
    const issues: ResponsiveIssue[] = [];
    const elements = document.querySelectorAll('*');
    
    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      
      if (rect.right > window.innerWidth) {
        issues.push({
          element: element.tagName.toLowerCase() + (element.className ? `.${element.className.split(' ')[0]}` : ''),
          issue: 'Element overflows viewport width',
          severity: 'high',
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          recommendation: 'Check for fixed widths or missing responsive classes'
        });
      }
    });

    return issues;
  }

  // Check for missing responsive images
  checkImages(): ResponsiveIssue[] {
    const issues: ResponsiveIssue[] = [];
    const images = document.querySelectorAll('img');
    
    images.forEach((img) => {
      if (!img.style.maxWidth && !img.classList.contains('w-full') && !img.classList.contains('max-w-full')) {
        issues.push({
          element: 'img',
          issue: 'Image may not be responsive',
          severity: 'low',
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          recommendation: 'Add max-width: 100% or responsive classes'
        });
      }
    });

    return issues;
  }

  // Run all checks
  runAllChecks(): ResponsiveIssue[] {
    return [
      ...this.checkHorizontalScroll(),
      ...this.checkTouchTargets(),
      ...this.checkTextReadability(),
      ...this.checkOverflow(),
      ...this.checkImages()
    ];
  }

  // Get recommendations for viewport
  getViewportRecommendations(viewport: ViewportSize): string[] {
    const recommendations: string[] = [];
    
    switch (viewport.type) {
      case 'mobile':
        recommendations.push(
          'Ensure touch targets are at least 44px',
          'Use single-column layouts',
          'Minimize text input requirements',
          'Make navigation thumb-friendly',
          'Test in landscape mode'
        );
        break;
      case 'tablet':
        recommendations.push(
          'Consider 2-column layouts',
          'Optimize for both portrait and landscape',
          'Make use of additional screen space',
          'Test touch and mouse interactions'
        );
        break;
      case 'desktop':
        recommendations.push(
          'Use multi-column layouts effectively',
          'Ensure content doesn\'t stretch too wide',
          'Make good use of white space',
          'Test keyboard navigation'
        );
        break;
    }
    
    return recommendations;
  }
}

// Utility to simulate different viewport sizes for testing
export const simulateViewport = (viewport: ViewportSize) => {
  // This would be used in testing environments
  if (typeof window !== 'undefined') {
    // Note: This is for development testing only
    console.log(`Simulating ${viewport.name}: ${viewport.width}x${viewport.height}`);
  }
};

// Breakpoint utilities matching Tailwind defaults
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
} as const;

export const getCurrentBreakpoint = (): keyof typeof BREAKPOINTS | 'xs' => {
  if (typeof window === 'undefined') return 'lg';
  
  const width = window.innerWidth;
  
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
};

// Helper to check if element is visible in viewport
export const isElementInViewport = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
};

// Development helper to log responsive issues
export const logResponsiveIssues = () => {
  if (process.env.NODE_ENV === 'development') {
    const checker = new ResponsiveChecker();
    const issues = checker.runAllChecks();
    
    if (issues.length > 0) {
      console.group('🔍 Responsive Issues Found');
      issues.forEach(issue => {
        const emoji = issue.severity === 'high' ? '🚨' : issue.severity === 'medium' ? '⚠️' : 'ℹ️';
        console.log(`${emoji} ${issue.element}: ${issue.issue}`);
        console.log(`   💡 ${issue.recommendation}`);
      });
      console.groupEnd();
    } else {
      console.log('✅ No responsive issues detected');
    }
  }
}; 