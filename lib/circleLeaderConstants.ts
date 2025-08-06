/**
 * Constants for the Circle Leader Profile component
 * Centralizes reusable constants and configurations
 */

// Meeting days of the week
export const MEETING_DAYS = [
  'Monday', 
  'Tuesday', 
  'Wednesday', 
  'Thursday', 
  'Friday', 
  'Saturday', 
  'Sunday'
] as const;

// Status options with display information
export const STATUS_OPTIONS = [
  { value: 'invited', label: 'Invited', color: 'text-blue-700' },
  { value: 'pipeline', label: 'Pipeline', color: 'text-indigo-700' },
  { value: 'active', label: 'Active', color: 'text-green-700' },
  { value: 'paused', label: 'Paused', color: 'text-yellow-700' },
  { value: 'off-boarding', label: 'Off-boarding', color: 'text-red-700' },
  { value: 'follow-up', label: 'Follow Up', color: 'text-orange-700' }
] as const;

// Status mapping for display
export const STATUS_MAP = {
  'active': { label: 'Active', color: 'text-green-600 dark:text-green-400' },
  'paused': { label: 'Paused', color: 'text-yellow-600 dark:text-yellow-400' },
  'off-boarding': { label: 'Off Boarding', color: 'text-red-600 dark:text-red-400' },
  'invited': { label: 'Invited', color: 'text-blue-600 dark:text-blue-400' },
  'pipeline': { label: 'Pipeline', color: 'text-indigo-600 dark:text-indigo-400' },
  'follow-up': { label: 'Follow Up', color: 'text-orange-600 dark:text-orange-400' }
} as const;

// Status badge colors for UI
export const STATUS_BADGE_COLORS = {
  'active': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  'invited': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  'pipeline': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400',
  'paused': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  'off-boarding': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  'follow-up': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
  'default': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
} as const;

// Ordered statuses for display consistency
export const ORDERED_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'follow-up', label: 'Follow Up' },
  { value: 'invited', label: 'Invited' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'paused', label: 'Paused' },
  { value: 'off-boarding', label: 'Off Boarding' }
] as const;

// Default form values
export const DEFAULT_LEADER_VALUES = {
  name: '',
  email: '',
  phone: '',
  campus: '',
  acpd: '',
  status: 'active' as const,
  day: '',
  time: '',
  frequency: '',
  circle_type: undefined,
  follow_up_required: false,
  follow_up_date: undefined,
  event_summary_received: false
} as const;

// Validation rules
export const VALIDATION_RULES = {
  NAME_MIN_LENGTH: 2,
  PHONE_MIN_LENGTH: 10,
  NOTE_MIN_LENGTH: 1,
  NOTE_MAX_LENGTH: 5000
} as const;

// UI Constants
export const UI_CONSTANTS = {
  FOLLOW_UP_APPROACHING_DAYS: 3,
  ANIMATION_DURATION: 200,
  DEBOUNCE_DELAY: 300,
  MAX_NOTE_PREVIEW_LENGTH: 100
} as const;
