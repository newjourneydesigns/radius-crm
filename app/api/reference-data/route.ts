import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service key for reference data access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const [directorsRes, campusesRes, statusesRes, circleTypesRes, frequenciesRes] = await Promise.all([
      supabase.from('acpd_list').select('id, name').order('name'),
      supabase.from('campuses').select('id, value').order('value'),
      supabase.from('statuses').select('id, value').order('value'),
      supabase.from('circle_types').select('id, value').order('value'),
      supabase.from('frequencies').select('id, value').order('value')
    ]);

    const referenceData = {
      directors: directorsRes.data || [],
      campuses: campusesRes.data || [],
      statuses: statusesRes.data || [],
      circleTypes: circleTypesRes.data || [],
      frequencies: frequenciesRes.data || []
    };

    return NextResponse.json(referenceData);
  } catch (error) {
    console.error('Error loading reference data:', error);
    return NextResponse.json({ error: 'Failed to load reference data' }, { status: 500 });
  }
}
