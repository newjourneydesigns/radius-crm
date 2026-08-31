/**
 * Delivery helpers for inbox messages addressed to the 'student' audience.
 *
 * Messages themselves live in the shared `circle_summary_inbox_messages` table
 * so staff compose in the screens they already know. Only the recipient join is
 * student-specific: `circle_summary_inbox_recipients.leader_id` FKs to
 * `circle_leaders`, which student leaders are not in, so read receipts land in
 * `student_inbox_recipients` instead.
 *
 * This mirrors the contract in lib/circle-leader-toolkit/inbox-delivery.ts —
 * resolve targets at delivery time, replace the recipient rows, fire push — but
 * deliberately does NOT copy it:
 *
 *  - Targeting is `all | campus | leader` only. There is no ACPD (students have
 *    none) and no `audience_filters` / `host_team_positions` machinery (that is
 *    Teams-specific). Student ministry targets by campus.
 *  - The push deep link is built from the Student Toolkit base URL. The circle
 *    version falls back to the literal string 'events' when a leader has no CCB
 *    group; carrying that over would open the wrong app.
 */

import { createServiceSupabaseClient } from '../server-supabase';
import { deliverStudentPush, studentInboxUrl } from './push';

export type StudentTargetType = 'all' | 'campus' | 'leader';

export type StudentTarget = {
  id: number | string;
  name: string;
  campus: string | null;
  status: string | null;
  toolkit_access_enabled?: boolean | null;
};

const INELIGIBLE_STATUSES = new Set(['archive', 'archived']);

/** Archived leaders and anyone whose kill switch is flipped never receive. */
export function isEligibleStudent(student: StudentTarget): boolean {
  const status = (student.status || '').trim().toLowerCase();
  if (INELIGIBLE_STATUSES.has(status)) return false;
  if (student.toolkit_access_enabled === false) return false;
  return true;
}

export function parseStudentTargetIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * The student leaders a message is addressed to, resolved fresh at delivery
 * time so a campus move or a new leader is always reflected in the send.
 */
export async function loadStudentTargets(
  targetType: StudentTargetType,
  targetValue: string | null
): Promise<StudentTarget[]> {
  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from('student_leaders')
    .select('id, name, campus, status, toolkit_access_enabled')
    .order('name');

  if (targetType === 'campus') {
    if (!targetValue) return [];
    query = query.eq('campus', targetValue);
  } else if (targetType === 'leader') {
    const ids = parseStudentTargetIds(targetValue);
    if (ids.length === 0) return [];
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as StudentTarget[]).filter(isEligibleStudent);
}

async function replaceStudentRecipients(messageId: string, students: StudentTarget[]) {
  const supabase = createServiceSupabaseClient();
  const { error: deleteError } = await supabase
    .from('student_inbox_recipients')
    .delete()
    .eq('message_id', messageId);
  if (deleteError) throw deleteError;

  if (students.length === 0) return;

  const { error: insertError } = await supabase
    .from('student_inbox_recipients')
    .insert(students.map((student) => ({
      message_id: messageId,
      student_leader_id: student.id,
    })));
  if (insertError) throw insertError;
}

async function sendStudentInboxPushes(
  message: { id: string; title: string },
  recipients: Array<{ id: number | string; student_leader_id: number | string }>
) {
  if (recipients.length === 0) return;

  const supabase = createServiceSupabaseClient();
  const { data: prefs } = await supabase
    .from('student_notification_preferences')
    .select('student_leader_id, inbox_push_enabled')
    .in('student_leader_id', recipients.map((recipient) => recipient.student_leader_id))
    .eq('inbox_push_enabled', true);
  const optedIn = new Set((prefs || []).map((pref: any) => String(pref.student_leader_id)));

  await Promise.all(
    recipients
      .filter((recipient) => optedIn.has(String(recipient.student_leader_id)))
      .map((recipient) =>
        deliverStudentPush(
          {
            notification_type: 'inbox_message',
            student_leader_id: recipient.student_leader_id,
            inbox_recipient_id: recipient.id,
            message_id: message.id,
          },
          {
            title: 'New message in Student Toolkit',
            body: `You have a new message: ${message.title}`,
            // Each leader's inbox is keyed on their own id — never a shared path.
            url: studentInboxUrl(recipient.student_leader_id),
            tag: `student-inbox-${recipient.id}`,
          }
        ).catch((error) => {
          // A dead device must not fail the send for everyone else.
          console.warn('[student-toolkit/inbox] push failed:', error?.message || error);
        })
      )
  );
}

/**
 * Deliver a message to a resolved set of student leaders: replace its recipient
 * rows, then push to everyone who opted in. Idempotent — safe for first send,
 * send-now, resend, and scheduled delivery.
 */
export async function deliverToStudents(
  message: { id: string; title: string },
  students: StudentTarget[]
) {
  await replaceStudentRecipients(message.id, students);
  if (students.length === 0) return;

  const supabase = createServiceSupabaseClient();
  const { data: recipients } = await supabase
    .from('student_inbox_recipients')
    .select('id, student_leader_id')
    .eq('message_id', message.id);

  await sendStudentInboxPushes(message, recipients || []);
}

/** Recipient rows for a message, dropped when staff unsend it. */
export async function clearStudentRecipients(messageId: string) {
  const { error } = await createServiceSupabaseClient()
    .from('student_inbox_recipients')
    .delete()
    .eq('message_id', messageId);
  if (error) throw error;
}
