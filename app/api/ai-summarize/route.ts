import { NextRequest, NextResponse } from 'next/server';

function getSystemPrompt(wordCount: number): string {
  let depthInstruction: string;

  if (wordCount < 100) {
    depthInstruction = `The input is brief. Provide:
- A concise 1-2 sentence summary
- 1-3 suggested next steps`;
  } else if (wordCount < 300) {
    depthInstruction = `The input is moderate length. Provide:
- A solid summary paragraph covering all key points
- Any key themes or topics mentioned
- 2-4 concrete next steps`;
  } else {
    depthInstruction = `The input is a detailed brain dump. Be thorough and comprehensive. Provide:
- A multi-paragraph summary organized by topic/theme — capture EVERY key point, decision, concern, and idea
- All people or groups mentioned and their context
- Next steps prioritized by urgency (most urgent first)
- Any unresolved questions or open items that need follow-up

Do NOT summarize away important details. The user needs to see everything they mentioned reflected back clearly.`;
  }

  return `You are a meeting notes assistant for a church CRM application. Your job is to take raw dictated or typed meeting notes and produce a clean, well-organized summary.

${depthInstruction}

Format your response EXACTLY like this (use these exact emoji headers):

📋 Meeting Summary
[your summary here — scale depth to match the input length]

📌 Key Points
• [key point 1]
• [key point 2]
(include this section only if the input has enough substance to warrant it — skip for very short inputs)

✅ Next Steps
• [action item 1]
• [action item 2]
• [action item 3]

❓ Open Items
• [unresolved question or thing needing follow-up]
(include this section only if there are genuinely unresolved items — skip if everything is clear)

Rules:
- Use plain text with bullet points (•), no markdown headers or bold
- If a meeting type/category is obvious from the content, mention it naturally in the summary (e.g., "This one-on-one meeting covered..." or "During this leadership planning session...") — but don't force a category
- Be warm but professional — this is for church ministry context
- Preserve any specific names, dates, numbers, or commitments mentioned
- If the input is very short or unclear, do your best and note what seems unclear`;
}

// --- Provider implementations ---

async function callGemini(apiKey: string, systemPrompt: string, text: string, maxTokens: number = 2048): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt}\n\n---\n\n${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
          topP: 0.8,
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
    if (response.status === 429) {
      return { status: 429, rateLimited: true };
    }
    const errorData = await response.json().catch(() => ({}));
    return { error: errorData?.error?.message || `Gemini error: ${response.status}`, status: response.status };
  }

  const data = await response.json();
  const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summary) {
    return { error: 'Gemini returned an empty response.', status: 502 };
  }
  return { summary: summary.trim(), status: 200 };
}

async function callGroq(apiKey: string, systemPrompt: string, text: string, maxTokens: number = 2048): Promise<{ summary?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
      top_p: 0.8,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return { status: 429, rateLimited: true };
    }
    const errorData = await response.json().catch(() => ({}));
    return { error: errorData?.error?.message || `Groq error: ${response.status}`, status: response.status };
  }

  const data = await response.json();
  const summary = data?.choices?.[0]?.message?.content;
  if (!summary) {
    return { error: 'Groq returned an empty response.', status: 502 };
  }
  return { summary: summary.trim(), status: 200 };
}

// --- Route handler ---

export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json(
        { error: 'AI summarization is not configured. Please add GEMINI_API_KEY or GROQ_API_KEY to your environment variables.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, mode } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided to summarize.' },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();

    // For meeting-prep mode, pass the prompt directly (it already contains instructions)
    let systemPrompt: string;
    if (mode === 'meeting-prep') {
      systemPrompt = 'You are an expert coaching assistant for church ministry leadership. Follow the user\'s instructions exactly and produce a thorough, well-structured briefing.';
    } else {
      const wordCount = trimmedText.split(/\s+/).length;
      systemPrompt = getSystemPrompt(wordCount);
    }

    const maxTokens = mode === 'meeting-prep' ? 4096 : 2048;

    // Try Gemini first, fall back to Groq on rate limit or error
    if (geminiKey) {
      const geminiResult = await callGemini(geminiKey, systemPrompt, trimmedText, maxTokens);
      
      if (geminiResult.summary) {
        return NextResponse.json({ summary: geminiResult.summary });
      }

      // If rate-limited and we have Groq, fall back silently
      if (geminiResult.rateLimited && groqKey) {
        console.log('Gemini rate-limited, falling back to Groq');
      } else if (!groqKey) {
        // No fallback available
        const errorMsg = geminiResult.rateLimited
          ? 'AI rate limit reached. Please wait a moment and try again.'
          : geminiResult.error || 'AI service error';
        return NextResponse.json({ error: errorMsg }, { status: geminiResult.status });
      } else {
        // Non-rate-limit error but we have Groq — try it
        console.warn('Gemini error, falling back to Groq:', geminiResult.error);
      }
    }

    // Groq: primary (if no Gemini key) or fallback
    if (groqKey) {
      const groqResult = await callGroq(groqKey, systemPrompt, trimmedText, maxTokens);

      if (groqResult.summary) {
        return NextResponse.json({ summary: groqResult.summary });
      }

      const errorMsg = groqResult.rateLimited
        ? 'Both AI providers are rate-limited. Please wait a moment and try again.'
        : groqResult.error || 'AI service error';
      return NextResponse.json({ error: errorMsg }, { status: groqResult.status });
    }

    // Should never reach here, but just in case
    return NextResponse.json({ error: 'No AI provider available.' }, { status: 500 });

  } catch (error: unknown) {
    console.error('AI summarize error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
