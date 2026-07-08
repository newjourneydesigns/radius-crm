import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { createCCBv2Client } from '../../../../../lib/ccb/ccb-v2-client';
import { getCCBRequestContext } from '../../../../../lib/ccb/ccb-api-gateway';
import { reconcile, computeCounts } from '../../../../../lib/campaigns/reconcile';
import { fetchAllRows } from '../../../../../lib/campaigns/fetchAllRows';
import { guessCampusFromGroupName } from '../../../../../lib/campaigns/campus';

export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'ACPD') {
    return { user: null, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user, response: null };
}

// POST /api/campaigns/[id]/reconcile
// Pulls group participants and form responses from CCB, reconciles them,
// persists results to follow_up_campaign_people, and updates aggregate counts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;

  const supabase = createServiceSupabaseClient();

  // 1. Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('follow_up_campaigns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // 2. Create CCB clients (v1 for participant list, v2 for phone enrichment)
  const ctx = await getCCBRequestContext(req, {
    module: 'Follow-Up Campaigns',
    action: 'Reconcile',
    direction: 'pull',
  });
  const ccb = createCCBClient(ctx);
  const ccbV2 = createCCBv2Client(ctx);

  // 3. Fetch group participants from all configured group IDs, then deduplicate.
  // Also fetch group names in parallel so we can tag each participant with their source group.
  const groupIds: string[] = Array.isArray(campaign.ccb_group_ids)
    ? campaign.ccb_group_ids
    : [campaign.ccb_group_ids].filter(Boolean);

  const groupNameMap: Record<string, string> = {};
  await Promise.all(groupIds.map(async (gid) => {
    try {
      groupNameMap[gid] = await ccb.getGroupName(gid);
    } catch {
      groupNameMap[gid] = `Group ${gid}`;
    }
  }));

  const seenCcbIds = new Set<string>();
  const groupParticipants: (Awaited<ReturnType<typeof ccb.getGroupParticipants>>[number] & {
    sourceGroupId?: string;
    sourceGroupName?: string;
  })[] = [];

  for (const groupId of groupIds) {
    let participants: Awaited<ReturnType<typeof ccb.getGroupParticipants>>;
    try {
      participants = await ccb.getGroupParticipants(groupId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.toLowerCase().includes('permission')) {
        return NextResponse.json({
          error: 'ccb_permission',
          message: 'The CCB API user lacks permission to read group participants. Grant "Group" API access in CCB Admin → API → Permissions.',
        }, { status: 403 });
      }
      return NextResponse.json({ error: 'ccb_group_fetch_failed', message: `Group ${groupId}: ${msg}` }, { status: 502 });
    }
    for (const p of participants) {
      if (p.id && seenCcbIds.has(p.id)) continue;
      if (p.id) seenCcbIds.add(p.id);
      groupParticipants.push({ ...p, sourceGroupId: groupId, sourceGroupName: groupNameMap[groupId] });
    }
  }

  // 3b. Enrich phone data via CCB v2 — one call per group, not per person.
  // v1's group_participants XML often omits phone numbers (contact-info permission
  // gate). v2's /groups/{id}/members returns phones in JSON format reliably.
  const v2PhoneMap: Record<string, { phone: string; mobilePhone: string }> = {};
  await Promise.all(groupIds.map(async (gid) => {
    try {
      const v2Members = await ccbV2.getGroupParticipants(gid);
      for (const m of v2Members) {
        if (m.id && (m.phone || m.mobilePhone)) {
          v2PhoneMap[m.id] = { phone: m.phone, mobilePhone: m.mobilePhone };
        }
      }
    } catch {
      // v2 unavailable for this group — fall back to whatever v1 returned
    }
  }));

  // 3b-2. Backfill missing phones from circle_leaders table (zero extra CCB calls).
  // CCB privacy settings can hide phone numbers from the group participant APIs even
  // with admin credentials. Since campaign participants are typically circle leaders,
  // their phone is often already stored in our DB — look it up by email.
  const missingEmails = groupParticipants
    .filter(p => p.email && !v2PhoneMap[p.id]?.phone && !v2PhoneMap[p.id]?.mobilePhone && !p.phone && !p.mobilePhone)
    .map(p => p.email);

  if (missingEmails.length > 0) {
    const { data: leaderPhones } = await supabase
      .from('circle_leaders')
      .select('email, phone')
      .in('email', missingEmails)
      .not('phone', 'is', null);

    if (leaderPhones) {
      const leaderPhoneByEmail = new Map(leaderPhones.map(r => [r.email?.toLowerCase(), r.phone as string]));
      for (const p of groupParticipants) {
        const leaderPhone = p.email ? leaderPhoneByEmail.get(p.email.toLowerCase()) : undefined;
        if (leaderPhone && !v2PhoneMap[p.id]?.phone && !v2PhoneMap[p.id]?.mobilePhone) {
          v2PhoneMap[p.id] = { phone: leaderPhone, mobilePhone: '' };
        }
      }
    }
  }

  // 3c. Load manually-added individuals from DB and merge them in.
  // They join the group participant list so the reconcile function checks them
  // against form responses automatically.
  const manualPeople = await fetchAllRows<{
    ccb_individual_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    mobile_phone: string | null;
    source_group_name: string | null;
    attributes: Record<string, unknown> | null;
  }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('ccb_individual_id, first_name, last_name, email, phone, mobile_phone, source_group_name, attributes')
      .eq('campaign_id', params.id)
      .eq('manually_added', true)
      .range(from, to),
  );

  // Manually-added people who have no CCB id (e.g. a pasted spreadsheet roster)
  // can't be tracked by id across reconciles. Key them by normalized name so we
  // can re-flag them manually_added and preserve their campus team below.
  const normName = (s: string | null | undefined) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const manualNullKeys = new Set<string>();
  const manualCcbIds = new Set<string>();
  // Preserve pasted free-form attributes across reconcile (keyed by CCB id, or name when id-less).
  const manualAttrsByCcbId = new Map<string, unknown>();
  const manualAttrsByName = new Map<string, unknown>();
  for (const mp of manualPeople ?? []) {
    if (mp.attributes) {
      if (mp.ccb_individual_id) manualAttrsByCcbId.set(mp.ccb_individual_id, mp.attributes);
      else manualAttrsByName.set(`${normName(mp.first_name)}|${normName(mp.last_name)}`, mp.attributes);
    }
    if (mp.ccb_individual_id && seenCcbIds.has(mp.ccb_individual_id)) continue; // already in a group
    if (mp.ccb_individual_id) {
      seenCcbIds.add(mp.ccb_individual_id);
      manualCcbIds.add(mp.ccb_individual_id);
    } else {
      manualNullKeys.add(`${normName(mp.first_name)}|${normName(mp.last_name)}`);
    }
    groupParticipants.push({
      id: mp.ccb_individual_id || '',
      firstName: mp.first_name || '',
      lastName: mp.last_name || '',
      fullName: `${mp.first_name || ''} ${mp.last_name || ''}`.trim(),
      email: mp.email || '',
      phone: mp.phone || '',
      mobilePhone: mp.mobile_phone || '',
      status: '',
      statusId: '',
      isActive: true,
      // Carry the campus team through reconcile so it survives the upsert
      sourceGroupName: mp.source_group_name || undefined,
    });
  }

  // 3d. Sticky invite list: someone who was invited (in a CCB group at a prior
  // reconcile) but has since been removed from the group stays invited. Their
  // submission still counts, their unsubmitted follow-up still matters, and the
  // invited denominator doesn't quietly shrink. They're flagged left_group so
  // the UI can show it; off-boarding is the deliberate way to remove someone.
  const previouslyInvited = await fetchAllRows<{
    ccb_individual_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    mobile_phone: string | null;
    source_group_id: string | null;
    source_group_name: string | null;
  }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('ccb_individual_id, first_name, last_name, email, phone, mobile_phone, source_group_id, source_group_name')
      .eq('campaign_id', params.id)
      .eq('in_group', true)
      .eq('manually_added', false)
      .range(from, to),
  );
  const leftGroupCcbIds = new Set<string>();
  for (const pp of previouslyInvited ?? []) {
    // Id-less rows can't be tracked across reconciles; still-present people are
    // already in the list from CCB.
    if (!pp.ccb_individual_id || seenCcbIds.has(pp.ccb_individual_id)) continue;
    seenCcbIds.add(pp.ccb_individual_id);
    leftGroupCcbIds.add(pp.ccb_individual_id);
    groupParticipants.push({
      id: pp.ccb_individual_id,
      firstName: pp.first_name || '',
      lastName: pp.last_name || '',
      fullName: `${pp.first_name || ''} ${pp.last_name || ''}`.trim(),
      email: pp.email || '',
      phone: pp.phone || '',
      mobilePhone: pp.mobile_phone || '',
      status: '',
      statusId: '',
      isActive: true,
      // Keep the group they were invited through so filters and the Summary
      // rollup still attribute them correctly.
      sourceGroupId: pp.source_group_id || undefined,
      sourceGroupName: pp.source_group_name || undefined,
    });
  }

  if (groupParticipants.length === 0) {
    return NextResponse.json({
      error: 'empty_group',
      message: `CCB groups [${groupIds.join(', ')}] returned 0 participants and no individuals were manually added. Check that the Group IDs are correct.`,
    }, { status: 422 });
  }

  // 4. Fetch form responses
  let formRespondents: Awaited<ReturnType<typeof ccb.getFormResponses>>;
  try {
    formRespondents = await ccb.getFormResponses(campaign.ccb_form_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.toLowerCase().includes('permission')) {
      return NextResponse.json({
        error: 'ccb_permission',
        message: 'The CCB API user lacks permission to read form responses. Grant "Form" API access in CCB Admin → API → Permissions.',
      }, { status: 403 });
    }
    return NextResponse.json({ error: 'ccb_form_fetch_failed', message: msg }, { status: 502 });
  }

  // 4b. Fetch day-of check-ins from the campaign's CCB events (optional).
  // Attendance is additive: a failed fetch (or an attendee dropped by CCB)
  // never clears a previously recorded check-in — see prevAttended below.
  const eventIds: string[] = Array.isArray(campaign.ccb_event_ids)
    ? campaign.ccb_event_ids.filter(Boolean)
    : [];
  const attendedCcbIds = new Set<string>();
  const attendedNames = new Set<string>();
  for (const evId of eventIds) {
    try {
      const attendees = await ccb.getEventAttendees(evId);
      for (const a of attendees) {
        if (a.id) attendedCcbIds.add(a.id);
        else if (a.name) attendedNames.add(a.name.toLowerCase().trim().replace(/\s+/g, ' '));
      }
    } catch (err) {
      console.warn(`Attendance fetch failed for event ${evId}:`, err);
    }
  }

  const prevAttended = eventIds.length > 0
    ? await fetchAllRows<{ ccb_individual_id: string | null; first_name: string | null; last_name: string | null }>((from, to) =>
        supabase
          .from('follow_up_campaign_people')
          .select('ccb_individual_id, first_name, last_name')
          .eq('campaign_id', params.id)
          .eq('attended', true)
          .range(from, to),
      )
    : [];

  // 5. Reconcile
  // Deduplicate form respondents by CCB individual ID — a person can submit
  // the form more than once, producing two entries with the same fp.id.
  // Without this, Pass 2 of reconcile() pushes a second row for the same ID,
  // which causes the PostgreSQL "ON CONFLICT DO UPDATE cannot affect row a
  // second time" error when upserting.
  const seenFormIds = new Set<string>();
  const uniqueFormRespondents = formRespondents.filter(fp => {
    if (!fp.id) return true;
    if (seenFormIds.has(fp.id)) return false;
    seenFormIds.add(fp.id);
    return true;
  });
  const reconciledPeople = reconcile(groupParticipants, uniqueFormRespondents);

  // 6. Load existing contacted rows so we can preserve their contact fields on re-reconcile
  const existingContacted = await fetchAllRows<{
    ccb_individual_id: string | null;
    first_name: string | null;
    last_name: string | null;
    contacted_at: string | null;
    contacted_by: string | null;
    contact_note: string | null;
  }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('ccb_individual_id, first_name, last_name, contacted_at, contacted_by, contact_note')
      .eq('campaign_id', params.id)
      .not('contacted_at', 'is', null)
      .range(from, to),
  );

  const prevAttendedIds = new Set<string>();
  const prevAttendedNames = new Set<string>();
  for (const r of prevAttended) {
    if (r.ccb_individual_id) prevAttendedIds.add(r.ccb_individual_id);
    else prevAttendedNames.add(`${normName(r.first_name)}|${normName(r.last_name)}`);
  }

  type ContactedRow = { ccb_individual_id: string | null; contacted_at: string | null; contacted_by: string | null; contact_note: string | null };
  const contactedMap = new Map<string, ContactedRow>();
  // No-CCB-id contacted people (e.g. pasted roster) are keyed by name instead,
  // so re-reconciling preserves their follow-up status rather than losing it.
  const contactedNullMap = new Map<string, ContactedRow>();
  for (const r of existingContacted ?? []) {
    if (r.ccb_individual_id) contactedMap.set(r.ccb_individual_id, r as ContactedRow);
    else contactedNullMap.set(`${normName(r.first_name)}|${normName(r.last_name)}`, r as ContactedRow);
  }

  // 6b. Load admin decisions on fuzzy matches so a confirmed/rejected match isn't
  // re-flagged as needs_review on every reconcile.
  const resolved = await fetchAllRows<{
    ccb_individual_id: string | null;
    first_name: string | null;
    last_name: string | null;
    match_resolution: string | null;
  }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('ccb_individual_id, first_name, last_name, match_resolution')
      .eq('campaign_id', params.id)
      .not('match_resolution', 'is', null)
      .range(from, to),
  );
  const resolutionByCcbId = new Map<string, string>();
  const resolutionByName = new Map<string, string>();
  for (const r of resolved ?? []) {
    if (!r.match_resolution) continue;
    if (r.ccb_individual_id) resolutionByCcbId.set(r.ccb_individual_id, r.match_resolution);
    else resolutionByName.set(`${normName(r.first_name)}|${normName(r.last_name)}`, r.match_resolution);
  }

  // 6c. Load off-boarded (excluded) people so their status survives reconcile —
  // an admin removed them from the pool deliberately; don't drop them back in.
  const excludedPeople = await fetchAllRows<{
    ccb_individual_id: string | null;
    first_name: string | null;
    last_name: string | null;
  }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('ccb_individual_id, first_name, last_name')
      .eq('campaign_id', params.id)
      .eq('reconcile_status', 'excluded')
      .range(from, to),
  );
  const excludedCcbIds = new Set<string>();
  const excludedNames = new Set<string>();
  for (const r of excludedPeople ?? []) {
    if (r.ccb_individual_id) excludedCcbIds.add(r.ccb_individual_id);
    else excludedNames.add(`${normName(r.first_name)}|${normName(r.last_name)}`);
  }

  // 7. Upsert all people
  // For each reconciled person, if they were previously contacted, keep that status.
  // Preserve manually_added flag for anyone who was manually added.

  // Campus per person, from their invite group: an admin override in
  // group_campus_map wins; otherwise guess from the group name (LVT -> Lewisville).
  // Stamped into attributes so Campus filters/summaries work on every tab.
  const campusMap: Record<string, string> =
    campaign.group_campus_map && typeof campaign.group_campus_map === 'object' && !Array.isArray(campaign.group_campus_map)
      ? campaign.group_campus_map
      : {};
  const campusForGroup = (groupId: string | null, groupName: string | null) =>
    (groupId ? campusMap[groupId] : undefined) || guessCampusFromGroupName(groupName);

  const rows = reconciledPeople.map((p) => {
    const nameKey = `${normName(p.firstName)}|${normName(p.lastName)}`;
    const prevContacted = p.ccbIndividualId
      ? contactedMap.get(p.ccbIndividualId)
      : contactedNullMap.get(nameKey);
    const isManual = p.ccbIndividualId ? manualCcbIds.has(p.ccbIndividualId) : manualNullKeys.has(nameKey);
    const v2Ph = p.ccbIndividualId ? v2PhoneMap[p.ccbIndividualId] : null;
    const baseAttrs = ((p.ccbIndividualId ? manualAttrsByCcbId.get(p.ccbIndividualId) : manualAttrsByName.get(nameKey)) ?? null) as Record<string, unknown> | null;
    // Merge the group-derived campus in; an explicit Campus attribute (e.g. from
    // a pasted roster) wins because the spread comes after.
    const campus = campusForGroup(p.sourceGroupId ?? null, p.sourceGroupName ?? null);
    const attributes = campus ? { Campus: campus, ...(baseAttrs ?? {}) } : baseAttrs;

    // Honor a prior admin decision on a fuzzy match: confirmed -> submitted,
    // rejected -> missing (drop the form link). Only applies to fuzzy matches.
    const resolution = p.ccbIndividualId ? resolutionByCcbId.get(p.ccbIndividualId) : resolutionByName.get(nameKey);
    const applyResolution = resolution && (p.status === 'needs_review' || p.matchMethod === 'fuzzy');
    const resolvedStatus = applyResolution
      ? (resolution === 'confirmed' ? 'submitted' : 'missing')
      : p.status;
    const rejected = applyResolution && resolution === 'rejected';

    // An admin's off-boarding decision wins over the reconciled status so the
    // person stays out of the unsubmitted pool until manually restored.
    const isExcluded = p.ccbIndividualId ? excludedCcbIds.has(p.ccbIndividualId) : excludedNames.has(nameKey);
    const status = isExcluded ? 'excluded' : resolvedStatus;

    // Checked in to one of the campaign's events — matched by CCB id, by name
    // (attendee names come as "First Last"), or carried from a prior reconcile.
    const attended =
      (p.ccbIndividualId
        ? attendedCcbIds.has(p.ccbIndividualId) || prevAttendedIds.has(p.ccbIndividualId)
        : prevAttendedNames.has(nameKey)) ||
      attendedNames.has(`${normName(p.firstName)} ${normName(p.lastName)}`);

    return {
      campaign_id: params.id,
      ccb_individual_id: p.ccbIndividualId || null,
      first_name: p.firstName,
      last_name: p.lastName,
      form_first_name: rejected ? null : (p.formFirstName || null),
      form_last_name: rejected ? null : (p.formLastName || null),
      email: p.email || null,
      phone: v2Ph?.phone || p.phone || null,
      mobile_phone: v2Ph?.mobilePhone || p.mobilePhone || null,
      in_group: p.inGroup,
      // Explicitly false for people found in the group so the flag clears if
      // someone rejoins.
      left_group: p.ccbIndividualId ? leftGroupCcbIds.has(p.ccbIndividualId) : false,
      in_form: rejected ? false : p.inForm,
      manually_added: isManual,
      form_response_data: rejected ? null : (p.formResponseData || null),
      reconcile_status: status,
      match_method: p.matchMethod || null,
      match_resolution: applyResolution ? resolution : null,
      source_group_id: p.sourceGroupId || null,
      source_group_name: p.sourceGroupName || null,
      attended,
      // Preserve pasted free-form attributes (Campus, Team, …) across reconcile
      attributes,
      // Preserve contact fields so re-reconciling doesn't wipe them
      contacted_at: prevContacted?.contacted_at ?? null,
      contacted_by: prevContacted?.contacted_by ?? null,
      contact_note: prevContacted?.contact_note ?? null,
    };
  });

  // Delete stale rows (NOT contacted) before upserting fresh ones
  const currentCcbIds = reconciledPeople
    .map(p => p.ccbIndividualId)
    .filter(Boolean) as string[];

  // Delete people who have a CCB ID but are no longer in either list,
  // and were not contacted, not manually added, and not off-boarded (an
  // off-boarding decision should persist even if they leave the CCB group).
  if (currentCcbIds.length > 0) {
    await supabase
      .from('follow_up_campaign_people')
      .delete()
      .eq('campaign_id', params.id)
      .eq('manually_added', false)
      .is('contacted_at', null)
      .neq('reconcile_status', 'excluded')
      .not('ccb_individual_id', 'in', `(${currentCcbIds.map(id => `"${id}"`).join(',')})`);
  }

  // Upsert current rows. The unique constraint is on (campaign_id, ccb_individual_id).
  // Rows with null ccb_individual_id (form-only without CCB id) get inserted fresh.
  const rowsWithId = rows.filter(r => r.ccb_individual_id);
  const rowsWithoutId = rows.filter(r => !r.ccb_individual_id);

  if (rowsWithId.length > 0) {
    const { error: upsertError } = await supabase
      .from('follow_up_campaign_people')
      .upsert(rowsWithId, {
        onConflict: 'campaign_id,ccb_individual_id',
        ignoreDuplicates: false,
      });
    if (upsertError) {
      console.error('Upsert error (with CCB ID):', upsertError);
      return NextResponse.json({ error: 'db_upsert_failed', message: upsertError.message }, { status: 500 });
    }
  }

  if (rowsWithoutId.length > 0) {
    // For rows without a CCB id, delete ALL existing null-id rows and re-insert.
    // Contact status is carried forward in `rows` via contactedNullMap, so deleting
    // the contacted ones too (rather than skipping them) avoids duplicate rows for
    // pasted people who were already followed up.
    await supabase
      .from('follow_up_campaign_people')
      .delete()
      .eq('campaign_id', params.id)
      .is('ccb_individual_id', null);

    const { error: insertError } = await supabase
      .from('follow_up_campaign_people')
      .insert(rowsWithoutId);
    if (insertError) {
      console.error('Insert error (no CCB ID):', insertError);
      return NextResponse.json({ error: 'db_insert_failed', message: insertError.message }, { status: 500 });
    }
  }

  // 8. Re-read all people to compute accurate counts (includes any pre-existing contacted rows).
  // Paginate past the 1000-row cap so the aggregate counts reflect the full campaign.
  const allPeople = await fetchAllRows<{ reconcile_status: string; contacted_at: string | null; attended: boolean | null }>((from, to) =>
    supabase
      .from('follow_up_campaign_people')
      .select('reconcile_status, contacted_at, attended')
      .eq('campaign_id', params.id)
      .range(from, to),
  );

  const counts = computeCounts(allPeople);

  // 9. Update campaign aggregate counts
  await supabase
    .from('follow_up_campaigns')
    .update({
      last_reconciled_at: new Date().toISOString(),
      expected_count: counts.submitted + counts.missing + counts.needs_review,
      submitted_count: counts.submitted,
      missing_count: counts.missing,
      not_in_group_count: counts.submitted_not_in_group,
      needs_review_count: counts.needs_review,
      contacted_count: counts.contacted,
      attended_count: counts.attended,
      completion_pct: counts.completion_pct,
    })
    .eq('id', params.id);

  return NextResponse.json({ success: true, counts });
}
