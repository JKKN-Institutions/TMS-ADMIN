'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  EyeOff, 
  Check, 
  X, 
  AlertCircle, 
  Search, 
  Calendar, 
  ChevronDown,
  Upload,
  Trash2,
  Plus,
  Info,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  CreditCard,
  FileText,
  Image,
  Paperclip
} from 'lucide-react';

// Enhanced Input Component
interface EnhancedInputProps {
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
  className?: string;
  autoComplete?: string;
  maxLength?: number;
  onValidate?: (value: string) => string | undefined;
}

export const EnhancedInput: React.FC<EnhancedInputProps> = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  icon: Icon,
  hint,
  className = '',
  autoComplete,
  maxLength,
  onValidate
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(error);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalError(error);
  }, [error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    if (onValidate) {
      const validationError = onValidate(newValue);
      setLocalError(validationError);
    }
  };

  const inputType = type === 'password' && showPassword ? 'text' : type;
  const hasError = Boolean(localError);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label */}
      <label className="block text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Input Container */}
      <div className="relative">
        <div className={`
          relative flex items-center rounded-xl border-2 transition-all duration-200 
          ${hasError 
            ? 'border-red-300 bg-red-50' 
            : isFocused 
              ? 'border-blue-300 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}>
          {/* Left Icon */}
          {Icon && (
            <div className="absolute left-3 flex items-center">
              <Icon className={`w-5 h-5 ${hasError ? 'text-red-400' : isFocused ? 'text-blue-400' : 'text-gray-400'}`} />
            </div>
          )}

          {/* Input */}
          <input
            ref={inputRef}
            type={inputType}
            placeholder={placeholder}
            value={value}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            maxLength={maxLength}
            className={`
              w-full py-3 px-4 text-sm bg-transparent outline-none placeholder-gray-400
              ${Icon ? 'pl-12' : ''}
              ${type === 'password' ? 'pr-12' : ''}
              ${disabled ? 'cursor-not-allowed' : ''}
            `}
          />

          {/* Password Toggle */}
          {type === 'password' && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}

          {/* Validation Icon */}
          {!hasError && value && (
            <div className="absolute right-3 flex items-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
          )}
        </div>

        {/* Character Count */}
        {maxLength && (
          <div className="absolute right-3 top-full mt-1 text-xs text-gray-400">
            {value.length}/{maxLength}
          </div>
        )}
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {hasError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center space-x-2 text-red-600 text-sm"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{localError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      {hint && !hasError && (
        <div className="flex items-center space-x-2 text-gray-500 text-sm">
          <Info className="w-4 h-4" />
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
};

// Enhanced Select Component
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

interface EnhancedSelectProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  className?: string;
}

export const EnhancedSelect: React.FC<EnhancedSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  error,
  disabled = false,
  required = false,
  searchable = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const filteredOptions = searchable
    ? options.filter(option => 
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  const selectedOption = options.find(opt => opt.value === value);
  const hasError = Boolean(error);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`space-y-2 ${className}`} ref={selectRef}>
      {/* Label */}
      <label className="block text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Select Container */}
      <div className="relative">
        <div
          className={`
            relative flex items-center justify-between rounded-xl border-2 transition-all duration-200 cursor-pointer
            ${hasError 
              ? 'border-red-300 bg-red-50' 
              : isFocused || isOpen
                ? 'border-blue-300 bg-blue-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => {
            if (!disabled) {
              setIsOpen(!isOpen);
              setIsFocused(true);
            }
          }}
        >
          <div className="flex items-center flex-1 py-3 px-4">
            {selectedOption?.icon && (
              <selectedOption.icon className="w-5 h-5 mr-3 text-gray-400" />
            )}
            <span className={`text-sm ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          
          <div className="pr-4">
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Dropdown */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-xl z-50 max-h-60 overflow-hidden"
            >
              {/* Search */}
              {searchable && (
                <div className="p-3 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search options..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Options */}
              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`
                      flex items-center px-4 py-3 text-sm cursor-pointer transition-colors
                      ${option.disabled 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:bg-gray-50'
                      }
                      ${option.value === value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}
                    `}
                    onClick={() => {
                      if (!option.disabled) {
                        handleSelect(option.value);
                      }
                    }}
                  >
                    {option.icon && (
                      <option.icon className="w-4 h-4 mr-3" />
                    )}
                    <span className="flex-1">{option.label}</span>
                    {option.value === value && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                ))}
                
                {filteredOptions.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    No options found
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {hasError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center space-x-2 text-red-600 text-sm"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Enhanced Textarea Component
interface EnhancedTextareaProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
  hint?: string;
}

export const EnhancedTextarea: React.FC<EnhancedTextareaProps> = ({
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  rows = 4,
  maxLength,
  className = '',
  hint
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(error);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label */}
      <label className="block text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Textarea Container */}
      <div className="relative">
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          required={required}
          rows={rows}
          maxLength={maxLength}
          className={`
            w-full py-3 px-4 text-sm rounded-xl border-2 transition-all duration-200 resize-none
            ${hasError 
              ? 'border-red-300 bg-red-50' 
              : isFocused 
                ? 'border-blue-300 bg-blue-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            focus:outline-none placeholder-gray-400
          `}
        />

        {/* Character Count */}
        {maxLength && (
          <div className="absolute right-3 bottom-3 text-xs text-gray-400">
            {value.length}/{maxLength}
          </div>
        )}
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {hasError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center space-x-2 text-red-600 text-sm"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint */}
      {hint && !hasError && (
        <div className="flex items-center space-x-2 text-gray-500 text-sm">
          <Info className="w-4 h-4" />
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
};

// Enhanced Button Component
interface EnhancedButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export const EnhancedButton: React.FC<EnhancedButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  icon: Icon,
  className = ''
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 focus:ring-blue-500 shadow-lg hover:shadow-xl',
    secondary: 'bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-gray-600 hover:to-gray-700 focus:ring-gray-500 shadow-lg hover:shadow-xl',
    outline: 'border-2 border-blue-500 text-blue-500 hover:bg-blue-50 focus:ring-blue-500',
    ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
    danger: 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 focus:ring-red-500 shadow-lg hover:shadow-xl'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      )}
      {Icon && !loading && (
        <Icon className="w-4 h-4 mr-2" />
      )}
      {children}
    </motion.button>
  );
};

// Form validation utilities
export const validators = {
  required: (value: string) => {
    return value.trim() === '' ? 'This field is required' : undefined;
  },
  
  email: (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return !emailRegex.test(value) ? 'Please enter a valid email address' : undefined;
  },
  
  phone: (value: string) => {
    const phoneRegex = /^[+]?[\d\s\-\(\)]{10,}$/;
    return !phoneRegex.test(value) ? 'Please enter a valid phone number' : undefined;
  },
  
  minLength: (min: number) => (value: string) => {
    return value.length < min ? `Must be at least ${min} characters` : undefined;
  },
  
  maxLength: (max: number) => (value: string) => {
    return value.length > max ? `Must not exceed ${max} characters` : undefined;
  }
}; 