import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { createServiceSupabaseClient } from '../../../../lib/server-supabase';

const ALLOWED_FIELDS = ['frequency', 'day', 'time', 'meeting_start_date', 'ccb_group_id', 'ccb_profile_link'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid leader id' }, { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, string | null> = {};

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updates[field] = body[field] || null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    // Schedule fields are derived from the CCB calendar snapshot for
    // calendar-managed circles — reject the edit with the fix path instead of
    // letting the next sync silently overwrite it.
    const SCHEDULE_FIELDS = ['frequency', 'day', 'time', 'meeting_start_date'];
    if (SCHEDULE_FIELDS.some((f) => f in updates)) {
      const { data: current } = await createServiceSupabaseClient()
        .from('circle_leaders')
        .select('schedule_source')
        .eq('id', id)
        .maybeSingle();
      if (current?.schedule_source === 'ccb_calendar') {
        return NextResponse.json(
          { error: 'This circle’s schedule comes from its CCB calendar. Update the events in CCB, then use Resync Calendar.' },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from('circle_leaders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, frequency, day, time, meeting_start_date, ccb_group_id, ccb_profile_link')
      .single();

    if (error) {
      console.error('Leader update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leader: data }, { status: 200 });
  } catch (error) {
    console.error('Leader update API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
