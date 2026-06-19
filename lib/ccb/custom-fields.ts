/**
 * CCB custom-field dictionary helpers.
 *
 * Background: v2 (Pushpay) returns a person's custom fields only as opaque IDs
 * (`option:individual/3` = 3). The labels live in the snapshot tables
 * `ccb_custom_field_definitions` (field -> label/type, from v1 custom_field_labels)
 * and `ccb_custom_field_options` (pulldown option id -> label). This module
 * harvests option labels from v1 individual profiles (the only source) and
 * resolves v2 raw IDs against the snapshot at read time — no live v1 call needed.
 *
 * Naming quirk: the v1 individual-profile XML names pulldowns `udf_pulldown_3`,
 * but `custom_field_labels` (and our definitions PK) names them `udf_ind_pulldown_3`.
 * normalizeProfileFieldName() bridges the two so the FK lines up.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface HarvestedOption {
  field_name: string; // normalized, e.g. 'udf_ind_pulldown_3'
  option_id: number;
  option_label: string;
}

/** 'udf_pulldown_3' (profile XML) -> 'udf_ind_pulldown_3' (definitions PK). */
export function normalizeProfileFieldName(
  name: string,
  scope: 'ind' | 'grp' = 'ind'
): string {
  if (/^udf_(ind|grp)_/.test(name)) return name; // already normalized
  return name.replace(/^udf_/, `udf_${scope}_`);
}

/**
 * Pull pulldown option (id -> label) pairs out of a parsed v1 individual profile.
 * Expects the fast-xml-parser shape (attributes prefixed '@_', text under '#text').
 * Returns [] when the profile has no pulldown selections.
 */
export function extractPulldownOptions(individualProfile: any): HarvestedOption[] {
  const raw =
    individualProfile?.user_defined_pulldown_fields?.user_defined_pulldown_field;
  const fields = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const out: HarvestedOption[] = [];
  for (const field of fields) {
    const name = String(field?.name ?? '').trim();
    if (!name) continue;
    const selection = field?.selection;
    // A single field has one selected option; CCB sometimes omits it entirely.
    const selections = Array.isArray(selection) ? selection : selection ? [selection] : [];
    for (const sel of selections) {
      const idRaw = sel?.['@_id'];
      const label = (sel?.['#text'] ?? (typeof sel === 'string' ? sel : '')).toString().trim();
      const option_id = Number.parseInt(String(idRaw ?? ''), 10);
      if (!Number.isFinite(option_id) || !label) continue;
      out.push({
        field_name: normalizeProfileFieldName(name),
        option_id,
        option_label: label,
      });
    }
  }
  return out;
}

/**
 * Upsert harvested pulldown options into ccb_custom_field_options. Best-effort:
 * skips silently when there's nothing to write. Requires the matching definition
 * rows to already exist (run the definitions sync first — the FK enforces it).
 */
export async function harvestCustomFieldOptions(
  supabase: SupabaseClient,
  options: HarvestedOption[]
): Promise<{ upserted: number; error: string | null }> {
  if (options.length === 0) return { upserted: 0, error: null };

  // Dedupe within the batch so a repeated (field, option) doesn't conflict.
  const byKey = new Map<string, HarvestedOption>();
  for (const o of options) byKey.set(`${o.field_name}:${o.option_id}`, o);

  const synced_at = new Date().toISOString();
  const { error } = await supabase
    .from('ccb_custom_field_options')
    .upsert(
      Array.from(byKey.values()).map((o) => ({ ...o, synced_at })),
      { onConflict: 'field_name,option_id' }
    );

  return { upserted: error ? 0 : byKey.size, error: error?.message ?? null };
}

// ---- Read-time resolution (v2 -> labels) ----------------------------------

export interface FieldDefinition {
  name: string;
  label: string | null;
  field_type: string;
  v2_field_id: string | null;
}

export interface ResolvedCustomField {
  field_name: string;
  label: string | null;
  /** Raw v2 value (option id for pulldowns, date/text otherwise). */
  value: string | number | null;
  /** Resolved label for pulldown options; null for non-pulldown fields. */
  valueLabel: string | null;
}

/**
 * Resolve a v2 individual's `custom_fields` array into labeled values using the
 * snapshot dictionary. `definitions` keyed by v2_field_id; `optionLabels` keyed
 * by `${field_name}:${option_id}`.
 */
export function resolveV2CustomFields(
  v2CustomFields: Array<{ id: string; value: unknown }>,
  definitions: Map<string, FieldDefinition>,
  optionLabels: Map<string, string>
): ResolvedCustomField[] {
  const out: ResolvedCustomField[] = [];
  for (const cf of v2CustomFields ?? []) {
    const def = definitions.get(cf.id);
    if (!def) continue; // unknown / profile field we don't track
    const value = (cf.value as string | number | null) ?? null;

    let valueLabel: string | null = null;
    if (def.field_type === 'pulldown' && value != null) {
      valueLabel = optionLabels.get(`${def.name}:${value}`) ?? null;
    }

    out.push({ field_name: def.name, label: def.label, value, valueLabel });
  }
  return out;
}
