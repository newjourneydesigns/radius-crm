import { NextRequest, NextResponse } from 'next/server';

interface ChecklistSuggestion {
  text: string;
  kind: 'next_step' | 'open_item';
  sourceLine: number;
  sourceQuote: string;
}

function normalizeChecklistText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '');
}

function addLineNumbers(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n');
}

function parseSuggestions(raw: string): ChecklistSuggestion[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): ChecklistSuggestion | null => {
      if (!item || typeof item !== 'object') return null;

      const text = typeof item.text === 'string' ? normalizeChecklistText(item.text) : '';
      const kind = item.kind === 'open_item' ? 'open_item' : 'next_step';
      const sourceLine = Number(item.sourceLine);
      const sourceQuote = typeof item.sourceQuote === 'string' ? item.sourceQuote.trim() : '';

      if (!text || !Number.isFinite(sourceLine) || sourceLine < 1 || !sourceQuote) return null;

      return {
        text,
        kind,
        sourceLine,
        sourceQuote: sourceQuote.slice(0, 160),
      };
    })
    .filter((item): item is ChecklistSuggestion => item !== null)
    .slice(0, 12);
}

async function callGemini(apiKey: string, text: string): Promise<{ suggestions?: ChecklistSuggestion[]; error?: string; status: number }> {
  const systemPrompt = `You suggest checklist items from notebook notes for a church CRM app.

Find concrete tasks that belong in a checklist. Include both:
- next_step: actions, commitments, follow-ups, decisions that require action, "we should/we need to" statements, and implied pastoral care or leadership actions
- open_item: unresolved questions, blockers, waiting items, unclear ownership, or outstanding decisions

Rules:
- Only suggest items supported by the source note.
- Do not invent tasks, owners, dates, or details.
- Use the clearest, most concise language possible.
- Make each item 2-8 words when possible.
- Start with a strong verb for next steps: Follow up, Ask, Confirm, Schedule, Send, Review, Pray, Check, Decide, Update.
- For open items, phrase as the unresolved thing to clarify or decide.
- Do not include source quotes, line numbers, labels, explanations, or extra context in the text field.
- Do not write full sentences when a short task label is enough.
- Do not end checklist text with punctuation.
- Include where each item came from using the provided source line number and a short exact quote from that line.
- Return only JSON. No markdown, no explanation.

JSON shape:
[
  { "text": "Follow up with Jordan about childcare coverage", "kind": "next_step", "sourceLine": 4, "sourceQuote": "Jordan may need help with childcare" }
]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nSource note:\n${addLineNumbers(text)}` }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
          topP: 0.8,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
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
    const errorData = await response.json().catch(() => ({}));
    return { error: errorData?.error?.message || `Gemini error: ${response.status}`, status: response.status };
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return { error: 'Gemini returned an empty response.', status: 502 };

  try {
    return { suggestions: parseSuggestions(raw), status: 200 };
  } catch {
    return { error: 'Gemini returned suggestions in an invalid format.', status: 502 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { error: 'AI checklist suggestions are not configured. Please add GEMINI_API_KEY.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'No note text provided.' }, { status: 400 });
    }

    const result = await callGemini(geminiKey, text.trim());
    if (result.suggestions) {
      return NextResponse.json({ suggestions: result.suggestions });
    }

    return NextResponse.json(
      { error: result.error || 'Gemini AI error', provider: 'gemini' },
      { status: result.status || 500 }
    );
  } catch (error: unknown) {
    console.error('Checklist suggestions error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
