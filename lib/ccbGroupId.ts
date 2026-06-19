export function extractCcbGroupId(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const groupId = url.searchParams.get('group_id')?.trim();
    if (groupId && /^\d+$/.test(groupId)) {
      return groupId;
    }
  } catch {
    // Fall through to regex parsing for partial or copied CCB paths.
  }

  const pathMatch = raw.match(/\/(?:goto\/)?groups\/(\d+)(?:\/|$|\?)/i);
  if (pathMatch) return pathMatch[1];

  const queryMatch = raw.match(/(?:[?&]|&amp;)group_id=(\d+)(?:[&#]|$)/i);
  return queryMatch ? queryMatch[1] : null;
}

/** Pull the CCB individual ID out of a profile link or accept a bare numeric ID. */
export function extractCcbIndividualId(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;

  const pathMatch = raw.match(/\/(?:goto\/)?individuals?\/(\d+)(?:\/|$|\?)/i);
  if (pathMatch) return pathMatch[1];

  const queryMatch = raw.match(/(?:[?&]|&amp;)individual_id=(\d+)(?:[&#]|$)/i);
  return queryMatch ? queryMatch[1] : null;
}

/** Build the canonical CCB deep links from IDs. */
export function ccbGroupCalendarUrl(subdomainBase: string, groupId: string): string {
  return `${subdomainBase}/goto/groups/${groupId}/events`;
}
export function ccbGroupEditUrl(subdomainBase: string, groupId: string): string {
  return `${subdomainBase}/group_edit.php?ax=edit&group_id=${groupId}`;
}
export function ccbIndividualUrl(subdomainBase: string, individualId: string): string {
  return `${subdomainBase}/goto/individuals/${individualId}`;
}
