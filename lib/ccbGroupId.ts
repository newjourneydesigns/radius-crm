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
