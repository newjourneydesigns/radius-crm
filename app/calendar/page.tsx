'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import CircleMeetingsCalendar from '../../components/calendar/CircleMeetingsCalendar';
import CalendarFilterPanel from '../../components/calendar/CalendarFilterPanel';
import { useLeaderFilters } from '../../hooks/useLeaderFilters';
import { useCircleLeaders, type CircleLeaderFilters } from '../../hooks/useCircleLeaders';
import { supabase } from '../../lib/supabase';
import { ensureDefaultFrequencies } from '../../lib/frequencyUtils';

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
  const { circleLeaders, isLoading, error, loadCircleLeaders, setEventSummaryState } = useCircleLeaders();

  const [directors, setDirectors] = useState<DirectorItem[]>([]);
  const [campuses, setCampuses] = useState<RefItem[]>([]);
  const [statuses, setStatuses] = useState<RefItem[]>([]);
  const [circleTypes, setCircleTypes] = useState<RefItem[]>([]);
  const [frequencies, setFrequencies] = useState<RefItem[]>([]);
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
    filters.frequency.forEach(freq => params.append('frequency', freq));

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
        const response = await fetch('/api/reference-data/');
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

        setFrequencies(ensureDefaultFrequencies(data.frequencies || []));

        // Query connections for current month only (consistent with dashboard and leaders page)
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const startDate = firstDayOfMonth.toISOString().split('T')[0];
        const endDate = lastDayOfMonth.toISOString().split('T')[0];

        const { data: connectionsData, error: connectionsError } = await supabase
          .from('connections')
          .select('circle_leader_id')
          .gte('date_of_connection', startDate)
          .lte('date_of_connection', endDate);

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

        // Also derive campuses/directors/circleTypes from actual circle_leaders data
        // (keeps filter options usable even if the API route is unavailable)
        try {
          const { data: actualData, error: actualError } = await supabase
            .from('circle_leaders')
            .select('campus, acpd, circle_type, frequency')
            .order('campus');

          if (!actualError && actualData) {
            const uniqueCampuses = Array.from(new Set(actualData.map(i => i.campus).filter(Boolean) as string[])).sort();
            const uniqueDirectors = Array.from(new Set(actualData.map(i => i.acpd).filter(Boolean) as string[])).sort();
            const EXCLUDED_CT = new Set(['[object Object]', 'Admin', 'Circle', "YA | Couple's"]);
            const uniqueCircleTypes = Array.from(new Set(actualData.map(i => i.circle_type).filter(v => Boolean(v) && typeof v === 'string' && !EXCLUDED_CT.has(v)) as string[])).sort();
            const uniqueFrequencies = Array.from(new Set(actualData.map(i => i.frequency).filter(Boolean) as string[])).sort();

            setCampuses(uniqueCampuses.map((value, idx) => ({ id: 1000 + idx, value })));
            setDirectors(uniqueDirectors.map((name, idx) => ({ id: 1000 + idx, name })));
            setCircleTypes(uniqueCircleTypes.map((value, idx) => ({ id: 1000 + idx, value })));
            setFrequencies(ensureDefaultFrequencies(uniqueFrequencies.map((value, idx) => ({ id: 1000 + idx, value }))));
          }
        } catch (err) {
          console.error('Error deriving filter options from circle_leaders:', err);
        }
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
      frequency: filters.frequency,
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

  // Fallback: if reference-data fails/returns empty, derive filter options from loaded leaders
  const derivedCampuses = useMemo(() => {
    const values = new Set<string>();
    campuses.forEach(c => c?.value && values.add(c.value));
    circleLeaders.forEach(l => l?.campus && values.add(l.campus));
    filters.campus.forEach(v => v && values.add(v));
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value, idx) => ({ id: idx + 1, value }));
  }, [campuses, circleLeaders, filters.campus]);

  const derivedDirectors = useMemo(() => {
    const names = new Set<string>();
    directors.forEach(d => d?.name && names.add(d.name));
    circleLeaders.forEach(l => l?.acpd && names.add(l.acpd));
    filters.acpd.forEach(v => v && names.add(v));
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name, idx) => ({ id: idx + 1, name }));
  }, [directors, circleLeaders, filters.acpd]);

  const derivedCircleTypes = useMemo(() => {
    const EXCLUDED_CIRCLE_TYPES = new Set(['[object Object]', 'Admin', 'Circle', "YA | Couple's"]);
    const values = new Set<string>();
    circleTypes.forEach(t => t?.value && !EXCLUDED_CIRCLE_TYPES.has(t.value) && values.add(t.value));
    circleLeaders.forEach(l => l?.circle_type && typeof l.circle_type === 'string' && !EXCLUDED_CIRCLE_TYPES.has(l.circle_type) && values.add(l.circle_type));
    filters.circleType.forEach(v => v && !EXCLUDED_CIRCLE_TYPES.has(v) && values.add(v));
    // Ensure YA sub-types are always present
    values.add("YA | Men's");
    values.add("YA | Women's");
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value, idx) => ({ id: idx + 1, value }));
  }, [circleTypes, circleLeaders, filters.circleType]);

  const derivedFrequencies = useMemo(() => {
    const values = new Set<string>();
    frequencies.forEach(f => f?.value && values.add(f.value));
    circleLeaders.forEach(l => l?.frequency && values.add(l.frequency));
    filters.frequency.forEach(v => v && values.add(v));
    return ensureDefaultFrequencies(
      Array.from(values)
        .sort((a, b) => a.localeCompare(b))
        .map((value, idx) => ({ id: idx + 1, value }))
    );
  }, [frequencies, circleLeaders, filters.frequency]);

  return (
    <>
      <CalendarFilterPanel
        filters={filters}
        onFiltersChange={(next) => updateFilters(next)}
        onClearAllFilters={clearAllFilters}
        totalLeaders={filteredLeaders.length}
        directors={derivedDirectors}
        campuses={derivedCampuses}
        statuses={statuses}
        circleTypes={derivedCircleTypes}
        frequencies={derivedFrequencies}
      />

      <CircleMeetingsCalendar
        leaders={filteredLeaders}
        isLoading={isLoading || referenceDataLoading}
        loadError={error}
        onSetEventSummaryState={setEventSummaryState}
      />
    </>
  );
}
