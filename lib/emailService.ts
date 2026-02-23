// Uses Resend API directly via fetch - no SDK dependency needed

export interface TodoItem {
  id: number;
  text: string;
  due_date: string | null;
  notes: string | null;
  todo_type: 'manual' | 'encouragement' | 'follow_up' | 'circle_visit' | null;
  linked_leader_id: number | null;
  linked_leader_name?: string | null;
  linked_visit_id: string | null;
}

export interface VisitItem {
  id: string;
  visit_date: string;
  leader_id: number;
  leader_name: string;
  leader_campus?: string;
  previsit_note?: string | null;
}

export interface EncouragementItem {
  id: number;
  circle_leader_id: number;
  leader_name: string;
  leader_campus?: string;
  encourage_method: string;
  message_date: string;
  note?: string | null;
}

export interface FollowUpItem {
  id: number;
  name: string;
  campus?: string;
  follow_up_date?: string | null;
}

export interface NoteItem {
  id: number;
  circle_leader_id: number;
  leader_name: string;
  leader_campus?: string;
  content: string;
  created_at: string;
}

export interface PersonalDigestData {
  user: { id: string; name: string; email: string };
  date: string;
  todos: {
    dueToday: TodoItem[];
    overdue: TodoItem[];
    noDate: TodoItem[];
  };
  circleVisits: {
    today: VisitItem[];
    thisWeek: VisitItem[];
  };
  upcomingVisits: VisitItem[];
  recentNotes: NoteItem[];
  encouragements: {
    dueToday: EncouragementItem[];
    overdue: EncouragementItem[];
  };
  followUps: {
    dueToday: FollowUpItem[];
    overdue: FollowUpItem[];
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function daysDiff(dateStr: string, today: string): number {
  const d1 = new Date(dateStr + 'T00:00:00').getTime();
  const d2 = new Date(today + 'T00:00:00').getTime();
  return Math.round((d2 - d1) / 86400000);
}

function methodLabel(method: string): string {
  const m: Record<string, string> = {
    text: '💬 Text', email: '📧 Email', call: '📞 Call',
    in_person: '🤝 In Person', card: '✉️ Card', other: '📝 Other',
  };
  return m[method] ?? '📝 Note';
}

function todoTypeLabel(type: string | null): string {
  const t: Record<string, string> = {
    manual: '✅ Task', encouragement: '💚 Encouragement',
    follow_up: '🔔 Follow-Up', circle_visit: '📅 Circle Visit',
  };
  return t[type ?? 'manual'] ?? '✅ Task';
}

function sectionHeader(emoji: string, title: string, count: number, color: string): string {
  return `
  <div style="margin: 28px 0 0 0;">
    <div style="border-bottom: 2px solid ${color}; padding-bottom: 8px; margin-bottom: 14px; display:flex; align-items:center;">
      <span style="font-size:20px; margin-right:8px;">${emoji}</span>
      <span style="font-size:16px; font-weight:700; color:#e2e8f0; flex:1;">${title}</span>
      <span style="background:${color}; color:white; border-radius:12px; padding:2px 10px; font-size:12px; font-weight:700;">${count}</span>
    </div>
  `;
}

function leaderCard(
  appUrl: string,
  leaderId: number | string,
  leaderName: string,
  leaderCampus: string | undefined,
  bodyHtml: string,
  overdueDays?: number
): string {
  const leaderUrl = `${appUrl}/circle/${leaderId}/`;
  const overdueTag = overdueDays && overdueDays > 0
    ? `<span style="margin-left:8px; background:#fee2e2; color:#dc2626; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:600;">${overdueDays}d overdue</span>`
    : '';
  return `
  <div style="background:#0f2a4a; border:1px solid #1e3a5f; border-radius:10px; padding:14px 16px; margin-bottom:10px;">
    <div style="margin-bottom:10px;">
      <a href="${leaderUrl}" style="font-size:15px; font-weight:700; color:#8da9c4; text-decoration:none;">${leaderName}</a>
      ${leaderCampus ? `<span style="margin-left:8px; font-size:12px; color:#6b8ab0;">• ${leaderCampus}</span>` : ''}
      ${overdueTag}
    </div>
    ${bodyHtml}
    <div style="margin-top:10px;">
      <a href="${leaderUrl}" style="display:inline-block; padding:5px 14px; background:#4f46e5; color:white; text-decoration:none; border-radius:6px; font-size:12px; font-weight:600;">View in Radius →</a>
    </div>
  </div>`;
}

function todoRow(item: TodoItem, appUrl: string, today: string): string {
  const overdue = item.due_date && item.due_date < today ? daysDiff(item.due_date, today) : 0;
  const link = item.linked_leader_id
    ? `${appUrl}/circle/${item.linked_leader_id}/`
    : `${appUrl}/dashboard/`;
  return `
  <div style="background:#0f2a4a; border:1px solid #1e3a5f; border-left:4px solid ${overdue > 0 ? '#ef4444' : '#6366f1'}; border-radius:6px; padding:10px 14px; margin-bottom:8px;">
    <div>
      <span style="font-size:11px; font-weight:600; color:#8da9c4; text-transform:uppercase; letter-spacing:0.5px; margin-right:6px;">${todoTypeLabel(item.todo_type)}</span>
      ${overdue > 0 ? `<span style="font-size:11px; color:#dc2626; font-weight:700;">${overdue}d overdue</span>` : item.due_date ? `<span style="font-size:11px; color:#6b8ab0;">Due ${formatShortDate(item.due_date)}</span>` : ''}
    </div>
    <div style="font-size:14px; font-weight:600; color:#e2e8f0; margin-top:3px;">${item.text}</div>
    ${item.linked_leader_name ? `<div style="font-size:12px; color:#8da9c4; margin-top:2px;">Leader: ${item.linked_leader_name}</div>` : ''}
    ${item.notes ? `<div style="font-size:12px; color:#6b8ab0; margin-top:4px;">${item.notes}</div>` : ''}
    <div style="margin-top:6px;">
      <a href="${link}" style="font-size:11px; color:#8da9c4; text-decoration:none; font-weight:600;">Open in Radius →</a>
    </div>
  </div>`;
}

export function generatePersonalDigestHTML(data: PersonalDigestData): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://myradiuscrm.com';
  const { user, date, todos, circleVisits, upcomingVisits, recentNotes, encouragements, followUps } = data;

  const totalItems =
    todos.dueToday.length + todos.overdue.length + todos.noDate.length +
    circleVisits.today.length + circleVisits.thisWeek.length +
    encouragements.dueToday.length + encouragements.overdue.length +
    followUps.dueToday.length + followUps.overdue.length;

  // TODOS DUE TODAY
  let todosDueTodayHtml = '';
  if (todos.dueToday.length > 0) {
    todosDueTodayHtml = sectionHeader('✅', 'Tasks Due Today', todos.dueToday.length, '#6366f1');
    todos.dueToday.forEach(t => { todosDueTodayHtml += todoRow(t, appUrl, date); });
    todosDueTodayHtml += `<a href="${appUrl}/dashboard/" style="font-size:12px; color:#6366f1; text-decoration:none; font-weight:600;">View all tasks →</a></div>`;
  }

  // OVERDUE TODOS
  let todosOverdueHtml = '';
  if (todos.overdue.length > 0) {
    todosOverdueHtml = sectionHeader('🚨', 'Overdue Tasks', todos.overdue.length, '#ef4444');
    todos.overdue.forEach(t => { todosOverdueHtml += todoRow(t, appUrl, date); });
    todosOverdueHtml += `<a href="${appUrl}/dashboard/" style="font-size:12px; color:#ef4444; text-decoration:none; font-weight:600;">View all overdue →</a></div>`;
  }

  // NO-DATE TODOS
  let todosNoDueDateHtml = '';
  if (todos.noDate.length > 0) {
    todosNoDueDateHtml = sectionHeader('📋', 'Tasks (No Due Date)', todos.noDate.length, '#64748b');
    todos.noDate.forEach(t => { todosNoDueDateHtml += todoRow(t, appUrl, date); });
    todosNoDueDateHtml += `<a href="${appUrl}/dashboard/" style="font-size:12px; color:#64748b; text-decoration:none; font-weight:600;">View all tasks →</a></div>`;
  }

  // CIRCLE VISITS TODAY
  let visitsToday = '';
  if (circleVisits.today.length > 0) {
    visitsToday = sectionHeader('🏠', 'Circle Visits Today', circleVisits.today.length, '#0891b2');
    circleVisits.today.forEach(v => {
      visitsToday += leaderCard(appUrl, v.leader_id, v.leader_name, v.leader_campus,
        v.previsit_note
          ? `<div style="font-size:13px; color:#c9d6e3;"><strong>Pre-visit note:</strong> ${v.previsit_note}</div>`
          : `<div style="font-size:13px; color:#6b8ab0;">No pre-visit note</div>`
      );
    });
    visitsToday += '</div>';
  }

  // CIRCLE VISITS THIS WEEK
  let visitsWeek = '';
  if (circleVisits.thisWeek.length > 0) {
    visitsWeek = sectionHeader('📅', 'Circle Visits This Week', circleVisits.thisWeek.length, '#0284c7');
    circleVisits.thisWeek.forEach(v => {
      visitsWeek += leaderCard(appUrl, v.leader_id, v.leader_name, v.leader_campus,
        `<div style="font-size:13px; color:#c9d6e3;"><strong>Scheduled:</strong> ${formatDate(v.visit_date)}${v.previsit_note ? `<br><strong>Note:</strong> ${v.previsit_note}` : ''}</div>`
      );
    });
    visitsWeek += '</div>';
  }

  // ENCOURAGEMENTS DUE TODAY
  let encToday = '';
  if (encouragements.dueToday.length > 0) {
    encToday = sectionHeader('💚', 'Encouragements Due Today', encouragements.dueToday.length, '#059669');
    encouragements.dueToday.forEach(e => {
      encToday += leaderCard(appUrl, e.circle_leader_id, e.leader_name, e.leader_campus,
        `<div style="font-size:13px; color:#c9d6e3;"><strong>Method:</strong> ${methodLabel(e.encourage_method)}${e.note ? `<br><strong>Note:</strong> ${e.note}` : ''}</div>`
      );
    });
    encToday += '</div>';
  }

  // OVERDUE ENCOURAGEMENTS
  let encOverdue = '';
  if (encouragements.overdue.length > 0) {
    encOverdue = sectionHeader('⚠️', 'Overdue Encouragements', encouragements.overdue.length, '#d97706');
    encouragements.overdue.forEach(e => {
      const days = daysDiff(e.message_date, date);
      encOverdue += leaderCard(appUrl, e.circle_leader_id, e.leader_name, e.leader_campus,
        `<div style="font-size:13px; color:#c9d6e3;"><strong>Method:</strong> ${methodLabel(e.encourage_method)}<br><strong>Was due:</strong> ${formatShortDate(e.message_date)}${e.note ? `<br><strong>Note:</strong> ${e.note}` : ''}</div>`,
        days
      );
    });
    encOverdue += '</div>';
  }

  // FOLLOW-UPS DUE TODAY
  let fuToday = '';
  if (followUps.dueToday.length > 0) {
    fuToday = sectionHeader('🔔', 'Follow-Ups Due Today', followUps.dueToday.length, '#7c3aed');
    followUps.dueToday.forEach(f => {
      fuToday += leaderCard(appUrl, f.id, f.name, f.campus,
        `<div style="font-size:13px; color:#c9d6e3;">Follow-up scheduled for today</div>`
      );
    });
    fuToday += '</div>';
  }

  // OVERDUE FOLLOW-UPS
  let fuOverdue = '';
  if (followUps.overdue.length > 0) {
    fuOverdue = sectionHeader('🚩', 'Overdue Follow-Ups', followUps.overdue.length, '#dc2626');
    followUps.overdue.forEach(f => {
      const days = f.follow_up_date ? daysDiff(f.follow_up_date, date) : 0;
      fuOverdue += leaderCard(appUrl, f.id, f.name, f.campus,
        `<div style="font-size:13px; color:#c9d6e3;">Was due: ${f.follow_up_date ? formatShortDate(f.follow_up_date) : 'No date set'}</div>`,
        days
      );
    });
    fuOverdue += '</div>';
  }

  const noItemsMsg = totalItems === 0
    ? `<div style="text-align:center; padding:40px 20px; color:#8da9c4; font-size:15px;">
        🎉 You're all caught up! No tasks, visits, encouragements, or follow-ups due today.
       </div>`
    : '';

  // UPCOMING SCHEDULED CIRCLE VISITS
  let upcomingVisitsHtml = '';
  if (upcomingVisits.length > 0) {
    upcomingVisitsHtml = sectionHeader('🗓️', 'Upcoming Scheduled Circle Visits', upcomingVisits.length, '#0891b2');
    upcomingVisits.forEach(v => {
      upcomingVisitsHtml += leaderCard(appUrl, v.leader_id, v.leader_name, v.leader_campus,
        `<div style="font-size:13px; color:#c9d6e3;"><strong>📅 ${formatDate(v.visit_date)}</strong>${v.previsit_note ? `<br><span style="color:#6b8ab0;">Note:</span> ${v.previsit_note}` : ''}</div>`
      );
    });
    upcomingVisitsHtml += '</div>';
  }

  // RECENT NOTES
  let recentNotesHtml = '';
  if (recentNotes.length > 0) {
    recentNotesHtml = sectionHeader('📝', 'Recent Notes', recentNotes.length, '#8b5cf6');
    recentNotes.forEach(n => {
      const noteDate = new Date(n.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      const truncatedContent = n.content.length > 200 ? n.content.substring(0, 200) + '…' : n.content;
      recentNotesHtml += `
      <div style="background:#0f2a4a; border:1px solid #1e3a5f; border-left:4px solid #8b5cf6; border-radius:6px; padding:10px 14px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <a href="${appUrl}/circle/${n.circle_leader_id}/" style="font-size:14px; font-weight:700; color:#8da9c4; text-decoration:none;">${n.leader_name}</a>
          ${n.leader_campus ? `<span style="font-size:11px; color:#4c6785;">• ${n.leader_campus}</span>` : ''}
        </div>
        <div style="font-size:13px; color:#c9d6e3; margin-bottom:4px; line-height:1.5;">${truncatedContent}</div>
        <div style="font-size:11px; color:#4c6785;">${noteDate}</div>
      </div>`;
    });
    recentNotesHtml += '</div>';
  }

  const taskCount = todos.dueToday.length + todos.overdue.length + todos.noDate.length;
  const visitCount = circleVisits.today.length + circleVisits.thisWeek.length;
  const encCount = encouragements.dueToday.length + encouragements.overdue.length;
  const fuCount = followUps.dueToday.length + followUps.overdue.length;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#091b34; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:640px; margin:0 auto; padding:24px 16px;">

  <!--[if mso]>
  <div style="background-color:#0b2545; border-radius:14px; padding:28px 32px; text-align:center; margin-bottom:8px; border:1px solid #1e3a5f;">
  <![endif]-->
  <!--[if !mso]><!-->
  <div style="background-color:#0b2545; background:linear-gradient(135deg,#0b2545,#143d6b); border-radius:14px; padding:28px 32px; text-align:center; margin-bottom:8px; border:1px solid #1e3a5f;">
  <!--<![endif]-->
    <div style="margin-bottom:16px;">
      <img src="${appUrl}/icon-144x144.png" alt="Radius" width="56" height="56" style="border-radius:12px; display:inline-block;" />
    </div>
    <h1 style="margin:0 0 2px 0; font-size:26px; font-weight:800; color:#ffffff; letter-spacing:1.5px;">RADIUS</h1>
    <p style="margin:0 0 12px 0; font-size:12px; color:#6b8ab0; letter-spacing:2px; text-transform:uppercase;">Circle Leader Management</p>
    <div style="width:40px; height:2px; background:#4f46e5; margin:0 auto 14px auto; border-radius:2px;"></div>
    <h2 style="margin:0 0 6px 0; font-size:20px; font-weight:700; color:#e2e8f0;">Your Digest</h2>
    <p style="margin:0; font-size:14px; color:#8da9c4;">${formatDate(date)}</p>
    <p style="margin:8px 0 0 0; font-size:13px; color:#6b8ab0;">Hi ${user.name || 'there'} 👋 Here's what needs your attention.</p>
  </div>

  <div style="background:#0b2545; border-radius:10px; padding:16px 20px; margin-bottom:8px; border:1px solid #1e3a5f;">
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        ${taskCount > 0 ? `<td style="text-align:center; padding:4px 12px;"><div style="font-size:22px; font-weight:800; color:#6366f1;">${taskCount}</div><div style="font-size:11px; color:#6b8ab0; font-weight:600;">Tasks</div></td>` : ''}
        ${visitCount > 0 ? `<td style="text-align:center; padding:4px 12px;"><div style="font-size:22px; font-weight:800; color:#0891b2;">${visitCount}</div><div style="font-size:11px; color:#6b8ab0; font-weight:600;">Visits</div></td>` : ''}
        ${encCount > 0 ? `<td style="text-align:center; padding:4px 12px;"><div style="font-size:22px; font-weight:800; color:#059669;">${encCount}</div><div style="font-size:11px; color:#6b8ab0; font-weight:600;">Encouragements</div></td>` : ''}
        ${fuCount > 0 ? `<td style="text-align:center; padding:4px 12px;"><div style="font-size:22px; font-weight:800; color:#7c3aed;">${fuCount}</div><div style="font-size:11px; color:#6b8ab0; font-weight:600;">Follow-Ups</div></td>` : ''}
        <td style="text-align:right; padding:4px 0;">
          <a href="${appUrl}/dashboard/" style="display:inline-block; padding:8px 18px; background:#4f46e5; color:white; text-decoration:none; border-radius:8px; font-size:13px; font-weight:700;">Open Dashboard →</a>
        </td>
      </tr>
    </table>
  </div>

  <div style="background:#0b2545; border-radius:12px; padding:20px 24px; border:1px solid #1e3a5f;">
    ${noItemsMsg}
    ${visitsToday}
    ${encToday}
    ${fuToday}
    ${todosDueTodayHtml}
    ${todosOverdueHtml}
    ${todosNoDueDateHtml}
    ${encOverdue}
    ${fuOverdue}
    ${visitsWeek}
    ${upcomingVisitsHtml}
    ${recentNotesHtml}
  </div>

  <div style="text-align:center; padding:24px 0 8px;">
    <div style="margin-bottom:12px;">
      <img src="${appUrl}/icon-32x32.png" alt="Radius" width="24" height="24" style="border-radius:6px; display:inline-block; vertical-align:middle;" />
      <span style="font-size:13px; font-weight:700; color:#8da9c4; letter-spacing:1px; vertical-align:middle; margin-left:6px;">RADIUS</span>
    </div>
    <p style="margin:0 0 8px 0; font-size:12px; color:#4c6785;">
      <a href="${appUrl}" style="color:#8da9c4; text-decoration:none;">Open App</a>
      <span style="margin:0 8px; color:#1e3a5f;">•</span>
      <a href="${appUrl}/profile/" style="color:#8da9c4; text-decoration:none;">Email Settings</a>
      <span style="margin:0 8px; color:#1e3a5f;">•</span>
      <a href="${appUrl}/settings/" style="color:#8da9c4; text-decoration:none;">Unsubscribe</a>
    </p>
    <p style="margin:0; font-size:11px; color:#2d4a6f;">© ${new Date().getFullYear()} Radius CRM</p>
  </div>

</div>
</body>
</html>`;
}

/**
 * Send personal daily digest email to a single user
 */
export async function sendPersonalDigestEmail(
  data: PersonalDigestData
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const fromName = process.env.EMAIL_FROM_NAME || 'Radius CRM';
    const htmlContent = generatePersonalDigestHTML(data);

    const dateLabel = new Date(data.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const subject = `Your Daily Digest – ${dateLabel}`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [data.user.email],
        subject,
        html: htmlContent,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', result);
      return { success: false, error: result.message || result.name || 'Unknown error' };
    }

    console.log(`Digest sent to ${data.user.email}:`, result.id);
    return { success: true };
  } catch (error: any) {
    console.error('Error sending digest email:', error);
    return { success: false, error: error.message };
  }
}

