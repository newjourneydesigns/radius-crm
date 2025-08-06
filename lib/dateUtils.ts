/**
 * Date and time utility functions for the Circle Leader application
 * Provides consistent date/time formatting and validation across components
 */

// Regex for validating YYYY-MM-DD format
export const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a Date object or string to YYYY-MM-DD format
 * @param date - Date object or string to format
 * @returns Formatted date string or original if invalid
 */
export const formatDate = (date: Date | string): string => {
  try {
    if (typeof date === 'string') {
      if (!DATE_FORMAT_REGEX.test(date)) {
        console.warn('Invalid date format:', date);
        return date;
      }
      return date;
    }
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    console.warn('Invalid date type:', typeof date);
    return '';
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Parses a date string (YYYY-MM-DD) to a local Date object
 * @param dateString - Date string to parse
 * @returns Date object or null if invalid
 */
export const parseLocalDate = (dateString: string): Date | null => {
  try {
    if (!dateString || !DATE_FORMAT_REGEX.test(dateString)) {
      console.warn('Invalid date string format:', dateString);
      return null;
    }
    const [year, month, day] = dateString.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      console.warn('Invalid date components:', { year, month, day });
      return null;
    }
    return new Date(year, month - 1, day);
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
};

/**
 * Checks if a date string represents an overdue date
 * @param dateString - Date string to check
 * @returns True if date is overdue (before today)
 */
export const isDateOverdue = (dateString: string): boolean => {
  try {
    const parsedDate = parseLocalDate(dateString);
    if (!parsedDate) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsedDate.setHours(0, 0, 0, 0);
    
    return parsedDate < today;
  } catch (error) {
    console.error('Error checking if date is overdue:', error);
    return false;
  }
};

/**
 * Formats a date string for display (avoiding timezone issues)
 * @param dateString - Date string to format
 * @returns Formatted display string
 */
export const formatDateForDisplay = (dateString: string | undefined | null): string => {
  if (!dateString) return 'Not set';
  
  try {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  } catch (error) {
    return dateString; // Fallback to raw string
  }
};

/**
 * Formats a date and time string for display
 * @param dateString - ISO date string to format
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Gets follow-up date status information
 * @param dateString - Follow-up date string
 * @returns Object with overdue, approaching, and days until information
 */
export const getFollowUpStatus = (dateString: string | undefined | null): { 
  isOverdue: boolean; 
  isApproaching: boolean; 
  daysUntil: number;
} => {
  if (!dateString) return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  
  try {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const followUpDate = new Date(year, month - 1, day); // month is 0-indexed
    const today = new Date();
    
    // Reset time to compare just dates
    followUpDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = followUpDate.getTime() - today.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      isOverdue: daysUntil < 0,
      isApproaching: daysUntil >= 0 && daysUntil <= 3, // Approaching if within 3 days
      daysUntil
    };
  } catch (error) {
    return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  }
};
