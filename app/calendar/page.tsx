'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import CircleMeetingsCalendar from '../../components/calendar/CircleMeetingsCalendar';
import CalendarFilterPanel from '../../components/calendar/CalendarFilterPanel';
import { useLeaderFilters } from '../../hooks/useLeaderFilters';
import { useCircleLeaders, type CircleLeaderFilters } from '../../hooks/useCircleLeaders';
import { supabase } from '../../lib/supabase';

type RefItem = { id: number; value: string };
type DirectorItem = { id: number; name: string };

export default function CalendarPage() {
  return (
    <ProtectedRoute>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={<div className="text-sm text-gray-600 dark:text-gray-300">Loading…</div>}>
          <CalendarPageContent />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}

function CalendarPageContent() {
  const router = useRouter();
  const { filters, updateFilters, clearAllFilters, isInitialized } = useLeaderFilters({ basePath: '/calendar' });
  const { circleLeaders, isLoading, error, loadCircleLeaders } = useCircleLeaders();

  const [directors, setDirectors] = useState<DirectorItem[]>([]);
  const [campuses, setCampuses] = useState<RefItem[]>([]);
  const [statuses, setStatuses] = useState<RefItem[]>([]);
  const [circleTypes, setCircleTypes] = useState<RefItem[]>([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(true);
  const [connectedLeaderIds, setConnectedLeaderIds] = useState<Set<number>>(new Set());

  // Update URL when filters change (same query keys as Leaders page)
  useEffect(() => {
    if (!isInitialized) return;
    const params = new URLSearchParams();

    filters.campus.forEach(campus => params.append('campus', campus));
    filters.acpd.forEach(acpd => params.append('acpd', acpd));
    filters.status.forEach(status => params.append('status', status));
    filters.meetingDay.forEach(day => params.append('meetingDay', day));
    filters.circleType.forEach(type => params.append('circleType', type));

    if (filters.eventSummary !== 'all') params.set('eventSummary', filters.eventSummary);
    if (filters.connected !== 'all') params.set('connected', filters.connected);
    if (filters.timeOfDay !== 'all') params.set('timeOfDay', filters.timeOfDay);

    const newUrl = params.toString() ? `/calendar?${params.toString()}` : '/calendar';
    router.replace(newUrl, { scroll: false });
  }, [filters, router, isInitialized]);

  // Load reference data and connections (for connected filter)
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        setReferenceDataLoading(true);
        const response = await fetch('/api/reference-data');
        if (!response.ok) throw new Error('Failed to fetch reference data');

        const data = await response.json();
        setDirectors(data.directors || []);
        setCampuses(data.campuses || []);

        const statusesData = data.statuses && data.statuses.length > 0
          ? data.statuses
          : [
            { id: 1, value: 'active' },
            { id: 2, value: 'follow-up' },
            { id: 3, value: 'invited' },
            { id: 4, value: 'pipeline' },
            { id: 5, value: 'on-boarding' },
            { id: 6, value: 'paused' },
            { id: 7, value: 'off-boarding' },
            { id: 8, value: 'archive' },
          ];
        setStatuses(statusesData);

        setCircleTypes(data.circleTypes || []);

        const { data: connectionsData, error: connectionsError } = await supabase
          .from('connections')
          .select('circle_leader_id');

        if (!connectionsError && connectionsData) {
          setConnectedLeaderIds(new Set(connectionsData.map(c => c.circle_leader_id)));
        }
      } catch (e) {
        console.error('Error loading reference data for calendar:', e);
        setStatuses([
          { id: 1, value: 'active' },
          { id: 2, value: 'follow-up' },
          { id: 3, value: 'invited' },
          { id: 4, value: 'pipeline' },
          { id: 5, value: 'on-boarding' },
          { id: 6, value: 'paused' },
          { id: 7, value: 'off-boarding' },
          { id: 8, value: 'archive' },
        ]);
      } finally {
        setReferenceDataLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  // Load leaders when filters change (server-side portion)
  useEffect(() => {
    if (!isInitialized) return;

    const serverFilters: CircleLeaderFilters = {
      campus: filters.campus,
      acpd: filters.acpd,
      status: filters.status.filter(s => s !== 'follow-up'),
      meetingDay: filters.meetingDay,
      circleType: filters.circleType,
      eventSummary: filters.eventSummary,
      // NOTE: connected + timeOfDay handled client-side to match Leaders page behavior
    };

    loadCircleLeaders(serverFilters);
  }, [filters, isInitialized, loadCircleLeaders]);

  // Apply the same client-side filters as Leaders page
  const filteredLeaders = useMemo(() => {
    let filtered = [...circleLeaders];

    // Follow-up status filter (client-side only)
    if (filters.status.length > 0 && filters.status.includes('follow-up')) {
      if (filters.status.length === 1 && filters.status[0] === 'follow-up') {
        filtered = filtered.filter(leader => leader.follow_up_required);
      } else {
        filtered = filtered.filter(leader => {
          const statusMatch = filters.status.some(status => status !== 'follow-up' && status === leader.status);
          const followUpMatch = leader.follow_up_required;
          return statusMatch || followUpMatch;
        });
      }
    }

    // Connected filter
    if (filters.connected === 'connected') {
      filtered = filtered.filter(leader => connectedLeaderIds.has(leader.id));
    } else if (filters.connected === 'not_connected') {
      filtered = filtered.filter(leader => !connectedLeaderIds.has(leader.id));
    }

    // Time of Day filter (match Leaders page logic)
    if (filters.timeOfDay === 'am' || filters.timeOfDay === 'pm') {
      filtered = filtered.filter(leader => {
        if (!leader.time) return false;

        const ampmMatch = leader.time.match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i);
        if (ampmMatch) {
          const period = ampmMatch[3].toUpperCase();
          return filters.timeOfDay === 'am' ? period === 'AM' : period === 'PM';
        }

        const time24Match = leader.time.match(/^(\d{1,2}):(\d{2})$/);
        if (time24Match) {
          const hour = parseInt(time24Match[1], 10);
          if (filters.timeOfDay === 'am') return hour >= 0 && hour < 12;
          return hour >= 12 && hour <= 23;
        }

        return false;
      });
    }

    // Sort by name (client-side)
    return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [circleLeaders, connectedLeaderIds, filters]);

  return (
    <>
      <CalendarFilterPanel
        filters={filters}
        onFiltersChange={(next) => updateFilters(next)}
        onClearAllFilters={clearAllFilters}
        totalLeaders={filteredLeaders.length}
        directors={directors}
        campuses={campuses}
        statuses={statuses}
        circleTypes={circleTypes}
      />

      <CircleMeetingsCalendar
        leaders={filteredLeaders}
        isLoading={isLoading || referenceDataLoading}
        loadError={error}
      />
    </>
  );
}
