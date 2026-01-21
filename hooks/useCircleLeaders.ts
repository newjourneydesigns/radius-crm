import { useState, useCallback, useRef } from 'react';
import { supabase, CircleLeader } from '../lib/supabase';

export interface CircleLeaderFilters {
  campus?: string[];
  acpd?: string[];
  status?: string[];
  statusExclude?: string[];
  statusAlwaysExclude?: string[]; // Always exclude these statuses regardless of other filters
  meetingDay?: string[];
  circleType?: string[];
  eventSummary?: string;
  timeOfDay?: string;
}

export type EventSummaryState = 'received' | 'not_received' | 'skipped';

// Cache management
interface CacheEntry {
  data: CircleLeader[];
  timestamp: number;
  filterKey: string;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const cache = new Map<string, CacheEntry>();

// Generate cache key from filters
const generateCacheKey = (filters?: CircleLeaderFilters): string => {
  if (!filters) return 'no-filters';
  
  const sortedFilters = {
    campus: filters.campus?.sort().join(',') || '',
    acpd: filters.acpd?.sort().join(',') || '',
    status: filters.status?.sort().join(',') || '',
    statusExclude: filters.statusExclude?.sort().join(',') || '',
    statusAlwaysExclude: filters.statusAlwaysExclude?.sort().join(',') || '',
    meetingDay: filters.meetingDay?.sort().join(',') || '',
    circleType: filters.circleType?.sort().join(',') || '',
    eventSummary: filters.eventSummary || '',
    timeOfDay: (filters.timeOfDay || '').trim().toUpperCase() // Ensure cache key includes normalized timeOfDay
  };
  return JSON.stringify(sortedFilters);
};

// Check if cache entry is valid
const isCacheValid = (entry: CacheEntry): boolean => {
  return Date.now() - entry.timestamp < CACHE_DURATION;
};

// Clear all cache entries (used when data is modified)
const clearCache = () => {
  const cacheSize = cache.size;
  cache.clear();
  console.log(`Cache cleared due to data modification (${cacheSize} entries removed)`);
};

// Get cache statistics for debugging
const getCacheStats = () => {
  const validEntries = Array.from(cache.values()).filter(entry => isCacheValid(entry));
  const expiredEntries = Array.from(cache.values()).filter(entry => !isCacheValid(entry));
  
  return {
    totalEntries: cache.size,
    validEntries: validEntries.length,
    expiredEntries: expiredEntries.length,
    keys: Array.from(cache.keys())
  };
};

export const useCircleLeaders = () => {
  const [circleLeaders, setCircleLeaders] = useState<CircleLeader[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadCircleLeaders = useCallback(async (filters?: CircleLeaderFilters) => {
    // Debug: Log incoming filters on every load
    console.log('🔄 [useCircleLeaders] loadCircleLeaders called with filters:', filters);

    if (loadingRef.current) {
      console.log('Load already in progress, skipping');
      return;
    }

    // Check cache first
    const cacheKey = generateCacheKey(filters);
    console.log('🗝️ [useCircleLeaders] Generated cacheKey:', cacheKey);
    const cachedEntry = cache.get(cacheKey);

    if (cachedEntry && isCacheValid(cachedEntry)) {
      console.log('✅ [useCircleLeaders] Using cached data for cacheKey:', cacheKey);
      setCircleLeaders(cachedEntry.data);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Clean up expired entries
    cache.forEach((entry, key) => {
      if (!isCacheValid(entry)) {
        cache.delete(key);
      }
    });

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {

      // DEBUG: Log all distinct campus values in the database before filtering
      const { data: campusValues, error: campusError } = await supabase
        .from('circle_leaders')
        .select('campus')
        .neq('campus', '')
        .neq('campus', null);
      if (campusError) {
        console.error('Error fetching campus values:', campusError);
      } else {
        const uniqueCampuses = Array.from(new Set((campusValues || []).map(row => row.campus)));
        console.log('🟢 Distinct campus values in DB:', uniqueCampuses);
      }

      const baseSelect = (includeSkipped: boolean) => (
        'id, name, email, phone, campus, acpd, status, day, time, frequency, circle_type, ' +
        'event_summary_received' +
        (includeSkipped ? ', event_summary_skipped' : '') +
        ', follow_up_required, follow_up_date, ccb_profile_link'
      );

      const applyServerFilters = (q: any, f?: CircleLeaderFilters, includeSkipped: boolean = true) => {
        if (!f) return q;

        // Campus filter
        if (f.campus && f.campus.length > 0) {
          const validCampuses = f.campus.filter(c => c && c.trim() !== '');
          if (validCampuses.length === 1) {
            q = q.eq('campus', validCampuses[0]);
          } else if (validCampuses.length > 1) {
            q = q.in('campus', validCampuses);
          }
        }

        // ACPD filter
        if (f.acpd && f.acpd.length > 0) {
          q = q.in('acpd', f.acpd);
        }

        // Status filter
        if (f.status && f.status.length > 0) {
          const regularStatuses = f.status.filter(s => s !== 'follow-up');
          if (regularStatuses.length > 0) {
            q = q.in('status', regularStatuses);
          }
        }

        // Status exclusion filter - exclude specific statuses unless explicitly included
        if (
          f.statusExclude && f.statusExclude.length > 0 &&
          (!f.status || f.status.length === 0) &&
          (!f.campus || f.campus.length === 0) &&
          (!f.acpd || f.acpd.length === 0) &&
          (!f.meetingDay || f.meetingDay.length === 0) &&
          (!f.circleType || f.circleType.length === 0) &&
          (!f.eventSummary || f.eventSummary === '') &&
          (!f.timeOfDay || f.timeOfDay === '')
        ) {
          q = q.not('status', 'in', `(${f.statusExclude.map(s => `'${s}'`).join(',')})`);
        }

        // Always exclude certain statuses
        if (f.statusAlwaysExclude && f.statusAlwaysExclude.length > 0) {
          q = q.not('status', 'in', `(${f.statusAlwaysExclude.map(s => `'${s}'`).join(',')})`);
        }

        // Meeting Day filter
        if (f.meetingDay && f.meetingDay.length > 0) {
          q = q.in('day', f.meetingDay);
        }

        // Circle Type filter
        if (f.circleType && f.circleType.length > 0) {
          q = q.in('circle_type', f.circleType);
        }

        // Event Summary filter
        if (f.eventSummary === 'received') {
          q = q.eq('event_summary_received', true);
        } else if (f.eventSummary === 'skipped') {
          if (includeSkipped) {
            q = q.eq('event_summary_skipped', true);
          } else {
            // DB not migrated yet; return no rows
            q = q.eq('id', -1);
          }
        } else if (f.eventSummary === 'not_received') {
          q = q.neq('event_summary_received', true);
          if (includeSkipped) {
            q = q.neq('event_summary_skipped', true);
          }
        }

        return q;
      };

      // Build the base query
      let query = applyServerFilters(
        supabase
          .from('circle_leaders')
          .select(baseSelect(true)),
        filters,
        true
      );

      // (filters already applied via applyServerFilters)

      // Log the final query object for debugging
      console.log('Final Supabase query object:', query);
      // Execute the query
      console.log('Executing Supabase query...');
      let { data: leaders, error: leadersError } = await query.order('name');

      // Backward-compat: if the DB hasn't been migrated yet, retry without event_summary_skipped
      if (leadersError && /event_summary_skipped/i.test(leadersError.message || '')) {
        console.warn('event_summary_skipped column missing; retrying without it. Apply add_event_summary_skipped.sql to enable tri-state.');
        query = applyServerFilters(
          supabase
            .from('circle_leaders')
            .select(baseSelect(false)),
          filters,
          false
        );

        ({ data: leaders, error: leadersError } = await query.order('name'));

        if (leaders && leaders.length > 0) {
          leaders = leaders.map((l: any) => ({ ...l, event_summary_skipped: false }));
        }
      }

      console.log('🔍 Query results:', {
        totalFound: leaders?.length || 0,
        filters: filters,
        sampleLeaders: leaders?.slice(0, 3).map(l => ({
          name: l.name,
          campus: l.campus,
          status: l.status,
          acpd: l.acpd
        })),
        raw: leaders
      });

      if (leadersError) {
        console.error('Error loading circle leaders:', leadersError);
        throw leadersError;
      }

      // --- Time of Day AM/PM filter (client-side) ---
      let filteredLeaders = leaders || [];
      const period = (filters?.timeOfDay || '').trim().toUpperCase();
      if (period === 'AM' || period === 'PM') {
        const beforeCount = filteredLeaders.length;
        filteredLeaders = filteredLeaders.filter(l => {
          if (!l.time) return false;
          const raw = String(l.time);
          const timeStr = raw.trim().toUpperCase();

          // Handle special words
          if (timeStr === 'NOON') return period === 'PM'; // 12:00 PM
          if (timeStr === 'MIDNIGHT') return period === 'AM'; // 12:00 AM

          // Match AM/PM formats like "7", "7P", "7 PM", "7:30PM", "10:05 am"
          const ampmMatch = timeStr.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM|A|P)$/i);
          if (ampmMatch) {
            const suffix = ampmMatch[3].toUpperCase();
            const normalized = suffix === 'A' ? 'AM' : suffix === 'P' ? 'PM' : suffix;
            return normalized === period;
          }

          // Match 24-hour format (e.g., "07:30", "19:00", "7:00")
          const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
          if (time24Match) {
            const hour = parseInt(time24Match[1], 10);
            if (period === 'AM') {
              return hour >= 0 && hour < 12; // 00:00 - 11:59
            } else {
              return hour >= 12 && hour <= 23; // 12:00 - 23:59
            }
          }

          // If the format is just an hour (e.g., "7"), assume AM by default
          const hourOnly = timeStr.match(/^(\d{1,2})$/);
          if (hourOnly) {
            // Treat 1-11 as AM, 12 as PM by convention if no suffix is given
            const hour = parseInt(hourOnly[1], 10);
            const assumed = hour === 12 ? 'PM' : 'AM';
            return assumed === period;
          }

          return false; // Unrecognized format => filter out
        });
        const afterCount = filteredLeaders.length;
        console.log(`[TimeOfDay Filter] Applied period: ${period}. Leaders before: ${beforeCount}, after: ${afterCount}`);
      }

      // Load notes only for the filtered leaders (much more efficient)
      let allNotes: any[] = [];
      if (filteredLeaders.length > 0) {
        const leaderIds = filteredLeaders.map(leader => leader.id);
        const { data: notesData, error: notesError } = await supabase
          .from('notes')
          .select('*')
          .in('circle_leader_id', leaderIds)
          .order('created_at', { ascending: false });

        if (notesError) {
          console.error('Error loading notes:', notesError);
        } else {
          allNotes = notesData || [];
        }
      }

      console.log('Loaded', allNotes.length, 'notes for filtered leaders');

      // Create a map of leader_id to their latest note
      const latestNotesMap = new Map();
      if (allNotes && allNotes.length > 0) {
        allNotes.forEach((note: any) => {
          if (!latestNotesMap.has(note.circle_leader_id)) {
            latestNotesMap.set(note.circle_leader_id, note);
          }
        });
      }

      // Combine leaders with their latest notes
      const leadersWithNotes = filteredLeaders.map(leader => ({
        ...leader,
        last_note: latestNotesMap.get(leader.id) || null
      }));

      // Store in cache
      cache.set(cacheKey, {
        data: leadersWithNotes,
        timestamp: Date.now(),
        filterKey: cacheKey
      });

      console.log('Data cached successfully', { cacheKey, dataLength: leadersWithNotes.length });

      setCircleLeaders(leadersWithNotes);

    } catch (error: any) {
      console.error('Error loading circle leaders:', error);
      setError('Error loading circle leaders. Please refresh the page.');
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const setEventSummaryState = async (leaderId: number, state: EventSummaryState) => {
    try {
      const payload = {
        event_summary_received: state === 'received',
        event_summary_skipped: state === 'skipped',
      };

      let { error } = await supabase
        .from('circle_leaders')
        .update(payload)
        .eq('id', leaderId);

      // Backward-compat: if event_summary_skipped doesn't exist yet, retry without it
      if (error && /event_summary_skipped/i.test(error.message || '')) {
        if (state === 'skipped') {
          throw new Error('Did not meet is not enabled yet. Apply add_event_summary_skipped.sql to your Supabase database first.');
        }

        ({ error } = await supabase
          .from('circle_leaders')
          .update({ event_summary_received: state === 'received' })
          .eq('id', leaderId));
      }

      if (error) {
        console.error('Error updating event summary state:', error);
        throw error;
      }

      clearCache();

      setCircleLeaders(prev =>
        prev.map(leader =>
          leader.id === leaderId
            ? { ...leader, ...payload }
            : leader
        )
      );
    } catch (error) {
      console.error('Error in setEventSummaryState:', error);
      setError('Error updating event summary');
      throw error;
    }
  };

  const toggleEventSummary = async (leaderId: number, isChecked: boolean) => {
    // Backwards-compatible wrapper: checked => received, unchecked => not_received
    return setEventSummaryState(leaderId, isChecked ? 'received' : 'not_received');
  };

  const resetEventSummaryCheckboxes = async (leaderIds: number[]) => {
    try {
      // Update in database
      const { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_received: false, event_summary_skipped: false })
        .in('id', leaderIds);

      if (error) {
        console.error('Error resetting event summaries:', error);
        throw error;
      }

      // Clear cache since data was modified
      clearCache();

      // Update local state
      setCircleLeaders(prev => 
        prev.map(leader => 
          leaderIds.includes(leader.id)
            ? { ...leader, event_summary_received: false, event_summary_skipped: false }
            : leader
        )
      );

    } catch (error) {
      console.error('Error in resetEventSummaryCheckboxes:', error);
      setError('Error resetting event summaries');
      throw error;
    }
  };

  const toggleFollowUp = async (leaderId: number, isRequired: boolean) => {
    try {
      // Update in database
      const { error } = await supabase
        .from('circle_leaders')
        .update({ follow_up_required: isRequired })
        .eq('id', leaderId);

      if (error) {
        console.error('Error updating follow-up status:', error);
        throw error;
      }

      // Clear cache since data was modified
      clearCache();

      // Update local state
      setCircleLeaders(prev => 
        prev.map(leader => 
          leader.id === leaderId 
            ? { ...leader, follow_up_required: isRequired }
            : leader
        )
      );

    } catch (error) {
      console.error('Error in toggleFollowUp:', error);
      setError('Error updating follow-up status');
      throw error;
    }
  };

  const updateStatus = async (leaderId: number, newStatus: string, followUpDate?: string) => {
    try {
      // Prepare update data
      const updateData: any = { status: newStatus };
      
      // If setting to follow-up status and date provided, include it
      if (newStatus === 'follow-up' && followUpDate) {
        updateData.follow_up_required = true;
        updateData.follow_up_date = followUpDate;
      }
      // If changing from follow-up to another status, clear follow-up data
      else if (newStatus !== 'follow-up') {
        updateData.follow_up_required = false;
        updateData.follow_up_date = null;
      }

      // Update in database
      const { error } = await supabase
        .from('circle_leaders')
        .update(updateData)
        .eq('id', leaderId);

      if (error) {
        console.error('Error updating status:', error);
        throw error;
      }

      // Clear cache since data was modified
      clearCache();

      // Update local state
      setCircleLeaders(prev => 
        prev.map(leader => 
          leader.id === leaderId
            ? { 
                ...leader, 
                status: newStatus as CircleLeader['status'],
                follow_up_required: updateData.follow_up_required !== undefined ? updateData.follow_up_required : leader.follow_up_required,
                follow_up_date: updateData.follow_up_date !== undefined ? updateData.follow_up_date : leader.follow_up_date
              }
            : leader
        )
      );

    } catch (error) {
      console.error('Error in updateStatus:', error);
      setError('Error updating status');
      throw error;
    }
  };

  const bulkUpdateStatus = async (leaderIds: number[], newStatus: string) => {
    try {
      // Handle follow-up specially since it's not a status but a boolean flag
      if (newStatus === 'follow-up') {
        // Update follow_up_required flag
        const { error } = await supabase
          .from('circle_leaders')
          .update({ follow_up_required: true })
          .in('id', leaderIds);

        if (error) {
          console.error('Error updating follow-up:', error);
          throw error;
        }

        // Update local state
        setCircleLeaders(prev => 
          prev.map(leader => 
            leaderIds.includes(leader.id)
              ? { ...leader, follow_up_required: true }
              : leader
          )
        );
      } else {
        // Handle regular status updates
        const { error } = await supabase
          .from('circle_leaders')
          .update({ status: newStatus })
          .in('id', leaderIds);

        if (error) {
          console.error('Error updating status:', error);
          throw error;
        }

        // Clear cache since data was modified
        clearCache();

        // Update local state
        setCircleLeaders(prev => 
          prev.map(leader => 
            leaderIds.includes(leader.id)
              ? { ...leader, status: newStatus as CircleLeader['status'] }
              : leader
          )
        );
      }

    } catch (error) {
      console.error('Error in bulkUpdateStatus:', error);
      setError('Error updating status');
      throw error;
    }
  };

  const deleteCircleLeader = async (leaderId: number) => {
    try {
      // First delete associated notes
      const { error: notesError } = await supabase
        .from('notes')
        .delete()
        .eq('circle_leader_id', leaderId);

      if (notesError) {
        console.error('Error deleting notes:', notesError);
        throw notesError;
      }

      // Then delete the circle leader
      const { error } = await supabase
        .from('circle_leaders')
        .delete()
        .eq('id', leaderId);

      if (error) {
        console.error('Error deleting circle leader:', error);
        throw error;
      }

      // Update local state
      setCircleLeaders(prev => prev.filter(leader => leader.id !== leaderId));

    } catch (error) {
      console.error('Error in deleteCircleLeader:', error);
      setError('Error deleting circle leader');
      throw error;
    }
  };

  // Expose cache invalidation for external use (when notes/connections are added)
  const invalidateCache = useCallback(() => {
    clearCache();
  }, []);

  // Expose cache stats for debugging in development
  const getCacheDebugInfo = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      return getCacheStats();
    }
    return null;
  }, []);

  return {
    circleLeaders,
    isLoading,
    error,
    loadCircleLeaders,
    setEventSummaryState,
    toggleEventSummary,
    resetEventSummaryCheckboxes,
    toggleFollowUp,
    updateStatus,
    bulkUpdateStatus,
    deleteCircleLeader,
    invalidateCache,
    getCacheDebugInfo
  };
};
