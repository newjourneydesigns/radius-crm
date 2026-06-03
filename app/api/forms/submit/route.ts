import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { FormField } from '../../../../lib/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// In-memory rate limiter: max 10 submissions per IP per 5 minutes.
// Note: per-instance only (fine for a single Netlify function instance).
const _rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please wait a few minutes and try again.' },
        { status: 429, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { formId, data } = body as { formId: string; data: Record<string, string> };

    if (!formId || !data) {
      return NextResponse.json({ error: 'Missing formId or data' }, { status: 400, headers: corsHeaders });
    }

    // Service-role client bypasses RLS so anon submissions can create cards.
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch the form (must be active)
    const { data: form, error: formErr } = await supabase
      .from('board_forms')
      .select('*')
      .eq('id', formId)
      .eq('is_active', true)
      .single();

    if (formErr || !form) {
      return NextResponse.json({ error: 'Form not found or inactive' }, { status: 404, headers: corsHeaders });
    }

    const fields = (form.fields || []) as FormField[];

    // Validate required fields server-side.
    for (const field of fields) {
      // Hidden assignee fields are satisfied by their configured default, not user input.
      if (field.maps_to === 'assignee' && field.assignee_visible === false) continue;
      if (field.required && !data[field.id]?.trim()) {
        return NextResponse.json({ error: `${field.label} is required` }, { status: 400, headers: corsHeaders });
      }
    }

    // ── Build card data from field mappings ──
    let cardTitle = 'Form submission';
    let cardDescription = '';
    let cardPriority = 'medium';
    let cardDueDate: string | null = null;
    let cardAssigneeId: string | null = null; // a user id (uuid)
    const descParts: string[] = [];

    for (const field of fields) {
      // Hidden assignee: apply the form-configured default before the empty-value guard.
      if (field.maps_to === 'assignee' && field.assignee_visible === false) {
        if (field.assignee_default_id) cardAssigneeId = field.assignee_default_id;
        continue;
      }

      const value = (data[field.id] || '').trim();
      if (!value) continue;

      if (field.maps_to === 'title') {
        cardTitle = value;
      } else if (field.maps_to === 'description') {
        cardDescription = value;
      } else if (field.maps_to === 'priority') {
        if (['low', 'medium', 'high', 'urgent'].includes(value)) {
          cardPriority = value;
        }
      } else if (field.maps_to === 'due_date') {
        cardDueDate = value;
      } else if (field.maps_to === 'assignee') {
        cardAssigneeId = value;
      } else {
        // Unmapped fields go into the card description.
        descParts.push(`**${field.label}:** ${value}`);
      }
    }

    // Append unmapped fields under the mapped description.
    if (descParts.length > 0) {
      cardDescription = cardDescription
        ? cardDescription + '\n\n' + descParts.join('\n')
        : descParts.join('\n');
    }

    // Radius models assignees via the card_assignments join table (the board UI
    // reads it, enriched from public.users), plus a legacy board_cards.assignee
    // text column that holds the display name. Resolve the chosen user up front
    // so we can set both consistently.
    let assigneeName: string | null = null;
    let assigneeUserId: string | null = null;
    if (cardAssigneeId) {
      const { data: assigneeUser } = await supabase
        .from('users')
        .select('id, name')
        .eq('id', cardAssigneeId)
        .maybeSingle();
      if (assigneeUser) {
        assigneeUserId = assigneeUser.id;
        assigneeName = assigneeUser.name || null;
      }
    }

    // Next position in the target column.
    const { data: existingCards } = await supabase
      .from('board_cards')
      .select('position')
      .eq('column_id', form.column_id)
      .order('position', { ascending: false })
      .limit(1);
    const nextPosition = existingCards && existingCards.length > 0 ? existingCards[0].position + 1 : 0;

    // Create the card.
    const { data: card, error: cardErr } = await supabase
      .from('board_cards')
      .insert([{
        board_id: form.board_id,
        column_id: form.column_id,
        title: cardTitle,
        description: cardDescription || null,
        priority: cardPriority,
        due_date: cardDueDate,
        assignee: assigneeName,
        created_by: form.user_id,
        position: nextPosition,
        is_archived: false,
      }])
      .select()
      .single();

    if (cardErr) {
      console.error('[form-submit] Failed to create card:', cardErr);
      return NextResponse.json({ error: 'Failed to create card' }, { status: 500, headers: corsHeaders });
    }

    // Wire the assignee into card_assignments (the source of truth the board UI reads).
    if (assigneeUserId) {
      const { error: assignErr } = await supabase
        .from('card_assignments')
        .insert([{ card_id: card.id, user_id: assigneeUserId, assigned_by: form.user_id }]);
      if (assignErr) console.error('[form-submit] Failed to write card_assignments (non-critical):', assignErr);
    }

    // Log the raw submission for the record.
    await supabase
      .from('form_submissions')
      .insert([{ form_id: formId, data, card_id: card.id }]);

    // Assignment notification: Radius has no inbox/notifications table and no
    // assignment-email helper, and we must not add paid email/AI calls without
    // approval, so this is intentionally a no-op. If a notifications table or an
    // assignment-email helper is added later, hook it in here (wrapped in
    // try/catch so it can never fail the submission).

    return NextResponse.json(
      { success: true, cardId: card.id, boardId: form.board_id },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[form-submit] Unexpected error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders });
  }
}
