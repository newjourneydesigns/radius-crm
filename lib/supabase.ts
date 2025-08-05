import { createClient } from '@supabase/supabase-js';

// Debug environment variables at build time
console.log('🔍 Supabase Environment Debug:', {
  NODE_ENV: process.env.NODE_ENV,
  SUPABASE_URL_EXISTS: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY_EXISTS: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  URL_VALUE: process.env.NEXT_PUBLIC_SUPABASE_URL ? 
    process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 40) + '...' : 
    'NOT_SET'
});

// Handle environment variables with fallbacks for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDg3NjczNjMsImV4cCI6MTk2NDM0MzM2M30.placeholder';

// Runtime check for placeholder credentials
if (typeof window !== 'undefined' && supabaseUrl.includes('placeholder')) {
  console.warn('⚠️ Using placeholder Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
}

// Create Supabase client with proper fallbacks
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: !supabaseUrl.includes('placeholder'), // Only persist sessions with real credentials
    autoRefreshToken: !supabaseUrl.includes('placeholder') // Only refresh tokens with real credentials
  }
});

// Types for our database tables based on actual schema
export interface CircleLeader {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  campus?: string;
  acpd?: string;
  status?: 'invited' | 'pipeline' | 'active' | 'paused' | 'off-boarding';
  day?: string;
  time?: string;
  frequency?: string;
  circle_type?: 'Men\'s' | 'Women\'s' | 'Young Adult | Coed' | 'Young Adult | Men\'s' | 'Young Adult | Women\'s' | 'Young Adult | Couple\'s';
  event_summary_received?: boolean;
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_note?: string;
  ccb_profile_link?: string;
  uuid?: string;
  created_at?: string;
  updated_at?: string;
  last_note?: {
    id: number;
    content: string;
    created_at: string;
    created_by?: string;
  };
  last_connection?: {
    id: number;
    date_of_connection: string;
    connection_type: string;
  };
}

export interface Note {
  id: number;
  circle_leader_id: number;
  user_id?: string;
  content: string;
  created_at: string;
  updated_at?: string;
  note_date?: string;
  note?: string;
  follow_up_date?: string;
  created_by?: string;
  users?: {
    name: string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ACPD' | 'Viewer';
  campus?: string;
  acpd?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Campus {
  id: number;
  name: string;
  active: boolean;
  address?: string;
  created_at?: string;
}

export interface ACPD {
  id: number;
  name: string;
  active: boolean;
  description?: string;
  created_at?: string;
}

export interface Communication {
  id: number;
  circle_leader_id: number;
  user_id?: string;
  type: string;
  content: string;
  date: string;
  communication_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ConnectionType {
  id: number;
  name: string;
  active: boolean;
  created_at?: string;
}

export interface Connection {
  id: number;
  circle_leader_id: number;
  date_of_connection: string; // Date only (YYYY-MM-DD)
  connection_type_id: number;
  connection_type?: ConnectionType; // For joined queries
  note?: string;
  created_at: string;
  updated_at?: string;
}
