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
        follow_up: {
          type: 'string',
          description: 'Filter to only leaders who need follow-up. "true" to show only those needing follow-up.',
          enum: ['true', 'false'],
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
    name: 'set_follow_up',
    description:
      'Mark or unmark a circle leader as needing follow-up. Use this when the user asks to flag a leader for follow-up, mark follow-up required, or clear/remove follow-up from a leader.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
        required: {
          type: 'string',
          description: 'Whether follow-up is required. "true" to mark for follow-up, "false" to clear follow-up.',
          enum: ['true', 'false'],
        },
      },
      required: ['leader_name', 'required'],
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
  {
    name: 'get_prayer_points',
    description:
      'Get prayer points for the current user. If a leader_name is provided, returns ACPD-specific prayer points for that leader. If no leader_name, returns the user\'s general prayer points. Use when the user asks about prayer requests, what to pray for, or prayer items.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'Optional — the name of a circle leader to get prayer points for. If omitted, returns general prayer points.',
        },
        include_answered: {
          type: 'string',
          description: 'Whether to include answered prayer points. "true" to include, "false" (default) for only active.',
          enum: ['true', 'false'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_score_history',
    description:
      'Get the Big 4 scorecard history for a circle leader over time. Returns multiple scored entries ordered by date, so you can see trends and changes in Reach, Connect, Disciple, and Develop scores. Use when the user asks about score trends, progress over time, or scorecard history.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader to get score history for',
        },
        dimension: {
          type: 'string',
          description: 'Optional — filter to a specific Big 4 dimension',
          enum: ['reach', 'connect', 'disciple', 'develop'],
        },
        limit: {
          type: 'string',
          description: 'Maximum number of score entries to return (default: 10)',
        },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'get_encouragements',
    description:
      'Get the encouragement history for a circle leader — when and how the user encouraged them. Use when the user asks "when did I last encourage X?" or "show my encouragement history for X" or wants to review past encouragements.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader to get encouragement history for',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of encouragement entries to return (default: 10)',
        },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'get_circle_roster',
    description:
      'Get the list of members in a circle leader\'s group. Returns names, contact info, and birthdays. Use when the user asks "who is in X\'s circle?" or "how many members does X have?" or about upcoming birthdays in a group.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader whose roster to view',
        },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'get_coaching_notes',
    description:
      'Get coaching notes for a circle leader. These are dimension-specific observations and action items that the ACPD has recorded. Can filter by Big 4 dimension and resolution status. Use when the user asks about coaching notes, unresolved coaching items, or coaching history for a leader.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader to get coaching notes for',
        },
        dimension: {
          type: 'string',
          description: 'Optional — filter to a specific Big 4 dimension',
          enum: ['reach', 'connect', 'disciple', 'develop'],
        },
        include_resolved: {
          type: 'string',
          description: 'Whether to include resolved coaching notes. "true" to include, "false" (default) for only unresolved.',
          enum: ['true', 'false'],
        },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'update_leader_status',
    description:
      'Change a circle leader\'s status. Use when the user asks to set, change, or update a leader\'s status (e.g. make them active, mark as paused, move to pipeline, etc.).',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
        status: {
          type: 'string',
          description: 'The new status to set',
          enum: ['invited', 'on-boarding', 'pipeline', 'active', 'paused', 'off-boarding'],
        },
      },
      required: ['leader_name', 'status'],
    },
  },
  {
    name: 'log_connection',
    description:
      'Log an interaction/connection with a circle leader. Use when the user says they called, texted, emailed, or met with a leader and wants to record it.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
        connection_type: {
          type: 'string',
          description: 'The type of interaction',
          enum: ['Phone Call', 'Text Message', 'Email', 'In-Person Meeting', 'Video Call', 'Social Media', 'Other'],
        },
        note: {
          type: 'string',
          description: 'Optional note about the interaction',
        },
        date: {
          type: 'string',
          description: 'Date of the connection in YYYY-MM-DD format. Defaults to today if not specified.',
        },
      },
      required: ['leader_name', 'connection_type'],
    },
  },
  {
    name: 'log_encouragement',
    description:
      'Log an encouragement sent to a circle leader. Use when the user says they encouraged, sent a message to, or reached out to uplift a leader.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
        method: {
          type: 'string',
          description: 'How the encouragement was delivered',
          enum: ['text', 'email', 'call', 'in_person', 'card', 'other'],
        },
        note: {
          type: 'string',
          description: 'Optional note or scripture reference included with the encouragement',
        },
      },
      required: ['leader_name', 'method'],
    },
  },
  {
    name: 'set_event_summary',
    description:
      'Set the event summary state for a circle leader. Use when the user wants to mark a leader\'s event summary as received, not received, did not meet, or skipped.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
        state: {
          type: 'string',
          description: 'The event summary state to set',
          enum: ['not_received', 'received', 'did_not_meet', 'skipped'],
        },
      },
      required: ['leader_name', 'state'],
    },
  },
  {
    name: 'update_leader_profile',
    description:
      'Update fields on a circle leader\'s profile such as phone, email, campus, meeting day, time, circle type, or ACPD. Use when the user asks to change a leader\'s contact info or meeting details.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader to update',
        },
        phone: { type: 'string', description: 'New phone number' },
        email: { type: 'string', description: 'New email address' },
        campus: { type: 'string', description: 'New campus assignment' },
        day: { type: 'string', description: 'New meeting day (e.g. Monday, Tuesday)' },
        time: { type: 'string', description: 'New meeting time (e.g. 7:00 PM)' },
        circle_type: { type: 'string', description: 'New circle type' },
        acpd: { type: 'string', description: 'New ACPD name' },
        frequency: { type: 'string', description: 'New meeting frequency (e.g. weekly, biweekly)' },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'add_prayer_point',
    description:
      'Add a prayer point. Can be a general prayer point or one specific to a circle leader. Use when the user asks to add a prayer request or prayer item.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The prayer point text',
        },
        leader_name: {
          type: 'string',
          description: 'Optional — the name of the circle leader this prayer is for. Omit for a general prayer point.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'resolve_prayer_point',
    description:
      'Mark a prayer point as answered/resolved. Use when the user says a prayer has been answered or wants to resolve a prayer item.',
    parameters: {
      type: 'object',
      properties: {
        prayer_content: {
          type: 'string',
          description: 'Text of the prayer point to match (partial match supported)',
        },
        leader_name: {
          type: 'string',
          description: 'Optional — the leader the prayer belongs to. Omit for general prayer points.',
        },
      },
      required: ['prayer_content'],
    },
  },
  {
    name: 'delete_todo',
    description:
      'Delete a to-do item. Use when the user asks to remove or delete a specific todo.',
    parameters: {
      type: 'object',
      properties: {
        todo_text: {
          type: 'string',
          description: 'The title/text of the todo to delete (partial match supported)',
        },
      },
      required: ['todo_text'],
    },
  },
  {
    name: 'cancel_circle_visit',
    description:
      'Cancel a scheduled circle visit. Use when the user asks to cancel an upcoming visit.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader whose visit to cancel',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for cancellation',
        },
      },
      required: ['leader_name'],
    },
  },
  {
    name: 'add_coaching_note',
    description:
      'Add a coaching note/observation for a circle leader, categorized by Big 4 dimension (Reach, Connect, Disciple, Develop). Use when the user wants to record a coaching observation or action item for a leader.',
    parameters: {
      type: 'object',
      properties: {
        leader_name: {
          type: 'string',
          description: 'The name of the circle leader',
        },
        dimension: {
          type: 'string',
          description: 'The Big 4 dimension this coaching note relates to',
          enum: ['reach', 'connect', 'disciple', 'develop'],
        },
        content: {
          type: 'string',
          description: 'The coaching note content',
        },
      },
      required: ['leader_name', 'dimension', 'content'],
    },
  },
  {
    name: 'navigate_to_page',
    description:
      'Navigate the user to a specific page in Radius CRM. Use when the user asks to "go to", "take me to", "open", or "show me" a page. Can also navigate to a specific leader\'s profile by name.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          description: 'The page to navigate to',
          enum: ['dashboard', 'prayer', 'progress', 'calendar', 'search', 'settings', 'profile', 'help', 'assistant', 'birthday-list', 'bulk-message', 'ccb-explorer', 'add-leader', 'users', 'event-summaries', 'leader-profile', 'leader-roster'],
        },
        leader_name: {
          type: 'string',
          description: 'When page is "leader-profile" or "leader-roster", the name of the leader to navigate to',
        },
      },
      required: ['page'],
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
  userId: string,
  userRole: string = 'Viewer'
): Promise<ToolResult> {
  const supabase = getServiceClient();
  const { name, args } = toolCall;

  // Server-side write protection — only ACPDs can perform write operations
  const WRITE_TOOLS = ['create_todo', 'complete_todo', 'add_leader_note', 'schedule_circle_visit', 'set_follow_up', 'update_leader_status', 'log_connection', 'log_encouragement', 'set_event_summary', 'update_leader_profile', 'add_prayer_point', 'resolve_prayer_point', 'delete_todo', 'cancel_circle_visit', 'add_coaching_note'];
  if (WRITE_TOOLS.includes(name) && userRole !== 'ACPD') {
    return {
      toolName: name,
      result: { error: 'Write operations require ACPD access. You have read-only (Viewer) access.' },
    };
  }

  switch (name) {
    // ---- SEARCH LEADERS ----
    case 'search_leaders': {
      // Use { count: 'exact' } to get the true total count alongside the data
      let query = supabase
        .from('circle_leaders')
        .select('id, name, email, phone, campus, acpd, day, time, frequency, status, circle_type, birthday, follow_up_required, follow_up_date, follow_up_note', { count: 'exact' })
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
        query = query.eq('status', args.status as string);
      }
      if (args.acpd) {
        query = query.ilike('acpd', `%${args.acpd}%`);
      }
      if (args.follow_up === 'true') {
        query = query.eq('follow_up_required', true);
      }

      // Fetch up to 50 results, but totalCount reflects ALL matching rows
      const { data, error, count: totalCount } = await query.limit(50);
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: {
          leaders: data,
          count: data?.length || 0,
          totalCount: totalCount ?? data?.length ?? 0,
          note: (totalCount ?? 0) > 50 ? `Showing first 50 of ${totalCount} total matching leaders` : undefined,
        },
      };
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

      // Get exact total count first
      const countQuery = supabase
        .from('todo_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (!showCompleted) countQuery.eq('completed', false);
      const { count: totalTodos } = await countQuery;

      const { data, error } = await query.limit(limit);
      if (error) return { toolName: name, result: { error: error.message } };
      return { toolName: name, result: { todos: data, count: data?.length || 0, totalCount: totalTodos ?? data?.length ?? 0 } };
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
          user_id: userId,
          content: args.content as string,
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

    // ---- SET FOLLOW-UP ----
    case 'set_follow_up': {
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
      const isRequired = args.required === 'true';
      const { error } = await supabase
        .from('circle_leaders')
        .update({ follow_up_required: isRequired })
        .eq('id', leader.id);

      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: {
          success: true,
          leader_name: leader.name,
          follow_up_required: isRequired,
        },
        actionLabel: isRequired ? 'follow_up_set' : 'follow_up_cleared',
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

    // ---- GET PRAYER POINTS ----
    case 'get_prayer_points': {
      const includeAnswered = args.include_answered === 'true';

      if (args.leader_name) {
        // Leader-specific prayer points from acpd_prayer_points
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
        let prayerQuery = supabase
          .from('acpd_prayer_points')
          .select('id, content, is_answered, created_at, updated_at')
          .eq('circle_leader_id', leader.id)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!includeAnswered) {
          prayerQuery = prayerQuery.eq('is_answered', false);
        }

        const { data, error: prayerErr } = await prayerQuery;
        if (prayerErr) return { toolName: name, result: { error: prayerErr.message } };
        return {
          toolName: name,
          result: {
            type: 'leader_prayer_points',
            leader_name: leader.name,
            prayerPoints: data || [],
            count: data?.length || 0,
          },
        };
      } else {
        // General prayer points
        let generalQuery = supabase
          .from('general_prayer_points')
          .select('id, content, is_answered, created_at, updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!includeAnswered) {
          generalQuery = generalQuery.eq('is_answered', false);
        }

        const { data, error: prayerErr } = await generalQuery;
        if (prayerErr) return { toolName: name, result: { error: prayerErr.message } };
        return {
          toolName: name,
          result: {
            type: 'general_prayer_points',
            prayerPoints: data || [],
            count: data?.length || 0,
          },
        };
      }
    }

    // ---- GET SCORE HISTORY ----
    case 'get_score_history': {
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
      const scoreLimit = parseInt(args.limit as string) || 10;

      // Get full scorecard history
      const { data: scores, error: scoreErr } = await supabase
        .from('circle_leader_scores')
        .select('reach_score, connect_score, disciple_score, develop_score, notes, scored_date, created_at')
        .eq('circle_leader_id', leader.id)
        .order('scored_date', { ascending: false })
        .limit(scoreLimit);

      if (scoreErr) return { toolName: name, result: { error: scoreErr.message } };

      // If a specific dimension was requested, also get granular history
      let dimensionHistory: { score: unknown; source: unknown; recorded_at: unknown }[] | null = null;
      if (args.dimension) {
        const { data: dimData } = await supabase
          .from('scorecard_score_history')
          .select('score, source, recorded_at')
          .eq('circle_leader_id', leader.id)
          .eq('dimension', args.dimension as string)
          .order('recorded_at', { ascending: false })
          .limit(scoreLimit);
        dimensionHistory = dimData;
      }

      return {
        toolName: name,
        result: {
          leader_name: leader.name,
          scoreHistory: scores || [],
          count: scores?.length || 0,
          ...(dimensionHistory ? { dimensionDetail: { dimension: args.dimension, history: dimensionHistory } } : {}),
        },
      };
    }

    // ---- GET ENCOURAGEMENTS ----
    case 'get_encouragements': {
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
      const encLimit = parseInt(args.limit as string) || 10;

      const { data, error: encErr } = await supabase
        .from('acpd_encouragements')
        .select('id, message_type, message_date, note, encourage_method, created_at')
        .eq('circle_leader_id', leader.id)
        .eq('user_id', userId)
        .order('message_date', { ascending: false })
        .limit(encLimit);

      if (encErr) return { toolName: name, result: { error: encErr.message } };
      return {
        toolName: name,
        result: {
          leader_name: leader.name,
          encouragements: data || [],
          count: data?.length || 0,
        },
      };
    }

    // ---- GET CIRCLE ROSTER ----
    case 'get_circle_roster': {
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
      const { data, error: rosterErr } = await supabase
        .from('circle_roster_cache')
        .select('full_name, first_name, last_name, email, phone, mobile_phone, birthday')
        .eq('circle_leader_id', leader.id)
        .order('full_name');

      if (rosterErr) return { toolName: name, result: { error: rosterErr.message } };
      return {
        toolName: name,
        result: {
          leader_name: leader.name,
          members: data || [],
          memberCount: data?.length || 0,
        },
      };
    }

    // ---- GET COACHING NOTES ----
    case 'get_coaching_notes': {
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
      const includeResolved = args.include_resolved === 'true';

      let coachQuery = supabase
        .from('acpd_coaching_notes')
        .select('id, dimension, content, is_resolved, created_at')
        .eq('circle_leader_id', leader.id)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (args.dimension) {
        coachQuery = coachQuery.eq('dimension', args.dimension as string);
      }
      if (!includeResolved) {
        coachQuery = coachQuery.eq('is_resolved', false);
      }

      const { data, error: coachErr } = await coachQuery;
      if (coachErr) return { toolName: name, result: { error: coachErr.message } };
      return {
        toolName: name,
        result: {
          leader_name: leader.name,
          coachingNotes: data || [],
          count: data?.length || 0,
        },
      };
    }

    // ---- NAVIGATE TO PAGE ----
    case 'navigate_to_page': {
      const PAGE_ROUTES: Record<string, string> = {
        'dashboard': '/dashboard',
        'prayer': '/prayer',
        'progress': '/progress',
        'calendar': '/calendar',
        'search': '/search',
        'settings': '/settings',
        'profile': '/profile',
        'help': '/help',
        'assistant': '/assistant',
        'birthday-list': '/birthday-list',
        'bulk-message': '/bulk-message',
        'ccb-explorer': '/ccb-explorer',
        'add-leader': '/add-leader',
        'users': '/users',
        'event-summaries': '/dashboard/event-summaries',
      };

      const page = args.page as string;

      // Handle leader-specific pages
      if (page === 'leader-profile' || page === 'leader-roster') {
        if (!args.leader_name) {
          return { toolName: name, result: { error: 'Please specify which leader to navigate to.' } };
        }
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
        const path = page === 'leader-roster'
          ? `/circle/${leader.id}/roster`
          : `/circle/${leader.id}`;
        return {
          toolName: name,
          result: { navigateTo: path, label: `${leader.name}'s ${page === 'leader-roster' ? 'roster' : 'profile'}` },
          actionLabel: 'navigated',
        };
      }

      const route = PAGE_ROUTES[page];
      if (!route) {
        return { toolName: name, result: { error: `Unknown page: "${page}". Available pages: ${Object.keys(PAGE_ROUTES).join(', ')}` } };
      }

      return {
        toolName: name,
        result: { navigateTo: route, label: page },
        actionLabel: 'navigated',
      };
    }

    // ---- UPDATE LEADER STATUS ----
    case 'update_leader_status': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
      const newStatus = args.status as string;
      const { error } = await supabase
        .from('circle_leaders')
        .update({ status: newStatus })
        .eq('id', leader.id);
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, leader_name: leader.name, new_status: newStatus },
        actionLabel: 'status_updated',
      };
    }

    // ---- LOG CONNECTION ----
    case 'log_connection': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
      // Look up connection_type_id from the connection_types table
      const { data: typeData, error: typeError } = await supabase
        .from('connection_types')
        .select('id')
        .eq('name', args.connection_type as string)
        .single();
      if (typeError || !typeData) {
        return { toolName: name, result: { error: `Unknown connection type: "${args.connection_type}"` } };
      }
      const connDate = (args.date as string) || getTodayCST();
      const { data, error } = await supabase
        .from('connections')
        .insert({
          circle_leader_id: leader.id,
          connection_type_id: typeData.id,
          date_of_connection: connDate,
          note: (args.note as string) || null,
        })
        .select()
        .single();
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, connection: data, leader_name: leader.name, type: args.connection_type },
        actionLabel: 'connection_logged',
      };
    }

    // ---- LOG ENCOURAGEMENT ----
    case 'log_encouragement': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
        .from('acpd_encouragements')
        .insert({
          circle_leader_id: leader.id,
          user_id: userId,
          message_type: 'sent',
          encourage_method: args.method as string,
          message_date: getTodayCST(),
          note: (args.note as string) || null,
        })
        .select()
        .single();
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, encouragement: data, leader_name: leader.name, method: args.method },
        actionLabel: 'encouragement_logged',
      };
    }

    // ---- SET EVENT SUMMARY ----
    case 'set_event_summary': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
      const state = args.state as string;
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_state: state })
        .eq('id', leader.id);
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, leader_name: leader.name, event_summary_state: state },
        actionLabel: 'event_summary_set',
      };
    }

    // ---- UPDATE LEADER PROFILE ----
    case 'update_leader_profile': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
      const allowedFields = ['phone', 'email', 'campus', 'day', 'time', 'circle_type', 'acpd', 'frequency'];
      const updateData: Record<string, string> = {};
      for (const field of allowedFields) {
        if (args[field]) updateData[field] = args[field] as string;
      }
      if (Object.keys(updateData).length === 0) {
        return { toolName: name, result: { error: 'No fields specified to update. Provide at least one field (phone, email, campus, day, time, circle_type, acpd, frequency).' } };
      }
      const { error } = await supabase
        .from('circle_leaders')
        .update(updateData)
        .eq('id', leader.id);
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, leader_name: leader.name, updated_fields: updateData },
        actionLabel: 'profile_updated',
      };
    }

    // ---- ADD PRAYER POINT ----
    case 'add_prayer_point': {
      const content = args.content as string;
      if (args.leader_name) {
        // Leader-specific prayer point
        const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
        if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
          .from('acpd_prayer_points')
          .insert({ circle_leader_id: leader.id, user_id: userId, content, is_answered: false })
          .select()
          .single();
        if (error) return { toolName: name, result: { error: error.message } };
        return {
          toolName: name,
          result: { success: true, prayer_point: data, leader_name: leader.name },
          actionLabel: 'prayer_added',
        };
      } else {
        // General prayer point
        const { data, error } = await supabase
          .from('general_prayer_points')
          .insert({ user_id: userId, content, is_answered: false })
          .select()
          .single();
        if (error) return { toolName: name, result: { error: error.message } };
        return {
          toolName: name,
          result: { success: true, prayer_point: data, type: 'general' },
          actionLabel: 'prayer_added',
        };
      }
    }

    // ---- RESOLVE PRAYER POINT ----
    case 'resolve_prayer_point': {
      const prayerContent = args.prayer_content as string;
      if (args.leader_name) {
        // Leader-specific prayer point
        const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
        if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
        const { data: prayers, error: fetchErr } = await supabase
          .from('acpd_prayer_points')
          .select('id, content')
          .eq('circle_leader_id', leader.id)
          .eq('user_id', userId)
          .eq('is_answered', false)
          .ilike('content', `%${prayerContent}%`)
          .limit(1);
        if (fetchErr) return { toolName: name, result: { error: fetchErr.message } };
        if (!prayers || prayers.length === 0) {
          return { toolName: name, result: { error: `No unresolved prayer point matching "${prayerContent}" found for ${leader.name}.` } };
        }
        const { error } = await supabase
          .from('acpd_prayer_points')
          .update({ is_answered: true, updated_at: new Date().toISOString() })
          .eq('id', prayers[0].id);
        if (error) return { toolName: name, result: { error: error.message } };
        return {
          toolName: name,
          result: { success: true, resolved_prayer: prayers[0].content, leader_name: leader.name },
          actionLabel: 'prayer_resolved',
        };
      } else {
        // General prayer point
        const { data: prayers, error: fetchErr } = await supabase
          .from('general_prayer_points')
          .select('id, content')
          .eq('user_id', userId)
          .eq('is_answered', false)
          .ilike('content', `%${prayerContent}%`)
          .limit(1);
        if (fetchErr) return { toolName: name, result: { error: fetchErr.message } };
        if (!prayers || prayers.length === 0) {
          return { toolName: name, result: { error: `No unresolved general prayer point matching "${prayerContent}" found.` } };
        }
        const { error } = await supabase
          .from('general_prayer_points')
          .update({ is_answered: true, updated_at: new Date().toISOString() })
          .eq('id', prayers[0].id);
        if (error) return { toolName: name, result: { error: error.message } };
        return {
          toolName: name,
          result: { success: true, resolved_prayer: prayers[0].content, type: 'general' },
          actionLabel: 'prayer_resolved',
        };
      }
    }

    // ---- DELETE TODO ----
    case 'delete_todo': {
      const todoText = args.todo_text as string;
      const { data: todos, error: fetchErr } = await supabase
        .from('todo_items')
        .select('id, text')
        .eq('user_id', userId)
        .ilike('text', `%${todoText}%`)
        .limit(5);
      if (fetchErr) return { toolName: name, result: { error: fetchErr.message } };
      if (!todos || todos.length === 0) {
        return { toolName: name, result: { error: `No todo found matching "${todoText}".` } };
      }
      if (todos.length > 1) {
        return {
          toolName: name,
          result: {
            ambiguous: true,
            message: `Multiple todos match "${todoText}". Please specify which one:`,
            matches: todos.map((t) => ({ id: t.id, text: t.text })),
          },
        };
      }
      const { error } = await supabase
        .from('todo_items')
        .delete()
        .eq('id', todos[0].id);
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, deleted_todo: todos[0].text },
        actionLabel: 'todo_deleted',
      };
    }

    // ---- CANCEL CIRCLE VISIT ----
    case 'cancel_circle_visit': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
      // Find the next scheduled visit for this leader
      const { data: visits, error: visitErr } = await supabase
        .from('circle_visits')
        .select('id, visit_date, previsit_note')
        .eq('leader_id', leader.id)
        .eq('status', 'scheduled')
        .gte('visit_date', getTodayCST())
        .order('visit_date', { ascending: true })
        .limit(1);
      if (visitErr) return { toolName: name, result: { error: visitErr.message } };
      if (!visits || visits.length === 0) {
        return { toolName: name, result: { error: `No upcoming scheduled visit found for ${leader.name}.` } };
      }
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('circle_visits')
        .update({
          status: 'canceled',
          canceled_at: now,
          canceled_by: userId,
          cancel_reason: (args.reason as string) || null,
          updated_at: now,
        })
        .eq('id', visits[0].id);
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, leader_name: leader.name, visit_date: visits[0].visit_date },
        actionLabel: 'visit_canceled',
      };
    }

    // ---- ADD COACHING NOTE ----
    case 'add_coaching_note': {
      const leaders = await resolveLeaderByName(supabase, args.leader_name as string);
      if ('error' in leaders) return { toolName: name, result: { error: leaders.error } };
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
        .from('acpd_coaching_notes')
        .insert({
          circle_leader_id: leader.id,
          user_id: userId,
          dimension: args.dimension as string,
          content: args.content as string,
          is_resolved: false,
        })
        .select()
        .single();
      if (error) return { toolName: name, result: { error: error.message } };
      return {
        toolName: name,
        result: { success: true, coaching_note: data, leader_name: leader.name, dimension: args.dimension },
        actionLabel: 'coaching_note_added',
      };
    }

    default:
      return { toolName: name, result: { error: `Unknown tool: ${name}` } };
  }
}
