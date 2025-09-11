'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// Screen Reader Only Text Component
export const ScreenReaderOnly = ({ 
  children 
}: { 
  children: React.ReactNode 
}) => (
  <span className="sr-only">
    {children}
  </span>
);

// Skip Navigation Link
export const SkipNavigation = ({ 
  targetId = 'main-content',
  text = 'Skip to main content'
}: {
  targetId?: string;
  text?: string;
}) => (
  <a
    href={`#${targetId}`}
    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 transition-colors"
  >
    {text}
  </a>
);

// Accessible Button with proper ARIA attributes
export const AccessibleButton = ({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  ariaLabel,
  ariaDescribedBy,
  ariaExpanded,
  ariaControls,
  className = '',
  ...props
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  className?: string;
  [key: string]: any;
}) => {
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-busy={loading}
      className={`${variantClasses[variant]} focus-ring ${className} ${
        disabled || loading ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      {...props}
    >
      {children}
      {loading && <ScreenReaderOnly>Loading...</ScreenReaderOnly>}
    </button>
  );
};

// Accessible Modal with proper focus management
export const AccessibleModal = ({
  isOpen,
  onClose,
  title,
  children,
  className = ''
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus the modal
      modalRef.current?.focus();
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
      
      // Return focus to the previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden focus:outline-none ${className}`}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 id="modal-title" className="text-xl font-bold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

// Accessible Form Field with proper labeling
export const AccessibleFormField = ({
  label,
  children,
  error,
  hint,
  required = false,
  fieldId
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  fieldId: string;
}) => {
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-2">
      <label 
        htmlFor={fieldId}
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
      
      <div className="relative">
        {React.cloneElement(children as React.ReactElement, {
          id: fieldId,
          'aria-describedby': describedBy,
          'aria-invalid': !!error,
          'aria-required': required
        })}
      </div>
      
      {error && (
        <p id={errorId} className="text-sm text-red-600 flex items-center" role="alert">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
};

// Accessible Alert/Notification
export const AccessibleAlert = ({
  type = 'info',
  title,
  children,
  onClose,
  className = ''
}: {
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) => {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Announce to screen readers
    if (alertRef.current && (type === 'error' || type === 'warning')) {
      alertRef.current.focus();
    }
  }, [type]);

  const typeConfig = {
    success: {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      iconColor: 'text-green-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    },
    error: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      iconColor: 'text-red-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )
    },
    warning: {
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      textColor: 'text-yellow-800',
      iconColor: 'text-yellow-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    },
    info: {
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      iconColor: 'text-blue-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      )
    }
  };

  const config = typeConfig[type];

  return (
    <div
      ref={alertRef}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`rounded-lg border p-4 ${config.bgColor} ${config.borderColor} ${className}`}
      tabIndex={type === 'error' || type === 'warning' ? -1 : undefined}
    >
      <div className="flex">
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          {config.icon}
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${config.textColor} mb-1`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${config.textColor}`}>
            {children}
          </div>
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={onClose}
                className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${config.iconColor} hover:bg-black/5 focus-ring`}
                aria-label="Dismiss alert"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Accessible Toggle/Switch
export const AccessibleToggle = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = ''
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) => {
  const toggleId = `toggle-${Math.random().toString(36).substr(2, 9)}`;
  const descriptionId = description ? `${toggleId}-description` : undefined;

  return (
    <div className={`flex items-start ${className}`}>
      <div className="flex items-center h-5">
        <button
          id={toggleId}
          role="switch"
          aria-checked={checked}
          aria-describedby={descriptionId}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            checked ? 'bg-blue-600' : 'bg-gray-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className="sr-only">{label}</span>
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <div className="ml-3">
        <label htmlFor={toggleId} className="text-sm font-medium text-gray-900 cursor-pointer">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-sm text-gray-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

// Keyboard Navigation Hook
export const useKeyboardNavigation = (
  items: HTMLElement[],
  options: {
    loop?: boolean;
    orientation?: 'horizontal' | 'vertical';
  } = {}
) => {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const { loop = true, orientation = 'vertical' } = options;

  const handleKeyDown = (event: KeyboardEvent) => {
    const { key } = event;
    let nextIndex = currentIndex;

    const isVertical = orientation === 'vertical';
    const upKey = isVertical ? 'ArrowUp' : 'ArrowLeft';
    const downKey = isVertical ? 'ArrowDown' : 'ArrowRight';

    switch (key) {
      case upKey:
        event.preventDefault();
        nextIndex = currentIndex <= 0 
          ? (loop ? items.length - 1 : 0)
          : currentIndex - 1;
        break;
      case downKey:
        event.preventDefault();
        nextIndex = currentIndex >= items.length - 1 
          ? (loop ? 0 : items.length - 1)
          : currentIndex + 1;
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    setCurrentIndex(nextIndex);
    items[nextIndex]?.focus();
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items]);

  return { currentIndex, setCurrentIndex };
};

// Accessible Data Table
export const AccessibleTable = ({
  data,
  columns,
  caption,
  className = ''
}: {
  data: any[];
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
  }>;
  caption?: string;
  className?: string;
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200" role="table">
        {caption && (
          <caption className="sr-only">
            {caption}
          </caption>
        )}
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  column.sortable ? 'cursor-pointer hover:bg-gray-100 focus:bg-gray-100' : ''
                }`}
                tabIndex={column.sortable ? 0 : undefined}
                onClick={column.sortable ? () => handleSort(column.key) : undefined}
                onKeyDown={column.sortable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort(column.key);
                  }
                } : undefined}
                aria-sort={
                  sortColumn === column.key 
                    ? sortDirection === 'asc' ? 'ascending' : 'descending'
                    : column.sortable ? 'none' : undefined
                }
              >
                <div className="flex items-center space-x-1">
                  <span>{column.label}</span>
                  {column.sortable && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, index) => (
            <tr key={index} className="hover:bg-gray-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 