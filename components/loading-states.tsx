'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';

// Loading Spinner Variants
export const LoadingSpinner = ({ 
  size = 'md', 
  color = 'blue',
  className = '' 
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'white';
  className?: string;
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    white: 'text-white'
  };

  return (
    <Loader2 
      className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]} ${className}`} 
    />
  );
};

// Pulse Loading Animation
export const PulseLoader = ({ 
  count = 3, 
  color = 'blue',
  className = '' 
}: {
  count?: number;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'white';
  className?: string;
}) => {
  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    red: 'bg-red-600',
    orange: 'bg-orange-600',
    purple: 'bg-purple-600',
    white: 'bg-white'
  };

  return (
    <div className={`flex space-x-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-3 h-3 rounded-full ${colorClasses[color]}`}
          animate={{
            scale: [0.8, 1.2, 0.8],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.2
          }}
        />
      ))}
    </div>
  );
};

// Progress Bar with Animation
export const AnimatedProgressBar = ({ 
  progress, 
  color = 'blue',
  showPercentage = true,
  className = '' 
}: {
  progress: number;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple';
  showPercentage?: boolean;
  className?: string;
}) => {
  const colorClasses = {
    blue: 'from-blue-400 to-blue-600',
    green: 'from-green-400 to-green-600',
    red: 'from-red-400 to-red-600',
    orange: 'from-orange-400 to-orange-600',
    purple: 'from-purple-400 to-purple-600'
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">Progress</span>
        {showPercentage && (
          <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <motion.div
          className={`h-2.5 bg-gradient-to-r ${colorClasses[color]} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
};

// Skeleton Loading Components
export const SkeletonText = ({ 
  lines = 1, 
  className = '' 
}: {
  lines?: number;
  className?: string;
}) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={`h-4 bg-gray-200 rounded animate-pulse ${
          i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
        }`}
      />
    ))}
  </div>
);

export const SkeletonCard = ({ className = '' }: { className?: string }) => (
  <div className={`bg-white rounded-xl p-6 shadow-sm border border-gray-200 ${className}`}>
    <div className="animate-pulse">
      <div className="flex items-center space-x-4 mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        <div className="h-4 bg-gray-200 rounded w-4/6"></div>
      </div>
    </div>
  </div>
);

export const SkeletonTable = ({ 
  rows = 5, 
  columns = 4,
  className = '' 
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    <div className="animate-pulse">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="px-6 py-4 border-b border-gray-100 last:border-b-0">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={colIndex} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Loading Overlay
export const LoadingOverlay = ({ 
  isVisible, 
  message = 'Loading...', 
  size = 'md',
  className = '' 
}: {
  isVisible: boolean;
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => (
  <AnimatePresence>
    {isVisible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 ${className}`}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm mx-4"
        >
          <div className="text-center">
            <LoadingSpinner size={size} className="mx-auto mb-4" />
            <p className="text-gray-700 font-medium">{message}</p>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Button Loading States
export const LoadingButton = ({
  children,
  isLoading = false,
  loadingText = 'Loading...',
  variant = 'primary',
  disabled = false,
  className = '',
  ...props
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  disabled?: boolean;
  className?: string;
  [key: string]: any;
}) => {
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    danger: 'btn-danger'
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`${variantClasses[variant]} ${className} ${
        isLoading ? 'cursor-not-allowed' : ''
      }`}
    >
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center space-x-2"
          >
            <LoadingSpinner size="sm" color="white" />
            <span>{loadingText}</span>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
};

// Status Animation
export const StatusAnimation = ({ 
  status, 
  size = 'md',
  className = '' 
}: {
  status: 'loading' | 'success' | 'error' | 'idle';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const statusConfig = {
    loading: { icon: Clock, color: 'text-blue-600', animation: 'animate-spin' },
    success: { icon: CheckCircle, color: 'text-green-600', animation: 'animate-bounce' },
    error: { icon: AlertCircle, color: 'text-red-600', animation: 'animate-pulse' },
    idle: { icon: Zap, color: 'text-gray-400', animation: '' }
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.div
      key={status}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={className}
    >
      <Icon className={`${sizeClasses[size]} ${config.color} ${config.animation}`} />
    </motion.div>
  );
};

// Shimmer Effect for Images/Content
export const ShimmerPlaceholder = ({ 
  width = '100%', 
  height = '200px',
  className = '' 
}: {
  width?: string;
  height?: string;
  className?: string;
}) => (
  <div
    className={`bg-gray-200 rounded-xl overflow-hidden relative ${className}`}
    style={{ width, height }}
  >
    <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-shimmer bg-[length:200%_100%]" />
  </div>
);

// Page Transition Wrapper
export const PageTransition = ({ 
  children, 
  className = '' 
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Stagger Animation for Lists
export const StaggerContainer = ({ 
  children, 
  staggerDelay = 0.1,
  className = '' 
}: {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: staggerDelay
        }
      }
    }}
    className={className}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({ 
  children, 
  className = '' 
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 }
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// Enhanced CSS classes for shimmer animation
export const shimmerStyles = `
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
  
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
`; 