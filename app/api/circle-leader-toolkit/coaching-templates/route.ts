/**
 * Coaching automation message templates.
 *  GET — effective templates + built-in defaults + placeholders (any signed-in user).
 *  PUT — save one automation's copy, or reset it to the built-in default (ACPD only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, getUserFromAuthHeader } from '../../../../lib/server-supabase';
import type { AutomationKind } from '../../../../lib/circle-leader-toolkit/coaching/config';
import {
  AUTOMATION_LABELS,
  AUTOMATION_ORDER,
  AUTOMATION_PLACEHOLDERS,
  COACHING_TEMPLATE_DEFAULTS,
  resolveTemplates,
  validateTemplate,
  type TemplateOverrides,
} from '../../../../lib/circle-leader-toolkit/coaching/templates';

export const dynamic = 'force-dynamic';

const VALID_KINDS = new Set<string>(AUTOMATION_ORDER);

async function requireUser(req: NextRequest) {
  const user = await getUserFromAuthHeader(req);
  if (!user) return { user: null, role: null, response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  const supabase = createServiceSupabaseClient();
  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).maybeSingle();
  if (error || !profile) return { user: null, role: null, response: NextResponse.json({ error: 'Unable to verify user profile' }, { status: 403 }) };
  return { user, role: profile.role as string | null, response: null };
}

async function readStored(): Promise<TemplateOverrides> {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('coaching_automation_templates')
    .select('automation_kind, title, body_html');
  const stored: TemplateOverrides = {};
  for (const row of (data || []) as Array<{ automation_kind: string; title: string; body_html: string }>) {
    if (VALID_KINDS.has(row.automation_kind)) {
      stored[row.automation_kind as AutomationKind] = { title: row.title, body_html: row.body_html };
    }
  }
  return stored;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const stored = await readStored();
  return NextResponse.json({
    templates: resolveTemplates(stored),
    defaults: COACHING_TEMPLATE_DEFAULTS,
    placeholders: AUTOMATION_PLACEHOLDERS,
    labels: AUTOMATION_LABELS,
    order: AUTOMATION_ORDER,
    // Which kinds are currently customized (vs. using the built-in default).
    customized: AUTOMATION_ORDER.filter((k) => stored[k]),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  if (auth.role !== 'ACPD') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Unknown automation kind.' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();

  // Reset to built-in default by removing the override row.
  if (body.reset === true) {
    const { error } = await supabase.from('coaching_automation_templates').delete().eq('automation_kind', kind);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: resolveTemplates(await readStored()) });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html.trim() : '';
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  if (!bodyHtml) return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });

  // Reject typo'd placeholders and broken HTML before they reach a leader's inbox.
  const validation = validateTemplate(kind as AutomationKind, { title, body_html: bodyHtml });
  if (validation.unknownPlaceholders.length > 0) {
    const list = validation.unknownPlaceholders.map((p) => `{{${p}}}`).join(', ');
    return NextResponse.json(
      { error: `Unknown placeholder${validation.unknownPlaceholders.length === 1 ? '' : 's'}: ${list}. These won't be filled in — remove them or use one of the supported placeholders.` },
      { status: 400 }
    );
  }
  if (validation.unbalancedTags.length > 0) {
    const list = validation.unbalancedTags.map((t) => `<${t}>`).join(', ');
    return NextResponse.json(
      { error: `The message has unclosed or mismatched HTML: ${list}. Make sure every tag is closed.` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('coaching_automation_templates')
    .upsert(
      { automation_kind: kind, title, body_html: bodyHtml, updated_at: new Date().toISOString(), updated_by: auth.user!.id },
      { onConflict: 'automation_kind' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: resolveTemplates(await readStored()) });
}
