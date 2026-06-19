import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

/**
 * Snapshot CCB custom-field definitions from the v1 XML API into Supabase so the
 * labels survive the v1 retirement (v2 returns only opaque IDs). Pulls the full
 * field dictionary from v1 `custom_field_labels` in a single call.
 *
 * Pulldown OPTION labels (e.g. "Business") are NOT available from any global v1
 * service — they only appear inline per-individual. Those are harvested
 * separately via harvestCustomFieldOptions() during individual fetches; this
 * route only refreshes the field-name -> label/type dictionary.
 */

const ADMIN_SCOPE: Record<string, 'individual' | 'group'> = {
  ind: 'individual',
  grp: 'group',
};

// v1 field type -> v2 custom_fields[].id prefix.
const V2_TYPE_PREFIX: Record<string, string> = {
  text: 'text',
  date: 'date',
  pulldown: 'option',
};

interface ParsedDefinition {
  name: string;
  label: string;
  field_type: string;
  scope: 'individual' | 'group';
  admin_only: boolean;
  v2_field_id: string | null;
}

/** Parse 'udf_ind_pulldown_3' -> {scope, field_type, index}. */
function parseFieldName(name: string): { scope: 'individual' | 'group'; field_type: string; index: string } | null {
  const m = /^udf_(ind|grp)_(text|date|pulldown)_(\d+)$/.exec(name);
  if (!m) return null;
  const scope = ADMIN_SCOPE[m[1]];
  return { scope, field_type: m[2], index: m[3] };
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCCBRequestContext(request, {
      module: 'CCB v2 Migration',
      action: 'Sync Custom Field Definitions',
      direction: 'pull',
    });

    const client = createCCBClient(ctx);
    const xml = await client.getXml<any>({ srv: 'custom_field_labels' });

    const rawFields = xml?.ccb_api?.response?.custom_fields?.custom_field;
    const fields = Array.isArray(rawFields) ? rawFields : rawFields ? [rawFields] : [];

    const definitions: ParsedDefinition[] = [];
    for (const f of fields) {
      const name = String(f?.name ?? '').trim();
      if (!name) continue;
      const parsed = parseFieldName(name);
      if (!parsed) continue;

      // CCB returns admin_only as the string 'true'/'false'.
      const adminOnly = String(f?.admin_only ?? '').trim().toLowerCase() === 'true';
      const label = typeof f?.label === 'string' ? f.label.trim() : '';

      const v2_field_id =
        parsed.scope === 'individual'
          ? `${V2_TYPE_PREFIX[parsed.field_type]}:individual/${parsed.index}`
          : null;

      definitions.push({
        name,
        label,
        field_type: parsed.field_type,
        scope: parsed.scope,
        admin_only: adminOnly,
        v2_field_id,
      });
    }

    if (definitions.length === 0) {
      return NextResponse.json(
        { error: 'No custom field definitions parsed from CCB v1 response' },
        { status: 502 }
      );
    }

    const supabase = getServiceSupabase();
    const synced_at = new Date().toISOString();
    const { error } = await supabase
      .from('ccb_custom_field_definitions')
      .upsert(
        definitions.map((d) => ({ ...d, synced_at })),
        { onConflict: 'name' }
      );

    if (error) {
      return NextResponse.json(
        { error: 'Failed to upsert custom field definitions', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: definitions.length,
      labeled: definitions.filter((d) => d.label).length,
      synced_at,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Custom field definition sync failed', details: error?.message ?? String(error) },
      { status: error?.response?.status ?? 500 }
    );
  }
}
