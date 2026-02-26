import { NextRequest, NextResponse } from 'next/server';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<{ reply?: string; error?: string; status: number; rateLimited?: boolean }> {
  // Gemini uses a single contents array with alternating user/model roles
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
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
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) return { error: 'Gemini returned an empty response.', status: 502 };
  return { reply: reply.trim(), status: 200 };
}

async function callGroq(
  apiKey: string,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<{ reply?: string; error?: string; status: number; rateLimited?: boolean }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.5,
      max_tokens: 2048,
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
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) return { error: 'Groq returned an empty response.', status: 502 };
  return { reply: reply.trim(), status: 200 };
}

export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json(
        { error: 'AI is not configured. Please add GEMINI_API_KEY or GROQ_API_KEY.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { messages, summary } = body as {
      messages: ChatMessage[];
      summary: string;
    };

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided.' }, { status: 400 });
    }

    const systemPrompt = `You are a ministry strategy advisor assisting a church leader in reviewing and discussing a Circle Event Summary Analysis.

The following analysis was just generated from this week's circle event reports. Use it as your primary source of truth when answering questions:

---
${summary}
---

Your role in this conversation:
- Answer follow-up questions about the analysis directly and specifically
- Reference specific circles, names, and quotes from the analysis when relevant
- Offer additional strategic insight when asked
- If asked something not covered in the analysis, say so clearly and offer what you can infer
- Keep responses concise and leadership-focused — no fluff
- Speak in the same direct, pastoral-strategic tone as the analysis itself`;

    // Try Gemini first, fall back to Groq
    if (geminiKey) {
      const result = await callGemini(geminiKey, systemPrompt, messages);
      if (result.reply) return NextResponse.json({ reply: result.reply });

      if (result.rateLimited && groqKey) {
        console.log('Gemini rate-limited, falling back to Groq');
      } else if (!groqKey) {
        const errorMsg = result.rateLimited
          ? 'AI rate limit reached. Please wait a moment and try again.'
          : result.error || 'AI service error';
        return NextResponse.json({ error: errorMsg }, { status: result.status });
      } else {
        console.warn('Gemini error, falling back to Groq:', result.error);
      }
    }

    if (groqKey) {
      const result = await callGroq(groqKey, systemPrompt, messages);
      if (result.reply) return NextResponse.json({ reply: result.reply });

      const errorMsg = result.rateLimited
        ? 'Both AI providers are rate-limited. Please wait a moment and try again.'
        : result.error || 'AI service error';
      return NextResponse.json({ error: errorMsg }, { status: result.status });
    }

    return NextResponse.json({ error: 'No AI provider available.' }, { status: 500 });
  } catch (error: unknown) {
    console.error('CCB chat error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
