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

export function getCircleTypeFromGroupProfile(xml: CCBGroupProfileResponse): string | null {
  const group = xml?.ccb_api?.response?.groups?.group;
  const customFields = asArray(group?.user_defined_fields?.user_defined_field);

  for (const field of customFields) {
    const label = ccbText(field?.label).toLowerCase();
    const name = ccbText(field?.name).toLowerCase();
    if (label !== 'circle type' && name !== 'udf_3') continue;

    return ccbText(field?.selection) || ccbText(field?.value) || null;
  }

  return null;
}

/**
 * A circle's type ("Men's", "YA | Co-Ed", …) is a church-defined custom field on
 * the CCB group profile — NOT CCB's own `group_type` taxonomy, which is coarse
 * ("Small Group") and is what v2's `group.type.name` returns. Only the v1
 * group_profile_from_id service exposes the custom field, so this stays a v1
 * call even where the rest of the sync runs on v2.
 */
export async function fetchCcbCircleType(
  request: NextRequest,
  groupId: string,
  context: { module: string; action?: string }
): Promise<string | null> {
  try {
    const ccb = createCCBClient(await getCCBRequestContext(request, {
      module: context.module,
      action: context.action || 'Lookup Group Circle Type',
      direction: 'pull',
    }));

    const xml = await ccb.getXml<CCBGroupProfileResponse>({
      srv: 'group_profile_from_id',
      id: groupId,
      include_participants: 'false',
    });

    return getCircleTypeFromGroupProfile(xml);
  } catch (error) {
    console.warn('⚠️ Unable to resolve CCB Circle Type from group profile:', error);
    return null;
  }
}
