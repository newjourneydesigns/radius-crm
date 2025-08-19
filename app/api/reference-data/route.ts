import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Check if required environment variables are available
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('NEXT_PUBLIC_SUPABASE_URL is missing');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    // Use service key if available, otherwise fallback to anon key with limited access
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    console.log('Environment check:', {
      hasServiceKey: !!serviceKey,
      hasAnonKey: !!anonKey,
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL
    });
    
    if (!serviceKey && !anonKey) {
      console.error('Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is available');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    // Use service key for reference data access if available, otherwise use anon key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey || anonKey!
    );

    const [directorsRes, campusesRes, statusesRes, circleTypesRes, frequenciesRes] = await Promise.all([
      supabase.from('acpd_list').select('id, name').order('name'),
      supabase.from('campuses').select('id, value').order('value'),
      supabase.from('statuses').select('id, value').order('value'),
      supabase.from('circle_types').select('id, value').order('value'),
      supabase.from('frequencies').select('id, value').order('value')
    ]);

    console.log('API Results:', {
      directors: directorsRes.data?.length || 0,
      campuses: campusesRes.data?.length || 0,
      statuses: statusesRes.data?.length || 0,
      circleTypes: circleTypesRes.data?.length || 0,
      frequencies: frequenciesRes.data?.length || 0,
      errors: {
        directors: directorsRes.error,
        campuses: campusesRes.error,
        statuses: statusesRes.error,
        circleTypes: circleTypesRes.error,
        frequencies: frequenciesRes.error
      }
    });

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
    return NextResponse.json({ 
      error: 'Failed to load reference data',
      directors: [],
      campuses: [],
      statuses: [],
      circleTypes: [],
      frequencies: []
    }, { status: 500 });
  }
}
