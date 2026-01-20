export type TodoRepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
};

export const fromISODate = (iso: string) => {
  // Parse as local date (YYYY-MM-DD)
  const [y, m, d] = iso.split('-').map(v => parseInt(v, 10));
  return new Date(y, (m || 1) - 1, d || 1);
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  const dayOfMonth = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Clamp day-of-month to end of target month
  const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, endOfMonth));
  return d;
};

const addYears = (date: Date, years: number) => {
  const d = new Date(date);
  const month = d.getMonth();
  const dayOfMonth = d.getDate();
  d.setDate(1);
  d.setFullYear(d.getFullYear() + years);
  d.setMonth(month);
  const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, endOfMonth));
  return d;
};

export const nextDueDate = (currentISO: string, rule: Exclude<TodoRepeatRule, 'none'>, interval = 1) => {
  const current = fromISODate(currentISO);
  const next = (() => {
    switch (rule) {
      case 'daily':
        return addDays(current, interval);
      case 'weekly':
        return addDays(current, 7 * interval);
      case 'monthly':
        return addMonths(current, interval);
      case 'yearly':
        return addYears(current, interval);
    }
  })();

  return toISODate(next);
};

export const buildRepeatLabel = (rule: TodoRepeatRule, interval = 1) => {
  if (rule === 'none') return '';

  const every = interval === 1 ? 'Every' : `Every ${interval}`;
  switch (rule) {
    case 'daily':
      return `${every} day`;
    case 'weekly':
      return `${every} week`;
    case 'monthly':
      return `${every} month`;
    case 'yearly':
      return `${every} year`;
    default:
      return '';
  }
};

export const generateDueDates = (
  startISO: string,
  rule: Exclude<TodoRepeatRule, 'none'>,
  interval: number,
  endISO: string
) => {
  const dates: string[] = [];
  let cursor = startISO;

  // Always generate strictly after start
  while (true) {
    cursor = nextDueDate(cursor, rule, interval);
    if (cursor > endISO) break;
    dates.push(cursor);
  }

  return dates;
};
