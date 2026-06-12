// Utility functions for time formatting

export type TimeOption = {
  value: string;
  label: string;
};

export const buildTimeOptions15Min = (startAt: string = '08:00'): TimeOption[] => {
  const options = Array.from({ length: 96 }, (_, index) => {
    const totalMinutes = index * 15;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return {
      value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      label: `${hour12}:${String(minutes).padStart(2, '0')} ${period}`,
    };
  });

  const startIndex = options.findIndex(option => option.value === startAt);
  if (startIndex <= 0) return options;
  return [...options.slice(startIndex), ...options.slice(0, startIndex)];
};

// Format time to AM/PM display format
export const formatTimeToAMPM = (time: string | undefined | null): string => {
  if (!time) return '';

  const trimmed = time.trim();
  if (!trimmed) return '';
  
  // If already in AM/PM format, return as is
  if (/\b(?:AM|PM)\b/i.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return trimmed;
  
  // Convert 24-hour format to 12-hour format
  const hour24 = parseInt(match[1], 10);
  const minutes = match[2];
  if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return trimmed;
  
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

// Convert AM/PM time to 24-hour format for HTML time input
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

// Format time with fallback message for Circle Profile display
export const formatTimeForProfile = (time: string | undefined | null): string => {
  if (!time) return 'Not scheduled';
  return formatTimeToAMPM(time);
};
