// =============================================================
// Radius AI Assistant — API Route
// =============================================================
// POST /api/ai-assistant
//
// Handles multi-turn conversation with Gemini function calling.
// Persists conversation history in Supabase (ai_conversations).
// Falls back to Groq if Gemini is rate-limited or errors.
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '../../../lib/ai-assistant-prompt';
import {
  executeTool,
  getGeminiToolDeclarations,
  getGroqToolDeclarations,
  ToolCall,
  ToolResult,
} from '../../../lib/ai-tools';

// ---- Types ----

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolAction?: string;
}

interface RequestBody {
  message: string;
  conversationId?: string;
  userId: string;
  userName: string;
  userRole: string;
  userCampus?: string;
}

// ---- Supabase service client ----

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

// ---- Date helpers ----

function getTodayCST(): string {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const y = cst.getFullYear();
  const m = String(cst.getMonth() + 1).padStart(2, '0');
  const d = String(cst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayOfWeekCST(): string {
  const now = new Date();
  const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  return cst.toLocaleDateString('en-US', { weekday: 'long' });
}

// ---- Gemini function calling ----

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: unknown } };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function callGeminiWithTools(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  tools: ReturnType<typeof getGeminiToolDeclarations>
): Promise<{
  reply?: string;
  functionCalls?: { name: string; args: Record<string, unknown> }[];
  error?: string;
  status: number;
  rateLimited?: boolean;
}> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
        generationConfig: {
          temperature: 0.4,
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
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts) {
    return { error: 'Gemini returned an empty response.', status: 502 };
  }

  const parts: GeminiPart[] = candidate.content.parts;

  // Check if the model wants to call functions
  const functionCalls = parts
    .filter((p: GeminiPart) => p.functionCall)
    .map((p: GeminiPart) => ({
      name: p.functionCall!.name,
      args: p.functionCall!.args,
    }));

  if (functionCalls.length > 0) {
    return { functionCalls, status: 200 };
  }

  // Otherwise, extract text reply
  const textParts = parts.filter((p: GeminiPart) => p.text);
  const reply = textParts.map((p: GeminiPart) => p.text).join('');
  if (!reply) return { error: 'Gemini returned empty text.', status: 502 };
  return { reply: reply.trim(), status: 200 };
}

// ---- Groq function calling (OpenAI compatible) ----

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function callGroqWithTools(
  apiKey: string,
  systemPrompt: string,
  messages: GroqMessage[],
  tools: ReturnType<typeof getGroqToolDeclarations>
): Promise<{
  reply?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
  error?: string;
  status: number;
  rateLimited?: boolean;
}> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.4,
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
  const choice = data?.choices?.[0];
  if (!choice) return { error: 'Groq returned empty response.', status: 502 };

  const msg = choice.message;

  // Check for tool calls
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolCalls = msg.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}'),
    }));
    return { toolCalls, status: 200 };
  }

  const reply = msg.content;
  if (!reply) return { error: 'Groq returned empty text.', status: 502 };
  return { reply: reply.trim(), status: 200 };
}

// ---- OpenAI function calling (GPT-4o-mini) ----

// Reuses GroqMessage type — OpenAI uses the same format
async function callOpenAIWithTools(
  apiKey: string,
  systemPrompt: string,
  messages: GroqMessage[],
  tools: ReturnType<typeof getGroqToolDeclarations>
): Promise<{
  reply?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
  error?: string;
  status: number;
  rateLimited?: boolean;
}> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.4,
      max_tokens: 2048,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) return { status: 429, rateLimited: true };
    const errorData = await response.json().catch(() => ({}));
    return {
      error: errorData?.error?.message || `OpenAI error: ${response.status}`,
      status: response.status,
    };
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  if (!choice) return { error: 'OpenAI returned empty response.', status: 502 };

  const msg = choice.message;

  // Check for tool calls
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolCalls = msg.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}'),
    }));
    return { toolCalls, status: 200 };
  }

  const reply = msg.content;
  if (!reply) return { error: 'OpenAI returned empty text.', status: 502 };
  return { reply: reply.trim(), status: 200 };
}

// ---- Conversation persistence ----

async function loadConversation(
  supabase: ReturnType<typeof getServiceClient>,
  conversationId: string,
  userId: string
): Promise<ConversationMessage[]> {
  const { data } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  return (data?.messages as ConversationMessage[]) || [];
}

async function saveConversation(
  supabase: ReturnType<typeof getServiceClient>,
  conversationId: string,
  userId: string,
  messages: ConversationMessage[]
): Promise<string> {
  // Trim to last 40 messages to prevent unbounded growth
  const trimmed = messages.slice(-40);

  const { data, error } = await supabase
    .from('ai_conversations')
    .upsert(
      {
        id: conversationId,
        user_id: userId,
        messages: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save conversation:', error.message);
    return conversationId;
  }
  return (data?.id as string) || conversationId;
}

// ---- Helper: Convert conversation history to Gemini format ----

function toGeminiContents(messages: ConversationMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

// ---- Helper: Convert conversation history to Groq format ----

function toGroqMessages(messages: ConversationMessage[]): GroqMessage[] {
  return messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

// ---- Main route handler ----

export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !openaiKey && !groqKey) {
      return NextResponse.json(
        { error: 'AI is not configured. Please add GEMINI_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY.' },
        { status: 500 }
      );
    }

    const body: RequestBody = await request.json();
    const { message, conversationId, userId, userName, userRole, userCampus } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'No message provided.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'No user ID provided.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Load or start conversation
    const convId = conversationId || crypto.randomUUID();
    let history: ConversationMessage[] = [];
    if (conversationId) {
      history = await loadConversation(supabase, conversationId, userId);
    }

    // Add user's new message
    history.push({ role: 'user', content: message.trim() });

    // Build system prompt
    const today = getTodayCST();
    const dayOfWeek = getDayOfWeekCST();
    const systemPrompt = buildSystemPrompt({
      userName,
      userRole,
      userCampus,
      todayDate: today,
      dayOfWeek,
    });

    let finalReply = '';
    let actionLabel: string | undefined;
    const hasAnyFallback = !!(openaiKey || groqKey);

    // ---- Try Gemini first ----
    if (geminiKey) {
      const geminiResult = await handleGeminiConversation(
        geminiKey,
        systemPrompt,
        history,
        userId
      );

      if (geminiResult.reply) {
        finalReply = geminiResult.reply;
        actionLabel = geminiResult.actionLabel;
      } else if (geminiResult.rateLimited && hasAnyFallback) {
        console.log('Gemini rate-limited, falling back…');
      } else if (!hasAnyFallback) {
        const errorMsg = geminiResult.rateLimited
          ? 'AI rate limit reached — please wait a moment and try again.'
          : geminiResult.error || 'AI service error.';
        return NextResponse.json({ error: errorMsg }, { status: geminiResult.status || 500 });
      } else {
        console.warn('Gemini error, falling back…', geminiResult.error);
      }
    }

    // ---- OpenAI fallback (GPT-4o-mini) ----
    if (!finalReply && openaiKey) {
      const openaiResult = await handleOpenAIConversation(
        openaiKey,
        systemPrompt,
        history,
        userId
      );

      if (openaiResult.reply) {
        finalReply = openaiResult.reply;
        actionLabel = openaiResult.actionLabel;
      } else if (openaiResult.rateLimited && groqKey) {
        console.log('OpenAI rate-limited, falling back to Groq…');
      } else if (!groqKey) {
        const errorMsg = openaiResult.rateLimited
          ? 'AI rate limit reached — please wait a moment and try again.'
          : openaiResult.error || 'AI service error.';
        return NextResponse.json({ error: errorMsg }, { status: openaiResult.status || 500 });
      } else {
        console.warn('OpenAI error, falling back to Groq:', openaiResult.error);
      }
    }

    // ---- Groq fallback (Llama 3.3 70B) ----
    if (!finalReply && groqKey) {
      const groqResult = await handleGroqConversation(
        groqKey,
        systemPrompt,
        history,
        userId
      );

      if (groqResult.reply) {
        finalReply = groqResult.reply;
        actionLabel = groqResult.actionLabel;
      } else {
        const errorMsg = groqResult.rateLimited
          ? 'All AI providers are rate-limited — please wait a moment and try again.'
          : groqResult.error || 'AI service error.';
        return NextResponse.json({ error: errorMsg }, { status: groqResult.status || 500 });
      }
    }

    if (!finalReply) {
      return NextResponse.json({ error: 'No AI provider available.' }, { status: 500 });
    }

    // Save conversation with the assistant's reply
    history.push({ role: 'assistant', content: finalReply, toolAction: actionLabel });
    const savedConvId = await saveConversation(supabase, convId, userId, history);

    return NextResponse.json({
      reply: finalReply,
      conversationId: savedConvId,
      toolAction: actionLabel,
    });
  } catch (error: unknown) {
    console.error('AI assistant error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---- Gemini conversation handler with tool execution loop ----

async function handleGeminiConversation(
  apiKey: string,
  systemPrompt: string,
  history: ConversationMessage[],
  userId: string
): Promise<{
  reply?: string;
  actionLabel?: string;
  error?: string;
  status?: number;
  rateLimited?: boolean;
}> {
  const tools = getGeminiToolDeclarations();
  let contents = toGeminiContents(history);
  let actionLabel: string | undefined;

  // Tool execution loop (max 5 rounds to prevent infinite loops)
  for (let round = 0; round < 5; round++) {
    const result = await callGeminiWithTools(apiKey, systemPrompt, contents, tools);

    if (result.rateLimited) return { rateLimited: true, status: 429 };
    if (result.error) return { error: result.error, status: result.status };

    // If we get a text reply, we're done
    if (result.reply) {
      return { reply: result.reply, actionLabel };
    }

    // If we get function calls, execute them
    if (result.functionCalls) {
      const toolResults: ToolResult[] = [];

      for (const fc of result.functionCalls) {
        const toolResult = await executeTool(
          { name: fc.name, args: fc.args } as ToolCall,
          userId
        );
        toolResults.push(toolResult);
        if (toolResult.actionLabel) actionLabel = toolResult.actionLabel;
      }

      // Add the model's function call to contents
      contents.push({
        role: 'model',
        parts: result.functionCalls.map((fc) => ({
          functionCall: { name: fc.name, args: fc.args },
        })),
      });

      // Add function responses
      contents.push({
        role: 'user',
        parts: toolResults.map((tr) => ({
          functionResponse: {
            name: tr.toolName,
            response: { result: tr.result },
          },
        })),
      });

      // Continue loop — Gemini will process the tool results
      continue;
    }

    // Shouldn't get here
    return { error: 'Unexpected response from Gemini', status: 500 };
  }

  return { error: 'Too many tool calls — stopping.', status: 500 };
}

// ---- Groq conversation handler with tool execution loop ----

async function handleGroqConversation(
  apiKey: string,
  systemPrompt: string,
  history: ConversationMessage[],
  userId: string
): Promise<{
  reply?: string;
  actionLabel?: string;
  error?: string;
  status?: number;
  rateLimited?: boolean;
}> {
  const tools = getGroqToolDeclarations();
  let messages = toGroqMessages(history);
  let actionLabel: string | undefined;

  // Tool execution loop (max 5 rounds)
  for (let round = 0; round < 5; round++) {
    const result = await callGroqWithTools(apiKey, systemPrompt, messages, tools);

    if (result.rateLimited) return { rateLimited: true, status: 429 };
    if (result.error) return { error: result.error, status: result.status };

    // If we get a text reply, we're done
    if (result.reply) {
      return { reply: result.reply, actionLabel };
    }

    // If we get tool calls, execute them
    if (result.toolCalls) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // Execute each tool and add results
      for (const tc of result.toolCalls) {
        const toolResult = await executeTool(
          { name: tc.name, args: tc.args } as ToolCall,
          userId
        );
        if (toolResult.actionLabel) actionLabel = toolResult.actionLabel;

        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.result),
          tool_call_id: tc.id,
        });
      }

      // Continue loop — Groq will process the tool results
      continue;
    }

    return { error: 'Unexpected response from Groq', status: 500 };
  }

  return { error: 'Too many tool calls — stopping.', status: 500 };
}

// ---- OpenAI conversation handler with tool execution loop (GPT-4o-mini) ----

async function handleOpenAIConversation(
  apiKey: string,
  systemPrompt: string,
  history: ConversationMessage[],
  userId: string
): Promise<{
  reply?: string;
  actionLabel?: string;
  error?: string;
  status?: number;
  rateLimited?: boolean;
}> {
  // Reuses Groq tool declarations (same OpenAI-compatible format)
  const tools = getGroqToolDeclarations();
  let messages = toGroqMessages(history);
  let actionLabel: string | undefined;

  // Tool execution loop (max 5 rounds)
  for (let round = 0; round < 5; round++) {
    const result = await callOpenAIWithTools(apiKey, systemPrompt, messages, tools);

    if (result.rateLimited) return { rateLimited: true, status: 429 };
    if (result.error) return { error: result.error, status: result.status };

    if (result.reply) {
      return { reply: result.reply, actionLabel };
    }

    if (result.toolCalls) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      for (const tc of result.toolCalls) {
        const toolResult = await executeTool(
          { name: tc.name, args: tc.args } as ToolCall,
          userId
        );
        if (toolResult.actionLabel) actionLabel = toolResult.actionLabel;

        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.result),
          tool_call_id: tc.id,
        });
      }

      continue;
    }

    return { error: 'Unexpected response from OpenAI', status: 500 };
  }

  return { error: 'Too many OpenAI tool calls — stopping.', status: 500 };
}