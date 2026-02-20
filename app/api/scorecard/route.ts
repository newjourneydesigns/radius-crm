import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// GET /api/scorecard?leader_id=123  — get scores for a leader
// GET /api/scorecard                — get all scores (for dashboard)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leaderId = searchParams.get('leader_id');

    let query = supabase
      .from('circle_leader_scores')
      .select('*')
      .order('scored_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (leaderId) {
      query = query.eq('circle_leader_id', parseInt(leaderId));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching scores:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('Scorecard GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/scorecard — submit a new scorecard rating
// Body: { circle_leader_id, reach_score, connect_score, disciple_score, develop_score, notes?, scored_date? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { circle_leader_id, reach_score, connect_score, disciple_score, develop_score, notes, scored_date } = body;

    if (!circle_leader_id) {
      return NextResponse.json({ error: 'circle_leader_id is required' }, { status: 400 });
    }

    // Validate scores are 1-5
    const scores = { reach_score, connect_score, disciple_score, develop_score };
    for (const [key, value] of Object.entries(scores)) {
      if (value === undefined || value === null) {
        return NextResponse.json({ error: `${key} is required` }, { status: 400 });
      }
      if (typeof value !== 'number' || value < 1 || value > 5) {
        return NextResponse.json({ error: `${key} must be between 1 and 5` }, { status: 400 });
      }
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const insertData: any = {
      circle_leader_id: parseInt(circle_leader_id),
      reach_score,
      connect_score,
      disciple_score,
      develop_score,
      notes: notes || null,
      scored_date: scored_date || new Date().toISOString().split('T')[0],
      scored_by: user?.id || null,
    };

    const { data, error } = await supabase
      .from('circle_leader_scores')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Error inserting score:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('Scorecard POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/scorecard — update an existing scorecard rating
// Body: { id, reach_score?, connect_score?, disciple_score?, develop_score?, notes?, scored_date? }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, reach_score, connect_score, disciple_score, develop_score, notes, scored_date } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Validate any provided scores are 1-5
    const scoreFields = { reach_score, connect_score, disciple_score, develop_score };
    for (const [key, value] of Object.entries(scoreFields)) {
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 1 || value > 5) {
          return NextResponse.json({ error: `${key} must be between 1 and 5` }, { status: 400 });
        }
      }
    }

    const updateData: any = {};
    if (reach_score !== undefined) updateData.reach_score = reach_score;
    if (connect_score !== undefined) updateData.connect_score = connect_score;
    if (disciple_score !== undefined) updateData.disciple_score = disciple_score;
    if (develop_score !== undefined) updateData.develop_score = develop_score;
    if (notes !== undefined) updateData.notes = notes || null;
    if (scored_date !== undefined) updateData.scored_date = scored_date;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('circle_leader_scores')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      console.error('Error updating score:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Scorecard PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/scorecard?id=123 — delete a scorecard rating
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('circle_leader_scores')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      console.error('Error deleting score:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Scorecard DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
