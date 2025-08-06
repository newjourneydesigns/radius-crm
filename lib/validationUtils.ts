/**
 * Validation utility functions for user input and data
 * Provides consistent validation across the Circle Leader application
 */

/**
 * Validates user input based on type
 * @param value - Value to validate
 * @param type - Type of validation to perform
 * @returns True if valid, false otherwise
 */
export const validateUserInput = (value: any, type: 'string' | 'number' | 'array' = 'string'): boolean => {
  if (value === null || value === undefined) return false;
  
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
};

/**
 * Validates email format
 * @param email - Email string to validate
 * @returns True if valid email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates phone number format
 * @param phone - Phone string to validate
 * @returns True if valid phone format
 */
export const validatePhone = (phone: string): boolean => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  // Check if it's 10 or 11 digits (with or without country code)
  return cleaned.length === 10 || cleaned.length === 11;
};

/**
 * Validates URL format
 * @param url - URL string to validate
 * @returns True if valid URL format
 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates required fields in an object
 * @param obj - Object to validate
 * @param requiredFields - Array of required field names
 * @returns Object with validation results
 */
export const validateRequiredFields = (obj: Record<string, any>, requiredFields: string[]): {
  isValid: boolean;
  missingFields: string[];
} => {
  const missingFields = requiredFields.filter(field => 
    !obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')
  );
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
};
