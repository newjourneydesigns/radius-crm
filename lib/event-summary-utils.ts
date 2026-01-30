import type { CircleLeader, EventSummaryState } from './supabase';

/**
 * Get the event summary state from a leader record
 * Handles both new event_summary_state column and legacy boolean flags
 */
export function getEventSummaryState(leader: CircleLeader): EventSummaryState {
  // Use new column if available
  if (leader.event_summary_state) {
    return leader.event_summary_state;
  }
  
  // Fall back to legacy boolean flags
  if (leader.event_summary_received === true) {
    return 'received';
  }
  if (leader.event_summary_skipped === true) {
    return 'did_not_meet'; // Map old "skipped" to new "did_not_meet"
  }
  return 'not_received';
}

/**
 * Get color classes for event summary state
 */
export function getEventSummaryColors(state: EventSummaryState) {
  switch (state) {
    case 'received':
      return {
        bg: 'bg-green-600',
        border: 'border-green-600',
        btnInactiveBorder: 'border-green-300 dark:border-green-700',
        btnInactiveText: 'text-green-700 dark:text-green-200',
        text: 'text-green-600',
        hover: 'hover:bg-green-50 dark:hover:bg-green-900/30',
        badge: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
        borderLeft: 'border-l-green-500',
        label: 'Received'
      };
    case 'did_not_meet':
      return {
        bg: 'bg-blue-600',
        border: 'border-blue-600',
        btnInactiveBorder: 'border-blue-300 dark:border-blue-700',
        btnInactiveText: 'text-blue-700 dark:text-blue-200',
        text: 'text-blue-600',
        hover: 'hover:bg-blue-50 dark:hover:bg-blue-900/30',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
        borderLeft: 'border-l-blue-500',
        label: 'Did Not Meet'
      };
    case 'skipped':
      return {
        bg: 'bg-yellow-600',
        border: 'border-yellow-600',
        btnInactiveBorder: 'border-yellow-300 dark:border-yellow-700',
        btnInactiveText: 'text-yellow-800 dark:text-yellow-200',
        text: 'text-yellow-600',
        hover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/30',
        badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
        borderLeft: 'border-l-yellow-500',
        label: 'Skipped'
      };
    case 'not_received':
    default:
      return {
        bg: 'bg-red-600',
        border: 'border-red-600',
        btnInactiveBorder: 'border-red-300 dark:border-red-700',
        btnInactiveText: 'text-red-700 dark:text-red-200',
        text: 'text-red-600',
        hover: 'hover:bg-red-50 dark:hover:bg-red-900/30',
        badge: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
        borderLeft: 'border-l-red-500',
        label: 'Not Received'
      };
  }
}

/**
 * Get button label for event summary state
 */
export function getEventSummaryButtonLabel(state: EventSummaryState): string {
  switch (state) {
    case 'not_received': return 'No';
    case 'received': return 'Yes';
    case 'did_not_meet': return 'Didn\'t Meet';
    case 'skipped': return 'Skip';
  }
}
