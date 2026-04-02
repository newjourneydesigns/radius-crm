import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/* ── iCal helpers ─────────────────────────────────────────────────────────── */

// Strip HTML tags and decode entities to plain text
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Remove emoji and non-BMP characters that cause double-encoding issues.
// Uses surrogate pair matching instead of /u flag for broader TS target compat.
function stripEmoji(str: string): string {
  return (str || '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // supplementary chars (emoji, etc.)
    .replace(/[\u2600-\u27BF\uFE00-\uFEFF]/g, '')   // misc symbols & variation selectors
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Escape special characters per RFC 5545
function icsEscape(str: string): string {
  return (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// Fold lines longer than 75 octets per RFC 5545 §3.1
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

// Format a YYYY-MM-DD string as an iCal date value (YYYYMMDD)
function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

// Advance a YYYY-MM-DD date by one day (for exclusive DTEND)
function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

interface CardRow {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  priority: string | null;
  is_complete: boolean;
  board_id: string;
  column_id: string;
}

interface ChecklistRow {
  id: string;
  title: string;
  due_date: string;
  card_id: string;
  card_title: string;
  board_id: string;
}

// Current timestamp in iCal format: YYYYMMDDTHHMMSSZ
function dtstamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function buildIcs(
  cards: CardRow[],
  checklists: ChecklistRow[],
  boardMap: Map<string, string>,
  columnMap: Map<string, string>,
  appUrl: string
): string {
  const stamp = dtstamp();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Radius CRM//Boards Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Radius Boards',
    'X-WR-CALDESC:Board card due dates from Radius CRM',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    // VTIMEZONE block for America/Chicago — required by Outlook when events reference this zone
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ];

  for (const card of cards) {
    const startDate = card.start_date || card.due_date!;
    const endDate   = nextDay(card.due_date || card.start_date!);
    const boardName = stripEmoji(boardMap.get(card.board_id) || 'Board');
    const colName   = columnMap.get(card.column_id) || '';
    const priority  = card.priority ? ` - ${card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}` : '';
    const status    = card.is_complete ? 'COMPLETED' : 'CONFIRMED';
    const summary   = stripEmoji(card.title).slice(0, 100);

    const plainDesc = card.description ? stripHtml(card.description) : null;
    const description = [
      boardName,
      colName ? `Column: ${colName}` : null,
      card.priority ? `Priority: ${card.priority}` : null,
      plainDesc || null,
    ].filter(Boolean).join('\\n');

    const eventUrl = `${appUrl}/boards/${card.board_id}?card=${card.id}`;

    lines.push(
      'BEGIN:VEVENT',
      foldLine(`UID:card-${card.id}@radius-crm`),
      `DTSTAMP:${stamp}`,
      foldLine(`SUMMARY:${icsEscape(summary)}${priority}`),
      foldLine(`DTSTART;VALUE=DATE:${icsDate(startDate)}`),
      foldLine(`DTEND;VALUE=DATE:${icsDate(endDate)}`),
      foldLine(`DESCRIPTION:${description}`),
      foldLine(`URL:${eventUrl}`),
      `STATUS:${status}`,
      'END:VEVENT'
    );
  }

  for (const cl of checklists) {
    const description = `${icsEscape(stripEmoji(cl.card_title))} - ${stripEmoji(boardMap.get(cl.board_id) || 'Board')}`;

    lines.push(
      'BEGIN:VEVENT',
      foldLine(`UID:checklist-${cl.id}@radius-crm`),
      `DTSTAMP:${stamp}`,
      foldLine(`SUMMARY:[Checklist] ${icsEscape(cl.title)}`),
      foldLine(`DTSTART;VALUE=DATE:${icsDate(cl.due_date)}`),
      foldLine(`DTEND;VALUE=DATE:${icsDate(nextDay(cl.due_date))}`),
      foldLine(`DESCRIPTION:${description}`),
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ── Route handler ────────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return new NextResponse('Missing token', { status: 400 });
    }

    const service = getSupabaseServiceClient();

    // 1. Resolve token → user_id + included_board_ids
    const { data: feed, error: feedErr } = await service
      .from('user_calendar_feeds')
      .select('user_id, included_board_ids')
      .eq('token', token)
      .single();

    if (feedErr || !feed) {
      return new NextResponse('Invalid token', { status: 404 });
    }

    const { user_id, included_board_ids } = feed as {
      user_id: string;
      included_board_ids: string[];
    };

    // 2. Get all boards this user owns
    const { data: ownedBoards } = await service
      .from('project_boards')
      .select('id, title')
      .eq('user_id', user_id)
      .eq('is_archived', false);

    // 3. Get boards the user is assigned on (via card assignments)
    const { data: assignmentRows } = await service
      .from('card_assignments')
      .select('card_id, board_cards!inner(board_id)')
      .eq('user_id', user_id);

    const assignedBoardIds = Array.from(new Set(
      (assignmentRows || []).map((a: any) => {
        const bc = Array.isArray(a.board_cards) ? a.board_cards[0] : a.board_cards;
        return bc?.board_id as string;
      }).filter(Boolean)
    ));

    // 4. Union and optionally filter to included_board_ids
    let allBoardIds = Array.from(new Set([
      ...(ownedBoards || []).map((b: any) => b.id as string),
      ...assignedBoardIds,
    ]));

    if (included_board_ids.length > 0) {
      const allowed = new Set(included_board_ids);
      allBoardIds = allBoardIds.filter(id => allowed.has(id));
    }

    if (allBoardIds.length === 0) {
      // Return empty calendar
      const empty = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Radius CRM//Boards Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Radius Boards',
        'END:VCALENDAR',
      ].join('\r\n');

      return new NextResponse(empty, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=900',
        },
      });
    }

    // 5. Fetch board names for any assigned boards not in ownedBoards
    const ownedBoardMap = new Map((ownedBoards || []).map((b: any) => [b.id, b.title as string]));
    const missingBoardIds = allBoardIds.filter(id => !ownedBoardMap.has(id));

    if (missingBoardIds.length > 0) {
      const { data: extraBoards } = await service
        .from('project_boards')
        .select('id, title')
        .in('id', missingBoardIds);
      (extraBoards || []).forEach((b: any) => ownedBoardMap.set(b.id, b.title));
    }

    // 6. Fetch cards + checklists in parallel
    const [cardsResult, checklistsResult, columnsResult] = await Promise.all([
      service
        .from('board_cards')
        .select('id, title, description, start_date, due_date, priority, is_complete, board_id, column_id')
        .in('board_id', allBoardIds)
        .eq('is_archived', false)
        .or('due_date.not.is.null,start_date.not.is.null'),

      service
        .from('card_checklists')
        .select('id, title, due_date, card_id, board_cards!inner(id, title, board_id)')
        .in('board_cards.board_id', allBoardIds)
        .not('due_date', 'is', null),

      service
        .from('board_columns')
        .select('id, title')
        .in('board_id', allBoardIds),
    ]);

    const columnMap = new Map(
      (columnsResult.data || []).map((c: any) => [c.id, c.title as string])
    );

    const cards: CardRow[] = (cardsResult.data || []) as CardRow[];

    const checklists: ChecklistRow[] = (checklistsResult.data || [])
      .filter((cl: any) => cl.due_date)
      .map((cl: any) => {
        const bc = Array.isArray(cl.board_cards) ? cl.board_cards[0] : cl.board_cards;
        return {
          id: cl.id,
          title: cl.title,
          due_date: cl.due_date,
          card_id: cl.card_id,
          card_title: bc?.title || 'Unknown Card',
          board_id: bc?.board_id || '',
        };
      })
      .filter((cl: ChecklistRow) => cl.board_id && allBoardIds.includes(cl.board_id));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://radius.valleycreek.org';
    const icsContent = buildIcs(cards, checklists, ownedBoardMap, columnMap, appUrl);

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch (err) {
    console.error('iCal export error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
