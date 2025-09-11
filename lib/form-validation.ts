export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  email?: boolean;
  phone?: boolean;
  numeric?: boolean;
  min?: number;
  max?: number;
  custom?: (value: any) => string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validateField = (
  value: any,
  rules: ValidationRule,
  fieldName: string
): string | null => {
  const val = String(value || '').trim();

  if (rules.required && !val) {
    return `${fieldName} is required`;
  }

  if (val && rules.minLength && val.length < rules.minLength) {
    return `${fieldName} must be at least ${rules.minLength} characters`;
  }

  if (val && rules.maxLength && val.length > rules.maxLength) {
    return `${fieldName} must not exceed ${rules.maxLength} characters`;
  }

  if (val && rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return `${fieldName} must be a valid email address`;
  }

  if (val && rules.phone && !/^\+?[\d\s\-\(\)]{10,}$/.test(val)) {
    return `${fieldName} must be a valid phone number`;
  }

  if (val && rules.numeric && !/^\d+(\.\d+)?$/.test(val)) {
    return `${fieldName} must be a valid number`;
  }

  if (val && rules.min && parseFloat(val) < rules.min) {
    return `${fieldName} must be at least ${rules.min}`;
  }

  if (val && rules.max && parseFloat(val) > rules.max) {
    return `${fieldName} must not exceed ${rules.max}`;
  }

  if (val && rules.pattern && !rules.pattern.test(val)) {
    return `${fieldName} format is invalid`;
  }

  if (val && rules.custom) {
    return rules.custom(val);
  }

  return null;
};

export const validateForm = (
  data: Record<string, any>,
  rules: Record<string, ValidationRule>
): ValidationResult => {
  const errors: Record<string, string> = {};

  Object.keys(rules).forEach(fieldName => {
    const error = validateField(data[fieldName], rules[fieldName], fieldName);
    if (error) {
      errors[fieldName] = error;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Common validation rules
export const commonRules = {
  email: { required: true, email: true },
  phone: { required: true, phone: true },
  name: { required: true, minLength: 2, maxLength: 50 },
  amount: { required: true, numeric: true, min: 0 },
  indianVehicleNumber: {
    required: true,
    pattern: /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/,
    custom: (value: string) => {
      if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(value)) {
        return 'Vehicle number must be in format: XX00XX0000';
      }
      return null;
    }
  }
}; 