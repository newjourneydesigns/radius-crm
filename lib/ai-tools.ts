// =============================================================
// Radius AI Assistant — Tool Definitions & Executor
// =============================================================
// Defines the function-calling tools that Gemini/Groq can invoke,
// and the server-side executor that runs them against Supabase.
// =============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---- Types ----

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  result: unknown;
  actionLabel?: string; // For UI badge display
}

// ---- Tool Definitions (Gemini function calling format) ----

export const AI_TOOLS: ToolDefinition[] = [
  {
    name: 'search_leaders',
    description:
      'Search for circle leaders by name, campus, ACPD, meeting day, status, or circle type. Use this when the user asks about a person or wants to find a leader. Returns matching leaders with their key details.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name or partial name to search for (fuzzy match)',
        },
        campus: {
          type: 'string',
          description: 'Filter by campus name (e.g. "Flower Mound", "Southlake")',
        },
        day: {
          type: 'string',
          description: 'Filter by meeting day (e.g. "Monday", "Tuesday")',
        },
        status: {
          type: 'string',
          description: 'Filter by leader status',
          enum: ['invited', 'on-boarding', 'pipeline', 'active', 'paused', 'off-boarding'],
        },
        acpd: {
          type: 'string',
          description: 'Filter by ACPD (director) name',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_leader_details',
    description:
      'Get full details for a specific circle leader by their ID, including recent notes, upcoming visits, scorecard ratings, and meeting schedule. Use this after finding a leader via search_leaders.',
    parameters: {
      type: 'object',
      properties: {
        leader_id: {
          type: 'string',
          description: 'The numeric ID of the circle leader',
        },
      },
      required: ['leader_id'],
    },
  },
  {
    name: 'create_todo',
    description:
      'Create a new todo/reminder for the current user. Use this when the user asks to be reminded about something, or wants to add a task. Resolve natural language dates (e.g. "tomorrow", "next Monday") to YYYY-MM-DD format.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The todo text / reminder description',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format. Resolve relative dates like "tomorrow" or "next Tuesday" based on today\'s date.',
        },
        notes: {
          type: 'string',
          description: 'Optional additional notes for the todo',
        },
        linked_leader_name: {
          type: 'string',
          description: 'If the todo is about a specific leader, their name (will be resolved to an ID)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_todos',
    description:
      'List the current user\'s todo items. Can filter by completion status or upcoming due dates.',
    parameters: {
      type: 'object',
      properties: {
        show_completed: {
          type: 'string',
          description: 'Whether to include completed todos. "true" to include, "false" (default) for only incomplete.',
          enum: ['true', 'false'],
        },
        limit: {
          type: 'string',
          description: 'Maximum number of todos to return (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'complete_todo',
    description:
      'Mark a todo item as completed. Use this when the user says they finished a task or want to check something off.',
    parameters: {
      type: 'object',
      properties: {
        todo_id: {
          type: 'string',
          description: 'The numeric ID of the todo to complete',
        },
        search_text: {
          type: 'string',
          description: 'If the user describes the todo by text instead of ID, search for it by matching text (partial match)',
        },
      },
      required: [],
    },
  },
  {
    name: 'add_leader_note',
    description:
      'Add a note to a circle leader\'s profile. Use this when the user wants to record information about a leader, such as prayer needs, personal updates, or coaching observations.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader to add the note to',
        },
        content: {
          type: 'string',
          description: 'The note content to add',
        },
      },
      required: ['leader_name', 'content'],
    },
  },
  {
    name: 'schedule_circle_visit',
    description:
      'Schedule a circle visit to a leader\'s group. Use this when the user wants to plan a visit to observe a circle group meeting.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader whose group to visit',
        },
        visit_date: {
          type: 'string',
          description: 'The date for the visit in YYYY-MM-DD format. Resolve relative dates based on today\'s date.',
        },
        previsit_note: {
          type: 'string',
          description: 'Optional note about what to focus on during the visit',
        },
      },
      required: ['leader_name', 'visit_date'],
    },
  },
  {
    name: 'get_meeting_schedule',
    description:
      'Find out when a circle leader\'s group meets — their meeting day, time, frequency, and next meeting date. Use this when the user asks "when does X meet?" or similar.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'get_upcoming_visits',
    description:
      'Get a list of upcoming scheduled circle visits for the current user.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'string',
          description: 'Maximum number of visits to return (default: 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_today_info',
    description:
      'Get today\'s date, day of week, and any circles meeting today. Use this to answer time-relative questions.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ---- Gemini format conversion ----

export function getGeminiToolDeclarations() {
  return [
    {
      functionDeclarations: AI_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
}

// ---- Groq/OpenAI format conversion ----

export function getGroqToolDeclarations() {
  return AI_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// ---- Tool Executor ----

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials for AI assistant');
  return createClient(url, key);
}

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
  return cst.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' });
}

async function resolveLeaderByName(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: number; name: string; campus?: string; circle_type?: string }[] | { error: string }> {
  const { data, error } = await supabase
    .from('circle_leaders')
    .select('id, name, campus, circle_type, acpd, day, time, status')
    .ilike('name', `%${name}%`)
    .limit(5);

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: `No circle leader found matching "${name}"` };
  return data;
}

export async function executeTool(
  toolCall: ToolCall,
  userId: string
): Promise<ToolResult> {
  const supabase = getServiceClient();
  const { name, args } = toolCall;

  switch (name) {
    // ---- SEARCH LEADERS ----
    case 'search_leaders': {
      let query = supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, day, time, frequency, status, circle_type, birthday, follow_up_required, follow_up_date, follow_up_note')
        .order('name');

      if (args.query) {
        query = query.ilike('name', `%${args.query}%`);
      }
      if (args.campus) {
        query = query.ilike('campus', `%${args.campus}%`);
      }
      if (args.day) {
        query = query.ilike('day', `%${args.day}%`);
      }
      if (args.status) {
        query = query.eq('status', args.status);
      }
      if (args.acpd) {
        query = query.ilike('acpd', `%${args.acpd}%`);
      }

      const { data, error } = await query.limit(10);
      if (error) return { toolName: name, result: { error: error.message } };
      return { toolName: name, result: { leaders: data, count: data?.length || 0 } };
    }

    // ---- GET LEADER DETAILS ----
    case 'get_leader_details': {
      const leaderId = parseInt(args.leader_id as string);
      if (isNaN(leaderId)) return { toolName: name, result: { error: 'Invalid leader ID' } };

      // Fetch leader profile
      const { data: leader, error: leaderErr } = await supabase
        .from('circle_leaders')
        .select('*')
        .eq('id', leaderId)
        .single();

      if (leaderErr || !leader) return { toolName: name, result: { error: leaderErr?.message || 'Leader not found' } };

      // Fetch recent notes (last 5)
      const { data: notes } = await supabase
        .from('notes')
        .select('id, content, created_at, created_by')
        .eq('circle_leader_id', leaderId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch upcoming visits
      const { data: visits } = await supabase
        .from('circle_visits')
        .select('id, visit_date, status, previsit_note')
        .eq('leader_id', leaderId)
        .in('status', ['scheduled', 'completed'])
        .order('visit_date', { ascending: false })
        .limit(3);

      // Fetch latest scorecard
      const { data: scores } = await supabase
        .from('circle_leader_scores')
        .select('reach_score, connect_score, disciple_score, develop_score, scored_date')
        .eq('circle_leader_id', leaderId)
        .order('scored_date', { ascending: false })
        .limit(1);

      return {
        toolName: name,
        result: {
          leader,
          recentNotes: notes || [],
          visits: visits || [],
          latestScores: scores?.[0] || null,
        },
      };
    }

    // ---- CREATE TODO ----
    case 'create_todo': {
      let linkedLeaderId: number | null = null;

      // Resolve leader name if provided
      if (args.linked_leader_name) {
        const leaders = await resolveLeaderByName(supabase, args.linked_leader_name as string);
        if ('error' in leaders) {
          return { toolName: name, result: { error: leaders.error } };
        }
        if (leaders.length > 1) {
          return {
            toolName: name,
            result: {
              ambiguous: true,
              message: `Multiple leaders match "${args.linked_leader_name}". Please specify which one:`,
              matches: leaders.map((l) => ({ id: l.id, name: l.name, campus: l.campus, circle_type: l.circle_type })),
            },
          };
        }
        linkedLeaderId = leaders[0].id;
      }

      const { data, error } = await supabase
        .from('todo_items')
        .insert({
          user_id: userId,
          text: args.text as string,
          completed: false,
          due_date: (args.due_date as string) || null,
          notes: (args.notes as string) || null,
          todo_type: 'manual',
          linked_leader_id: linkedLeaderId,
        })
        .select()
        .single();

      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, todo: data },
        actionLabel: 'created_todo',
      };
    }

    // ---- LIST TODOS ----
    case 'list_todos': {
      const showCompleted = args.show_completed === 'true';
      const limit = parseInt(args.limit as string) || 10;

      let query = supabase
        .from('todo_items')
        .select('id, text, completed, due_date, notes, todo_type, created_at')
        .eq('user_id', userId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (!showCompleted) {
        query = query.eq('completed', false);
      }

      const { data, error } = await query.limit(limit);
      if (error) return { toolName: name, result: { error: error.message } };
      return { toolName: name, result: { todos: data, count: data?.length || 0 } };
    }

    // ---- COMPLETE TODO ----
    case 'complete_todo': {
      let todoId: number | null = null;

      if (args.todo_id) {
        todoId = parseInt(args.todo_id as string);
      } else if (args.search_text) {
        const { data } = await supabase
          .from('todo_items')
          .select('id, text')
          .eq('user_id', userId)
          .eq('completed', false)
          .ilike('text', `%${args.search_text}%`)
          .limit(1);

        if (data && data.length > 0) {
          todoId = data[0].id;
        } else {
          return { toolName: name, result: { error: `No incomplete todo found matching "${args.search_text}"` } };
        }
      }

      if (!todoId) return { toolName: name, result: { error: 'Please specify which todo to complete' } };

      const { error } = await supabase
        .from('todo_items')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', todoId)
        .eq('user_id', userId);

      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, todo_id: todoId },
        actionLabel: 'completed_todo',
      };
    }

    // ---- ADD LEADER NOTE ----
    case 'add_leader_note': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) {
        return { toolName: name, result: { error: leaders.error } };
      }
      if (leaders.length > 1) {
        return {
          toolName: name,
          result: {
            ambiguous: true,
            message: `Multiple leaders match "${args.leader_name}". Please specify which one:`,
            matches: leaders.map((l) => ({ id: l.id, name: l.name, campus: l.campus, circle_type: l.circle_type })),
          },
        };
      }

      const leader = leaders[0];
      const { data, error } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: leader.id,
          content: args.content as string,
          created_by: 'Radius AI',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, note: data, leader_name: leader.name },
        actionLabel: 'added_note',
      };
    }

    // ---- SCHEDULE CIRCLE VISIT ----
    case 'schedule_circle_visit': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) {
        return { toolName: name, result: { error: leaders.error } };
      }
      if (leaders.length > 1) {
        return {
          toolName: name,
          result: {
            ambiguous: true,
            message: `Multiple leaders match "${args.leader_name}". Please specify which one:`,
            matches: leaders.map((l) => ({ id: l.id, name: l.name, campus: l.campus, circle_type: l.circle_type })),
          },
        };
      }

      const leader = leaders[0];
      const { data, error } = await supabase
        .from('circle_visits')
        .insert({
          leader_id: leader.id,
          visit_date: args.visit_date as string,
          scheduled_by: userId,
          status: 'scheduled',
          previsit_note: (args.previsit_note as string) || null,
        })
        .select()
        .single();

      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, visit: data, leader_name: leader.name },
        actionLabel: 'scheduled_visit',
      };
    }

    // ---- GET MEETING SCHEDULE ----
    case 'get_meeting_schedule': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) {
        return { toolName: name, result: { error: leaders.error } };
      }
      if (leaders.length > 1) {
        return {
          toolName: name,
          result: {
            ambiguous: true,
            message: `Multiple leaders match "${args.leader_name}". Please specify which one:`,
            matches: leaders.map((l) => ({ id: l.id, name: l.name, campus: l.campus, circle_type: l.circle_type })),
          },
        };
      }

      const leader = leaders[0];
      const { data, error } = await supabase
        .from('circle_leaders')
        .select('id, name, day, time, frequency, campus, circle_type, meeting_start_date, status')
        .eq('id', leader.id)
        .single();

      if (error) return { toolName: name, result: { error: error.message } };
      return { toolName: name, result: { schedule: data } };
    }

    // ---- GET UPCOMING VISITS ----
    case 'get_upcoming_visits': {
      const limit = parseInt(args.limit as string) || 5;
      const today = getTodayCST();

      const { data, error } = await supabase
        .from('circle_visits')
        .select('id, visit_date, status, previsit_note, leader_id, circle_leaders(name, campus, circle_type)')
        .eq('scheduled_by', userId)
        .eq('status', 'scheduled')
        .gte('visit_date', today)
        .order('visit_date', { ascending: true })
        .limit(limit);

      if (error) return { toolName: name, result: { error: error.message } };
      return { toolName: name, result: { visits: data, count: data?.length || 0 } };
    }

    // ---- GET TODAY INFO ----
    case 'get_today_info': {
      const today = getTodayCST();
      const dayOfWeek = getDayOfWeekCST();

      // Find circles meeting today
      const { data: todayCircles } = await supabase
        .from('circle_leaders')
        .select('id, name, time, campus, circle_type')
        .ilike('day', `%${dayOfWeek}%`)
        .eq('status', 'active')
        .order('time');

      return {
        toolName: name,
        result: {
          today: today,
          dayOfWeek: dayOfWeek,
          circlesMeetingToday: todayCircles || [],
          circleCount: todayCircles?.length || 0,
        },
      };
    }

    default:
      return { toolName: name, result: { error: `Unknown tool: ${name}` } };
  }
}
