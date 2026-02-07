export type FrequencyRefItem = { id: number; value: string };

const normalize = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/\band\b/g, ',')
    .replace(/&/g, ',')
    .replace(/\s+/g, '')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '');
};

// Display strings used across UI. Normalization makes this compatible with legacy variants
// like "1st & 3rd" vs "1st, 3rd".
export const DEFAULT_FREQUENCY_VALUES: string[] = [
  'Weekly',
  'Bi-weekly',
  '1st, 3rd',
  '1st, 3rd, 5th',
  '2nd, 4th',
  'Monthly',
  'Quarterly',
];

export const ensureDefaultFrequencies = (items: FrequencyRefItem[] | null | undefined): FrequencyRefItem[] => {
  const base = (items ?? []).filter(Boolean);
  const byNorm = new Map<string, FrequencyRefItem>();

  for (const item of base) {
    if (!item?.value) continue;
    byNorm.set(normalize(item.value), item);
  }

  const merged: FrequencyRefItem[] = [...base];
  let nextId = 9000;

  for (const value of DEFAULT_FREQUENCY_VALUES) {
    const key = normalize(value);
    if (byNorm.has(key)) continue;

    const fallback: FrequencyRefItem = { id: nextId++, value };
    merged.push(fallback);
    byNorm.set(key, fallback);
  }

  return merged.sort((a, b) => (a.value || '').localeCompare(b.value || ''));
};

export const formatFrequencyLabel = (value: string): string => {
  const raw = (value ?? '').trim();
  if (!raw) return raw;

  // For ordinal lists stored as comma-separated (e.g. "1st, 3rd, 5th"),
  // display the last separator as an ampersand.
  if (raw.includes(',') && !raw.includes('&')) {
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    const isOrdinal = (p: string) => /^\d{1,2}(st|nd|rd|th)$/i.test(p);

    if (parts.length >= 2 && parts.every(isOrdinal)) {
      if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
      return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
    }
  }

  return raw;
};
