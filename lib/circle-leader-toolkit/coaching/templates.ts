/**
 * Coaching automation message templates.
 *
 * Each automation has a default title + body (with {{placeholders}}). Admins can
 * override the copy per automation via the coaching_automation_templates table;
 * `renderNudge` interpolates the chosen template (override or default) with the
 * per-send values. No AI is used.
 */

import type { AutomationKind } from './config';

export interface NudgeContent {
  title: string;
  bodyHtml: string;
}

export interface TemplateText {
  title: string;
  body_html: string;
}

/** Sparse stored overrides keyed by automation kind. */
export type TemplateOverrides = Partial<Record<AutomationKind, TemplateText | null>>;

/** Values supplied per send; turned into placeholder substitutions. */
export interface NudgeVars {
  leaderName: string;
  memberNames?: string[];
  rosterCount?: number;
  weeks?: number;
}

/** Placeholders each automation's template can use (shown in the editor). */
export const AUTOMATION_PLACEHOLDERS: Record<AutomationKind, string[]> = {
  multiplication: ['leaderFirstName', 'leaderName', 'rosterCount'],
  new_member: ['leaderFirstName', 'leaderName', 'memberNames'],
  inactivity: ['leaderFirstName', 'leaderName', 'memberNames', 'weeks'],
  birthday: ['leaderFirstName', 'leaderName', 'memberNames'],
  did_not_meet: ['leaderFirstName', 'leaderName', 'weeks'],
  first_time: ['leaderFirstName', 'leaderName', 'memberNames'],
};

export const AUTOMATION_LABELS: Record<AutomationKind, string> = {
  multiplication: 'Multiplication',
  new_member: 'New member follow-up',
  inactivity: 'Loving check-in',
  birthday: 'Birthday',
  did_not_meet: 'Did-not-meet check-in',
  first_time: 'First-time welcome',
};

export const AUTOMATION_ORDER: AutomationKind[] = [
  'multiplication',
  'new_member',
  'inactivity',
  'birthday',
  'did_not_meet',
  'first_time',
];

/** Built-in copy. Plural-neutral wording so edited or default text reads cleanly. */
export const COACHING_TEMPLATE_DEFAULTS: Record<AutomationKind, TemplateText> = {
  multiplication: {
    title: 'Your Circle is growing — a multiplication moment 🌱',
    body_html:
      '<p>{{leaderFirstName}}, what a gift — your Circle has grown to {{rosterCount}} people!</p>' +
      '<p>A Circle this size is a beautiful sign of God at work through you. It can also be a moment to dream about what comes next — as a Circle grows, it gets harder for everyone to stay fully known.</p>' +
      '<p>Is there someone you could begin to raise up as a leader? Multiplication isn’t losing people — it’s sending more leaders to reach more people. Pray about who you might develop, and reach out to your coach to dream together.</p>',
  },
  new_member: {
    title: 'Someone new joined your Circle 👋',
    body_html:
      '<p>{{leaderFirstName}}, {{memberNames}} recently joined your Circle — how exciting!</p>' +
      '<p>The first week matters most. A quick, personal hello in the next day or two helps a new person feel seen and makes it far more likely they’ll come back.</p>' +
      '<p>Consider a short text just to say you’re glad they’re here, answer any questions, and let them know what to expect next time.</p>',
  },
  inactivity: {
    title: 'A loving check-in opportunity 💛',
    body_html:
      '<p>{{leaderFirstName}}, it’s been about {{weeks}}+ weeks since {{memberNames}} last joined your Circle.</p>' +
      '<p>People drift for all kinds of reasons — a hard season, a busy stretch, or just life. A warm “we’ve missed you” can mean the world and often brings someone back.</p>' +
      '<p>If now isn’t their season, that’s okay too. You can keep your roster focused and warmly welcome them back any time.</p>',
  },
  birthday: {
    title: 'A birthday in your Circle this week 🎉',
    body_html:
      '<p>{{leaderFirstName}}, there’s a birthday in your Circle this week: {{memberNames}}.</p>' +
      '<p>Few things say “you matter to me” like being remembered on your birthday. A quick text, a card, or a moment to celebrate together at your next gathering goes a long way.</p>',
  },
  did_not_meet: {
    title: 'Checking in on you 🤍',
    body_html:
      '<p>{{leaderFirstName}}, it looks like your Circle hasn’t met for about {{weeks}} weeks.</p>' +
      '<p>That’s completely okay — seasons of rest and full schedules happen. We just want you to know you’re not leading alone.</p>' +
      '<p>If it would help to talk through scheduling or anything you’re carrying, your coach would love to hear from you. When you’re ready to gather again, we’re cheering you on.</p>',
  },
  first_time: {
    title: 'A first-time guest to welcome 🌟',
    body_html:
      '<p>{{leaderFirstName}}, {{memberNames}} joined your Circle for the very first time — wonderful!</p>' +
      '<p>A personal welcome after a first visit is one of the most powerful things you can do. It tells them they belong here.</p>' +
      '<p>Reach out this week to say how glad you were to have them, and invite them back by name.</p>',
  },
};

function firstName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

/** "Alex", "Alex and Sam", "Alex, Sam, and 2 others" */
function nameList(names: string[]): string {
  const clean = names.map((n) => (n || '').trim()).filter(Boolean);
  if (clean.length === 0) return 'someone new';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  const head = clean.slice(0, 2).join(', ');
  const rest = clean.length - 2;
  return `${head}, and ${rest} other${rest === 1 ? '' : 's'}`;
}

function buildVarMap(vars: NudgeVars): Record<string, string> {
  return {
    leaderFirstName: firstName(vars.leaderName),
    leaderName: (vars.leaderName || '').trim() || 'there',
    memberNames: nameList(vars.memberNames || []),
    memberCount: String((vars.memberNames || []).length),
    rosterCount: vars.rosterCount != null ? String(vars.rosterCount) : '',
    weeks: vars.weeks != null ? String(vars.weeks) : '',
  };
}

function interpolate(text: string, map: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (key in map ? map[key] : ''));
}

/** Effective templates = built-in defaults with stored overrides merged in. */
export function resolveTemplates(stored: TemplateOverrides | null | undefined): Record<AutomationKind, TemplateText> {
  const out = {} as Record<AutomationKind, TemplateText>;
  for (const kind of AUTOMATION_ORDER) {
    const override = stored?.[kind];
    out[kind] =
      override && override.title && override.body_html
        ? { title: override.title, body_html: override.body_html }
        : COACHING_TEMPLATE_DEFAULTS[kind];
  }
  return out;
}

// ── Template validation ─────────────────────────────────────────────────────
// Used by both the admin editor (live warnings) and the save route (defense in
// depth) so broken copy never reaches a leader's inbox.

/** Placeholders that are always filled, regardless of automation. */
const ALWAYS_AVAILABLE = ['leaderFirstName', 'leaderName'];

/** HTML elements that never need a closing tag. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr']);

/** Every placeholder that will actually be filled in for a given automation. */
export function allowedPlaceholders(kind: AutomationKind): string[] {
  const set = new Set<string>([...ALWAYS_AVAILABLE, ...AUTOMATION_PLACEHOLDERS[kind]]);
  // memberCount rides along wherever member names are available.
  if (set.has('memberNames')) set.add('memberCount');
  return Array.from(set);
}

/** Placeholder tokens referenced in a string, e.g. ["leaderFirstName", "weeks"]. */
function usedPlaceholders(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** Unclosed or mismatched tags in the limited HTML templates allow. */
function findUnbalancedTags(html: string): string[] {
  const stack: string[] = [];
  const bad: string[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClosing = m[3] === '/' || VOID_TAGS.has(tag);
    if (selfClosing) continue;
    if (isClose) {
      if (stack.length === 0 || stack[stack.length - 1] !== tag) bad.push(tag);
      else stack.pop();
    } else {
      stack.push(tag);
    }
  }
  return Array.from(new Set([...bad, ...stack]));
}

export interface TemplateValidation {
  valid: boolean;
  emptyTitle: boolean;
  emptyBody: boolean;
  /** Placeholders that won't be filled in (typos like {{memberName}}). */
  unknownPlaceholders: string[];
  /** Tag names that are unclosed or mismatched. */
  unbalancedTags: string[];
}

/** Validate one automation's copy: empties, unknown placeholders, broken HTML. */
export function validateTemplate(kind: AutomationKind, tpl: TemplateText): TemplateValidation {
  const allowed = new Set(allowedPlaceholders(kind));
  const used = [...usedPlaceholders(tpl.title || ''), ...usedPlaceholders(tpl.body_html || '')];
  const unknownPlaceholders = Array.from(new Set(used.filter((p) => !allowed.has(p))));
  const unbalancedTags = findUnbalancedTags(tpl.body_html || '');
  const emptyTitle = !(tpl.title || '').trim();
  const emptyBody = !(tpl.body_html || '').trim();
  return {
    emptyTitle,
    emptyBody,
    unknownPlaceholders,
    unbalancedTags,
    valid: !emptyTitle && !emptyBody && unknownPlaceholders.length === 0 && unbalancedTags.length === 0,
  };
}

/**
 * Render a nudge for delivery: pick the override (if any) or the default for the
 * kind, then interpolate the per-send values.
 */
export function renderNudge(
  kind: AutomationKind,
  vars: NudgeVars,
  override?: TemplateText | null
): NudgeContent {
  const tpl = override && override.title && override.body_html ? override : COACHING_TEMPLATE_DEFAULTS[kind];
  const map = buildVarMap(vars);
  return {
    title: interpolate(tpl.title, map),
    bodyHtml: interpolate(tpl.body_html, map),
  };
}
