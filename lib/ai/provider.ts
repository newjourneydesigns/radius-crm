import { AiAction, ChatMessage } from "../types";

export interface AiResult {
  reply: string;
  actions: AiAction[];
}

function extractJson(text: string): AiResult {
  // Models occasionally wrap JSON in fences despite instructions.
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model reply");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return {
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}

export async function callGemini(
  system: string,
  messages: ChatMessage[],
  imageDataUrl?: string
): Promise<AiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const contents = messages.map((m, i) => {
    const parts: object[] = [{ text: m.text }];
    // Attach the photo to the final user message.
    if (imageDataUrl && m.role === "user" && i === messages.length - 1) {
      const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return extractJson(text);
}

export async function callGroq(
  system: string,
  messages: ChatMessage[]
): Promise<AiResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty Groq response");
  return extractJson(text);
}
