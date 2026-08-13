/**
 * Who in a campaign can be texted, and why the rest can't.
 *
 * Age comes from two places, in order of trust:
 *   1. `birthdate` — captured from CCB during reconcile / phone enrichment
 *   2. a Birthdate or Age column on a pasted roster (kept in `attributes`)
 *
 * Nothing here guesses: a person with neither is "age unknown" and stays
 * sendable, so the campaign view reports that count instead of implying the
 * whole list was age-checked.
 */

import {
  ageFromAttributes,
  ageFromBirthdate,
  sendBlockFor,
  isMinor,
  type SendBlock,
} from '../messaging/minorGuard';

/** The fields of a campaign person this module reads. */
export interface EligibilityPerson {
  birthdate?: string | null;
  attributes?: Record<string, unknown> | null;
  phone?: string | null;
  mobile_phone?: string | null;
}

export function bestPhoneOf(person: EligibilityPerson): string {
  return person.mobile_phone || person.phone || '';
}

export function ageOf(person: EligibilityPerson): number | null {
  return ageFromBirthdate(person.birthdate) ?? ageFromAttributes(person.attributes);
}

export function isMinorPerson(person: EligibilityPerson): boolean {
  return isMinor(ageOf(person));
}

/** The reason this person can't be texted, or null when they can be. */
export function blockFor(person: EligibilityPerson): SendBlock | null {
  return sendBlockFor({ age: ageOf(person), phone: bestPhoneOf(person) });
}

export interface SendSplit<T> {
  /** People a message can go to. */
  sendable: T[];
  /** People it can't, each paired with the reason. */
  blocked: { person: T; block: SendBlock }[];
  /** How many of `sendable` have no age on file — nothing was checked for them. */
  ageUnknown: number;
}

/** Split a selection into who gets the message and who doesn't. */
export function splitBySendability<T extends EligibilityPerson>(people: T[]): SendSplit<T> {
  const sendable: T[] = [];
  const blocked: { person: T; block: SendBlock }[] = [];
  let ageUnknown = 0;

  for (const person of people) {
    const block = blockFor(person);
    if (block) {
      blocked.push({ person, block });
      continue;
    }
    if (ageOf(person) === null) ageUnknown++;
    sendable.push(person);
  }

  // Minors first — that's the reason worth reading before anything else.
  blocked.sort((a, b) => (a.block.reason === b.block.reason ? 0 : a.block.reason === 'minor' ? -1 : 1));

  return { sendable, blocked, ageUnknown };
}
