/**
 * Per-device configuration for the mobile bottom tab bar's three page slots.
 *
 * The mobile nav has three page slots (positions 1 & 2 left of the center
 * Search button, position 3 to its right). Users pick which destination sits
 * in each slot from the same set of pages as the desktop primary nav. The
 * choice is stored in localStorage, so it's per-device and needs no sign-in or
 * database round-trip.
 */

export interface MobileNavOption {
  id: string;
  name: string;
  href: string;
}

/** Selectable destinations — titles and order mirror the desktop primary nav. */
export const MOBILE_NAV_OPTIONS: MobileNavOption[] = [
  { id: 'today',       name: 'Today',       href: '/today' },
  { id: 'events',      name: 'Events',      href: '/event-summary-tracker' },
  { id: 'circles',     name: 'Circles',     href: '/search' },
  { id: 'connections', name: 'Connections', href: '/touchpoint-tracker' },
  { id: 'reporting',   name: 'Reporting',   href: '/circle-reporting' },
  { id: 'prayer',      name: 'Prayer',      href: '/prayer' },
  { id: 'directory',   name: 'Directory',   href: '/person-lookup' },
  { id: 'boards',      name: 'Boards',      href: '/boards' },
  { id: 'notebook',    name: 'Notebook',    href: '/notebook' },
];

/** Default slot order — matches the historical mobile tab bar. */
export const DEFAULT_MOBILE_NAV_SLOTS: string[] = ['today', 'events', 'boards'];

export const MOBILE_NAV_SLOTS_KEY = 'radius:mobileNavSlots';
/** Fired on the window when slots change so an open nav updates without a reload. */
export const MOBILE_NAV_SLOTS_EVENT = 'radius:mobileNavSlotsChanged';

const isValidId = (id: unknown): id is string =>
  typeof id === 'string' && MOBILE_NAV_OPTIONS.some((o) => o.id === id);

export function readMobileNavSlots(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_MOBILE_NAV_SLOTS];
  try {
    const raw = window.localStorage.getItem(MOBILE_NAV_SLOTS_KEY);
    if (!raw) return [...DEFAULT_MOBILE_NAV_SLOTS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(isValidId)) {
      return parsed;
    }
  } catch {
    /* fall through to default */
  }
  return [...DEFAULT_MOBILE_NAV_SLOTS];
}

export function writeMobileNavSlots(slots: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOBILE_NAV_SLOTS_KEY, JSON.stringify(slots));
  window.dispatchEvent(new CustomEvent(MOBILE_NAV_SLOTS_EVENT, { detail: slots }));
}
