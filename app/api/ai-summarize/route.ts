import { NextRequest, NextResponse } from 'next/server';

function getSystemPrompt(wordCount: number): string {
  let depthInstruction: string;

  if (wordCount < 100) {
    depthInstruction = `The input is brief. Provide:
- A concise 1-2 sentence summary
- 1-3 suggested next steps, if any can be inferred`;
  } else if (wordCount < 300) {
    depthInstruction = `The input is moderate length. Provide:
- A solid summary paragraph covering all key points
- Any key themes or topics mentioned
- 2-4 concrete next steps, if any can be inferred`;
  } else {
    depthInstruction = `The input is a detailed brain dump. Be thorough and comprehensive. Provide:
- A multi-paragraph summary organized by topic/theme — capture EVERY key point, decision, concern, and idea
- All people or groups mentioned and their context
- Next steps prioritized by urgency (most urgent first), if any can be inferred
- Any unresolved questions or open items that need follow-up

Do NOT summarize away important details. The user needs to see everything they mentioned reflected back clearly.`;
  }

  return `You are a meeting notes assistant for a church CRM application. Your job is to take raw dictated or typed meeting notes and produce a clean, well-organized summary.

${depthInstruction}

The source note is provided with line numbers. Use those line numbers to identify where action items came from.

Format your response EXACTLY like this:

Meeting Summary
[your summary here — scale depth to match the input length]

Key Points
• [key point 1]
• [key point 2]
(include this section only if the input has enough substance to warrant it — skip for very short inputs)

Next Steps
• [action item 1] (source: line [line number] — "[short exact phrase from the note]")
• [action item 2] (source: line [line number] — "[short exact phrase from the note]")
• [action item 3] (source: line [line number] — "[short exact phrase from the note]")
(include this section only if there are explicit or strongly implied follow-up actions)

Open Items
• [unresolved question or thing needing follow-up]
(include this section only if there are genuinely unresolved items — skip if everything is clear)

Rules:
- Use plain text with bullet points (•), no markdown headers or bold
- If a meeting type/category is obvious from the content, mention it naturally in the summary (e.g., "This one-on-one meeting covered..." or "During this leadership planning session...") — but don't force a category
- Be warm but professional — this is for church ministry context
- Preserve any specific names, dates, numbers, or commitments mentioned
- Automatically find next steps from explicit commitments, requests, decisions, problems to solve, follow-up language, "we should/we need to" statements, and implied pastoral care or leadership actions
- Every next step must include a source reference with the line number and a short exact phrase from the note, so the user can find where it came from
- Do not invent next steps that are not supported by the source note
- If the note contains no supported next steps, omit the Next Steps section
- If the input is very short or unclear, do your best and note what seems unclear`;
}

function addLineNumbers(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n');
}

async function callGemini(apiKey: string, systemPrompt: string, text: string, maxTokens: number = 2048): Promise<{ summary?: string; error?: string; status: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${text}` }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
            topP: 0.8,
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
      if (response.status === 503 && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData?.error?.message || `Gemini error: ${response.status}`, status: response.status };
    }

    const data = await response.json();
    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) return { error: 'Gemini returned an empty response.', status: 502 };
    return { summary: summary.trim(), status: 200 };
  }
  return { error: 'Gemini is experiencing high demand. Please try again in a moment.', status: 503 };
}

export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json(
        { error: 'AI summarization is not configured. Please add GEMINI_API_KEY.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, mode } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'No text provided to summarize.' }, { status: 400 });
    }

    const trimmedText = text.trim();

    let systemPrompt: string;
    let sourceText = trimmedText;
    if (mode === 'meeting-prep') {
      systemPrompt = 'You are an expert coaching assistant for church ministry leadership. Follow the user\'s instructions exactly and produce a thorough, well-structured briefing.';
    } else {
      const wordCount = trimmedText.split(/\s+/).length;
      systemPrompt = getSystemPrompt(wordCount);
      sourceText = addLineNumbers(trimmedText);
    }

    const maxTokens = mode === 'meeting-prep' ? 4096 : 2048;

    const result = await callGemini(geminiKey, systemPrompt, sourceText, maxTokens);
    if (result.summary) return NextResponse.json({ summary: result.summary });

    return NextResponse.json(
      { error: result.error || 'Gemini AI error', provider: 'gemini' },
      { status: result.status || 500 }
    );
  } catch (error: unknown) {
    console.error('AI summarize error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
