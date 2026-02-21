import { ScorecardDimension } from './supabase';

/**
 * Suggested next steps keyed by evaluation question key.
 * `no` steps are shown when a question is answered "no" — actionable coaching
 * guidance to help the circle leader grow in that area.
 * `yes` steps are shown when a question is answered "yes" — because there is
 * always more. These push the leader to go deeper even when already excelling.
 */
export const NEXT_STEPS: Record<string, { no: string; yes: string }> = {
  // ── Reach ──────────────────────────────────────────────────
  leader_invited_last_30_days: {
    no: 'Challenge the leader to personally invite one person this week.',
    yes: 'Celebrate it! Now encourage them to equip a member to invite someone too.',
  },
  non_leader_invited_recently: {
    no: 'Encourage members to each bring a friend to the next gathering.',
    yes: 'Highlight this win to the group and set a goal to make it a regular rhythm.',
  },
  new_person_attended_60_days: {
    no: 'Plan a special "invite a friend" event or themed gathering.',
    yes: 'Focus on follow-up — make sure new attendees feel welcomed and want to return.',
  },
  leader_talks_about_inviting: {
    no: 'Help the leader incorporate invitation culture into regular discussions.',
    yes: 'Coach the leader to share specific invitation stories, not just the concept.',
  },
  members_expect_to_invite: {
    no: 'Set a group goal for invitations and celebrate when new people come.',
    yes: 'Raise the bar — help members think about who specifically they could invite next.',
  },
  friends_brought_without_staff: {
    no: 'Model inviting behavior and share success stories from other circles.',
    yes: 'Ask the leader to share this story with other circle leaders as an encouragement.',
  },
  group_engages_outside_church: {
    no: 'Organize a community service project or neighborhood activity.',
    yes: 'Help the group identify a consistent community they can serve regularly.',
  },

  // ── Connect ────────────────────────────────────────────────
  communicates_outside_gathering: {
    no: 'Set up a group chat or schedule one-on-one check-ins between meetings.',
    yes: 'Deepen it — encourage the leader to have meaningful individual conversations, not just group texts.',
  },
  prays_for_each_other_weekly: {
    no: 'Introduce a prayer partner system or shared prayer list.',
    yes: 'Take it further — keep a running prayer list and celebrate answered prayers together.',
  },
  knows_personal_details: {
    no: 'Start each meeting with a meaningful check-in question.',
    yes: 'Use that knowledge intentionally — surprise members with personalized encouragement.',
  },
  hangs_outside_circle: {
    no: 'Plan a social outing or meal together outside of regular meetings.',
    yes: 'Encourage members to initiate these hangouts themselves, not just the leader.',
  },
  group_conversations_not_leader_centric: {
    no: 'Use open-ended discussion questions and invite quieter members to share.',
    yes: 'Coach the leader to step back even more — let members facilitate portions of discussion.',
  },
  new_people_integrated_quickly: {
    no: 'Assign a "welcome buddy" for new members in their first few weeks.',
    yes: 'Ask: are the new people now connecting others? That\'s the next level.',
  },
  notices_when_missing: {
    no: 'Follow up with absent members within 48 hours — make it a group habit.',
    yes: 'Empower other members to take ownership of reaching out, not just the leader.',
  },

  // ── Disciple ───────────────────────────────────────────────
  leader_asks_next_steps: {
    no: 'Prepare 2-3 spiritual next-step questions for each meeting.',
    yes: 'Push deeper — help the leader move from asking about steps to walking through them together.',
  },
  leader_knows_member_next_steps: {
    no: 'Schedule individual conversations to learn each member\'s spiritual journey.',
    yes: 'Create a simple growth plan for each member based on what the leader knows.',
  },
  members_take_spiritual_actions: {
    no: 'Create accountability partners to track spiritual action steps.',
    yes: 'Help members share their action steps with the group to inspire one another.',
  },
  scripture_applied_personally: {
    no: 'Shift from "what does this mean?" to "what will you do about it?"',
    yes: 'Ask members to report back on how they applied it — close the loop.',
  },
  growth_stories_shared: {
    no: 'Dedicate time each month for members to share how God is working.',
    yes: 'Encourage the leader to document these stories and share them with other leaders.',
  },
  leader_follows_up_commitments: {
    no: 'Keep a simple log of commitments and check in the following week.',
    yes: 'Celebrate follow-through publicly and help members set bigger stretches.',
  },
  measurable_growth_last_month: {
    no: 'Set specific, measurable spiritual goals with the group.',
    yes: 'Review the growth trend — what contributed? Replicate it intentionally.',
  },

  // ── Develop ────────────────────────────────────────────────
  future_leader_identified: {
    no: 'Prayerfully identify 1-2 members who show leadership potential.',
    yes: 'Great start — now create a written development plan for that person.',
  },
  person_knows_they_are_developed: {
    no: 'Have a direct conversation about their leadership potential and interest.',
    yes: 'Set specific leadership milestones together and review them monthly.',
  },
  given_real_responsibility: {
    no: 'Delegate a specific task: leading worship, facilitating discussion, or planning an event.',
    yes: 'Increase the scope — let them own an entire meeting, not just a portion.',
  },
  helps_lead_regularly: {
    no: 'Create a rotation schedule where they lead portions of the gathering.',
    yes: 'Move toward co-leadership — give them equal ownership of the group.',
  },
  meets_outside_circle: {
    no: 'Schedule a monthly one-on-one mentoring meeting.',
    yes: 'Use those meetings to work through a leadership development resource together.',
  },
  leadership_discussed: {
    no: 'Cast vision for multiplication and discuss what it might look like.',
    yes: 'Set a target date for multiplication and start planning the transition.',
  },
  could_run_group_if_needed: {
    no: 'Have them lead the group solo for 2-3 weeks as a trial run.',
    yes: 'They\'re ready — begin the multiplication conversation and timeline.',
  },
};

export interface NextStepItem {
  questionKey: string;
  questionLabel: string;
  nextStep: string;
  answerType: 'yes' | 'no';
}

/**
 * Get suggested next steps for a category based on answered questions.
 * Returns steps for both "no" (growth areas) and "yes" (keep pushing) answers.
 */
export function getNextStepsForCategory(
  answers: Record<string, 'yes' | 'no' | null>,
  questions: Array<{ key: string; label: string }>
): NextStepItem[] {
  const steps: NextStepItem[] = [];

  for (const q of questions) {
    const answer = answers[q.key];
    if (answer && NEXT_STEPS[q.key]) {
      steps.push({
        questionKey: q.key,
        questionLabel: q.label,
        nextStep: NEXT_STEPS[q.key][answer],
        answerType: answer,
      });
    }
  }

  return steps;
}
