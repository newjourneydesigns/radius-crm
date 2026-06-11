import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ical from 'node-ical';
import { DateTime } from 'luxon';
import type { CalendarSubscription } from '../../../lib/supabase';

export interface CalendarEventItem {
  id: string;
  subscription_id: string;
  calendar_name: string;
  color: string;
  title: string;
  location?: string;
  start: string; // ISO, with zone offset
  end: string;   // ISO, with zone offset
  all_day: boolean;
}

export interface CalendarEventsData {
  date: string;
  events: CalendarEventItem[];
  errors: { subscription_id: string; calendar_name: string }[];
}

const APP_ZONE = 'America/Chicago';

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

// ── Per-URL feed cache (10 min TTL) ──────────────────────────────────────────
const feedCache = new Map<string, { body: string; cachedAt: number }>();
const FEED_CACHE_TTL = 10 * 60 * 1000;

async function fetchFeed(url: string): Promise<string> {
  const cached = feedCache.get(url);
  if (cached && Date.now() - cached.cachedAt < FEED_CACHE_TTL) return cached.body;

  // webcal:// is just http(s) with a different scheme
  const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
  const res = await fetch(httpUrl, {
    headers: { 'User-Agent': 'RADIUS-Calendar/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Feed responded ${res.status}`);
  const body = await res.text();
  feedCache.set(url, { body, cachedAt: Date.now() });
  return body;
}

type VEvent = {
  type: string;
  uid?: string;
  summary?: string;
  location?: string;
  start?: Date & { dateOnly?: boolean };
  end?: Date & { dateOnly?: boolean };
  datetype?: string;
  rrule?: { between: (after: Date, before: Date, inc?: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, VEvent>;
};

function eventsForDay(parsed: Record<string, unknown>, dayStart: DateTime, dayEnd: DateTime): Omit<CalendarEventItem, 'subscription_id' | 'calendar_name' | 'color'>[] {
  const out: Omit<CalendarEventItem, 'subscription_id' | 'calendar_name' | 'color'>[] = [];
  const windowStart = dayStart.toJSDate();
  const windowEnd = dayEnd.toJSDate();

  const push = (ev: VEvent, start: Date, end: Date, keySuffix = '') => {
    const allDay = ev.datetype === 'date' || Boolean(ev.start?.dateOnly);
    out.push({
      id: `${ev.uid || ev.summary || 'event'}${keySuffix}`,
      title: ev.summary || '(untitled)',
      location: ev.location || undefined,
      start: DateTime.fromJSDate(start).setZone(APP_ZONE).toISO() || '',
      end: DateTime.fromJSDate(end).setZone(APP_ZONE).toISO() || '',
      all_day: allDay,
    });
  };

  for (const key of Object.keys(parsed)) {
    const ev = parsed[key] as VEvent;
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;

    const durationMs = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0;

    if (ev.rrule) {
      // Expand recurrences inside the window; honor EXDATE and per-date overrides
      const dates = ev.rrule.between(windowStart, windowEnd, true);
      for (const date of dates) {
        const dateKey = date.toISOString().slice(0, 10);
        if (ev.exdate && Object.keys(ev.exdate).some(k => k.startsWith(dateKey))) continue;
        const override = ev.recurrences && Object.entries(ev.recurrences)
          .find(([k]) => k.startsWith(dateKey))?.[1];
        if (override?.start) {
          const oEnd = override.end || new Date(override.start.getTime() + durationMs);
          if (override.start < windowEnd && oEnd > windowStart) push(override, override.start, oEnd, `-${dateKey}`);
        } else {
          push(ev, date, new Date(date.getTime() + durationMs), `-${dateKey}`);
        }
      }
    } else if (ev.end ? (ev.start < windowEnd && ev.end > windowStart) : (ev.start >= windowStart && ev.start < windowEnd)) {
      push(ev, ev.start, ev.end || ev.start);
    }
  }

  return out;
}

function extractSubFromToken(token: string): string | null {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub ?? null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user || user.id !== extractSubFromToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dateParam = request.nextUrl.searchParams.get('date');
    const day = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam))
      ? DateTime.fromISO(dateParam, { zone: APP_ZONE })
      : DateTime.now().setZone(APP_ZONE);
    const dayStart = day.startOf('day');
    const dayEnd = dayStart.plus({ days: 1 });

    const supabase = getSupabaseServiceClient();
    const { data: subsRaw } = await supabase
      .from('calendar_subscriptions')
      .select('id, user_id, name, url, color, is_enabled, created_at')
      .eq('user_id', user.id)
      .eq('is_enabled', true);

    const subs = (subsRaw || []) as CalendarSubscription[];
    const events: CalendarEventItem[] = [];
    const errors: CalendarEventsData['errors'] = [];

    await Promise.all(subs.map(async (sub) => {
      try {
        const body = await fetchFeed(sub.url);
        const parsed = ical.sync.parseICS(body);
        for (const ev of eventsForDay(parsed as Record<string, unknown>, dayStart, dayEnd)) {
          events.push({
            ...ev,
            subscription_id: sub.id,
            calendar_name: sub.name,
            color: sub.color,
          });
        }
      } catch {
        errors.push({ subscription_id: sub.id, calendar_name: sub.name });
      }
    }));

    events.sort((a, b) => a.start.localeCompare(b.start));

    const payload: CalendarEventsData = {
      date: dayStart.toISODate() || '',
      events,
      errors,
    };
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err: unknown) {
    console.error('Calendar events API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
