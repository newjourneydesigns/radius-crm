import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../../lib/server-supabase';
import { createCCBClient } from '../../../../../lib/ccb/ccb-client';
import { CCB_V2_API_BASE_URL, CCB_V2_ACCEPT_HEADER } from '../../../../../lib/ccb/ccb-v2-config';

export const dynamic = 'force-dynamic';

/**
 * THROWAWAY Phase 0 probe — delete after the v1→v2 ID-parity gate is settled.
 *
 * Answers the go/no-go question for the migration: does CCB v2 return the SAME
 * entity IDs as v1 for groups/individuals we already store? Also captures v2
 * rate-limit headers and whether group members embed contact fields (which would
 * let us drop the N+1 phone enrichment).
 *
 * Auth: pass the v2 access token via `Authorization: Bearer <token>` (preferred)
 * or `?token=` for quick browser testing. The token is never persisted.
 *
 * Optional query params: ?groupId= (defaults to a real ccb_group_id from
 * circle_leaders) and ?individualId= (defaults to the first member found).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cookieToken = (request.headers.get('cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('ccb_v2_probe_token='))
    ?.slice('ccb_v2_probe_token='.length);
  const token =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    searchParams.get('token')?.trim() ||
    cookieToken?.trim();

  if (!token) {
    return NextResponse.json(
      { error: 'Provide a v2 access token via Authorization: Bearer <token> or ?token=' },
      { status: 400 }
    );
  }

  // Resolve a group id to test: explicit param, else a real one from our DB.
  let groupId = searchParams.get('groupId')?.trim() || '';
  if (!groupId) {
    try {
      const supabase = createServiceSupabaseClient();
      const { data } = await supabase
        .from('circle_leaders')
        .select('ccb_group_id')
        .not('ccb_group_id', 'is', null)
        .limit(1);
      groupId = String(data?.[0]?.ccb_group_id || '').trim();
    } catch (e: any) {
      return NextResponse.json({ error: 'Could not auto-pick a group id', detail: e.message }, { status: 500 });
    }
  }
  if (!groupId) {
    return NextResponse.json({ error: 'No ccb_group_id available; pass ?groupId=' }, { status: 400 });
  }

  // ---- v2 fetch helper ----
  const v2 = async (path: string) => {
    const res = await fetch(`${CCB_V2_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: CCB_V2_ACCEPT_HEADER },
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    const rateHeaders = {
      limit: res.headers.get('x-ratelimit-limit'),
      remaining: res.headers.get('x-ratelimit-remaining'),
      reset: res.headers.get('x-ratelimit-reset'),
      retryAfter: res.headers.get('retry-after'),
    };
    return { status: res.status, ok: res.ok, json, rateHeaders };
  };

  const report: any = { groupId, v2: {}, v1: {}, verdict: {} };

  // ---- v2 calls ----
  const v2Group = await v2(`/groups/${encodeURIComponent(groupId)}`);
  const v2Members = await v2(`/groups/${encodeURIComponent(groupId)}/members`);
  report.v2.group = { status: v2Group.status, id: v2Group.json?.id ?? v2Group.json?.data?.id ?? null, rateHeaders: v2Group.rateHeaders };

  const memberList: any[] = Array.isArray(v2Members.json)
    ? v2Members.json
    : v2Members.json?.items ?? v2Members.json?.data ?? [];
  const firstMember = memberList[0] || {};
  const individualId =
    searchParams.get('individualId')?.trim() ||
    String(firstMember.id ?? firstMember.individual_id ?? firstMember.individual?.id ?? '').trim();

  report.v2.members = {
    status: v2Members.status,
    count: memberList.length,
    sampleKeys: Object.keys(firstMember),
    // Does the member object carry contact info inline? (kills N+1 phone enrichment if so)
    embedsContact: Boolean(firstMember.phone || firstMember.mobile_phone || firstMember.email || firstMember.phones || firstMember.contact),
  };

  let v2Individual: any = null;
  if (individualId) {
    v2Individual = await v2(`/individuals/${encodeURIComponent(individualId)}`);
    report.v2.individual = { status: v2Individual.status, id: v2Individual.json?.id ?? v2Individual.json?.data?.id ?? null };
  }

  // ---- v1 calls (same IDs) ----
  try {
    const ccb = createCCBClient({ module: 'v2-probe', action: 'parity-check', direction: 'pull' });
    const v1Participants = await ccb.getGroupParticipants(groupId);
    report.v1.participantCount = v1Participants.length;
    report.v1.participantIds = v1Participants.slice(0, 5).map((p) => p.id);
    if (individualId) {
      const v1Ind = await ccb.getIndividualProfile(individualId).catch((e) => ({ error: e.message }));
      report.v1.individual = v1Ind;
    }
  } catch (e: any) {
    report.v1.error = e.message;
  }

  // ---- verdict ----
  const v2MemberIds = memberList.slice(0, 20).map((m) => String(m.id ?? m.individual_id ?? m.individual?.id ?? '')).filter(Boolean);
  const v1Ids = new Set((report.v1.participantIds || []).map(String));
  report.verdict = {
    groupIdEchoedByV2: report.v2.group.id != null ? String(report.v2.group.id) === String(groupId) : 'unknown',
    individualIdEchoedByV2: individualId && report.v2.individual?.id != null ? String(report.v2.individual.id) === String(individualId) : 'unknown',
    memberIdOverlap: v2MemberIds.some((id) => v1Ids.has(id)) ? 'OVERLAP — IDs likely shared (GOOD)' : 'no overlap detected — inspect manually',
    note: 'Manually compare names/emails below to confirm same entities. If IDs match → proceed to Phase 1.',
  };

  return NextResponse.json(report, { status: 200 });
}
