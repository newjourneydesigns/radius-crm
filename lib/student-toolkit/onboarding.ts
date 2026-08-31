import { createServiceSupabaseClient } from '../server-supabase';

/**
 * Student Toolkit onboarding state.
 *
 * Mirrors lib/circle-leader-toolkit/onboarding.ts, with a different third step:
 * circle leaders finish by filing a practice event summary, but student leaders
 * submit no summaries at all. Their last step is building the roster of students
 * they lead, which is the one thing the rest of the toolkit is useless without.
 */

export type ToolkitOnboardingState = {
  homeScreenCompletedAt: string | null;
  homeScreenDismissedAt: string | null;
  notificationsCompletedAt: string | null;
  notificationsDismissedAt: string | null;
  rosterCompletedAt: string | null;
  rosterDismissedAt: string | null;
  completedAt: string | null;
  isComplete: boolean;
};

export type ToolkitOnboardingStep = 'home_screen' | 'notifications' | 'roster';
export type ToolkitOnboardingAction = 'complete' | 'dismiss';

const SELECT_COLUMNS = `
  toolkit_home_screen_completed_at,
  toolkit_home_screen_dismissed_at,
  toolkit_notifications_completed_at,
  toolkit_notifications_dismissed_at,
  toolkit_roster_completed_at,
  toolkit_roster_dismissed_at,
  toolkit_onboarding_completed_at
`;

/**
 * The same columns as a flat list, for callers that embed them in a larger
 * `student_leaders` select. The session lookup does exactly that so the toolkit
 * layout can resolve onboarding state without a second sequential round trip.
 */
export const ONBOARDING_SELECT_COLUMNS = SELECT_COLUMNS.split(',')
  .map((c) => c.trim())
  .filter(Boolean);

/** Onboarding state to assume when the columns aren't deployed yet. */
export function onboardingStateWhenColumnsMissing(): ToolkitOnboardingState {
  return {
    homeScreenCompletedAt: null,
    homeScreenDismissedAt: null,
    notificationsCompletedAt: null,
    notificationsDismissedAt: null,
    rosterCompletedAt: null,
    rosterDismissedAt: null,
    completedAt: new Date(0).toISOString(),
    isComplete: true,
  };
}

function isMissingOnboardingColumnsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('toolkit_home_screen_completed_at') ||
    text.includes('toolkit_roster_completed_at') ||
    text.includes('toolkit_onboarding_completed_at') ||
    text.includes('schema cache') ||
    text.includes('could not find')
  );
}

export function onboardingStateFromRow(
  row: Record<string, string | null> | null
): ToolkitOnboardingState {
  const homeScreenCompletedAt = row?.toolkit_home_screen_completed_at ?? null;
  const homeScreenDismissedAt = row?.toolkit_home_screen_dismissed_at ?? null;
  const notificationsCompletedAt = row?.toolkit_notifications_completed_at ?? null;
  const notificationsDismissedAt = row?.toolkit_notifications_dismissed_at ?? null;
  const rosterCompletedAt = row?.toolkit_roster_completed_at ?? null;
  const rosterDismissedAt = row?.toolkit_roster_dismissed_at ?? null;
  const completedAt = row?.toolkit_onboarding_completed_at ?? null;

  return {
    homeScreenCompletedAt,
    homeScreenDismissedAt,
    notificationsCompletedAt,
    notificationsDismissedAt,
    rosterCompletedAt,
    rosterDismissedAt,
    completedAt,
    isComplete: Boolean(completedAt || rosterCompletedAt || rosterDismissedAt),
  };
}

export function isHomeScreenStepResolved(state: ToolkitOnboardingState): boolean {
  return Boolean(state.homeScreenCompletedAt || state.homeScreenDismissedAt);
}

export function isNotificationStepResolved(state: ToolkitOnboardingState): boolean {
  return Boolean(state.notificationsCompletedAt || state.notificationsDismissedAt);
}

export async function getToolkitOnboardingState(
  studentLeaderId: number | string
): Promise<ToolkitOnboardingState> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_leaders')
    .select(SELECT_COLUMNS)
    .eq('id', studentLeaderId)
    .maybeSingle();

  if (error) {
    if (isMissingOnboardingColumnsError(error)) return onboardingStateWhenColumnsMissing();
    throw error;
  }

  return onboardingStateFromRow((data as Record<string, string | null> | null) ?? null);
}

export async function updateToolkitOnboardingState(
  studentLeaderId: number | string,
  step: ToolkitOnboardingStep,
  action: ToolkitOnboardingAction
): Promise<ToolkitOnboardingState> {
  const current = await getToolkitOnboardingState(studentLeaderId);
  const now = new Date().toISOString();
  const patch: Record<string, string> = {};

  if (step === 'home_screen') {
    patch[
      action === 'complete'
        ? 'toolkit_home_screen_completed_at'
        : 'toolkit_home_screen_dismissed_at'
    ] = now;
  }

  if (step === 'notifications') {
    if (!isHomeScreenStepResolved(current)) {
      throw new Error('Complete or skip Add to Home Screen before continuing.');
    }
    patch[
      action === 'complete'
        ? 'toolkit_notifications_completed_at'
        : 'toolkit_notifications_dismissed_at'
    ] = now;
  }

  if (step === 'roster') {
    if (!isHomeScreenStepResolved(current) || !isNotificationStepResolved(current)) {
      throw new Error('Complete the setup steps before building your roster.');
    }
    patch[
      action === 'complete' ? 'toolkit_roster_completed_at' : 'toolkit_roster_dismissed_at'
    ] = now;
    // The roster step is the last one either way — a leader who skips it still
    // finishes onboarding and can add students from the roster page any time.
    patch.toolkit_onboarding_completed_at = now;
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('student_leaders')
    .update(patch)
    .eq('id', studentLeaderId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw error;
  return onboardingStateFromRow(data as Record<string, string | null>);
}
