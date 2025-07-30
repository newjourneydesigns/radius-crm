import { createClient } from '@supabase/supabase-js';

// Handle environment variables with fallbacks for build time
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  circle_type?: string;
  event_summary_received?: boolean;
  ccb_profile_link?: string;
  follow_up_date?: string;
  follow_up_note?: string;
  uuid?: string;
  created_at?: string;
  updated_at?: string;
  last_note?: {
    content: string;
    created_at: string;
  };
}

export interface Note {
  id: number;
  circle_leader_id: number;
  user_id?: string;
  content: string;
  note_date?: string;
  note?: string;
  follow_up_date?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
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
  date: string;
  communication_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}
