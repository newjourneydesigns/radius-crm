import { useState, useEffect, useCallback } from 'react';
import { EventNote, CCBEventProfile, UseEventNotesResult } from '../lib/ccb-types';

// CCB API Configuration
// NOTE: In production, move these to environment variables
const CCB_BASE_URL = 'https://valleycreekchurch.ccbchurch.com/api.php';
const CCB_USERNAME = 'circlesreportingapi';
const CCB_PASSWORD = 'curho8-gyxceQ-mymqyv';

// Helper function to create Basic Auth header
const createAuthHeader = () => {
  const credentials = btoa(`${CCB_USERNAME}:${CCB_PASSWORD}`);
  return `Basic ${credentials}`;
};

// Helper function to parse XML to JSON (simplified)
const parseXMLResponse = (xmlText: string): any => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  
  // Check for parsing errors
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML parsing failed: ' + parserError.textContent);
  }
  
  return xmlDoc;
};

// Extract event data from XML
const extractEventsFromXML = (xmlDoc: Document): CCBEventProfile[] => {
  const events: CCBEventProfile[] = [];
  const eventElements = xmlDoc.querySelectorAll('event');
  
  eventElements.forEach(eventEl => {
    const id = eventEl.getAttribute('id') || '';
    const nameEl = eventEl.querySelector('name');
    const startDatetimeEl = eventEl.querySelector('start_datetime');
    const startDateEl = eventEl.querySelector('start_date');
    const groupEl = eventEl.querySelector('group');
    const setupEl = eventEl.querySelector('setup');
    const leaderNotesEl = eventEl.querySelector('leader_notes');
    
    const event: CCBEventProfile = {
      id,
      name: nameEl?.textContent || 'Unnamed Event',
      start_datetime: startDatetimeEl?.textContent || startDateEl?.textContent || '',
      group: {
        id: groupEl?.getAttribute('id') || '',
        name: groupEl?.textContent || ''
      },
      setup: setupEl ? {
        notes: setupEl.querySelector('notes')?.textContent || ''
      } : undefined,
      leader_notes: leaderNotesEl?.textContent || ''
    };
    
    events.push(event);
  });
  
  return events;
};

// Extract single event data from XML
const extractSingleEventFromXML = (xmlDoc: Document): CCBEventProfile | null => {
  const eventEl = xmlDoc.querySelector('event');
  if (!eventEl) return null;
  
  const id = eventEl.getAttribute('id') || '';
  const nameEl = eventEl.querySelector('name');
  const startDatetimeEl = eventEl.querySelector('start_datetime');
  const startDateEl = eventEl.querySelector('start_date');
  const groupEl = eventEl.querySelector('group');
  const setupEl = eventEl.querySelector('setup');
  const leaderNotesEl = eventEl.querySelector('leader_notes');
  
  return {
    id,
    name: nameEl?.textContent || 'Unnamed Event',
    start_datetime: startDatetimeEl?.textContent || startDateEl?.textContent || '',
    group: {
      id: groupEl?.getAttribute('id') || '',
      name: groupEl?.textContent || ''
    },
    setup: setupEl ? {
      notes: setupEl.querySelector('notes')?.textContent || ''
    } : undefined,
    leader_notes: leaderNotesEl?.textContent || ''
  };
};

// Fetch event profiles with pagination
const fetchEventProfiles = async (groupId: number, startDate: string): Promise<CCBEventProfile[]> => {
  const allEvents: CCBEventProfile[] = [];
  let page = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const url = new URL(CCB_BASE_URL);
    url.searchParams.append('srv', 'event_profiles');
    url.searchParams.append('modified_since', startDate);
    url.searchParams.append('include_guest_list', 'false');
    url.searchParams.append('include_image_link', 'false');
    url.searchParams.append('per_page', '100');
    url.searchParams.append('page', page.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': createAuthHeader(),
        'Accept': 'application/xml'
      }
    });
    
    if (!response.ok) {
      throw new Error(`CCB API error: ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    const xmlDoc = parseXMLResponse(xmlText);
    const events = extractEventsFromXML(xmlDoc);
    
    // Filter events by group ID
    const filteredEvents = events.filter(event => 
      event.group.id === groupId.toString()
    );
    
    allEvents.push(...filteredEvents);
    
    // Check if we have more pages (simplified check)
    hasMorePages = events.length === 100;
    page++;
    
    // Safety break to prevent infinite loops
    if (page > 50) break;
  }
  
  return allEvents;
};

// Fetch detailed event data
const fetchEventDetails = async (eventId: string): Promise<CCBEventProfile | null> => {
  const url = new URL(CCB_BASE_URL);
  url.searchParams.append('srv', 'event_profile');
  url.searchParams.append('id', eventId);
  url.searchParams.append('include_guest_list', 'false');
  url.searchParams.append('include_image_link', 'false');
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': createAuthHeader(),
      'Accept': 'application/xml'
    }
  });
  
  if (!response.ok) {
    throw new Error(`CCB API error for event ${eventId}: ${response.status} ${response.statusText}`);
  }
  
  const xmlText = await response.text();
  const xmlDoc = parseXMLResponse(xmlText);
  return extractSingleEventFromXML(xmlDoc);
};

// Filter events by date range
const filterEventsByDateRange = (events: CCBEventProfile[], startDate: string, endDate: string): CCBEventProfile[] => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return events.filter(event => {
    const eventDate = new Date(event.start_datetime || event.start_date || '');
    return eventDate >= start && eventDate <= end;
  });
};

// Main hook
export const useEventNotesForGroup = (groupId: number, startDate: string, endDate: string): UseEventNotesResult => {
  const [data, setData] = useState<EventNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchData = useCallback(async () => {
    if (!groupId || !startDate || !endDate) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Fetching events for group ${groupId} from ${startDate} to ${endDate}`);
      
      // Step 1: Get event profiles
      const eventProfiles = await fetchEventProfiles(groupId, startDate);
      console.log(`Found ${eventProfiles.length} events for group ${groupId}`);
      
      // Step 2: Filter by date range
      const filteredEvents = filterEventsByDateRange(eventProfiles, startDate, endDate);
      console.log(`${filteredEvents.length} events match date range`);
      
      // Step 3: Fetch detailed data for each event
      const eventNotes: EventNote[] = [];
      
      for (const event of filteredEvents) {
        try {
          const detailedEvent = await fetchEventDetails(event.id);
          if (detailedEvent) {
            const notes: string[] = [];
            
            // Collect all notes
            if (detailedEvent.setup?.notes) {
              notes.push(detailedEvent.setup.notes);
            }
            if (detailedEvent.leader_notes) {
              notes.push(detailedEvent.leader_notes);
            }
            
            const eventNote: EventNote = {
              eventId: detailedEvent.id,
              eventName: detailedEvent.name,
              eventDate: detailedEvent.start_datetime || detailedEvent.start_date || '',
              notes: notes.filter(note => note.trim() !== ''),
              setupNotes: detailedEvent.setup?.notes,
              leaderNotes: detailedEvent.leader_notes
            };
            
            eventNotes.push(eventNote);
          }
        } catch (eventError) {
          console.error(`Error fetching details for event ${event.id}:`, eventError);
          // Continue with other events
        }
      }
      
      // Sort by date (chronological order)
      eventNotes.sort((a, b) => 
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
      );
      
      setData(eventNotes);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching event notes:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [groupId, startDate, endDate]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
};
