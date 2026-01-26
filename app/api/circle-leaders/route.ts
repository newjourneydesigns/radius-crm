import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const circleLeader = await request.json();
    
    // Validate required fields
    if (!circleLeader.name || circleLeader.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Clean up the data
    const cleanData: any = {
      name: circleLeader.name.trim(),
      // Set default status if none provided
      status: 'active', // Default to active status for new imports
    };

    // Add optional fields if they exist and are not empty
    if (circleLeader.email && circleLeader.email.trim()) {
      cleanData.email = circleLeader.email.trim();
    }
    
    if (circleLeader.phone && circleLeader.phone.trim()) {
      cleanData.phone = circleLeader.phone.trim();
    }
    
    if (circleLeader.campus && circleLeader.campus.trim()) {
      cleanData.campus = circleLeader.campus.trim();
    }
    
    if (circleLeader.acpd && circleLeader.acpd.trim()) {
      cleanData.acpd = circleLeader.acpd.trim();
    }
    
    // Override status if explicitly provided
    if (circleLeader.status && circleLeader.status.trim()) {
      const validStatuses = ['invited', 'pipeline', 'active', 'paused', 'off-boarding'];
      const status = circleLeader.status.trim().toLowerCase();
      if (validStatuses.includes(status)) {
        cleanData.status = status;
      }
    }
    
    if (circleLeader.day && circleLeader.day.trim()) {
      cleanData.day = circleLeader.day.trim();
    }
    
    if (circleLeader.time && circleLeader.time.trim()) {
      cleanData.time = circleLeader.time.trim();
    }
    
    if (circleLeader.frequency && circleLeader.frequency.trim()) {
      cleanData.frequency = circleLeader.frequency.trim();
    }

    // Optional: anchor date for bi-weekly parity (expects YYYY-MM-DD)
    if (circleLeader.meeting_start_date && String(circleLeader.meeting_start_date).trim()) {
      const raw = String(circleLeader.meeting_start_date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        cleanData.meeting_start_date = raw;
      }
    }
    
    if (circleLeader.circle_type && circleLeader.circle_type.trim()) {
      cleanData.circle_type = circleLeader.circle_type.trim();
    }
    
    if (circleLeader.ccb_profile_link && circleLeader.ccb_profile_link.trim()) {
      cleanData.ccb_profile_link = circleLeader.ccb_profile_link.trim();
    }

    // Insert into database
    const { data, error } = await supabase
      .from('circle_leaders')
      .insert([cleanData])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Parse query params for filtering
    const { searchParams } = new URL(request.url);
    const campusParam = searchParams.get('campus');

    let query = supabase
      .from('circle_leaders')
      .select('*');

    // If campus filter is provided, normalize and filter
    if (campusParam) {
      // Normalize campus value for comparison
      const normalizedCampus = campusParam.trim().toLowerCase();
      query = query.ilike('campus', normalizedCampus);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ circleLeaders: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
