import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// GET /api/acpd-tracking?type=prayer|encourage|coach&leader_id=123
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const leaderId = searchParams.get('leader_id');

    if (!type || !['prayer', 'encourage', 'coach'].includes(type)) {
      return NextResponse.json({ error: 'type must be prayer, encourage, or coach' }, { status: 400 });
    }

    const tableMap: Record<string, string> = {
      prayer: 'acpd_prayer_points',
      encourage: 'acpd_encouragements',
      coach: 'acpd_coaching_notes',
    };

    let query = supabase
      .from(tableMap[type])
      .select('*')
      .order('created_at', { ascending: false });

    if (leaderId) {
      query = query.eq('circle_leader_id', parseInt(leaderId));
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching ${type}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('ACPD tracking GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/acpd-tracking?type=prayer|encourage|coach
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const body = await request.json();

    if (!type || !['prayer', 'encourage', 'coach'].includes(type)) {
      return NextResponse.json({ error: 'type must be prayer, encourage, or coach' }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const tableMap: Record<string, string> = {
      prayer: 'acpd_prayer_points',
      encourage: 'acpd_encouragements',
      coach: 'acpd_coaching_notes',
    };

    let insertData: any;

    if (type === 'prayer') {
      if (!body.content || !body.circle_leader_id) {
        return NextResponse.json({ error: 'content and circle_leader_id required' }, { status: 400 });
      }
      insertData = {
        circle_leader_id: body.circle_leader_id,
        user_id: user.id,
        content: body.content,
        is_answered: false,
      };
    } else if (type === 'encourage') {
      if (!body.circle_leader_id || !body.message_type) {
        return NextResponse.json({ error: 'circle_leader_id and message_type required' }, { status: 400 });
      }
      insertData = {
        circle_leader_id: body.circle_leader_id,
        user_id: user.id,
        message_type: body.message_type,
        message_date: body.message_date || new Date().toISOString().split('T')[0],
        note: body.note || null,
      };
    } else if (type === 'coach') {
      if (!body.content || !body.circle_leader_id || !body.dimension) {
        return NextResponse.json({ error: 'content, circle_leader_id, and dimension required' }, { status: 400 });
      }
      insertData = {
        circle_leader_id: body.circle_leader_id,
        user_id: user.id,
        dimension: body.dimension,
        content: body.content,
        is_resolved: false,
      };
    }

    const { data, error } = await supabase
      .from(tableMap[type])
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error(`Error inserting ${type}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('ACPD tracking POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/acpd-tracking?type=prayer|encourage|coach&id=123
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    const body = await request.json();

    if (!type || !['prayer', 'encourage', 'coach'].includes(type)) {
      return NextResponse.json({ error: 'type must be prayer, encourage, or coach' }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const tableMap: Record<string, string> = {
      prayer: 'acpd_prayer_points',
      encourage: 'acpd_encouragements',
      coach: 'acpd_coaching_notes',
    };

    const { data, error } = await supabase
      .from(tableMap[type])
      .update(body)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      console.error(`Error updating ${type}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('ACPD tracking PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/acpd-tracking?type=prayer|encourage|coach&id=123
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !['prayer', 'encourage', 'coach'].includes(type)) {
      return NextResponse.json({ error: 'type must be prayer, encourage, or coach' }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const tableMap: Record<string, string> = {
      prayer: 'acpd_prayer_points',
      encourage: 'acpd_encouragements',
      coach: 'acpd_coaching_notes',
    };

    const { error } = await supabase
      .from(tableMap[type])
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      console.error(`Error deleting ${type}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('ACPD tracking DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
