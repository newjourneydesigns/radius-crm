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
const VALID_CARD_MAPPINGS: Array<NonNullable<FormField['maps_to']>> = [
  'title',
  'description',
  'priority',
  'due_date',
  'assignee',
  'screenshot_url',
];

type SubmittedData = Record<string, unknown>;
type DescriptionRow = { label: string; value: string };

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

function getCardMapping(field: FormField): FormField['maps_to'] {
  const raw = (
    field as FormField & {
      mapsTo?: string;
      map_to?: string;
      cardField?: string;
      card_field?: string;
    }
  ).maps_to
    || (field as { mapsTo?: string }).mapsTo
    || (field as { map_to?: string }).map_to
    || (field as { cardField?: string }).cardField
    || (field as { card_field?: string }).card_field;

  return VALID_CARD_MAPPINGS.includes(raw as NonNullable<FormField['maps_to']>)
    ? raw as FormField['maps_to']
    : undefined;
}

function submittedValueToString(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(submittedValueToString).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDescriptionValue(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function formatSubmissionDescription(rows: DescriptionRow[]): string {
  return rows
    .map((row) => `<p><strong>${escapeHtml(row.label)}:</strong> ${formatDescriptionValue(row.value)}</p>`)
    .join('\n');
}

function normalizePriority(value: string): string | null {
  const priority = value.trim().toLowerCase();
  return ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : null;
}

function formatPriority(value: string): string {
  const normalized = normalizePriority(value);
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : value;
}

function fieldAssigneeName(field: FormField, userId: string): string | null {
  return (field.assignee_options || []).find((option) => option.id === userId)?.name || null;
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
    const { formId, data } = body as { formId: string; data: SubmittedData };

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
      if (getCardMapping(field) === 'assignee' && field.assignee_visible === false) continue;
      if (field.required && !submittedValueToString(data[field.id]).trim()) {
        return NextResponse.json({ error: `${field.label} is required` }, { status: 400, headers: corsHeaders });
      }
    }

    // ── Build card data from field mappings ──
    let cardTitle = 'Form submission';
    let cardDescription = '';
    let cardPriority = 'medium';
    let cardDueDate: string | null = null;
    let cardAssigneeId: string | null = null; // a user id (uuid)
    let cardScreenshotUrl: string | null = null;

    for (const field of fields) {
      const mapping = getCardMapping(field);

      // Hidden assignee: apply the form-configured default before the empty-value guard.
      if (mapping === 'assignee' && field.assignee_visible === false) {
        if (field.assignee_default_id) cardAssigneeId = field.assignee_default_id;
        continue;
      }

      const value = submittedValueToString(data[field.id]).trim();
      if (!value) continue;

      if (mapping === 'title') {
        cardTitle = value;
      } else if (mapping === 'description') {
        cardDescription = value;
      } else if (mapping === 'priority') {
        cardPriority = normalizePriority(value) || cardPriority;
      } else if (mapping === 'due_date') {
        cardDueDate = value;
      } else if (mapping === 'assignee') {
        cardAssigneeId = value;
      } else if (mapping === 'screenshot_url') {
        cardScreenshotUrl = value;
      }
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

    // Mirror the submissions tab: every submitted field is rendered into the
    // card description, even when it is also mapped to title/priority/etc.
    const fieldIds = new Set(fields.map((field) => field.id));
    const descriptionRows: DescriptionRow[] = [];

    for (const field of fields) {
      const mapping = getCardMapping(field);

      if (mapping === 'assignee' && field.assignee_visible === false) {
        if (cardAssigneeId) {
          descriptionRows.push({
            label: field.label,
            value: assigneeName || fieldAssigneeName(field, cardAssigneeId) || cardAssigneeId,
          });
        }
        continue;
      }

      const value = submittedValueToString(data[field.id]).trim();
      if (!value) continue;

      // Image URLs are attached as screenshot_url on the card; no need to embed in description.
      if (mapping === 'screenshot_url') continue;

      descriptionRows.push({
        label: field.label,
        value:
          mapping === 'priority'
            ? formatPriority(value)
            : mapping === 'assignee'
              ? assigneeName || fieldAssigneeName(field, value) || value
              : value,
      });
    }

    for (const [key, rawValue] of Object.entries(data)) {
      if (fieldIds.has(key)) continue;
      const value = submittedValueToString(rawValue).trim();
      if (value) descriptionRows.push({ label: key, value });
    }

    if (descriptionRows.length > 0) {
      cardDescription = formatSubmissionDescription(descriptionRows);
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
        screenshot_url: cardScreenshotUrl,
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
