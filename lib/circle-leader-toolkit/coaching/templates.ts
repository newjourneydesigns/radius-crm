/**
 * Hand-crafted, life-giving inbox templates for coaching automations.
 *
 * Each builder returns { title, bodyHtml } for a circle_summary_inbox_messages
 * row. Tone mirrors the existing seeded inbox copy (warm, celebratory,
 * pastoral) — nudges invite a next step, they never scold. No AI is used.
 */

import type { AutomationKind } from './config';

export interface NudgeContent {
  title: string;
  bodyHtml: string;
}

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

function p(text: string): string {
  return `<p>${text}</p>`;
}

// --- Automation 1: Multiplication --------------------------------------------
export function multiplicationNudge(opts: { leaderName: string; rosterCount: number }): NudgeContent {
  const name = firstName(opts.leaderName);
  return {
    title: 'Your Circle is growing — a multiplication moment 🌱',
    bodyHtml:
      p(`${name}, what a gift — your Circle has grown to ${opts.rosterCount} people!`) +
      p(
        'A Circle this size is a beautiful sign of God at work through you. It can also be a moment to dream about what comes next. As a Circle grows, it often becomes hard for everyone to be fully known.'
      ) +
      p(
        'Is there someone in your Circle who could begin to lead? Multiplication isn’t losing people — it’s sending more leaders out to reach more people. Pray about who you might begin to develop, and reach out to your coach to dream together.'
      ),
  };
}

// --- Automation 2: New member 24h follow-up ----------------------------------
export function newMemberNudge(opts: { leaderName: string; memberNames: string[] }): NudgeContent {
  const name = firstName(opts.leaderName);
  const who = nameList(opts.memberNames);
  return {
    title: 'Someone new just joined your Circle 👋',
    bodyHtml:
      p(`${name}, ${who} recently joined your Circle — how exciting!`) +
      p(
        'The first week is everything. A quick, personal hello in the next day or two helps a new person feel seen and makes it far more likely they’ll come back.'
      ) +
      p(
        'Consider sending a short text just to say you’re glad they’re here, answer any questions, and let them know what to expect at the next gathering.'
      ),
  };
}

// --- Automation 3: Inactivity (loving follow-up) -----------------------------
export function inactivityNudge(opts: { leaderName: string; memberNames: string[]; weeks: number }): NudgeContent {
  const name = firstName(opts.leaderName);
  const who = nameList(opts.memberNames);
  return {
    title: 'A loving check-in opportunity 💛',
    bodyHtml:
      p(`${name}, it’s been about ${opts.weeks}+ weeks since ${who} last joined your Circle.`) +
      p(
        'People drift for all kinds of reasons — a hard season, a busy stretch, or just life. A warm "we’ve missed you" can mean the world and often brings someone back.'
      ) +
      p(
        'If now isn’t their season, that’s okay too. You can always keep your roster focused and warmly welcome them back any time the door is open.'
      ),
  };
}

// --- Automation 4: Birthday this week ----------------------------------------
export function birthdayNudge(opts: { leaderName: string; memberNames: string[] }): NudgeContent {
  const name = firstName(opts.leaderName);
  const who = nameList(opts.memberNames);
  return {
    title: 'A birthday in your Circle this week 🎉',
    bodyHtml:
      p(`${name}, ${who} ${opts.memberNames.length > 1 ? 'have' : 'has'} a birthday this week!`) +
      p(
        'Few things say "you matter to me" like being remembered on your birthday. A quick text, a card, or a moment to celebrate together at your next gathering goes a long way.'
      ),
  };
}

// --- Automation 5: Did-not-meet streak ---------------------------------------
export function didNotMeetNudge(opts: { leaderName: string; weeks: number }): NudgeContent {
  const name = firstName(opts.leaderName);
  return {
    title: 'Checking in on you 🤍',
    bodyHtml:
      p(`${name}, it looks like your Circle hasn’t met for about ${opts.weeks} weeks.`) +
      p(
        'That’s completely okay — seasons of rest and full schedules happen. We just want you to know you’re not leading alone.'
      ) +
      p(
        'If it would help to talk through scheduling, momentum, or anything you’re carrying, your coach would love to hear from you. And when you’re ready to gather again, we’re cheering you on.'
      ),
  };
}

// --- Automation 6: First-time attendee welcome -------------------------------
export function firstTimeNudge(opts: { leaderName: string; memberNames: string[] }): NudgeContent {
  const name = firstName(opts.leaderName);
  const who = nameList(opts.memberNames);
  return {
    title: 'A first-time guest to welcome 🌟',
    bodyHtml:
      p(`${name}, ${who} joined your Circle for the very first time — wonderful!`) +
      p(
        'A personal welcome after a first visit is one of the most powerful things you can do. It tells them they belong here.'
      ) +
      p(
        'Reach out this week to say how glad you were to have them, and invite them back by name. You may be the reason they keep coming.'
      ),
  };
}

/** Convenience map so the engine can label sends by kind if needed. */
export const AUTOMATION_LABELS: Record<AutomationKind, string> = {
  multiplication: 'Multiplication',
  new_member: 'New member follow-up',
  inactivity: 'Loving check-in',
  birthday: 'Birthday',
  did_not_meet: 'Did-not-meet check-in',
  first_time: 'First-time welcome',
};
