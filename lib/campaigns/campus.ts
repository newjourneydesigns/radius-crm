// Map a CCB group to its campus so campaigns can roll up by campus.
//
// VCC group names carry a campus prefix ("LVT | Circles | Leader"), so the
// campus can usually be guessed straight from the name. Admins can override
// per group via the campaign's group_campus_map (group id -> campus), which
// always wins over the guess.

export const CAMPUS_PREFIXES: Record<string, string> = {
  LVT: 'Lewisville',
  GVT: 'Gainesville',
  FMT: 'Flower Mound',
  DNT: 'Denton',
  ONL: 'Online',
};

// Best-effort campus from a group name: a known prefix token (LVT, GVT, …)
// or a campus name written out in full. Returns null when nothing matches.
export function guessCampusFromGroupName(name: string | null | undefined): string | null {
  if (!name) return null;
  const upper = name.toUpperCase();
  for (const [prefix, campus] of Object.entries(CAMPUS_PREFIXES)) {
    // Token match so e.g. "FMT" doesn't fire inside an unrelated word.
    if (new RegExp(`(^|[^A-Z])${prefix}([^A-Z]|$)`).test(upper)) return campus;
  }
  for (const campus of Object.values(CAMPUS_PREFIXES)) {
    if (upper.includes(campus.toUpperCase())) return campus;
  }
  return null;
}
