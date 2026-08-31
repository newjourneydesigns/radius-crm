import { NextResponse } from 'next/server';
import { getSessionStudentLeader, unauthorized } from '../../../../lib/student-toolkit/session';
import {
  getToolkitOnboardingState,
  updateToolkitOnboardingState,
  type ToolkitOnboardingAction,
  type ToolkitOnboardingStep,
} from '../../../../lib/student-toolkit/onboarding';

export const dynamic = 'force-dynamic';

const VALID_STEPS = new Set<ToolkitOnboardingStep>(['home_screen', 'notifications', 'roster']);
const VALID_ACTIONS = new Set<ToolkitOnboardingAction>(['complete', 'dismiss']);

export async function GET() {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  try {
    const onboarding = await getToolkitOnboardingState(leader.id);
    return NextResponse.json({ onboarding });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load onboarding.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const leader = await getSessionStudentLeader();
  if (!leader) return unauthorized();

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { step, action } = body as {
    step?: ToolkitOnboardingStep;
    action?: ToolkitOnboardingAction;
  };

  if (!step || !VALID_STEPS.has(step)) {
    return NextResponse.json({ error: 'Valid step is required.' }, { status: 400 });
  }
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Valid action is required.' }, { status: 400 });
  }

  try {
    const onboarding = await updateToolkitOnboardingState(leader.id, step, action);
    return NextResponse.json({ onboarding });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update onboarding.' },
      { status: 400 }
    );
  }
}
