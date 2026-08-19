import type { NextRequest } from 'next/server';
import { createCCBClient } from './ccb-client';
import { getCCBRequestContext } from './ccb-api-gateway';

interface CCBGroupProfileCustomField {
  name?: unknown;
  label?: unknown;
  selection?: unknown;
  value?: unknown;
}

export interface CCBGroupProfileResponse {
  ccb_api?: {
    response?: {
      groups?: {
        group?: {
          user_defined_fields?: {
            user_defined_field?: CCBGroupProfileCustomField | CCBGroupProfileCustomField[];
          };
        };
      };
    };
  };
}

/**
 * The church-defined "Classifications" pulldowns on a CCB group profile.
 * Both are custom fields, not CCB's own taxonomy.
 */
export interface CcbGroupClassifications {
  /** "Men's", "Women's", "YA | Co-Ed", … */
  circleType: string | null;
  /** Where the circle meets: "Campus Circle" / "City Circle" / "Online Circle". */
  circleLocation: string | null;
}

function ccbText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().replace(/\\'/g, "'");
  }

  const rec = value as Record<string, unknown>;
  return ccbText(rec['#text'] ?? rec.text ?? rec.value);
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export function getGroupClassificationsFromProfile(xml: CCBGroupProfileResponse): CcbGroupClassifications {
  const group = xml?.ccb_api?.response?.groups?.group;
  const customFields = asArray(group?.user_defined_fields?.user_defined_field);

  let circleType: string | null = null;
  let circleLocation: string | null = null;

  for (const field of customFields) {
    const label = ccbText(field?.label).toLowerCase();
    const name = ccbText(field?.name).toLowerCase();
    const selection = ccbText(field?.selection) || ccbText(field?.value) || null;

    if (label === 'circle type' || name === 'udf_3') {
      circleType = selection;
    } else if (label === 'circle location') {
      circleLocation = selection;
    }
  }

  return { circleType, circleLocation };
}

/**
 * A circle's type ("Men's", "YA | Co-Ed", …) and its Circle Location
 * ("Campus Circle" / "City Circle" / "Online Circle") are church-defined custom
 * fields on the CCB group profile — NOT CCB's own `group_type` taxonomy, which
 * is coarse ("Small Group") and is what v2's `group.type.name` returns. Only
 * the v1 group_profile_from_id service exposes these custom fields, so this
 * stays a v1 call even where the rest of the sync runs on v2. Both ride the
 * same call — asking for the location costs no extra CCB request.
 *
 * Errors resolve to nulls: every caller treats "CCB has no value" as
 * "don't touch the stored one", so a failed lookup can never blank data.
 */
export async function fetchCcbGroupClassifications(
  request: NextRequest,
  groupId: string,
  context: { module: string; action?: string }
): Promise<CcbGroupClassifications> {
  try {
    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: context.module,
      action: context.action || 'Lookup Group Classifications',
      direction: 'pull',
    }));

    const xml = await ccb.getXml<CCBGroupProfileResponse>({
      srv: 'group_profile_from_id',
      id: groupId,
      include_participants: 'false',
    });

    return getGroupClassificationsFromProfile(xml);
  } catch (error) {
    console.warn('⚠️ Unable to resolve CCB group classifications from group profile:', error);
    return { circleType: null, circleLocation: null };
  }
}
