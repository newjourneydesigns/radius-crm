import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { campus } = await request.json();
    
    if (!campus || campus.trim().length === 0) {
      return NextResponse.json(
        { error: 'Campus name is required' },
        { status: 400 }
      );
    }

    // Check if campus already exists
    const { data: existing, error: checkError } = await supabase
      .from('campuses')
      .select('id')
      .eq('value', campus.trim());
      
    if (checkError) {
      console.error('Error checking existing campus:', checkError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }
    
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { message: 'Campus already exists' },
        { status: 200 }
      );
    }

    // Insert new campus
    const { data, error } = await supabase
      .from('campuses')
      .insert([{ value: campus.trim() }])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, campus: data }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('campuses')
      .select('*')
      .order('value');

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
