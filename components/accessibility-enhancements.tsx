'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Focus Management Hook
export const useFocusManagement = () => {
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const trapFocus = (containerRef: React.RefObject<HTMLElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  };

  const saveFocus = () => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  };

  const restoreFocus = () => {
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  };

  return { trapFocus, saveFocus, restoreFocus, focusedElement, setFocusedElement };
};

// Screen Reader Announcer
export const ScreenReaderAnnouncer: React.FC<{
  message: string;
  priority?: 'polite' | 'assertive';
  className?: string;
}> = ({ message, priority = 'polite', className = '' }) => {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className={`sr-only ${className}`}
    >
      {message}
    </div>
  );
};

// Skip Link Component
export const SkipLink: React.FC<{
  href: string;
  children: React.ReactNode;
}> = ({ href, children }) => {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-md font-medium"
    >
      {children}
    </a>
  );
};

// Accessible Modal
export const AccessibleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ isOpen, onClose, title, children, className = '' }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { trapFocus, saveFocus, restoreFocus } = useFocusManagement();

  useEffect(() => {
    if (isOpen) {
      saveFocus();
      const cleanup = trapFocus(modalRef);
      // Focus first focusable element
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      firstFocusable?.focus();

      return cleanup;
    } else {
      restoreFocus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`relative bg-white rounded-xl p-6 max-w-md w-full mx-4 ${className}`}
      >
        <h2 id="modal-title" className="text-xl font-bold mb-4">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};

// Accessible Button
export const AccessibleButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
}> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  ariaLabel,
  ariaDescribedBy,
  className = ''
}) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      className={`
        ${variants[variant]} ${sizes[size]}
        rounded-lg font-medium transition-colors duration-200
        focus:outline-none focus:ring-2 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {children}
    </button>
  );
};

// Accessible Form Input
export const AccessibleInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
}> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  error,
  hint,
  className = ''
}) => {
  const inputId = `input-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = `error-${inputId}`;
  const hintId = `hint-${inputId}`;

  return (
    <div className={`space-y-1 ${className}`}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
      </label>
      
      {hint && (
        <p id={hintId} className="text-sm text-gray-600">
          {hint}
        </p>
      )}
      
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`
          w-full px-3 py-2 border rounded-lg
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      />
      
      {error && (
        <p id={errorId} className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

// Accessible Select
export const AccessibleSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
}> = ({
  label,
  value,
  onChange,
  options,
  required = false,
  disabled = false,
  error,
  hint,
  className = ''
}) => {
  const selectId = `select-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = `error-${selectId}`;
  const hintId = `hint-${selectId}`;

  return (
    <div className={`space-y-1 ${className}`}>
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
      </label>
      
      {hint && (
        <p id={hintId} className="text-sm text-gray-600">
          {hint}
        </p>
      )}
      
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`
          w-full px-3 py-2 border rounded-lg
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-gray-300'}
        `}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      
      {error && (
        <p id={errorId} className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

// Accessible Table
export const AccessibleTable: React.FC<{
  caption: string;
  headers: Array<{ key: string; label: string; sortable?: boolean }>;
  data: Array<Record<string, any>>;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  className?: string;
}> = ({
  caption,
  headers,
  data,
  sortColumn,
  sortDirection,
  onSort,
  className = ''
}) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200" role="table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header) => (
              <th
                key={header.key}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  header.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                }`}
                onClick={header.sortable ? () => onSort?.(header.key) : undefined}
                aria-sort={
                  sortColumn === header.key
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {header.label}
                {header.sortable && sortColumn === header.key && (
                  <span className="ml-2" aria-hidden="true">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, index) => (
            <tr key={index} className="hover:bg-gray-50">
              {headers.map((header) => (
                <td
                  key={header.key}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {row[header.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Accessible Tabs
export const AccessibleTabs: React.FC<{
  tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}> = ({ tabs, activeTab, onTabChange, className = '' }) => {
  return (
    <div className={className}>
      <div role="tablist" className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          className="mt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
};

// High Contrast Mode Toggle
export const HighContrastToggle: React.FC<{
  className?: string;
}> = ({ className = '' }) => {
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('highContrast');
    if (saved === 'true') {
      setHighContrast(true);
      document.documentElement.classList.add('high-contrast');
    }
  }, []);

  const toggleHighContrast = () => {
    const newValue = !highContrast;
    setHighContrast(newValue);
    localStorage.setItem('highContrast', newValue.toString());
    
    if (newValue) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  };

  return (
    <AccessibleButton
      onClick={toggleHighContrast}
      variant="secondary"
      ariaLabel={`${highContrast ? 'Disable' : 'Enable'} high contrast mode`}
      className={className}
    >
      {highContrast ? '🌙' : '☀️'} {highContrast ? 'Normal' : 'High'} Contrast
    </AccessibleButton>
  );
};

// Keyboard Navigation Helper
export const useKeyboardNavigation = (
  items: Array<{ id: string; element: React.RefObject<HTMLElement> }>,
  isActive: boolean = true
) => {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(items.length - 1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          items[focusedIndex]?.element.current?.click();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [items, focusedIndex, isActive]);

  useEffect(() => {
    if (isActive && items[focusedIndex]) {
      items[focusedIndex].element.current?.focus();
    }
  }, [focusedIndex, items, isActive]);

  return { focusedIndex, setFocusedIndex };
}; 