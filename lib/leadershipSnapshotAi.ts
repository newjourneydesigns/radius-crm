// Generates the Leadership Snapshot's AI output in a single Gemini call:
// an overall encouraging summary plus per-category next steps. Mirrors the
// Gemini fetch/retry shape used in app/api/ai-summarize/route.ts (Gemini 2.5
// Flash, GEMINI_API_KEY, 503 retry with backoff). Server-side only.

import type { SnapshotCategory } from './leadershipSnapshot';
import type { LeadershipSnapshotCategoryScore } from './supabase';

export interface SnapshotInsightInput {
  firstName: string;
  role: string;
  campus: string;
  circleType: string;
  groupSize: string;
  categoryScores: LeadershipSnapshotCategoryScore[];
  reflections: Record<string, string>; // keyed by each category's reflectionId
  categories: SnapshotCategory[];       // the template's categories (for labels/ids/prompts)
}

export interface SnapshotInsights {
  overall_summary: string;
  // Per-category next steps keyed by category id (cat1..cat5).
  category_next_steps: Record<string, string>;
}

function buildPrompt(input: SnapshotInsightInput): string {
  const scoresText = input.categoryScores
    .map((s) => `- ${s.label} (${s.id}): ${s.score}% (${s.isStrength ? 'Strength' : 'Growth Opportunity'})`)
    .join('\n');

  const reflectText = input.categories.map((cat) => {
    const r = (input.reflections[cat.reflectionId] || '').trim();
    return r ? `${cat.label} (${cat.id}): "${r}"` : '';
  })
    .filter(Boolean)
    .join('\n');

  const catIdList = input.categories.map((c) => `"${c.id}"`).join(', ');

  return `You are a compassionate, encouraging coach for Valley Creek Church Circle Leaders. You are writing for ${input.firstName}, a ${input.role} leading a ${input.circleType} Circle of ${input.groupSize} at the ${input.campus} campus.

Their Leadership Snapshot scores:
${scoresText}

Their reflections:
${reflectText || '(no written reflections provided)'}

Produce two things:
1. "overall_summary": a warm, personal 3-4 paragraph summary addressed to ${input.firstName} in second person. Celebrate strengths genuinely, speak honestly but gently about growth areas, and end with an encouraging word about their next step. Flowing paragraphs only — no headers or bullet points.
2. "category_next_steps": for EACH category id (${catIdList}), 2-3 concrete, actionable next steps tailored to that category's score and reflection. Write each as a short paragraph or a few sentences (plain text, no bullet characters).

Respond with ONLY valid JSON in exactly this shape, no markdown code fences and no commentary:
{"overall_summary":"...","category_next_steps":{${input.categories.map((c) => `"${c.id}":"..."`).join(',')}}}`;
}

function extractJson(text: string): string {
  let t = text.trim();
  // Strip ```json ... ``` fences if the model added them.
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return t.slice(first, last + 1);
  }
  return t;
}

async function callGemini(apiKey: string, prompt: string, maxTokens = 2048): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: maxTokens,
            topP: 0.8,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
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
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Gemini error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    return text.trim();
  }
  throw new Error('Gemini is experiencing high demand. Please try again in a moment.');
}

/**
 * Returns the AI summary + per-category next steps. Never throws: on any
 * failure it returns nulls so the submission still succeeds (the UI degrades
 * gracefully, like the prototype's error state).
 */
export async function generateSnapshotInsights(
  input: SnapshotInsightInput
): Promise<{ summary: string | null; categoryNextSteps: Record<string, string> | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[leadership-snapshot] GEMINI_API_KEY not set — skipping AI insights.');
    return { summary: null, categoryNextSteps: null };
  }

  try {
    const raw = await callGemini(apiKey, buildPrompt(input));
    const parsed = JSON.parse(extractJson(raw)) as SnapshotInsights;
    const summary = typeof parsed.overall_summary === 'string' ? parsed.overall_summary.trim() : null;

    const steps: Record<string, string> = {};
    if (parsed.category_next_steps && typeof parsed.category_next_steps === 'object') {
      for (const cat of input.categories) {
        const v = parsed.category_next_steps[cat.id];
        if (typeof v === 'string' && v.trim()) steps[cat.id] = v.trim();
      }
    }

    return {
      summary,
      categoryNextSteps: Object.keys(steps).length > 0 ? steps : null,
    };
  } catch (err) {
    console.error('[leadership-snapshot] AI insight generation failed:', err);
    return { summary: null, categoryNextSteps: null };
  }
}
