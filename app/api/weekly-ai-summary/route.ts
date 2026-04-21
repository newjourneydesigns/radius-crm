import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../lib/ccb/ccb-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, serviceRoleKey);
}

// --- AI provider calls (mirrors /api/ai-summarize pattern) ---

async function callGemini(apiKey: string, systemPrompt: string, text: string): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${text}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000, topP: 0.85 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    }
  );

  if (!response.ok) {
    if (response.status === 429) return { status: 429, rateLimited: true };
    const err = await response.json().catch(() => ({}));
    return { error: err?.error?.message || `Gemini error: ${response.status}`, status: response.status };
  }

  const data = await response.json();
  const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summary) return { error: 'Gemini returned an empty response.', status: 502 };
  return { summary: summary.trim(), status: 200 };
}

async function callGroq(apiKey: string, systemPrompt: string, text: string): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.4,
      max_tokens: 3000,
      top_p: 0.85,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) return { status: 429, rateLimited: true };
    const err = await response.json().catch(() => ({}));
    return { error: err?.error?.message || `Groq error: ${response.status}`, status: response.status };
  }

  const data = await response.json();
  const summary = data?.choices?.[0]?.message?.content;
  if (!summary) return { error: 'Groq returned an empty response.', status: 502 };
  return { summary: summary.trim(), status: 200 };
}

const SYSTEM_PROMPT = `You are analyzing Circle Event Summary reports for pastoral insight.

Your job is to focus primarily on the Notes, Prayer Requests, and any meaningful statements of spiritual response. Do not emphasize attendance counts, head count trends, or roster data unless they directly affect pastoral care or explain the note.

Your goal is to identify how people are responding to God in Circles, especially:
- spiritual hunger
- resistance or hesitation
- breakthrough moments
- confusion or theological questions
- emotional tone
- shared themes across groups
- notable outliers
- pastoral follow-up needs
- memorable quotes or highlight statements

As you analyze, look for:
1. Trends and patterns across multiple reports
   - repeated spiritual themes
   - common questions
   - common responses to the weekend message or ministry moment
   - evidence of growing openness, faith, repentance, healing, hunger, or unity

2. Outliers
   - unusual resistance
   - confusion that may need shepherding
   - especially strong breakthrough moments
   - situations needing urgent pastoral awareness

3. Pastor follow-up items
   - medical needs
   - emotional distress
   - relational conflict
   - theological confusion
   - resistance to the Holy Spirit or ministry environment
   - people who may need encouragement, clarification, or personal contact

4. Highlight statements
   - short, meaningful lines from the notes that capture what God seems to be doing
   - statements that reveal transformation, hunger, freedom, peace, joy, conviction, or breakthrough

5. Change requests
   - any mention of a leader wanting to change their meeting time, day, or location
   - roster changes such as adding, removing, or transferring members
   - requests to pause, end, or restructure their circle
   - requests for resources, curriculum, or support
   - anything that requires an administrative or logistical response from an ACPD

Return your analysis in this structure:

1. Overall Read on the Week
Write 2 to 4 sentences summarizing what seems to be happening spiritually across these Circle reports.

2. Key Spiritual Trends
Give 3 to 7 bullet points describing major patterns you see in the notes.

3. Notable Outliers
List any reports or moments that stand out as unusually important, unusually resistant, or especially significant.

4. Pastor Follow-Up
List specific follow-up needs with:
- leader name
- person if named
- reason for follow-up
- suggested pastoral response

5. Highlight Statements
Pull out 3 to 8 short statements or paraphrased lines that best capture the spiritual tone of the reports.

6. Change Requests
List any logistical or administrative requests mentioned in the notes, including:
- meeting time, day, or location changes
- roster additions, removals, or transfers
- requests to pause, restructure, or end a circle
- resource or curriculum requests
- anything else requiring an action from an ACPD
If none are found, omit this section.

7. Cautions or Tensions
Identify any places where confusion, imbalance, resistance, or misunderstanding may need wise pastoral attention.

Important instructions:
- Prioritize spiritual insight over administrative reporting.
- Do not spend space summarizing who attended unless it matters to the pastoral read.
- Be concise but perceptive.
- Use warm, pastoral language, not corporate analytics language.
- If a note is mostly logistical, simply note that it offered little spiritual insight.
- Distinguish clearly between widespread trends and isolated comments.
- Do not overstate conclusions. Use language like "seems," "appears," or "suggests" when appropriate.`;

// --- Route handlers ---

// GET /api/weekly-ai-summary?week=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const week = request.nextUrl.searchParams.get('week');
  if (!week) {
    return NextResponse.json({ error: 'week parameter required' }, { status: 400 });
  }

  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from('weekly_ai_summaries')
      .select('*')
      .eq('week_start_date', week)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ summary: data ?? null });
  } catch (err: unknown) {
    console.error('weekly-ai-summary GET error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/weekly-ai-summary — generate (does not save)
export async function POST(request: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey && !groqKey) {
    return NextResponse.json({ error: 'AI summarization is not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { weekStartDate, weekLabel, leaders, filterLabel } = body as {
      weekStartDate: string; // YYYY-MM-DD (Sunday)
      weekLabel: string;
      filterLabel: string;
      leaders: Array<{
        id: number;
        name: string;
        circle_type?: string;
        campus?: string;
        acpd?: string;
        status?: string;
        eventState: string;
        followUpRequired?: boolean;
        followUpNote?: string;
      }>;
    };

    if (!weekStartDate || !weekLabel || !leaders?.length) {
      return NextResponse.json({ error: 'weekStartDate, weekLabel, and leaders are required.' }, { status: 400 });
    }

    // Fetch CCB Event Summary Reports directly from CCB API
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // Build a name → leader lookup for matching CCB event titles to leaders
    // CCB title format: "LVT | S1 | Leader Name" — match on last segment after " | "
    const leadersByName = new Map<string, typeof leaders[number]>();
    for (const l of leaders) {
      leadersByName.set(l.name.toLowerCase().trim(), l);
    }

    let ccbEvents: Array<{
      eventId: string;
      title: string;
      occurDate: string;
      notes: string | null;
      prayerRequests: string | null;
      topic: string | null;
      headCount: number | null;
      didNotMeet: boolean;
      attendees: Array<{ id?: string; name?: string; status?: string }>;
    }> = [];

    try {
      const ccbClient = createCCBClient();
      ccbEvents = await ccbClient.getAllEventsForWeek(weekStartDate, weekEnd);
    } catch (ccbErr) {
      console.warn('CCB fetch failed, falling back to empty events:', ccbErr);
      // Continue with empty events — AI will note no data was available
    }

    // Map leader id → { notes, prayerRequests } by matching CCB event titles to leader names
    const notesByLeader = new Map<number, { notes: string; prayerRequests: string | null }>();
    for (const event of ccbEvents) {
      if (!event.notes && !event.prayerRequests) continue;

      // Extract leader name from CCB title (last segment after " | ")
      let matchedLeader: typeof leaders[number] | undefined;
      if (event.title.includes('|')) {
        const namePart = event.title.split('|').pop()!.trim().toLowerCase();
        matchedLeader = leadersByName.get(namePart);
        // Fuzzy fallback: check if any leader name is contained in the name part
        if (!matchedLeader && namePart) {
          for (const [lname, l] of leadersByName) {
            if (namePart.includes(lname) || lname.includes(namePart)) {
              matchedLeader = l;
              break;
            }
          }
        }
      }
      // Fallback: scan full title
      if (!matchedLeader) {
        const titleLower = event.title.toLowerCase();
        for (const [lname, l] of leadersByName) {
          if (titleLower.includes(lname)) {
            matchedLeader = l;
            break;
          }
        }
      }

      if (matchedLeader && !notesByLeader.has(matchedLeader.id)) {
        notesByLeader.set(matchedLeader.id, {
          notes: event.notes ?? '',
          prayerRequests: event.prayerRequests ?? null,
        });
      }
    }

    const stateLabel: Record<string, string> = {
      received: 'Received',
      did_not_meet: 'Did Not Meet',
      skipped: 'Skipped',
      not_received: 'Not Reported',
    };

    const withNotes = leaders.filter(l => notesByLeader.has(l.id));
    const withoutNotes = leaders.filter(l => !notesByLeader.has(l.id));

    const lines: string[] = [
      `Week: ${weekLabel} | View: ${filterLabel}`,
      `${leaders.length} circles total — ${withNotes.length} with CCB event notes, ${withoutNotes.length} without`,
      '',
      '=== CIRCLE REPORTS WITH NOTES ===',
      '',
    ];

    for (const l of withNotes) {
      const entry = notesByLeader.get(l.id)!;
      const meta = [
        l.circle_type || 'Circle',
        l.campus || null,
        l.acpd ? `ACPD: ${l.acpd}` : null,
        `Event: ${stateLabel[l.eventState] ?? l.eventState}`,
        l.followUpRequired ? `[FOLLOW-UP FLAGGED${l.followUpNote ? `: ${l.followUpNote}` : ''}]` : null,
      ].filter(Boolean).join(' | ');
      lines.push(`Leader: ${l.name} — ${meta}`);
      if (entry.notes) lines.push(`Notes: ${entry.notes}`);
      if (entry.prayerRequests) lines.push(`Prayer Requests: ${entry.prayerRequests}`);
      lines.push('');
    }

    if (withoutNotes.length > 0) {
      lines.push('=== CIRCLES WITHOUT NOTES ===');
      lines.push('(Listed for context only — no CCB event note available)');
      for (const l of withoutNotes) {
        const parts = [
          l.circle_type || 'Circle',
          l.campus || null,
          `Event: ${stateLabel[l.eventState] ?? l.eventState}`,
          l.followUpRequired ? '[FOLLOW-UP FLAGGED]' : null,
        ].filter(Boolean);
        lines.push(`  • ${l.name} — ${parts.join(' | ')}`);
      }
    }

    const prompt = lines.join('\n');

    if (geminiKey) {
      const result = await callGemini(geminiKey, SYSTEM_PROMPT, prompt);
      if (result.summary) return NextResponse.json({ summary: result.summary });
      if (result.rateLimited && groqKey) {
        console.log('Gemini rate-limited, falling back to Groq');
      } else if (!groqKey) {
        return NextResponse.json(
          { error: result.rateLimited ? 'AI rate limit reached. Please try again.' : result.error || 'AI error' },
          { status: result.status }
        );
      }
    }

    if (groqKey) {
      const result = await callGroq(groqKey, SYSTEM_PROMPT, prompt);
      if (result.summary) return NextResponse.json({ summary: result.summary });
      return NextResponse.json(
        { error: result.rateLimited ? 'Both AI providers are rate-limited.' : result.error || 'AI error' },
        { status: result.status }
      );
    }

    return NextResponse.json({ error: 'No AI provider available.' }, { status: 500 });
  } catch (err: unknown) {
    console.error('weekly-ai-summary POST error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/weekly-ai-summary — save (upsert)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { weekStartDate, summaryText, filterLabel, generatedBy } = body as {
      weekStartDate: string;
      summaryText: string;
      filterLabel: string;
      generatedBy?: string;
    };

    if (!weekStartDate || !summaryText) {
      return NextResponse.json({ error: 'weekStartDate and summaryText are required.' }, { status: 400 });
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('weekly_ai_summaries')
      .upsert(
        {
          week_start_date: weekStartDate,
          summary_text: summaryText,
          filter_label: filterLabel || 'All Circles',
          generated_by: generatedBy ?? null,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'week_start_date' }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ summary: data });
  } catch (err: unknown) {
    console.error('weekly-ai-summary PUT error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
