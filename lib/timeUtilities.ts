/**
 * Time utility functions for the Circle Leader application
 * Provides consistent time formatting and conversion across components
 */

/**
 * Formats time string to AM/PM format
 * @param time - Time string in HH:MM or HH:MM AM/PM format
 * @returns Formatted time string in AM/PM format
 */
export const formatTimeToAMPM = (time: string | undefined | null): string => {
  if (!time) return 'Not scheduled';
  
  // If already in AM/PM format, return as is
  if (time.includes('AM') || time.includes('PM')) {
    return time;
  }
  
  // Convert 24-hour format to 12-hour format
  const [hours, minutes] = time.split(':');
  const hour24 = parseInt(hours);
  
  if (hour24 === 0) {
    return `12:${minutes} AM`;
  } else if (hour24 < 12) {
    return `${hour24}:${minutes} AM`;
  } else if (hour24 === 12) {
    return `12:${minutes} PM`;
  } else {
    return `${hour24 - 12}:${minutes} PM`;
  }
};

/**
 * Converts AM/PM time to 24-hour format for HTML time input
 * @param time - Time string in AM/PM format
 * @returns Time string in HH:MM 24-hour format
 */
export const convertAMPMTo24Hour = (time: string | undefined | null): string => {
  if (!time) return '';
  
  // If already in 24-hour format, return as is
  if (!time.includes('AM') && !time.includes('PM')) {
    return time;
  }
  
  const [timePart, period] = time.split(' ');
  const [hours, minutes] = timePart.split(':');
  let hour24 = parseInt(hours);
  
  if (period === 'AM' && hour24 === 12) {
    hour24 = 0;
  } else if (period === 'PM' && hour24 !== 12) {
    hour24 += 12;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes}`;
};

/**
 * Converts AM/PM time to military time format (alias for convertAMPMTo24Hour)
 * @param time - Time string in AM/PM format
 * @returns Time string in HH:MM 24-hour format
 */
export const convertToMilitaryTime = convertAMPMTo24Hour;

/**
 * Formats time string with timezone consideration
 * @param timeString - Time string to format
 * @returns Formatted time with Central Time AM/PM
 */
export const formatTimeWithTimezone = (timeString: string): string => {
  if (!timeString) return 'Not scheduled';
  
  try {
    // Parse the time string (expecting HH:MM format)
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Create a date object for today with the given time
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    // Format to 12-hour time with AM/PM in Central Time
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago' // Central Time
    });
  } catch (error) {
    console.error('Error formatting time:', error);
    return timeString; // Fallback to original time string
  }
};
