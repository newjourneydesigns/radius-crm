import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';
import { verifyAdminAccess } from '../../../../lib/auth-middleware';
import { createCCBv2Client, CCBv2RequestError } from '../../../../lib/ccb/ccb-v2-client';
import {
  EventOccurrenceDeleteCandidate,
  EventOccurrenceSearchParams,
  RadiusCircleOccurrenceSearchParams,
  candidateKey,
  searchEventOccurrences,
  searchEventOccurrencesForGroups,
  validateOccurrence,
  validateRadiusCircleSearchParams,
  validateSearchParams,
} from '../../../../lib/ccb/event-occurrence-delete';

export const dynamic = 'force-dynamic';

type UserProfile = {
  name: string | null;
  email: string | null;
};

async function adminUserContext(request: NextRequest) {
  const access = await verifyAdminAccess(request);
  if (!access.isAdmin || !access.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: access.error || 'Admin access required' }, { status: access.error === 'No authentication token provided' ? 401 : 403 }),
    };
  }

  const supabase = createServiceSupabaseClient();
  const { data: profile } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', access.user.id)
    .maybeSingle<UserProfile>();

  return {
    ok: true as const,
    user: access.user,
    userName: profile?.name || access.user.user_metadata?.name || null,
    userEmail: profile?.email || access.user.email || null,
    supabase,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sanitizedSearchParams(params: EventOccurrenceSearchParams | RadiusCircleOccurrenceSearchParams) {
  if ('groups' in params) {
    return {
      mode: 'radius-circles',
      acpd: params.acpd,
      status: params.status || 'all',
      startDate: params.startDate,
      endDate: params.endDate,
      includeOccurrencesWithAttendance: params.includeOccurrencesWithAttendance,
      groupCount: params.groups.length,
      groups: params.groups.map((group) => ({
        group_id: group.group_id,
        group_name: group.group_name,
        radius_circle_id: group.radius_circle_id ?? null,
        radius_circle_name: group.radius_circle_name ?? null,
      })),
    };
  }

  return {
    mode: 'ccb-name-search',
    groupName: params.groupName,
    groupMatchMode: params.groupMatchMode,
    eventName: params.eventName,
    eventMatchMode: params.eventMatchMode,
    startDate: params.startDate,
    endDate: params.endDate,
    includeInactiveGroups: params.includeInactiveGroups,
    includeOccurrencesWithAttendance: params.includeOccurrencesWithAttendance,
  };
}

async function insertAudit(input: {
  supabase: ReturnType<typeof createServiceSupabaseClient>;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  action: 'search' | 'delete';
  searchParams: Record<string, unknown>;
  occurrence?: Partial<EventOccurrenceDeleteCandidate>;
  ccbResponseStatus?: number | null;
  success: boolean;
  errorMessage?: string | null;
  resultCount?: number | null;
  selectedCount?: number | null;
}) {
  const { error } = await input.supabase.from('ccb_event_occurrence_deletion_audit').insert({
    user_id: input.userId,
    user_email: input.userEmail,
    user_name: input.userName,
    action: input.action,
    search_params: input.searchParams,
    group_id: input.occurrence?.group_id || null,
    group_name: input.occurrence?.group_name || null,
    event_id: input.occurrence?.event_id || null,
    event_name: input.occurrence?.event_name || null,
    occurrence: input.occurrence?.occurrence || null,
    event_start: input.occurrence?.start || null,
    event_end: input.occurrence?.end || null,
    had_attendance: input.occurrence?.had_attendance ?? null,
    total_attendance: input.occurrence?.total_attendance ?? null,
    ccb_response_status: input.ccbResponseStatus ?? null,
    success: input.success,
    error_message: input.errorMessage?.slice(0, 2000) || null,
    result_count: input.resultCount ?? null,
    selected_count: input.selectedCount ?? null,
  });

  if (error) throw new Error(`Failed to write CCB delete audit record: ${error.message}`);
}

function normalizeSelectedOccurrences(value: unknown): EventOccurrenceDeleteCandidate[] {
  if (!Array.isArray(value)) throw new Error('occurrences must be an array');
  if (value.length === 0) throw new Error('Select at least one occurrence to delete');
  if (value.length > 100) throw new Error('Delete at most 100 occurrences at a time');

  const seen = new Set<string>();
  return value.map((raw) => {
    const row = raw as Partial<EventOccurrenceDeleteCandidate> & Record<string, unknown>;
    const candidate: EventOccurrenceDeleteCandidate = {
      group_id: String(row?.group_id || '').trim(),
      group_name: String(row?.group_name || '').trim(),
      event_id: String(row?.event_id || '').trim(),
      event_name: String(row?.event_name || '').trim(),
      occurrence: validateOccurrence(String(row?.occurrence || '').trim()),
      start: row?.start ? String(row.start) : null,
      end: row?.end ? String(row.end) : null,
      status: row?.status ? String(row.status) : null,
      total_attendance: Number.isFinite(Number(row?.total_attendance)) ? Number(row.total_attendance) : null,
      had_attendance: row?.had_attendance === true || Number(row?.total_attendance) > 0,
      notes_indicators: Array.isArray(row?.notes_indicators)
        ? row.notes_indicators.map((item: unknown) => String(item)).slice(0, 10)
        : [],
      is_recurring: typeof row?.is_recurring === 'boolean' ? row.is_recurring : null,
      recurrence_label: row?.recurrence_label ? String(row.recurrence_label) : 'Unknown',
    };

    if (!candidate.group_id) throw new Error('Each occurrence must include group_id');
    if (!candidate.group_name) throw new Error('Each occurrence must include group_name');
    if (!candidate.event_id || !/^\d+$/.test(candidate.event_id)) throw new Error('Each occurrence must include a numeric event_id');
    if (!candidate.event_name) throw new Error('Each occurrence must include event_name');

    const key = candidateKey(candidate);
    if (seen.has(key)) throw new Error(`Duplicate selected occurrence: ${key}`);
    seen.add(key);
    return candidate;
  });
}

export async function POST(request: NextRequest) {
  const context = await adminUserContext(request);
  if (!context.ok) return context.response;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body?.action === 'search') {
    try {
      const isRadiusCircleSearch = body.searchMode === 'radius-circles' || Array.isArray(body.groups);
      const params = isRadiusCircleSearch
        ? validateRadiusCircleSearchParams(body as Partial<RadiusCircleOccurrenceSearchParams>)
        : validateSearchParams(body as Partial<EventOccurrenceSearchParams>);
      const ccb = createCCBv2Client({
        userId: context.user.id,
        module: 'Admin CCB Tools',
        action: 'Search Event Occurrences For Delete',
        direction: 'pull',
      });

      const result = isRadiusCircleSearch
        ? await searchEventOccurrencesForGroups(ccb, params as RadiusCircleOccurrenceSearchParams)
        : await searchEventOccurrences(ccb, params as EventOccurrenceSearchParams);
      await insertAudit({
        supabase: context.supabase,
        userId: context.user.id,
        userEmail: context.userEmail,
        userName: context.userName,
        action: 'search',
        searchParams: sanitizedSearchParams(params),
        success: true,
        resultCount: result.occurrences.length,
      });

      return NextResponse.json({
        success: true,
        searchParams: sanitizedSearchParams(params),
        ...result,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to search CCB occurrences' },
        { status: 400 }
      );
    }
  }

  if (body?.action === 'delete') {
    let selected: EventOccurrenceDeleteCandidate[];
    let auditSearchParams: Record<string, unknown> = {};

    try {
      selected = normalizeSelectedOccurrences(body?.occurrences);
      if (isRecord(body?.searchParams)) auditSearchParams = body.searchParams;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid delete request' },
        { status: 400 }
      );
    }

    const requiredConfirmation = `DELETE ${selected.length} OCCURRENCES`;
    if (body?.confirmation !== requiredConfirmation) {
      return NextResponse.json(
        { error: `Typed confirmation must match exactly: ${requiredConfirmation}` },
        { status: 400 }
      );
    }

    const attendedSelected = selected.some((occurrence) => occurrence.had_attendance);
    if (attendedSelected && body?.allowDeleteAttended !== true) {
      return NextResponse.json(
        { error: 'Selected occurrences include attendance. Check the attended-occurrence acknowledgement before deleting.' },
        { status: 400 }
      );
    }

    const ccb = createCCBv2Client({
      userId: context.user.id,
      module: 'Admin CCB Tools',
      action: 'Delete Event Occurrence',
      direction: 'push',
    });

    const results: Array<EventOccurrenceDeleteCandidate & {
      success: boolean;
      ccb_response_status: number | null;
      error_message: string | null;
      audit_error?: string;
    }> = [];

    for (const occurrence of selected) {
      let success = false;
      let ccbResponseStatus: number | null = null;
      let errorMessage: string | null = null;

      try {
        const response = await ccb.requestWithResponse(`/events/${occurrence.event_id}/${occurrence.occurrence}`, {
          method: 'DELETE',
        });
        success = true;
        ccbResponseStatus = response.status;
      } catch (error) {
        success = false;
        if (error instanceof CCBv2RequestError) {
          ccbResponseStatus = error.status;
          errorMessage = error.message;
        } else {
          errorMessage = error instanceof Error ? error.message : 'CCB delete failed';
        }
      }

      let auditError: string | undefined;
      try {
        await insertAudit({
          supabase: context.supabase,
          userId: context.user.id,
          userEmail: context.userEmail,
          userName: context.userName,
          action: 'delete',
          searchParams: auditSearchParams,
          occurrence,
          ccbResponseStatus,
          success,
          errorMessage,
          selectedCount: selected.length,
        });
      } catch (error) {
        auditError = error instanceof Error ? error.message : 'Failed to write audit record';
      }

      results.push({
        ...occurrence,
        success,
        ccb_response_status: ccbResponseStatus,
        error_message: errorMessage,
        ...(auditError ? { audit_error: auditError } : {}),
      });

      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    return NextResponse.json({
      success: results.every((result) => result.success),
      attempted: results.length,
      succeeded: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
