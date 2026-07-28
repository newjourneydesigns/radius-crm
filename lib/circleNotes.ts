/**
 * The circle-summary form captures the leader's narrative as configurable
 * "dynamic questions" (e.g. "Tell us about your Circle gathering"), stored in
 * circle_event_summaries.dynamic_responses — NOT the base `notes` column, which
 * holds only the did-not-meet reason. The composed blob is pushed to CCB, but
 * RADIUS's read path historically returned only `notes`, so submitted summaries
 * with dynamic answers rendered as "No notes recorded". This rebuilds a display
 * string from the base notes + dynamic responses so readers see the full
 * write-up the same way CCB does.
 */
export function composeSubmittedNotes(
  baseNotes: string | null | undefined,
  dynamicResponses: unknown
): string | null {
  const sections: string[] = [];

  const base = String(baseNotes ?? '').trim();
  if (base) sections.push(base);

  if (dynamicResponses && typeof dynamicResponses === 'object') {
    for (const entry of Object.values(dynamicResponses as Record<string, any>)) {
      const label = String(entry?.label ?? '').trim();
      const rawValue = entry?.value;
      const value = Array.isArray(rawValue)
        ? rawValue.map((v) => String(v).trim()).filter(Boolean).join(', ')
        : typeof rawValue === 'boolean'
          ? (rawValue ? 'Yes' : 'No')
          : String(rawValue ?? '').trim();
      if (!value) continue;
      sections.push(label ? `${label}: ${value}` : value);
    }
  }

  return sections.length ? sections.join('\n\n') : null;
}
