import { normalizePhone } from '../phoneUtils';

export type ReconcileStatus =
  | 'submitted'
  | 'missing'
  | 'submitted_not_in_group'
  | 'needs_review'
  | 'expected';

export type MatchMethod = 'ccb_id' | 'email' | 'phone' | 'fuzzy' | null;

export interface GroupParticipant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  sourceGroupId?: string;
  sourceGroupName?: string;
}

export interface FormRespondent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  rawResponse: Record<string, unknown>;
}

export interface ReconciledPerson {
  ccbIndividualId: string | null;
  firstName: string;
  lastName: string;
  // Form-side name stored separately for needs_review comparison
  formFirstName: string | null;
  formLastName: string | null;
  email: string;
  phone: string;
  mobilePhone: string;
  inGroup: boolean;
  inForm: boolean;
  formResponseData: Record<string, unknown> | null;
  status: ReconcileStatus;
  matchMethod: MatchMethod;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Reconcile a CCB group participant list against a CCB form respondent list.
 * Returns one ReconciledPerson per unique individual across both lists.
 *
 * Matching priority:
 *   1. CCB individual ID (most reliable)
 *   2. Email (case-insensitive)
 *   3. Mobile phone (normalized digits)
 *   4. Fuzzy first+last name match → needs_review
 */
export function reconcile(
  groupParticipants: GroupParticipant[],
  formRespondents: FormRespondent[],
): ReconciledPerson[] {
  // Build lookup indexes on form respondents
  const formById    = new Map<string, FormRespondent>();
  const formByEmail = new Map<string, FormRespondent>();
  const formByPhone = new Map<string, FormRespondent>();

  for (const fp of formRespondents) {
    if (fp.id) formById.set(fp.id, fp);
    const email = fp.email?.toLowerCase().trim();
    if (email) formByEmail.set(email, fp);
    const mobile = normalizePhone(fp.mobilePhone || fp.phone);
    if (mobile.length >= 7) formByPhone.set(mobile, fp);
  }

  const matchedFormRefs = new Set<FormRespondent>();
  const result: ReconciledPerson[] = [];

  // Pass 1: walk every group participant
  for (const gp of groupParticipants) {
    let formMatch: FormRespondent | null = null;
    let matchMethod: MatchMethod = null;

    // 1a. CCB individual ID
    if (gp.id && formById.has(gp.id)) {
      formMatch = formById.get(gp.id)!;
      matchMethod = 'ccb_id';
    }

    // 1b. Email
    if (!formMatch) {
      const email = gp.email?.toLowerCase().trim();
      if (email && formByEmail.has(email)) {
        formMatch = formByEmail.get(email)!;
        matchMethod = 'email';
      }
    }

    // 1c. Mobile phone
    if (!formMatch) {
      const mobile = normalizePhone(gp.mobilePhone || gp.phone);
      if (mobile.length >= 7 && formByPhone.has(mobile)) {
        formMatch = formByPhone.get(mobile)!;
        matchMethod = 'phone';
      }
    }

    if (formMatch) {
      matchedFormRefs.add(formMatch);
      result.push({
        ccbIndividualId: gp.id || null,
        firstName: gp.firstName,
        lastName: gp.lastName,
        formFirstName: null,
        formLastName: null,
        email: gp.email || formMatch.email,
        phone: gp.phone || formMatch.phone,
        mobilePhone: gp.mobilePhone || formMatch.mobilePhone,
        inGroup: true,
        inForm: true,
        formResponseData: formMatch.rawResponse ?? null,
        status: 'submitted',
        matchMethod,
        sourceGroupId: gp.sourceGroupId ?? null,
        sourceGroupName: gp.sourceGroupName ?? null,
      });
    } else {
      result.push({
        ccbIndividualId: gp.id || null,
        firstName: gp.firstName,
        lastName: gp.lastName,
        formFirstName: null,
        formLastName: null,
        email: gp.email,
        phone: gp.phone,
        mobilePhone: gp.mobilePhone,
        inGroup: true,
        inForm: false,
        formResponseData: null,
        status: 'missing',
        matchMethod: null,
        sourceGroupId: gp.sourceGroupId ?? null,
        sourceGroupName: gp.sourceGroupName ?? null,
      });
    }
  }

  // Build a name index on group participants for fuzzy matching in pass 2
  // Only consider group people that weren't already matched
  const matchedGroupCcbIds = new Set(
    result.filter(r => r.inForm).map(r => r.ccbIndividualId).filter(Boolean),
  );
  const unmatchedGroupByName = new Map<string, GroupParticipant>();
  for (const gp of groupParticipants) {
    if (matchedGroupCcbIds.has(gp.id)) continue;
    const key = `${normalizeName(gp.firstName)}|${normalizeName(gp.lastName)}`;
    unmatchedGroupByName.set(key, gp);
  }

  // Pass 2: unmatched form respondents
  for (const fp of formRespondents) {
    if (matchedFormRefs.has(fp)) continue;

    const nameKey = `${normalizeName(fp.firstName)}|${normalizeName(fp.lastName)}`;
    const fuzzyGroupMatch = unmatchedGroupByName.get(nameKey);

    if (fuzzyGroupMatch) {
      // Remove from the map so two form entries can't fuzzy-match the same person
      unmatchedGroupByName.delete(nameKey);
      // Also update the existing 'missing' result row for this group person
      const existing = result.find(
        r =>
          r.ccbIndividualId === (fuzzyGroupMatch.id || null) &&
          r.status === 'missing',
      );
      if (existing) {
        existing.status = 'needs_review';
        existing.matchMethod = 'fuzzy';
        existing.inForm = true;
        existing.formFirstName = fp.firstName;
        existing.formLastName = fp.lastName;
        existing.formResponseData = fp.rawResponse ?? null;
        matchedFormRefs.add(fp);
      } else {
        result.push({
          ccbIndividualId: fuzzyGroupMatch.id || null,
          firstName: fuzzyGroupMatch.firstName,
          lastName: fuzzyGroupMatch.lastName,
          formFirstName: fp.firstName,
          formLastName: fp.lastName,
          email: fuzzyGroupMatch.email || fp.email,
          phone: fuzzyGroupMatch.phone || fp.phone,
          mobilePhone: fuzzyGroupMatch.mobilePhone || fp.mobilePhone,
          inGroup: true,
          inForm: true,
          formResponseData: fp.rawResponse ?? null,
          status: 'needs_review',
          matchMethod: 'fuzzy',
          sourceGroupId: fuzzyGroupMatch.sourceGroupId ?? null,
          sourceGroupName: fuzzyGroupMatch.sourceGroupName ?? null,
        });
        matchedFormRefs.add(fp);
      }
    } else {
      result.push({
        ccbIndividualId: fp.id || null,
        firstName: fp.firstName,
        lastName: fp.lastName,
        formFirstName: null,
        formLastName: null,
        email: fp.email,
        phone: fp.phone,
        mobilePhone: fp.mobilePhone,
        inGroup: false,
        inForm: true,
        formResponseData: fp.rawResponse ?? null,
        status: 'submitted_not_in_group',
        matchMethod: null,
        sourceGroupId: null,
        sourceGroupName: null,
      });
    }
  }

  return result;
}

export type ReconcileCounts = {
  expected: number;
  submitted: number;
  missing: number;
  submitted_not_in_group: number;
  needs_review: number;
  contacted: number;
  total: number;
  completion_pct: number;
};

export function computeCounts(people: { reconcile_status: string; contacted_at?: string | null }[]): ReconcileCounts {
  const counts = {
    expected: 0,
    submitted: 0,
    missing: 0,
    submitted_not_in_group: 0,
    needs_review: 0,
    contacted: 0,
    total: 0,
    completion_pct: 0,
  };
  for (const p of people) {
    const s = p.reconcile_status;
    if (s === 'submitted' || s === 'missing' || s === 'submitted_not_in_group' || s === 'needs_review') {
      (counts as any)[s]++;
    }
    if (p.contacted_at) counts.contacted++;
  }
  const inGroup = counts.submitted + counts.missing + counts.needs_review;
  counts.total = inGroup + counts.submitted_not_in_group;
  counts.completion_pct =
    inGroup > 0
      ? Math.round((counts.submitted / inGroup) * 10000) / 100
      : 0;
  return counts;
}
