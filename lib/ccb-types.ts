// TypeScript interfaces for CCB API responses
// NOTE: CCB API returns XML, so we'll need to parse it to JSON

export interface CCBEventProfile {
  id: string;
  name: string;
  start_datetime: string;
  start_date?: string;
  group: {
    id: string;
    name?: string;
  };
  setup?: {
    notes?: string;
  };
  leader_notes?: string;
  modified_date?: string;
}

export interface CCBEventProfilesResponse {
  events: CCBEventProfile[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface CCBSingleEventResponse {
  event: CCBEventProfile;
}

export interface EventNote {
  eventId: string;
  eventName: string;
  eventDate: string;
  notes: string[];
  setupNotes?: string;
  leaderNotes?: string;
}

export interface UseEventNotesResult {
  data: EventNote[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
