/**
 * Date utility functions for the application
 */

export const APP_TIME_ZONE = 'America/Chicago';

export const getTodayDateString = (timeZone = APP_TIME_ZONE): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year && month && day) return `${year}-${month}-${day}`;
  return new Date().toISOString().slice(0, 10);
};

export const formatDateOnlyForDisplay = (
  dateString: string | null,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string => {
  if (!dateString) return 'No date';
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return formatDate(dateString);

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', options);
};

export const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return 'No date';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

export const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'No date';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

export const isDateOverdue = (dateString: string): boolean => {
  try {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  } catch (error) {
    console.error('Error checking if date is overdue:', error);
    return false;
  }
};
