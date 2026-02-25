import { NextRequest, NextResponse } from 'next/server';

interface EventData {
  eventId: string;
  title: string;
  date: string;
  link: string;
  notes: string | null;
  prayerRequests: string | null;
  topic: string | null;
  headCount: number | null;
  didNotMeet: boolean;
  attendees: Array<{ id?: string; name?: string; status?: string }>;
}

function formatEventReport(event: EventData, index: number): string {
  const lines: string[] = [];

  lines.push(`--- Circle Report #${index + 1} ---`);
  lines.push(`Circle: ${event.title}`);

  if (event.date) {
    try {
      const d = new Date(event.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        lines.push(
          `Date: ${d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}`
        );
      } else {
        lines.push(`Date: ${event.date}`);
      }
    } catch {
      lines.push(`Date: ${event.date}`);
    }
  }

  if (event.didNotMeet) {
    lines.push('Status: DID NOT MEET (canceled)');
  } else {
    lines.push('Status: Met');
  }

  if (event.headCount !== null) {
    lines.push(`Head Count: ${event.headCount}`);
  }

  if (event.attendees.length > 0) {
    const names = event.attendees.map((a) => {
      let n = a.name || 'Unknown';
      if (a.status && a.status !== 'Present') n += ` (${a.status})`;
      return n;
    });
    lines.push(`Attendees Recorded (${event.attendees.length}): ${names.join(', ')}`);
  }

  if (event.topic) {
    lines.push(`\nTopic:\n${event.topic}`);
  }

  if (event.notes) {
    lines.push(`\nNotes:\n${event.notes}`);
  }

  if (event.prayerRequests) {
    lines.push(`\nPrayer Requests:\n${event.prayerRequests}`);
  }

  return lines.join('\n');
}

function buildPrompt(
  events: EventData[],
  startDate: string,
  endDate: string,
  groupName: string
): string {
  const formattedReports = events.map((event, i) => formatEventReport(event, i)).join('\n\n');

  const dateLabel =
    startDate === endDate || !endDate
      ? startDate
      : `${startDate} to ${endDate}`;

  const systemPrompt = `Act as a high-level ministry strategist and spiritual formation consultant.

I will paste multiple Circle Event reports below. Your job is to produce a full leadership-level report with insight, not just summaries.

Use the following structure every time:

1. Snapshot
- Number of circles that met
- Number canceled
- Total attendance
- Average circle size
- 3 largest circles
- 3 smallest circles (that met)

2. Major Spiritual Themes
Identify repeated themes across circles.
Explain what God appears to be doing spiritually in this campus.
Group insights into clear categories.
After each major theme, include 1–2 direct quotes from the notes that best illustrate it.
Format quotes as: "[exact quote]" — [Circle name]

3. Themes by Circle Type
If the circle names or context suggest distinct group types (e.g. men, women, couples, young adults, mixed), identify any themes or patterns that appear unique to a particular type.
Note where different types of circles are engaging differently with formation, community, or spiritual depth.
If circle types cannot be determined from the data, skip this section.

4. Cultural Indicators
- Invitational culture
- Repentance and confession
- Leadership development
- Depth vs surface engagement
- Signs of maturity
- Warning signs if present
Where possible, anchor each indicator with a brief quote or specific example from the notes.

5. Prayer Request Categories
Group all prayer requests mentioned across circles into thematic categories (e.g. health, family, work, spiritual breakthrough, grief, relationships).
For each category:
- List the category name and the total number of circles where it appeared
- List every circle that mentioned it by name
- Include 1–2 representative example quotes from the notes
Note any prayer themes that appear unusually heavy or widespread — these may indicate what is pressing on the community spiritually.

6. High-Weight Pastoral Moments
Identify specific names or stories that require personal follow-up.
Briefly explain why each matters.
Include a direct quote from the notes where relevant.

7. Follow-Up Urgency
Divide follow-up needs into two tiers:
- This week: People or situations requiring immediate pastoral contact
- This month: Situations worth monitoring or addressing in the near term
For each item use this format: [Person's name] — [Circle name] — [Reason for follow-up]
Be specific. Do not generalize.

8. Leadership Development Observations
- Backup leaders emerging
- Leaders who are growing
- Circles that may need coaching
- Patterns in cancellations

9. Strategic Recommendations
Give 3–5 clear leadership moves for me this week.

10. Two-Sentence Executive Summary
End with a concise, high-level read of what is happening spiritually.

Tone:
- Clear
- Direct
- Insightful
- Not fluffy
- Focus on formation, not attendance
- Speak in leadership language

Do not repeat raw notes. Synthesize.
Quotes must be taken verbatim from the notes provided — do not paraphrase or fabricate.

Date Range: ${dateLabel}
Group Filter: ${groupName || 'All Groups'}

Here are the Circle Event reports:

${formattedReports}`;

  return systemPrompt;
}

// --- Provider implementations (same pattern as /api/ai-summarize) ---

async function callGemini(
  apiKey: string,
  prompt: string
): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
          topP: 0.9,
        },
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
    const errorData = await response.json().catch(() => ({}));
    return {
      error: errorData?.error?.message || `Gemini error: ${response.status}`,
      status: response.status,
    };
  }

  const data = await response.json();
  const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summary) return { error: 'Gemini returned an empty response.', status: 502 };
  return { summary: summary.trim(), status: 200 };
}

async function callGroq(
  apiKey: string,
  prompt: string
): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert ministry strategist and spiritual formation consultant. Follow the user\'s instructions exactly and produce thorough, structured leadership reports.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 8000,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) return { status: 429, rateLimited: true };
    const errorData = await response.json().catch(() => ({}));
    return {
      error: errorData?.error?.message || `Groq error: ${response.status}`,
      status: response.status,
    };
  }

  const data = await response.json();
  const summary = data?.choices?.[0]?.message?.content;
  if (!summary) return { error: 'Groq returned an empty response.', status: 502 };
  return { summary: summary.trim(), status: 200 };
}

// --- Route handler ---

export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json(
        {
          error:
            'AI summarization is not configured. Please add GEMINI_API_KEY or GROQ_API_KEY to your environment variables.',
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { events, startDate, endDate, groupName } = body as {
      events: EventData[];
      startDate: string;
      endDate: string;
      groupName: string;
    };

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'No events provided to summarize.' }, { status: 400 });
    }

    const prompt = buildPrompt(events, startDate, endDate, groupName);

    // Try Gemini first, fall back to Groq
    if (geminiKey) {
      const geminiResult = await callGemini(geminiKey, prompt);

      if (geminiResult.summary) {
        return NextResponse.json({ summary: geminiResult.summary });
      }

      if (geminiResult.rateLimited && groqKey) {
        console.log('Gemini rate-limited, falling back to Groq');
      } else if (!groqKey) {
        const errorMsg = geminiResult.rateLimited
          ? 'AI rate limit reached. Please wait a moment and try again.'
          : geminiResult.error || 'AI service error';
        return NextResponse.json({ error: errorMsg }, { status: geminiResult.status });
      } else {
        console.warn('Gemini error, falling back to Groq:', geminiResult.error);
      }
    }

    if (groqKey) {
      const groqResult = await callGroq(groqKey, prompt);

      if (groqResult.summary) {
        return NextResponse.json({ summary: groqResult.summary });
      }

      const errorMsg = groqResult.rateLimited
        ? 'Both AI providers are rate-limited. Please wait a moment and try again.'
        : groqResult.error || 'AI service error';
      return NextResponse.json({ error: errorMsg }, { status: groqResult.status });
    }

    return NextResponse.json({ error: 'No AI provider available.' }, { status: 500 });
  } catch (error: unknown) {
    console.error('CCB summarize error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
