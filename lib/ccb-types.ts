// TypeScript interfaces for CCB API responses
// NOTE: CCB API returns XML, so we'll need to parse it to JSON

// ---- Group / Circle import types ----

export interface CCBGroup {
  id: string;
  name: string;
  description?: string;
  campus?: string;
  groupType?: string;       // CCB "group_type" or "department"
  mainLeader?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
  };
  meetingDay?: string;
  meetingTime?: string;
  /** Whether this group already exists in circle_leaders (set client-side during search) */
  alreadyImported?: boolean;
  /** Possible fuzzy-name match in circle_leaders */
  possibleMatch?: { id: number; name: string } | null;
}

// ---- Event types ----

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
