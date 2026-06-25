import { createServiceSupabaseClient } from '../server-supabase';

export type ToolkitOnboardingState = {
  homeScreenCompletedAt: string | null;
  homeScreenDismissedAt: string | null;
  notificationsCompletedAt: string | null;
  notificationsDismissedAt: string | null;
  practiceSummaryCompletedAt: string | null;
  completedAt: string | null;
  isComplete: boolean;
};

export type ToolkitOnboardingStep = 'home_screen' | 'notifications' | 'practice_summary';
export type ToolkitOnboardingAction = 'complete' | 'dismiss';

const SELECT_COLUMNS = `
  toolkit_home_screen_completed_at,
  toolkit_home_screen_dismissed_at,
  toolkit_notifications_completed_at,
  toolkit_notifications_dismissed_at,
  toolkit_practice_summary_completed_at,
  toolkit_onboarding_completed_at
`;

function isMissingOnboardingColumnsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string; details?: string };
  const text = `${maybe.code || ''} ${maybe.message || ''} ${maybe.details || ''}`.toLowerCase();
  return (
    text.includes('toolkit_home_screen_completed_at') ||
    text.includes('toolkit_onboarding_completed_at') ||
    text.includes('schema cache') ||
    text.includes('could not find')
  );
}

function stateFromRow(row: Record<string, string | null> | null): ToolkitOnboardingState {
  const homeScreenCompletedAt = row?.toolkit_home_screen_completed_at ?? null;
  const homeScreenDismissedAt = row?.toolkit_home_screen_dismissed_at ?? null;
  const notificationsCompletedAt = row?.toolkit_notifications_completed_at ?? null;
  const notificationsDismissedAt = row?.toolkit_notifications_dismissed_at ?? null;
  const practiceSummaryCompletedAt = row?.toolkit_practice_summary_completed_at ?? null;
  const completedAt = row?.toolkit_onboarding_completed_at ?? null;

  return {
    homeScreenCompletedAt,
    homeScreenDismissedAt,
    notificationsCompletedAt,
    notificationsDismissedAt,
    practiceSummaryCompletedAt,
    completedAt,
    isComplete: Boolean(completedAt || practiceSummaryCompletedAt),
  };
}

export function isHomeScreenStepResolved(state: ToolkitOnboardingState): boolean {
  return Boolean(state.homeScreenCompletedAt || state.homeScreenDismissedAt);
}

export function isNotificationStepResolved(state: ToolkitOnboardingState): boolean {
  return Boolean(state.notificationsCompletedAt || state.notificationsDismissedAt);
}

export async function getToolkitOnboardingState(
  leaderId: number | string
): Promise<ToolkitOnboardingState> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leaders')
    .select(SELECT_COLUMNS)
    .eq('id', leaderId)
    .maybeSingle();

  if (error) {
    if (isMissingOnboardingColumnsError(error)) {
      return {
        homeScreenCompletedAt: null,
        homeScreenDismissedAt: null,
        notificationsCompletedAt: null,
        notificationsDismissedAt: null,
        practiceSummaryCompletedAt: null,
        completedAt: new Date(0).toISOString(),
        isComplete: true,
      };
    }
    throw error;
  }

  return stateFromRow((data as Record<string, string | null> | null) ?? null);
}

export async function updateToolkitOnboardingState(
  leaderId: number | string,
  step: ToolkitOnboardingStep,
  action: ToolkitOnboardingAction
): Promise<ToolkitOnboardingState> {
  const current = await getToolkitOnboardingState(leaderId);
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

  if (step === 'practice_summary') {
    if (!isHomeScreenStepResolved(current) || !isNotificationStepResolved(current)) {
      throw new Error('Complete the setup steps before trying the practice summary.');
    }
    patch.toolkit_practice_summary_completed_at = now;
    patch.toolkit_onboarding_completed_at = now;
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('circle_leaders')
    .update(patch)
    .eq('id', leaderId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw error;
  return stateFromRow(data as Record<string, string | null>);
}
