/**
 * Verifies the CCB custom-field dictionary pipeline against live data WITHOUT
 * writing to Supabase: pulls v1 custom_field_labels + a v1 profile, builds the
 * in-memory dictionary, then resolves a v2 individual's opaque custom_fields IDs
 * back to labels. Expected: "Area of Life" = "Business" for individual 9.
 *
 *   npx ts-node scripts/test-ccb-custom-fields.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createCCBClient } from '../lib/ccb/ccb-client';
import { createCCBv2Client } from '../lib/ccb/ccb-v2-client';
import {
  extractPulldownOptions,
  resolveV2CustomFields,
  type FieldDefinition,
} from '../lib/ccb/custom-fields';

const V2_TYPE_PREFIX: Record<string, string> = { text: 'text', date: 'date', pulldown: 'option' };

function parseFieldName(name: string) {
  const m = /^udf_(ind|grp)_(text|date|pulldown)_(\d+)$/.exec(name);
  if (!m) return null;
  return { scope: m[1] === 'ind' ? 'individual' : 'group', field_type: m[2], index: m[3] } as const;
}

async function main() {
  const v1 = createCCBClient();

  // 1. Field dictionary from v1 custom_field_labels.
  const labelsXml: any = await v1.getXml({ srv: 'custom_field_labels' });
  const rawFields = labelsXml?.ccb_api?.response?.custom_fields?.custom_field ?? [];
  const fields = Array.isArray(rawFields) ? rawFields : [rawFields];

  const defsByV2Id = new Map<string, FieldDefinition>();
  for (const f of fields) {
    const name = String(f?.name ?? '').trim();
    const parsed = parseFieldName(name);
    if (!parsed) continue;
    const v2_field_id =
      parsed.scope === 'individual'
        ? `${V2_TYPE_PREFIX[parsed.field_type]}:individual/${parsed.index}`
        : null;
    if (v2_field_id) {
      defsByV2Id.set(v2_field_id, {
        name,
        label: typeof f?.label === 'string' ? f.label.trim() : '',
        field_type: parsed.field_type,
        v2_field_id,
      });
    }
  }
  console.log(`Dictionary: ${defsByV2Id.size} individual fields`);

  // 2. Harvest pulldown option labels from a v1 profile (individual 9).
  const profileXml: any = await v1.getXml({ srv: 'individual_profile_from_id', individual_id: 9 });
  const indNode = profileXml?.ccb_api?.response?.individuals?.individual;
  const options = extractPulldownOptions(Array.isArray(indNode) ? indNode[0] : indNode);
  const optionLabels = new Map<string, string>();
  for (const o of options) optionLabels.set(`${o.field_name}:${o.option_id}`, o.option_label);
  console.log(`Harvested options:`, options);

  // 3. Resolve the v2 individual's opaque custom_fields against the dictionary.
  const v2Profile: any = await createCCBv2Client().request('/individuals/9');
  const resolved = resolveV2CustomFields(v2Profile?.custom_fields ?? [], defsByV2Id, optionLabels);

  console.log('\nResolved v2 custom fields:');
  for (const r of resolved) {
    console.log(`  ${r.label ?? r.field_name} = ${r.valueLabel ?? r.value}`);
  }

  const areaOfLife = resolved.find((r) => r.label === 'Area of Life');
  console.log(
    `\nArea of Life => ${areaOfLife?.valueLabel ?? '(unresolved)'} ` +
      `[${areaOfLife?.valueLabel === 'Business' ? 'PASS' : 'CHECK'}]`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
