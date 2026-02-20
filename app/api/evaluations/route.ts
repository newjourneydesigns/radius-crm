import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

// GET /api/evaluations?leader_id=123           — all 4 categories for a leader
// GET /api/evaluations?leader_id=123&category=reach — one category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leaderId = searchParams.get('leader_id');
    const category = searchParams.get('category');

    if (!leaderId) {
      return NextResponse.json({ error: 'leader_id is required' }, { status: 400 });
    }

    let query = supabase
      .from('leader_category_evaluations')
      .select('*')
      .eq('leader_id', parseInt(leaderId));

    if (category) {
      query = query.eq('category', category);
    }

    const { data: evaluations, error } = await query;

    if (error) {
      console.error('Error fetching evaluations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch answers for each evaluation
    const evalIds = (evaluations || []).map(e => e.id);
    let answers: any[] = [];

    if (evalIds.length > 0) {
      const { data: answerData, error: answerError } = await supabase
        .from('leader_category_answers')
        .select('*')
        .in('evaluation_id', evalIds);

      if (answerError) {
        console.error('Error fetching answers:', answerError);
      } else {
        answers = answerData || [];
      }
    }

    // Group answers by evaluation_id
    const answersByEval: Record<number, Record<string, string | null>> = {};
    for (const a of answers) {
      if (!answersByEval[a.evaluation_id]) answersByEval[a.evaluation_id] = {};
      answersByEval[a.evaluation_id][a.question_key] = a.answer;
    }

    // Attach answers to evaluations
    const result = (evaluations || []).map(e => ({
      ...e,
      answers: answersByEval[e.id] || {},
    }));

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Evaluations GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/evaluations — upsert an evaluation with answers
// Body: { leader_id, category, manual_override_score?, context_notes?, answers: { question_key: 'yes'|'no'|null } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leader_id, category, manual_override_score, context_notes, answers } = body;

    if (!leader_id || !category) {
      return NextResponse.json({ error: 'leader_id and category are required' }, { status: 400 });
    }

    const validCategories = ['reach', 'connect', 'disciple', 'develop'];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (manual_override_score !== undefined && manual_override_score !== null) {
      if (typeof manual_override_score !== 'number' || manual_override_score < 1 || manual_override_score > 5) {
        return NextResponse.json({ error: 'manual_override_score must be 1-5' }, { status: 400 });
      }
    }

    const { data: { user } } = await supabase.auth.getUser();

    // Upsert evaluation
    const { data: evaluation, error: evalError } = await supabase
      .from('leader_category_evaluations')
      .upsert(
        {
          leader_id: parseInt(leader_id),
          category,
          manual_override_score: manual_override_score ?? null,
          context_notes: context_notes || null,
          evaluated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'leader_id,category' }
      )
      .select()
      .single();

    if (evalError) {
      console.error('Error upserting evaluation:', evalError);
      return NextResponse.json({ error: evalError.message }, { status: 500 });
    }

    // Upsert answers
    if (answers && typeof answers === 'object') {
      for (const [questionKey, answer] of Object.entries(answers)) {
        const answerValue = answer as string | null;

        if (answerValue === null) {
          // Delete the answer row if cleared
          await supabase
            .from('leader_category_answers')
            .delete()
            .eq('evaluation_id', evaluation.id)
            .eq('question_key', questionKey);
        } else {
          await supabase
            .from('leader_category_answers')
            .upsert(
              {
                evaluation_id: evaluation.id,
                question_key: questionKey,
                answer: answerValue,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'evaluation_id,question_key' }
            );
        }
      }
    }

    // Re-fetch with answers
    const { data: freshAnswers } = await supabase
      .from('leader_category_answers')
      .select('*')
      .eq('evaluation_id', evaluation.id);

    const answersMap: Record<string, string | null> = {};
    for (const a of (freshAnswers || [])) {
      answersMap[a.question_key] = a.answer;
    }

    return NextResponse.json({ ...evaluation, answers: answersMap }, { status: 200 });
  } catch (err: any) {
    console.error('Evaluations POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/evaluations?leader_id=123&category=reach — clear an evaluation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leaderId = searchParams.get('leader_id');
    const category = searchParams.get('category');

    if (!leaderId || !category) {
      return NextResponse.json({ error: 'leader_id and category are required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('leader_category_evaluations')
      .delete()
      .eq('leader_id', parseInt(leaderId))
      .eq('category', category);

    if (error) {
      console.error('Error deleting evaluation:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Evaluations DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
