/**
 * Constants for Circle Leader components
 */

export const UI_CONSTANTS = {
  MAX_NOTE_LENGTH: 500,
  MAX_NAME_LENGTH: 100,
  DEFAULT_PAGE_SIZE: 20,
  SEARCH_DEBOUNCE_MS: 300,
} as const;

export const VALIDATION_RULES = {
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  MIN_NOTE_LENGTH: 1,
  MAX_NOTE_LENGTH: 500,
} as const;

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'text-green-600' },
  { value: 'inactive', label: 'Inactive', color: 'text-gray-600' },
  { value: 'pending', label: 'Pending', color: 'text-yellow-600' },
  { value: 'archived', label: 'Archived', color: 'text-red-600' },
] as const;

export const DEFAULT_FILTERS = {
  status: '',
  campus: '',
  search: '',
} as const;