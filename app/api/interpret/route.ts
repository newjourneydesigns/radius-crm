import { NextRequest, NextResponse } from "next/server";
import { callGemini, callGroq } from "@/lib/ai/provider";
import {
  buildPlayPrompt,
  buildSetupPrompt,
  buildVisionPreamble,
} from "@/lib/ai/prompt";
import { localPlay, localSetup } from "@/lib/localParser";
import { AiAction, InterpretRequest, InterpretResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_HISTORY = 20;

export async function POST(req: NextRequest) {
  let body: InterpretRequest;
  try {
    body = (await req.json()) as InterpretRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const messages = body.messages.slice(-MAX_HISTORY);
  const system =
    body.phase === "setup" ? buildSetupPrompt() : buildPlayPrompt(body);

  if (body.image) {
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = {
      ...last,
      text: `${buildVisionPreamble()}\n\n${last.text || "Here's a photo of our game."}`,
    };
  }

  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (hasGemini) {
    try {
      const result = await callGemini(system, messages, body.image);
      return NextResponse.json(finalize(result.reply, result.actions, body, "gemini"));
    } catch (err) {
      console.error("Gemini failed, trying fallback:", err);
    }
  }

  if (hasGroq && !body.image) {
    try {
      const result = await callGroq(system, messages);
      return NextResponse.json(finalize(result.reply, result.actions, body, "groq"));
    } catch (err) {
      console.error("Groq failed, falling back to local parser:", err);
    }
  }

  const local =
    body.phase === "setup" ? localSetup(body) : localPlay(body);
  return NextResponse.json(local);
}

/**
 * Vision-sourced corrections are never applied silently: score changes that
 * came from a photo are returned as proposals for the table to confirm.
 */
function finalize(
  reply: string,
  actions: AiAction[],
  body: InterpretRequest,
  provider: InterpretResponse["provider"]
): InterpretResponse {
  if (body.image) {
    const proposals = actions.filter(
      (a) => a.kind === "set_score" || a.kind === "adjust_score"
    );
    const rest = actions.filter(
      (a) => a.kind !== "set_score" && a.kind !== "adjust_score"
    );
    return { reply, actions: rest, proposals, provider };
  }
  return { reply, actions, provider };
}
