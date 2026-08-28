/**
 * Latest Circle Guide resolver.
 *
 * Circle Guides live on Valley Creek's own site, one permanent URL each, a new
 * one most Sundays. The toolkit links to whichever is newest, so the URL has to
 * be resolved rather than hardcoded.
 *
 * valleycreek.plus is a Next.js site: /guides embeds a __NEXT_DATA__ blob whose
 * props.pageProps.guides array is already sorted newest-first and carries the
 * name, date and slug of every guide. So this reads structured JSON the page
 * already ships — no HTML parser, no dependency.
 *
 * The catch is size: the full page is ~5.8MB because each guide inlines its
 * whole body (one `text2` alone is 235KB). The array starts around byte 24,300,
 * so a ranged request for the first 256KB carries the complete first entry with
 * room to spare. Verified against the live site.
 *
 * The Events page never calls any of this directly — it reads the Supabase
 * cache row that the sync-circle-guide cron writes.
 */

import { DateTime } from 'luxon';
import { createServiceSupabaseClient } from '../server-supabase';

export const CIRCLE_GUIDES_INDEX_URL = 'https://valleycreek.plus/guides';

/** Church timezone, matching APP_TZ in lib/touchpoints.ts. */
const GUIDE_TZ = 'America/Chicago';

/** How much of the page to pull. The array head sat at byte ~24,300 when this
 *  was written, so this leaves ~230KB of headroom for their <head> to grow. */
const RANGE_BYTES = 262_144;

/** One retry at 1MB if the first window came up short — cheap insurance
 *  against their head growing past the primary range. */
const ESCALATED_RANGE_BYTES = 1_048_576;

/** Stop reading here even if the range header is ignored and the server starts
 *  streaming all 5.8MB at us. */
const HARD_READ_CAP = ESCALATED_RANGE_BYTES + 65_536;

/** The first guide object is huge, so only the window covering its leading
 *  scalar fields (id, name, date, slug, status) is ever scanned. */
const SCAN_WINDOW = 8_192;

const FETCH_TIMEOUT_MS = 12_000;

/** After this long, the card stops calling the guide "this week's". Guides
 *  usually land weekly; a month-old one should not still claim to be current. */
const THIS_WEEK_MAX_AGE_DAYS = 10;

/** A guide dated further ahead than this is next week's, published early — hold
 *  the current one until its date arrives. */
const FUTURE_TOLERANCE_HOURS = 12;

/**
 * Sunday handoff window, Central. Leaders are told the new guide is up by 1pm,
 * and the refresh runs at noon, 1pm and 2pm. From HANDOFF_START the cached guide
 * is knowably last week's, so the card stops sending leaders confidently to a
 * stale guide and points at the index until this week's arrives.
 *
 * It reopens at HANDOFF_END rather than waiting indefinitely: guides skip a week
 * now and then, and once the last refresh has come and gone with nothing new, the
 * previous guide really is the latest one — the site's own index shows it at the
 * top too. A real guide beats a bare index link.
 */
const HANDOFF_START_HOUR = 9;
const HANDOFF_END_HOUR = 15;

export type CircleGuide = {
  title: string;
  /** ISO 8601, as published by the source. */
  publishedAt: string;
  url: string;
};

/**
 * What the card renders. `title` and `publishedAt` are null only in the
 * last-resort mode where `url` points at the guides index instead of a guide.
 *
 * `dateDisplay` and `eyebrow` are resolved here rather than in the component:
 * formatting in the browser would use the viewer's timezone and produce a
 * hydration mismatch against the server render, and it keeps Luxon out of the
 * client bundle.
 */
export type CircleGuideLink = {
  /** The guide's own title, set only when the card points at a specific guide. */
  title: string | null;
  publishedAt: string | null;
  dateDisplay: string | null;
  eyebrow: string;
  /** Main line on the card. */
  headline: string;
  ctaLabel: string;
  url: string;
};

/** Nothing cached at all — first deploy, or the cache is unreachable. */
const INDEX_FALLBACK: CircleGuideLink = {
  title: null,
  publishedAt: null,
  dateDisplay: null,
  eyebrow: 'Circle Guides',
  headline: 'Every Circle Guide, newest first',
  ctaLabel: 'Browse the guides',
  url: CIRCLE_GUIDES_INDEX_URL,
};

/** Sunday morning: this week's guide is due but we haven't picked it up yet. */
const AWAITING_THIS_WEEK: CircleGuideLink = {
  title: null,
  publishedAt: null,
  dateDisplay: null,
  eyebrow: "This Week's Circle Guide",
  headline: 'Posts by 1pm today',
  ctaLabel: 'Browse past guides',
  url: CIRCLE_GUIDES_INDEX_URL,
};

/**
 * True when the cached guide is last week's and this week's is still expected —
 * Sunday between HANDOFF_START_HOUR and HANDOFF_END_HOUR, Central.
 *
 * `now` is injectable so the window is testable without freezing the clock.
 */
export function isAwaitingThisWeeksGuide(
  publishedAt: DateTime,
  now: DateTime = DateTime.now().setZone(GUIDE_TZ)
): boolean {
  if (now.weekday !== 7) return false; // Luxon: 7 = Sunday
  if (now.hour < HANDOFF_START_HOUR || now.hour >= HANDOFF_END_HOUR) return false;
  // Already holding a guide dated today? Then this week's has landed.
  // Guides post Sunday morning Central, so "not today" reliably means last week's.
  return publishedAt.startOf('day') < now.startOf('day');
}

/** Pull one JSON string field out of the scan window, unescaping it properly. */
function readStringField(window: string, key: string): string | null {
  const match = window.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
}

/**
 * Extract the newest guide from a (possibly truncated) prefix of the /guides
 * HTML. Returns null on anything unexpected — a partial guess would put a wrong
 * link in front of every leader, so every failure falls through to the cache.
 */
export function parseLatestCircleGuide(html: string): CircleGuide | null {
  // Anchor to the data blob so a stray "guides":[ elsewhere in the page can
  // never be mistaken for the array.
  const blobAt = html.indexOf('id="__NEXT_DATA__"');
  const anchor = html.indexOf('"guides":[', blobAt >= 0 ? blobAt : 0);
  if (anchor === -1) return null;

  let window = html.slice(anchor, anchor + SCAN_WINDOW);
  // Clamp at the first body field. Without this, a missing scalar would let a
  // regex run on into the *second* guide and mix two entries together.
  const bodyAt = window.search(/"(?:title1|text1)":/);
  if (bodyAt > 0) window = window.slice(0, bodyAt);

  const title = readStringField(window, 'name');
  const publishedAt = readStringField(window, 'date');
  const slug = readStringField(window, 'slug');
  const status = readStringField(window, 'status');

  if (!title || !publishedAt || !slug) return null;
  // Every entry the site serves is "Published"; anything else means we are
  // reading a shape we do not understand. An absent status is tolerated.
  if (status && status !== 'Published') return null;
  // Guards against a slug that would escape the guides path.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;

  const parsed = DateTime.fromISO(publishedAt, { zone: 'utc' });
  if (!parsed.isValid) return null;
  // The array is date-desc, so a future entry at index 0 is next week's guide
  // staged early. Keep serving the current one until its date lands.
  if (parsed > DateTime.utc().plus({ hours: FUTURE_TOLERANCE_HOURS })) return null;

  return { title, publishedAt: parsed.toISO()!, url: `${CIRCLE_GUIDES_INDEX_URL}/${slug}` };
}

/** Read the response body, giving up once we have more than we could need. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let seen = 0;
  try {
    while (seen < HARD_READ_CAP) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      // stream: true so a chunk splitting a multi-byte character doesn't
      // corrupt it. Every token we scan for is ASCII either way.
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out;
}

async function fetchGuidesPage(rangeBytes: number): Promise<string> {
  // `cache: 'no-store'` is not optional: Next instruments global fetch and
  // Netlify persists that Data Cache across deploys, so without it this would
  // re-serve the first guide it ever saw, forever.
  const res = await fetch(CIRCLE_GUIDES_INDEX_URL, {
    headers: {
      'User-Agent': 'RADIUS-CircleGuide/1.0',
      Accept: 'text/html',
      Range: `bytes=0-${rangeBytes - 1}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // 206 is the expected answer; 200 means the range was ignored and the whole
  // page is coming, which readCapped truncates for us.
  if (!res.ok) throw new Error(`Guides index responded ${res.status}`);
  return readCapped(res);
}

/** Fetch the guides index and read the newest guide off it. Null if the page
 *  cannot be understood; throws only on a network/HTTP failure. */
export async function fetchLatestCircleGuide(): Promise<CircleGuide | null> {
  const guide = parseLatestCircleGuide(await fetchGuidesPage(RANGE_BYTES));
  if (guide) return guide;
  // Came up short — try once with a much larger window before giving up.
  return parseLatestCircleGuide(await fetchGuidesPage(ESCALATED_RANGE_BYTES));
}

function toLink(guide: CircleGuide): CircleGuideLink {
  const published = DateTime.fromISO(guide.publishedAt, { zone: GUIDE_TZ });
  if (published.isValid && isAwaitingThisWeeksGuide(published)) return AWAITING_THIS_WEEK;

  const isCurrent =
    published.isValid &&
    DateTime.now().setZone(GUIDE_TZ).diff(published, 'days').days <= THIS_WEEK_MAX_AGE_DAYS;

  return {
    title: guide.title,
    publishedAt: guide.publishedAt,
    dateDisplay: published.isValid ? published.toFormat('LLLL d') : null,
    eyebrow: isCurrent ? "This Week's Circle Guide" : 'Latest Circle Guide',
    headline: guide.title,
    ctaLabel: 'Open the guide',
    url: guide.url,
  };
}

/**
 * Read the cached guide for server-rendering. Never touches the network and
 * never throws — the Events page is already the slowest screen in the toolkit,
 * and a missing guide must not break it.
 */
export async function readCircleGuideLink(): Promise<CircleGuideLink> {
  try {
    // noStore: this row is rewritten by cron, so a cached read would pin the
    // toolkit to whichever guide the instance happened to see first.
    const supabase = createServiceSupabaseClient({ noStore: true });
    const { data } = await supabase
      .from('circle_guide_cache')
      .select('guide')
      .eq('id', 1)
      .maybeSingle();

    const guide = data?.guide as Partial<CircleGuide> | null | undefined;
    // Re-validate the stored URL: the row is only ever written by the refresh
    // below, but a link out to an arbitrary host should never be possible.
    if (guide?.title && guide.publishedAt && guide.url?.startsWith(`${CIRCLE_GUIDES_INDEX_URL}/`)) {
      return toLink(guide as CircleGuide);
    }
  } catch {
    // Table missing (migration not run yet) or Supabase unreachable.
  }
  return INDEX_FALLBACK;
}

export type CircleGuideRefreshResult = {
  ok: boolean;
  guide: CircleGuide | null;
  error?: string;
};

/**
 * Re-resolve the newest guide and store it. A failed fetch updates only
 * checked_at/last_error, leaving the last known good guide in place — the
 * toolkit keeps a working link even if the source changes shape.
 */
export async function refreshCircleGuideCache(): Promise<CircleGuideRefreshResult> {
  const supabase = createServiceSupabaseClient({ noStore: true });
  const now = new Date().toISOString();

  let guide: CircleGuide | null = null;
  let error: string | null = null;
  try {
    guide = await fetchLatestCircleGuide();
    if (!guide) error = 'No guide found in the page — the source layout may have changed';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const patch = guide
    ? { guide, fetched_at: now, checked_at: now, last_error: null }
    : { checked_at: now, last_error: error };

  const { error: writeError } = await supabase
    .from('circle_guide_cache')
    .upsert({ id: 1, ...patch }, { onConflict: 'id' });

  if (writeError) {
    return { ok: false, guide, error: `Cache write failed: ${writeError.message}` };
  }
  return { ok: !!guide, guide, ...(error ? { error } : {}) };
}
