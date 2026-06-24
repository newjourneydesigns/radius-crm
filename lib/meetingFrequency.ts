const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDateOnly(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function normalizeFrequency(frequency?: string | null): string {
  return (frequency ?? '').trim().toLowerCase();
}

function getDayName(dateStr: string): string | null {
  const date = parseDateOnly(dateStr);
  if (!date) return null;
  return DAY_NAMES[date.getUTCDay()];
}

function getWeekOfMonth(dateStr: string): number | null {
  const date = parseDateOnly(dateStr);
  if (!date) return null;
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

function getMonthIndex(dateStr: string): number | null {
  const date = parseDateOnly(dateStr);
  if (!date) return null;
  return date.getUTCMonth();
}

function weeksBetween(startDate: string, endDate: string): number | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;

  return Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function ordinalWeeks(frequency: string): number[] {
  const weeks: number[] = [];
  if (/\b(1st|first)\b/.test(frequency)) weeks.push(1);
  if (/\b(2nd|second)\b/.test(frequency)) weeks.push(2);
  if (/\b(3rd|third)\b/.test(frequency)) weeks.push(3);
  if (/\b(4th|fourth)\b/.test(frequency)) weeks.push(4);
  if (/\b(5th|fifth)\b/.test(frequency)) weeks.push(5);
  return weeks;
}

export function isBiWeeklyFrequency(frequency?: string | null): boolean {
  const normalized = normalizeFrequency(frequency);
  return (
    normalized.includes('bi-week') ||
    normalized.includes('biweekly') ||
    normalized.includes('bi weekly') ||
    normalized.includes('every other') ||
    normalized.includes('2-week') ||
    normalized.includes('2 week')
  );
}

export function doesMeetingFrequencyIncludeDate(args: {
  date: string;
  frequency?: string | null;
  meetingStartDate?: string | null;
  meetingDay?: string | null;
}): boolean {
  const dateOnly = args.date.slice(0, 10);
  const normalized = normalizeFrequency(args.frequency);

  if (args.meetingDay) {
    const actualDay = getDayName(dateOnly);
    if (actualDay && actualDay !== args.meetingDay.trim().toLowerCase()) return false;
  }

  if (args.meetingStartDate && dateOnly < args.meetingStartDate.slice(0, 10)) {
    return false;
  }

  const isBiWeekly = isBiWeeklyFrequency(normalized);
  const mentionsWeekly = normalized.includes('weekly') || normalized.includes('every week');
  const ordinals = ordinalWeeks(normalized);

  if (ordinals.length > 0 && !mentionsWeekly && !isBiWeekly) {
    const weekNum = getWeekOfMonth(dateOnly);
    return weekNum !== null && ordinals.includes(weekNum);
  }

  if (isBiWeekly) {
    if (!args.meetingStartDate) return true;
    const diffWeeks = weeksBetween(args.meetingStartDate.slice(0, 10), dateOnly);
    return diffWeeks !== null && diffWeeks >= 0 && diffWeeks % 2 === 0;
  }

  if (normalized.includes('quarter')) {
    const weekNum = getWeekOfMonth(dateOnly);
    const month = getMonthIndex(dateOnly);
    return weekNum === 1 && month !== null && [0, 3, 6, 9].includes(month);
  }

  if (normalized.includes('month')) {
    return getWeekOfMonth(dateOnly) === 1;
  }

  return true;
}
