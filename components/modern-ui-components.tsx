'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

// Modern Button Components
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  fullWidth = false,
  className = ''
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variants = {
    primary: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500 shadow-sm hover:shadow-md',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 focus:ring-gray-500',
    ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-sm hover:shadow-md'
  };
  
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  const classes = `
    ${baseClasses}
    ${variants[variant]}
    ${sizes[size]}
    ${fullWidth ? 'w-full' : ''}
    ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:transform hover:-translate-y-0.5'}
    ${className}
  `.trim();

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      className={classes}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
      )}
      {Icon && !loading && (
        <Icon className="w-4 h-4 mr-2" />
      )}
      {children}
    </motion.button>
  );
};

// Modern Card Component
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  shadow?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  hover = true,
  shadow = 'md'
}) => {
  const paddings = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  };
  
  const shadows = {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl'
  };
  
  const classes = `
    bg-white border border-gray-200 rounded-2xl transition-all duration-200
    ${paddings[padding]}
    ${shadows[shadow]}
    ${hover ? 'hover:shadow-lg hover:-translate-y-1' : ''}
    ${className}
  `.trim();

  return (
    <motion.div
      className={classes}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
};

// Modern Badge Component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = ''
}) => {
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800'
  };
  
  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1.5 text-sm'
  };
  
  const classes = `
    inline-flex items-center font-medium rounded-full
    ${variants[variant]}
    ${sizes[size]}
    ${className}
  `.trim();

  return (
    <span className={classes}>
      {children}
    </span>
  );
};

// Modern Input Component
interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: 'text' | 'email' | 'password' | 'number' | 'search';
  disabled?: boolean;
  error?: string;
  icon?: LucideIcon;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  disabled = false,
  error,
  icon: Icon,
  className = ''
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            block w-full rounded-lg border transition-colors duration-200
            ${Icon ? 'pl-10' : 'pl-3'} pr-3 py-2.5
            ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 
              'border-gray-300 focus:border-green-500 focus:ring-green-500'}
            ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-900'}
            focus:ring-2 focus:ring-offset-0 focus:outline-none
          `.trim()}
        />
      </div>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

// Modern Progress Component
interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'green' | 'blue' | 'purple' | 'yellow' | 'red';
  showValue?: boolean;
  animated?: boolean;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  size = 'md',
  color = 'green',
  showValue = false,
  animated = true,
  className = ''
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  const sizes = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };
  
  const colors = {
    green: 'bg-green-600',
    blue: 'bg-blue-600',
    purple: 'bg-purple-600',
    yellow: 'bg-yellow-600',
    red: 'bg-red-600'
  };
  
  return (
    <div className={`space-y-2 ${className}`}>
      {showValue && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium text-gray-900">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${sizes[size]}`}>
        <motion.div
          className={`${colors[color]} ${sizes[size]} rounded-full transition-all duration-500`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: animated ? 0.8 : 0, ease: "easeOut" }}
        />
      </div>
    </div>
  );
};

// Modern Avatar Component
interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away' | 'busy';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  status,
  className = ''
}) => {
  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-16 h-16 text-xl'
  };
  
  const statusColors = {
    online: 'bg-green-400',
    offline: 'bg-gray-400',
    away: 'bg-yellow-400',
    busy: 'bg-red-400'
  };
  
  const statusSizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4'
  };
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };
  
  return (
    <div className={`relative inline-flex ${className}`}>
      <div className={`
        ${sizes[size]} 
        rounded-full flex items-center justify-center font-medium
        ${src ? '' : 'bg-green-600 text-white'}
      `}>
        {src ? (
          <img
            src={src}
            alt={alt || name}
            className={`${sizes[size]} rounded-full object-cover`}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <span>{name ? getInitials(name) : '?'}</span>
        )}
      </div>
      
      {status && (
        <div className={`
          absolute -bottom-0.5 -right-0.5 
          ${statusSizes[size]} 
          ${statusColors[status]} 
          rounded-full border-2 border-white
        `} />
      )}
    </div>
  );
};

// Modern Select Component
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  error,
  className = ''
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={`
          block w-full rounded-lg border transition-colors duration-200
          px-3 py-2.5 text-gray-900 appearance-none
          ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 
            'border-gray-300 focus:border-green-500 focus:ring-green-500'}
          ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white cursor-pointer'}
          focus:ring-2 focus:ring-offset-0 focus:outline-none
        `.trim()}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

// Modern Alert Component
interface AlertProps {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  icon?: LucideIcon;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  variant = 'info',
  title,
  icon: Icon,
  onClose,
  className = ''
}) => {
  const variants = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    danger: 'bg-red-50 border-red-200 text-red-800'
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`
        rounded-lg border p-4 relative
        ${variants[variant]}
        ${className}
      `.trim()}
    >
      <div className="flex items-start space-x-3">
        {Icon && (
          <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1">
          {title && (
            <h4 className="font-medium mb-1">{title}</h4>
          )}
          <div className="text-sm">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 hover:bg-black/10 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Modern Loading Spinner Component
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'green' | 'blue' | 'gray';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  color = 'green',
  className = ''
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };
  
  const colors = {
    green: 'border-green-600',
    blue: 'border-blue-600',
    gray: 'border-gray-600'
  };
  
  return (
    <div
      className={`
        animate-spin rounded-full border-2 border-transparent border-t-current
        ${sizes[size]}
        ${colors[color]}
        ${className}
      `.trim()}
    />
  );
};

// Modern Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = ''
}) => {
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`
            inline-block w-full transform overflow-hidden rounded-2xl
            bg-white text-left align-bottom shadow-xl transition-all
            sm:my-8 sm:align-middle
            ${sizes[size]}
            ${className}
          `.trim()}
        >
          <div className="bg-white px-6 pt-6 pb-4">
            {title && (
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}; 