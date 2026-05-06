import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCCBClient } from '../../../../lib/ccb/ccb-client';
import { getCCBRequestContext } from '../../../../lib/ccb/ccb-api-gateway';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const stripHtml = (html: string): string =>
  html
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function extractIndividualId(profileLink: string): string | null {
  const match = profileLink.match(/\/individuals\/(\d+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leaderId, noteContent } = body as { leaderId: number; noteContent: string };

    if (!leaderId || !noteContent?.trim()) {
      return NextResponse.json({ error: 'leaderId and noteContent are required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: leader, error: leaderError } = await supabase
      .from('circle_leaders')
      .select('id, name, leader_ccb_profile_link')
      .eq('id', leaderId)
      .single();

    if (leaderError || !leader) {
      return NextResponse.json({ error: 'Leader not found' }, { status: 404 });
    }

    if (!leader.leader_ccb_profile_link) {
      return NextResponse.json(
        { error: 'This leader does not have a CCB profile link on file. Add it to their profile first.' },
        { status: 422 }
      );
    }

    const individualId = extractIndividualId(leader.leader_ccb_profile_link);
    if (!individualId) {
      return NextResponse.json(
        { error: `Could not parse a CCB individual ID from: ${leader.leader_ccb_profile_link}` },
        { status: 422 }
      );
    }

    const plainText = stripHtml(noteContent);
    if (!plainText) {
      return NextResponse.json({ error: 'Note content is empty after stripping formatting' }, { status: 400 });
    }

    const context = await getCCBRequestContext(req);
    const ccb = createCCBClient(context);
    await ccb.createIndividualNote(individualId, plainText);

    return NextResponse.json({ success: true, individualId, leaderName: leader.name });
  } catch (err: any) {
    console.error('[ccb/create-note] Error:', err);
    const message = err?.message || 'Unknown error';

    if (message.includes('401') || message.includes('Unauthorized') || message.includes('permission')) {
      return NextResponse.json(
        { error: 'CCB rejected the request — the API credentials may not have write access to individual notes.' },
        { status: 403 }
      );
    }
    if (message.includes('service not found') || message.includes('create_individual_note')) {
      return NextResponse.json(
        { error: 'CCB does not recognize the create_individual_note service. Check API permissions or contact your CCB admin.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
