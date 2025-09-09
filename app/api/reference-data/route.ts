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

    const [directorsRes, campusesRes, statusesRes, circleTypesRes, frequenciesRes, actualDataRes] = await Promise.all([
      supabase.from('acpd_list').select('id, name').order('name'),
      supabase.from('campuses').select('id, value').order('value'),
      supabase.from('statuses').select('id, value').order('value'),
      supabase.from('circle_types').select('id, value').order('value'),
      supabase.from('frequencies').select('id, value').order('value'),
      // Also get unique values from actual circle leaders data
      supabase.from('circle_leaders').select('campus, acpd, circle_type').order('campus')
    ]);

    console.log('API Results:', {
      directors: directorsRes.data?.length || 0,
      campuses: campusesRes.data?.length || 0,
      statuses: statusesRes.data?.length || 0,
      circleTypes: circleTypesRes.data?.length || 0,
      frequencies: frequenciesRes.data?.length || 0,
      actualDataCount: actualDataRes.data?.length || 0,
      errors: {
        directors: directorsRes.error,
        campuses: campusesRes.error,
        statuses: statusesRes.error,
        circleTypes: circleTypesRes.error,
        frequencies: frequenciesRes.error,
        actualData: actualDataRes.error
      }
    });

    console.log('Raw directors data:', directorsRes.data);
    console.log('Sample circle leaders data:', actualDataRes.data?.slice(0, 3));

    // Get unique values from actual circle leaders data
    const actualData = actualDataRes.data || [];
    const uniqueCampuses = Array.from(new Set(actualData.map(item => item.campus).filter(Boolean)));
    const uniqueACPDs = Array.from(new Set(actualData.map(item => item.acpd).filter(Boolean)));
    const uniqueCircleTypes = Array.from(new Set(actualData.map(item => item.circle_type).filter(Boolean)));

    console.log('Unique values from circle_leaders:', {
      uniqueCampuses: uniqueCampuses.length,
      uniqueACPDs: uniqueACPDs.length,
      uniqueCircleTypes: uniqueCircleTypes.length,
      sampleACPDs: uniqueACPDs.slice(0, 5)
    });

    // Merge reference data with actual data
    const existingCampusValues = new Set((campusesRes.data || []).map(c => c.value));
    const existingDirectorNames = new Set((directorsRes.data || []).map(d => d.name));
    const existingCircleTypeValues = new Set((circleTypesRes.data || []).map(ct => ct.value));

    // Add missing campuses from actual data
    const mergedCampuses = [...(campusesRes.data || [])];
    uniqueCampuses.forEach((campus, index) => {
      if (!existingCampusValues.has(campus)) {
        mergedCampuses.push({ id: 1000 + index, value: campus });
      }
    });

    // Add missing directors from actual data  
    const mergedDirectors = [...(directorsRes.data || [])];
    uniqueACPDs.forEach((acpd, index) => {
      if (!existingDirectorNames.has(acpd)) {
        mergedDirectors.push({ id: 1000 + index, name: acpd });
      }
    });

    // Add missing circle types from actual data
    const mergedCircleTypes = [...(circleTypesRes.data || [])];
    uniqueCircleTypes.forEach((circleType, index) => {
      if (!existingCircleTypeValues.has(circleType)) {
        mergedCircleTypes.push({ id: 1000 + index, value: circleType });
      }
    });

    const referenceData = {
      directors: mergedDirectors,
      campuses: mergedCampuses,
      statuses: statusesRes.data || [],
      circleTypes: mergedCircleTypes,
      frequencies: frequenciesRes.data || []
    };

    console.log('Final merged data:', {
      directors: referenceData.directors.length,
      directorNames: referenceData.directors.map(d => d.name),
      campuses: referenceData.campuses.length,
      statuses: referenceData.statuses.length,
      circleTypes: referenceData.circleTypes.length,
      frequencies: referenceData.frequencies.length
    });

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
