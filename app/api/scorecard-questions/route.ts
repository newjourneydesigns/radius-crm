import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// GET /api/scorecard-questions — fetch all active questions grouped by category
// GET /api/scorecard-questions?category=reach — fetch questions for one category
// GET /api/scorecard-questions?include_inactive=true — include deactivated questions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const includeInactive = searchParams.get('include_inactive') === 'true';

    let query = supabase
      .from('scorecard_questions')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching scorecard questions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('Scorecard questions GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/scorecard-questions — create a new question
// Body: { category, question_key, label, sort_order? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, question_key, label, sort_order } = body;

    if (!category || !label) {
      return NextResponse.json({ error: 'category and label are required' }, { status: 400 });
    }

    const validCategories = ['reach', 'connect', 'disciple', 'develop'];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category. Must be: reach, connect, disciple, or develop' }, { status: 400 });
    }

    // Auto-generate question_key from label if not provided
    const key = question_key || label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);

    // Get the next sort_order if not provided
    let order = sort_order;
    if (order === undefined || order === null) {
      const { data: maxData } = await supabase
        .from('scorecard_questions')
        .select('sort_order')
        .eq('category', category)
        .order('sort_order', { ascending: false })
        .limit(1);

      order = (maxData && maxData.length > 0) ? maxData[0].sort_order + 1 : 0;
    }

    const { data, error } = await supabase
      .from('scorecard_questions')
      .insert({
        category,
        question_key: key,
        label: label.trim(),
        sort_order: order,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating scorecard question:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A question with this key already exists in this category' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('Scorecard questions POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/scorecard-questions — update a question
// Body: { id, label?, sort_order?, is_active? }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, label, sort_order, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (label !== undefined) updates.label = label.trim();
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabase
      .from('scorecard_questions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating scorecard question:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Scorecard questions PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/scorecard-questions?id=123 — delete a question
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('scorecard_questions')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      console.error('Error deleting scorecard question:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Scorecard questions DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
