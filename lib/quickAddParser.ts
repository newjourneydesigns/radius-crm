import * as chrono from 'chrono-node';
import type { CardPriority } from './supabase';

export interface QuickAddToken {
  text: string;
  type: 'date' | 'time' | 'priority' | 'label';
}

export interface ParsedQuickAdd {
  /** Original input with recognized date/priority/label tokens stripped out. */
  title: string;
  /** YYYY-MM-DD, or null when no date was recognized. */
  dueDate: string | null;
  /** HH:MM (24h, snapped to 15 min), or null when no time was recognized. */
  dueTime: string | null;
  priority: CardPriority | null;
  /** Lowercased label names from #name / @name tokens, matched to board labels later. */
  labelTokens: string[];
  /** Human-readable chips for previewing what was detected. */
  tokens: QuickAddToken[];
}

const pad = (n: number) => String(n).padStart(2, '0');

const PRIORITY_WORDS: Record<string, CardPriority> = {
  p1: 'urgent', '1': 'urgent', urgent: 'urgent',
  p2: 'high', '2': 'high', high: 'high',
  p3: 'medium', '3': 'medium', medium: 'medium', med: 'medium',
  p4: 'low', '4': 'low', low: 'low',
};

const PRIORITY_LABEL: Record<CardPriority, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
};

// !p1 / !1 / !high — must follow whitespace or start of string.
const PRIORITY_RE = /(^|\s)!(p?[1-4]|urgent|high|medium|med|low)\b/i;
// #label or @label
const LABEL_RE = /(^|\s)[#@]([\w-]+)/g;

/**
 * Parses a Todoist-style quick-add string into structured card fields.
 * App-specific tokens (priority `!p1`, labels `#name`) are handled here; date and
 * time phrases ("next Friday at 3pm", "in two weeks") are delegated to chrono-node.
 *
 * @param input  raw text the user typed
 * @param refDate reference "now" — pass a Date representing the current time in the
 *                app's timezone (America/Chicago) so relative phrases resolve correctly.
 */
export function parseQuickAdd(input: string, refDate: Date): ParsedQuickAdd {
  const tokens: QuickAddToken[] = [];
  let working = input;

  let priority: CardPriority | null = null;
  const priorityMatch = working.match(PRIORITY_RE);
  if (priorityMatch) {
    const key = priorityMatch[2].toLowerCase();
    priority = PRIORITY_WORDS[key] ?? null;
    if (priority) {
      tokens.push({ text: PRIORITY_LABEL[priority], type: 'priority' });
      working = working.replace(PRIORITY_RE, ' ');
    }
  }

  const labelTokens: string[] = [];
  let labelMatch: RegExpExecArray | null;
  LABEL_RE.lastIndex = 0;
  while ((labelMatch = LABEL_RE.exec(working)) !== null) {
    const name = labelMatch[2].toLowerCase();
    if (!labelTokens.includes(name)) {
      labelTokens.push(name);
      tokens.push({ text: `#${labelMatch[2]}`, type: 'label' });
    }
  }
  if (labelTokens.length) working = working.replace(LABEL_RE, ' ');

  let dueDate: string | null = null;
  let dueTime: string | null = null;
  const results = chrono.parse(working, refDate, { forwardDate: true });
  if (results.length > 0) {
    const result = results[0];
    const comp = result.start;
    const year = comp.get('year');
    const month = comp.get('month');
    const day = comp.get('day');
    if (year != null && month != null && day != null) {
      dueDate = `${year}-${pad(month)}-${pad(day)}`;
      tokens.push({ text: result.text, type: 'date' });

      if (comp.isCertain('hour')) {
        let hour = comp.get('hour') ?? 0;
        let minute = comp.get('minute') ?? 0;
        minute = Math.round(minute / 15) * 15;
        if (minute === 60) { minute = 0; hour = (hour + 1) % 24; }
        dueTime = `${pad(hour)}:${pad(minute)}`;
        tokens.push({ text: formatTimeLabel(hour, minute), type: 'time' });
      }
      // Strip the matched date phrase from the title.
      working = working.slice(0, result.index) + ' ' + working.slice(result.index + result.text.length);
    }
  }

  const title = working.replace(/\s+/g, ' ').trim();
  return { title, dueDate, dueTime, priority, labelTokens, tokens };
}

function formatTimeLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${pad(minute)} ${period}`;
}
