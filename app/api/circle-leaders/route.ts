import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { verifyAdminAccessDemo } from '../../../lib/auth-middleware';

const VALID_STATUSES = ['invited', 'pipeline', 'on-boarding', 'active', 'paused', 'off-boarding'] as const;

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { isAdmin, error: adminAuthError } = await verifyAdminAccessDemo(request);
    if (!isAdmin) {
      return NextResponse.json({ error: adminAuthError || 'Admin access required' }, { status: 403 });
    }

    const circleLeader = await request.json();

    // Validate required fields
    const name = normalizeString(circleLeader.name);
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const isHostTeam = circleLeader.leader_type === 'host_team';

    // Clean up the data
    const cleanData: Record<string, any> = {
      leader_type: isHostTeam ? 'host_team' : 'circle',
      name,
      // Set default status if none provided
      status: 'active',
      event_summary_received: false,
    };

    const email = normalizeString(circleLeader.email);
    if (email) cleanData.email = email;

    const phone = normalizeString(circleLeader.phone);
    if (phone) cleanData.phone = phone;

    const campus = normalizeString(circleLeader.campus);
    if (campus) cleanData.campus = campus;

    const statusValue = normalizeString(circleLeader.status);
    if (statusValue) {
      const normalizedStatus = statusValue.toLowerCase();
      if (!VALID_STATUSES.includes(normalizedStatus as (typeof VALID_STATUSES)[number])) {
        return NextResponse.json(
          { error: `Status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      cleanData.status = normalizedStatus;
    }

    if (!isHostTeam) {
      const circleName = normalizeString(circleLeader.circle_name);
      cleanData.circle_name = circleName || name;

      const acpd = normalizeString(circleLeader.acpd);
      if (acpd) cleanData.acpd = acpd;

      const day = normalizeString(circleLeader.day);
      if (day) cleanData.day = day;

      const time = normalizeString(circleLeader.time);
      if (time) cleanData.time = time;

      const frequency = normalizeString(circleLeader.frequency);
      if (frequency) cleanData.frequency = frequency;

      const circleType = normalizeString(circleLeader.circle_type);
      if (circleType) cleanData.circle_type = circleType;

      const ccbProfileLink = normalizeString(circleLeader.ccb_profile_link);
      if (ccbProfileLink) cleanData.ccb_profile_link = ccbProfileLink;

      const leaderCcbProfileLink = normalizeString(circleLeader.leader_ccb_profile_link);
      if (leaderCcbProfileLink) cleanData.leader_ccb_profile_link = leaderCcbProfileLink;
    } else {
      const teamName = normalizeString(circleLeader.team_name);
      if (teamName) cleanData.team_name = teamName;

      const director = normalizeString(circleLeader.director);
      if (director) cleanData.director = director;
    }

    // Optional: anchor date for bi-weekly parity (expects YYYY-MM-DD)
    if (circleLeader.meeting_start_date && String(circleLeader.meeting_start_date).trim()) {
      const raw = String(circleLeader.meeting_start_date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        cleanData.meeting_start_date = raw;
      }
    }

    const db = getServiceClient() || supabase;

    // Insert into database
    const { data, error } = await db
      .from('circle_leaders')
      .insert([cleanData])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Parse query params for filtering
    const { searchParams } = new URL(request.url);
    const campusParam = searchParams.get('campus');

    let query = supabase
      .from('circle_leaders')
      .select('*');

    // If campus filter is provided, normalize and filter
    if (campusParam) {
      // Normalize campus value for comparison
      const normalizedCampus = campusParam.trim().toLowerCase();
      query = query.ilike('campus', normalizedCampus);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ circleLeaders: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Mass update ACPD or Campus for multiple circle leaders
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { leaderIds, field, value } = body;

    // Validate required fields
    if (!leaderIds || !Array.isArray(leaderIds) || leaderIds.length === 0) {
      return NextResponse.json(
        { error: 'leaderIds must be a non-empty array' },
        { status: 400 }
      );
    }

    const validFields = ['campus', 'acpd', 'frequency', 'circle_type', 'day', 'time', 'meeting_start_date', 'status'];
    if (!field || !validFields.includes(field)) {
      return NextResponse.json(
        { error: `field must be one of: ${validFields.join(', ')}` },
        { status: 400 }
      );
    }

    if (field === 'status') {
      const validStatuses = ['invited', 'on-boarding', 'active', 'paused', 'off-boarding'];
      if (!validStatuses.includes(value.trim().toLowerCase())) {
        return NextResponse.json(
          { error: `status must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return NextResponse.json(
        { error: 'value must be a non-empty string' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('circle_leaders')
      .update({ [field]: value.trim(), updated_at: new Date().toISOString() })
      .in('id', leaderIds)
      .select('id, name, campus, acpd');

    if (error) {
      console.error('Mass update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { updated: data?.length || 0, leaders: data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Mass update API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
