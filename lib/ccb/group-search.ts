/**
 * Pure matching/ranking logic for POST /api/ccb/group-search.
 *
 * Matching contract (shared with the Valley Creek Toolkit consumer):
 * case-insensitive, and every whitespace-separated word of the query must
 * appear somewhere in the group name (AND of substrings). "stm leader" finds
 * "STM Leaders – Denton" and "Leaders of STM Teams" but not "STM Kids".
 *
 * Kept free of I/O so scripts/verify-group-search.ts can assert on it.
 */

/** Whitespace-separated search words, lowercased. Empty for a blank query. */
export function searchWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Escape a word for use inside a Postgres ILIKE pattern, so a literal
 * "%"/"_"/"\" in a group name (or query) matches itself instead of acting
 * as a wildcard.
 */
export function escapeIlikePattern(word: string): string {
  return word.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** AND-of-substrings match, case-insensitive. Words must come from searchWords. */
export function nameMatches(name: string, words: string[]): boolean {
  const haystack = name.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * Order matches best-first: exact name match, then name-starts-with the query,
 * then alphabetical (each tier alphabetical within itself). Returns a new
 * array; does not mutate the input.
 */
export function rankGroups<T extends { name: string }>(matches: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  const tier = (name: string): number => {
    const normalized = name.trim().toLowerCase();
    if (normalized === normalizedQuery) return 0;
    if (normalized.startsWith(normalizedQuery)) return 1;
    return 2;
  };

  return [...matches].sort((a, b) => {
    const tierDiff = tier(a.name) - tier(b.name);
    if (tierDiff !== 0) return tierDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
