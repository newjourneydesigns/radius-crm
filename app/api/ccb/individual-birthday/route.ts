import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Count matching words between two names (case-insensitive)
function nameMatchScore(a: string, b: string): number {
  const aWords = a.toLowerCase().split(/\s+/);
  const bWords = b.toLowerCase().split(/\s+/);
  return aWords.filter(w => bWords.includes(w)).length;
}

export async function POST(request: Request) {
  try {
    const { circle_leader_id, role } = await request.json();

    if (!circle_leader_id) {
      return NextResponse.json({ error: 'circle_leader_id is required' }, { status: 400 });
    }

    const { data: leader, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, ccb_group_id, additional_leader_name')
      .eq('id', circle_leader_id)
      .single();

    if (leaderError || !leader) {
      return NextResponse.json({ error: 'Leader not found' }, { status: 404 });
    }

    const isAdditional = role === 'Additional Leader';
    const searchName = isAdditional ? leader.additional_leader_name : leader.name;

    if (!searchName?.trim()) {
      return NextResponse.json({ error: 'No name available to search' }, { status: 400 });
    }

    const ccbClient = createCCBClient();
    let individualId: string | null = null;

    // Primary path for Circle Leaders: fetch group roster and find best name match
    if (!isAdditional && leader.ccb_group_id) {
      try {
        const participants = await ccbClient.getGroupParticipants(String(leader.ccb_group_id));
        if (participants.length > 0) {
          let bestMatch = participants[0];
          let bestScore = nameMatchScore(searchName, participants[0].fullName);
          for (const p of participants.slice(1)) {
            const score = nameMatchScore(searchName, p.fullName);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = p;
            }
          }
          if (bestScore > 0) {
            individualId = bestMatch.id;
          }
        }
      } catch {
        // Fall through to name search
      }
    }

    // Fallback (or primary for Additional Leaders): search by name
    if (!individualId) {
      try {
        const results = await ccbClient.searchIndividuals(searchName.trim());
        if (results.length > 0) {
          let bestMatch = results[0];
          let bestScore = nameMatchScore(searchName, results[0].fullName);
          for (const r of results.slice(1)) {
            const score = nameMatchScore(searchName, r.fullName);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = r;
            }
          }
          if (bestScore > 0) {
            individualId = bestMatch.id;
          }
        }
      } catch {
        // Nothing found
      }
    }

    if (!individualId) {
      return NextResponse.json(
        { error: `Could not find "${searchName}" in CCB` },
        { status: 404 }
      );
    }

    const profile = await ccbClient.getIndividualProfile(individualId);

    if (!profile?.birthday) {
      return NextResponse.json(
        { error: 'Individual found in CCB but no birthday on record' },
        { status: 404 }
      );
    }

    const updateField = isAdditional ? 'additional_leader_birthday' : 'birthday';
    const { error: updateError } = await supabase
      .from('circle_leaders')
      .update({ [updateField]: profile.birthday })
      .eq('id', circle_leader_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to save birthday', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, birthday: profile.birthday });
  } catch (error: any) {
    console.error('CCB Individual Birthday Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch birthday from CCB', details: error.message },
      { status: 500 }
    );
  }
}
