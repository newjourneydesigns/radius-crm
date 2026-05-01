
'use client';

import { ensureDefaultFrequencies, formatFrequencyLabel } from '../../../lib/frequencyUtils';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Cake, Lightbulb } from 'lucide-react';
import { supabase, type CircleLeader, type EventSummaryState } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import AlertModal from '../../../components/ui/AlertModal';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import LogConnectionModal from '../../../components/dashboard/LogConnectionModal';
import ConnectPersonModal from '../../../components/modals/ConnectPersonModal';
import EventSummaryReminderModal from '../../../components/modals/EventSummaryReminderModal';
import CCBPersonLookup from '../../../components/ui/CCBPersonLookup';
import type { CCBPerson } from '../../../components/ui/CCBPersonLookup';
import EventExplorerModal from '../../../components/modals/EventExplorerModal';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AddToBoardModal from '../../../components/modals/AddToBoardModal';

import AttendanceTrends from '../../../components/circle/AttendanceTrends';
import CircleLeaderProfileSkeleton from '../../../components/circle/CircleLeaderProfileSkeleton';
import { useRealtimeSubscription, RealtimeSubscriptionConfig } from '../../../hooks/useRealtimeSubscription';
import { getEventSummaryButtonLabel, getEventSummaryColors, getEventSummaryState } from '../../../lib/event-summary-utils';
import { calculateSuggestedScore, getFinalScore } from '../../../lib/evaluationQuestions';

// Helper function to format time to AM/PM
const formatTimeToAMPM = (time: string | undefined | null): string => {
  if (!time) return 'Not scheduled';
  
  // If already in AM/PM format, return as is
  if (time.includes('AM') || time.includes('PM')) {
    return time;
  }
  
  // Convert 24-hour format to 12-hour format
  const [hours, minutes] = time.split(':');
  const hour24 = parseInt(hours);
  
  if (hour24 === 0) {
    return `12:${minutes} AM`;
  } else if (hour24 < 12) {
    return `${hour24}:${minutes} AM`;
  } else if (hour24 === 12) {
    return `12:${minutes} PM`;
  } else {
    return `${hour24 - 12}:${minutes} PM`;
  }
};

// Helper function to convert AM/PM time to 24-hour format for HTML time input
const convertAMPMTo24Hour = (time: string | undefined | null): string => {
  if (!time) return '';
  
  // If already in 24-hour format, return as is
  if (!time.includes('AM') && !time.includes('PM')) {
    return time;
  }
  
  const [timePart, period] = time.split(' ');
  const [hours, minutes] = timePart.split(':');
  let hour24 = parseInt(hours);
  
  if (period === 'AM' && hour24 === 12) {
    hour24 = 0;
  } else if (period === 'PM' && hour24 !== 12) {
    hour24 += 12;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes}`;
};

// Helper function to get follow-up date status
const getFollowUpStatus = (dateString: string | undefined | null): { 
  isOverdue: boolean; 
  isApproaching: boolean; 
  daysUntil: number;
} => {
  if (!dateString) return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  
  try {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const followUpDate = new Date(year, month - 1, day); // month is 0-indexed
    const today = new Date();
    
    // Reset time to compare just dates
    followUpDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = followUpDate.getTime() - today.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      isOverdue: daysUntil < 0,
      isApproaching: daysUntil >= 0 && daysUntil <= 3, // Approaching if within 3 days
      daysUntil
    };
  } catch (error) {
    return { isOverdue: false, isApproaching: false, daysUntil: 0 };
  }
};

const getLocalISODate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to format date for display (avoiding timezone issues)
const formatDateForDisplay = (dateString: string | undefined | null): string => {
  if (!dateString) return 'Not set';
  
  try {
    // Parse the date as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
  } catch (error) {
    return dateString; // Fallback to raw string
  }
};

// Helper function to convert AM/PM time to 24-hour format for input
const convertToMilitaryTime = (time: string | undefined | null): string => {
  if (!time) return '';
  
  // If already in 24-hour format, return as is
  if (!time.includes('AM') && !time.includes('PM')) {
    return time;
  }
  
  const [timePart, period] = time.split(' ');
  const [hours, minutes] = timePart.split(':');
  let hour24 = parseInt(hours);
  
  if (period === 'AM' && hour24 === 12) {
    hour24 = 0;
  } else if (period === 'PM' && hour24 !== 12) {
    hour24 += 12;
  }
  
  return `${hour24.toString().padStart(2, '0')}:${minutes}`;
};

// Helper function to format date and time for display
const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};


const uniqueByValue = <T extends { value: string }>(items: T[]): T[] => {
  const map = new Map<string, T>();
  for (const item of items || []) {
    const key = (item?.value || '').trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
};

const normalizeCircleTypeValue = (value: string | undefined | null): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^Young\s*Adult\s*\|\s*(.+)$/i);
  if (m && m[1]) return `YA | ${m[1].trim()}`;
  return raw;
};

export default function CircleLeaderProfilePage() {
  const params = useParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;
  const { user, isAdmin } = useAuth();
  const [scorecardSummary, setScorecardSummary] = useState<{ reach: number; connect: number; disciple: number; develop: number; average: number } | null>(null);

  const [leader, setLeader] = useState<CircleLeader | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdatingEventSummary, setIsUpdatingEventSummary] = useState(false);
  const [isUpdatingFollowUp, setIsUpdatingFollowUp] = useState(false);
  const [showFollowUpDateModal, setShowFollowUpDateModal] = useState(false);
  const [followUpDateValue, setFollowUpDateValue] = useState('');
  const [followUpNoteValue, setFollowUpNoteValue] = useState('');
  const [showAddToBoardModal, setShowAddToBoardModal] = useState(false);
  const [savedFollowUpDate, setSavedFollowUpDate] = useState('');
  const [showClearFollowUpConfirm, setShowClearFollowUpConfirm] = useState(false);
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });
  const [editedLeader, setEditedLeader] = useState<Partial<CircleLeader>>({});
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const [leaderError, setLeaderError] = useState('');
  const [directors, setDirectors] = useState<Array<{id: number, name: string}>>([]);
  const [showLogConnectionModal, setShowLogConnectionModal] = useState(false);
  const [showConnectPersonModal, setShowConnectPersonModal] = useState(false);
  const [showEventSummaryReminderModal, setShowEventSummaryReminderModal] = useState(false);
  const [showEventExplorerModal, setShowEventExplorerModal] = useState(false);
  const [sentReminderMessages, setSentReminderMessages] = useState<number[]>([]);
  const [eventSummaryEnumAvailable, setEventSummaryEnumAvailable] = useState<boolean | null>(null);
  const [eventSummaryEnumWarningShown, setEventSummaryEnumWarningShown] = useState(false);
  const [phoneActionModal, setPhoneActionModal] = useState<{ phone: string; name: string } | null>(null);
  
  // Key to force AttendanceTrends refresh after pulling event summaries
  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [rosterCount, setRosterCount] = useState<number | null>(null);

  // Extract CCB Group ID from profile link URL (e.g. /groups/3682/events -> 3682)
  const extractCcbGroupId = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const match = url.match(/\/groups\/(\d+)/i);
    return match ? match[1] : null;
  };

  // Reference data state
  const [campuses, setCampuses] = useState<Array<{id: number, value: string}>>([]);
  const [statuses, setStatuses] = useState<Array<{id: number, value: string}>>([]);
  const [circleTypes, setCircleTypes] = useState<Array<{id: number, value: string}>>([]);
  const [frequencies, setFrequencies] = useState<Array<{id: number, value: string}>>([]);

  useEffect(() => {
    // Load all data in parallel for faster page load
    const loadLeaderData = async () => {
      try {
        // Fire ALL independent queries in parallel
        const [
          leaderResult,
          directorsResult,
          campusesResult,
          statusesResult,
          circleTypesResult,
          frequenciesResult,
        ] = await Promise.all([
          supabase.from('circle_leaders').select('*').eq('id', leaderId).single(),
          supabase.from('acpd_list').select('id, name').eq('active', true).order('name'),
          supabase.from('campuses').select('*').order('value'),
          supabase.from('statuses').select('*').order('value'),
          supabase.from('circle_types').select('*').order('value'),
          supabase.from('frequencies').select('*').order('value'),
        ]);

        // Process leader
        if (leaderResult.data && !leaderResult.error) {
          // Auto-populate ccb_group_id from profile link if missing
          const ld = leaderResult.data;
          if (!ld.ccb_group_id && ld.ccb_profile_link) {
            const extracted = ld.ccb_profile_link.match(/\/groups\/(\d+)/i);
            if (extracted) {
              ld.ccb_group_id = extracted[1];
              // Persist it silently
              supabase.from('circle_leaders').update({ ccb_group_id: extracted[1] }).eq('id', leaderId).then();
            }
          }
          setLeader(ld);

          // Fetch roster count from cache
          if (ld.ccb_group_id) {
            supabase
              .from('circle_roster_cache')
              .select('id', { count: 'exact', head: true })
              .eq('circle_leader_id', leaderId)
              .then(({ count }) => {
                if (count !== null) setRosterCount(count);
              });
          }
        } else {
          setLeader({
            id: leaderId,
            name: 'John Smith',
            email: 'john.smith@email.com',
            phone: '(555) 123-4567',
            campus: 'Downtown',
            acpd: 'Jane Doe',
            status: 'active',
            day: 'Tuesday',
            time: '19:00',
            frequency: 'Weekly',
            circle_type: "Men's",
            event_summary_received: true,
            event_summary_skipped: false
          });
        }

        // Process directors
        if (directorsResult.data && !directorsResult.error) {
          setDirectors(directorsResult.data);
        } else {
          setDirectors([
            { id: 1, name: 'Jane Doe' },
            { id: 2, name: 'John Smith' },
            { id: 3, name: 'Trip Ochenski' },
            { id: 4, name: 'Sarah Johnson' },
            { id: 5, name: 'Mike Wilson' }
          ]);
        }

        // Process reference data
        if (campusesResult.data) setCampuses(campusesResult.data);
        if (statusesResult.data) setStatuses(uniqueByValue(statusesResult.data));
        if (circleTypesResult.data) {
          const normalized = circleTypesResult.data.map((t: any) => ({
            ...t,
            value: normalizeCircleTypeValue(t.value)
          }));
          setCircleTypes(uniqueByValue(normalized));
        }
        if (frequenciesResult.data) setFrequencies(uniqueByValue(ensureDefaultFrequencies(frequenciesResult.data)));

      } catch (error) {
        console.error('Error loading leader data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderData();
    (async () => {
      const [evalsResult, directResult] = await Promise.all([
        supabase
          .from('leader_category_evaluations')
          .select('id, category, manual_override_score')
          .eq('leader_id', leaderId),
        supabase
          .from('circle_leader_scores')
          .select('reach_score, connect_score, disciple_score, develop_score')
          .eq('circle_leader_id', leaderId)
          .order('scored_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      const evals = evalsResult.data || [];
      const directRow = directResult.data?.[0] || null;

      let answersByEval: Record<number, Record<string, 'yes' | 'no' | 'unsure' | null>> = {};
      if (evals.length > 0) {
        const { data: answers } = await supabase
          .from('leader_category_answers')
          .select('evaluation_id, question_key, answer')
          .in('evaluation_id', evals.map((e: any) => e.id));
        for (const a of (answers || [])) {
          if (!answersByEval[a.evaluation_id]) answersByEval[a.evaluation_id] = {};
          answersByEval[a.evaluation_id][a.question_key] = a.answer;
        }
      }

      const evalByCategory: Record<string, any> = {};
      for (const e of evals) evalByCategory[e.category] = e;

      const dims = ['reach', 'connect', 'disciple', 'develop'] as const;
      const computed: Record<string, number | null> = {};
      for (const dim of dims) {
        const ev = evalByCategory[dim];
        const override = ev?.manual_override_score ?? null;
        const suggested = ev ? calculateSuggestedScore(answersByEval[ev.id] || {}) : null;
        const fallback = directRow ? (directRow as any)[`${dim}_score`] : null;
        computed[dim] = getFinalScore(override, suggested, fallback);
      }

      const { reach, connect, disciple, develop } = computed;
      const vals = [reach, connect, disciple, develop].filter((v): v is number => v !== null);
      if (vals.length === 4) {
        const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
        setScorecardSummary({ reach: reach!, connect: connect!, disciple: disciple!, develop: develop!, average: avg });
      }
    })();
  }, [leaderId]);

  // ── Auto-sync attendance from CCB if stale (>6 days) ──────────────
  const attendanceSyncAttempted = useRef(false);
  useEffect(() => {
    if (!leader?.name || !leader?.ccb_group_id || attendanceSyncAttempted.current) return;
    attendanceSyncAttempted.current = true;

    (async () => {
      try {
        // Check the most recent synced_at for this leader
        const { data: latest } = await supabase
          .from('circle_meeting_occurrences')
          .select('synced_at')
          .eq('leader_id', leaderId)
          .not('synced_at', 'is', null)
          .order('synced_at', { ascending: false })
          .limit(1)
          .single();

        const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
        const isStale = !latest?.synced_at ||
          (Date.now() - new Date(latest.synced_at).getTime()) > sixDaysMs;

        if (!isStale) return;

        console.log(`🔄 Attendance data stale for leader ${leaderId} (${leader.name}), auto-syncing from CCB…`);

        // Use the event-attendance API (searches CCB by name + date range)
        // and writes through to circle_meeting_occurrences automatically
        const today = new Date();
        const fourWeeksAgo = new Date(today);
        fourWeeksAgo.setDate(today.getDate() - 28);

        const res = await fetch('/api/ccb/event-attendance/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: fourWeeksAgo.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0],
            groupName: leader.name,
          }),
        });

        if (res.ok) {
          const result = await res.json();
          console.log(`✅ Attendance auto-sync complete for ${leader.name}: ${result.count || 0} events`);
          if (result.count > 0) {
            setAttendanceRefreshKey((k) => k + 1);
          }
        } else {
          console.warn(`⚠️ Attendance auto-sync failed for ${leader.name}:`, res.status);
        }
      } catch (err) {
        console.warn('Attendance auto-sync error:', err);
      }
    })();
  }, [leader?.name, leader?.ccb_group_id, leaderId]);

  // ── Supabase Real-Time for this leader ────────────────────────────
  const realtimeDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Lightweight reload of just the leader row (used by real-time)
  const reloadLeader = useCallback(async () => {
    const { data } = await supabase
      .from('circle_leaders')
      .select('*')
      .eq('id', leaderId)
      .single();
    if (data) setLeader(data);
  }, [leaderId]);

  const handleLeaderRealtime = useCallback(
    (payload: any) => {
      const table = (payload as any).table as string;
      if (realtimeDebounce.current[table]) clearTimeout(realtimeDebounce.current[table]);
      realtimeDebounce.current[table] = setTimeout(() => {
        if (table === 'circle_leaders') reloadLeader();
      }, 300);
    },
    [reloadLeader],
  );

  const leaderRealtimeSubs: RealtimeSubscriptionConfig[] = useMemo(() => [
    { table: 'circle_leaders', event: 'UPDATE', filter: `id=eq.${leaderId}` },
  ], [leaderId]);

  useRealtimeSubscription(
    `leader-${leaderId}`,
    leaderRealtimeSubs,
    handleLeaderRealtime,
    leaderId > 0,
  );

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(realtimeDebounce.current).forEach(clearTimeout);
    };
  }, []);

  // Quick Action Handlers
  const handleSendEmail = () => {
    if (!leader) return;
    
    const emails: string[] = [];
    const names: string[] = [];
    
    if (leader.email) {
      emails.push(leader.email);
      names.push(leader.name.split(' ')[0]);
    }
    
    if (leader.additional_leader_email) {
      emails.push(leader.additional_leader_email);
      names.push(leader.additional_leader_name?.split(' ')[0] || 'there');
    }
    
    if (emails.length === 0) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Email Address',
        message: 'No email address available for this leader.'
      });
      return;
    }
    
    const subject = `Circle Leader Communication - ${leader.name}`;
    const greeting = names.length > 1 ? `Hi ${names.join(' and ')}!` : `Hi ${names[0]}!`;
    const mailtoUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(greeting)}`;
    
    window.open(mailtoUrl, '_blank');
  };

  const openEmailLink = (email: string, name: string) => {
    const subject = `Circle Leader Communication - ${name}`;
    const greeting = `Hi ${name.split(' ')[0]}!`;
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(greeting)}`, '_blank');
  };

  const callNumber = (phone: string) => {
    window.open(`tel:${phone.replace(/\D/g, '')}`, '_self');
  };

  const textNumber = (phone: string, name: string) => {
    const greeting = `Hi ${name.split(' ')[0]}!`;
    window.open(`sms:${phone.replace(/\D/g, '')}?body=${encodeURIComponent(greeting)}`, '_blank');
  };

  // Load sent reminder messages for this week
  useEffect(() => {
    const loadSentReminderMessages = async () => {
      if (!leaderId) return;

      try {
        // Get the current week's Saturday boundary at 11:59:59 PM CT
        // Week runs from Saturday 11:59:59 PM CT to next Saturday 11:59:59 PM CT
        const now = new Date();
        
        // Convert to Central Time
        const ctTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        
        // Find the most recent Saturday at 11:59:59 PM CT
        const dayOfWeek = ctTime.getDay(); // 0 = Sunday, 6 = Saturday
        let daysToLastSaturday = dayOfWeek === 6 ? 0 : (dayOfWeek + 1);
        
        const lastSaturday = new Date(ctTime);
        lastSaturday.setDate(ctTime.getDate() - daysToLastSaturday);
        lastSaturday.setHours(23, 59, 59, 999); // 11:59:59 PM
        
        // If we haven't passed Saturday 11:59:59 PM yet this week, use previous Saturday
        if (ctTime < lastSaturday) {
          lastSaturday.setDate(lastSaturday.getDate() - 7);
        }
        
        const weekStartStr = lastSaturday.toISOString().split('T')[0];

        // Query followups for this leader and this week
        const { data, error } = await supabase
          .from('event_summary_followups')
          .select('message_number')
          .eq('circle_leader_id', leaderId)
          .eq('week_start_date', weekStartStr);

        if (data && !error) {
          setSentReminderMessages(data.map(row => row.message_number));
        }
      } catch (error) {
        console.error('Error loading sent reminder messages:', error);
      }
    };

    loadSentReminderMessages();
  }, [leaderId, leader?.event_summary_received, leader?.event_summary_skipped]);

  // Helper function to get week start date (Saturday at 11:59:59 PM CT)
  const getWeekStartDate = () => {
    const now = new Date();
    
    // Convert to Central Time
    const ctTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    
    // Find the most recent Saturday at 11:59:59 PM CT
    const dayOfWeek = ctTime.getDay(); // 0 = Sunday, 6 = Saturday
    let daysToLastSaturday = dayOfWeek === 6 ? 0 : (dayOfWeek + 1);
    
    const lastSaturday = new Date(ctTime);
    lastSaturday.setDate(ctTime.getDate() - daysToLastSaturday);
    lastSaturday.setHours(23, 59, 59, 999); // 11:59:59 PM
    
    // If we haven't passed Saturday 11:59:59 PM yet this week, use previous Saturday
    if (ctTime < lastSaturday) {
      lastSaturday.setDate(lastSaturday.getDate() - 7);
    }
    
    return lastSaturday.toISOString().split('T')[0];
  };

  const handleSendEventSummaryReminder = async (messageNumber: number, messageText: string) => {
    if (!leader || !user?.id) return;

    try {
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      // Create note with timestamp and message number
      const noteContent = `[Event Summary Reminder ${messageNumber} - ${today}]\n\n${messageText}`;

      // Save to notes
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: leaderId,
          content: noteContent,
          created_by: user.id
        });

      if (noteError) throw noteError;

      // Save to event_summary_followups for tracking
      const { error: followupError } = await supabase
        .from('event_summary_followups')
        .insert({
          circle_leader_id: leaderId,
          message_number: messageNumber,
          sent_by: user.id,
          week_start_date: getWeekStartDate()
        });

      if (followupError) throw followupError;

      // Update sent messages state
      setSentReminderMessages(prev => [...prev, messageNumber]);

      // Open Messages app if leader has phone
      if (leader.phone) {
        const cleanPhone = leader.phone.replace(/\D/g, '');
        const encodedMessage = encodeURIComponent(messageText);
        const smsUrl = `sms:${cleanPhone}&body=${encodedMessage}`;
        window.location.href = smsUrl;
      }

      // Show success message
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Reminder Sent',
        message: leader.phone 
          ? 'The reminder has been saved to notes and Messages app opened.' 
          : 'The reminder has been saved to notes.'
      });
    } catch (error) {
      console.error('Error sending reminder:', error);
      throw error;
    }
  };

  const handleConnectPerson = async (personName: string, phone: string, email: string, message: string) => {
    if (!leader || !user?.id) return;

    try {
      // Get today's date
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      // Create note with timestamp
      const noteContent = `[Connect Person Referral - ${today}]\n\n${message}`;

      // Save to notes
      const { data, error } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: leaderId,
          content: noteContent,
          created_by: user.id
        })
        .select('*')
        .single();

      if (error) throw error;

      // Open Messages app if leader has phone
      if (leader.phone) {
        const cleanPhone = leader.phone.replace(/\D/g, '');
        const encodedMessage = encodeURIComponent(message);
        const smsUrl = `sms:${cleanPhone}&body=${encodedMessage}`;
        window.location.href = smsUrl;
      }

      // Show success message
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Referral Saved',
        message: leader.phone 
          ? 'The referral has been saved to notes and Messages app opened.' 
          : 'The referral has been saved to notes.'
      });
    } catch (error) {
      console.error('Error saving referral:', error);
      throw error; // Re-throw so modal can show error
    }
  };

  const handleSendSMS = () => {
    if (!leader) return;
    
    const phones: string[] = [];
    const names: string[] = [];
    
    if (leader.phone) {
      phones.push(leader.phone.replace(/\D/g, ''));
      names.push(leader.name.split(' ')[0]);
    }
    
    if (leader.additional_leader_phone) {
      phones.push(leader.additional_leader_phone.replace(/\D/g, ''));
      names.push(leader.additional_leader_name?.split(' ')[0] || 'there');
    }
    
    if (phones.length === 0) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'No phone number available for this leader.'
      });
      return;
    }
    
    const greeting = names.length > 1 ? `Hi ${names.join(' and ')}!` : `Hi ${names[0]}!`;
    
    if (phones.length === 1) {
      // Single SMS
      const smsUrl = `sms:${phones[0]}?body=${encodeURIComponent(greeting)}`;
      window.open(smsUrl, '_blank');
    } else {
      // Multiple SMS - open each separately
      phones.forEach((phone, index) => {
        const individualGreeting = `Hi ${names[index]}!`;
        const smsUrl = `sms:${phone}?body=${encodeURIComponent(individualGreeting)}`;
        setTimeout(() => window.open(smsUrl, '_blank'), index * 100); // Slight delay to avoid conflicts
      });
    }
  };

  const handleCallLeader = () => {
    if (!leader) return;
    
    const phones: string[] = [];
    
    if (leader.phone) {
      phones.push(leader.phone.replace(/\D/g, ''));
    }
    
    if (leader.additional_leader_phone) {
      phones.push(leader.additional_leader_phone.replace(/\D/g, ''));
    }
    
    if (phones.length === 0) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Phone Number',
        message: 'No phone number available for this leader.'
      });
      return;
    }
    
    if (phones.length === 1) {
      // Single call
      const telUrl = `tel:${phones[0]}`;
      window.open(telUrl, '_self');
    } else {
      // Multiple phones - let user choose
      const primaryName = leader.name.split(' ')[0];
      const additionalName = leader.additional_leader_name?.split(' ')[0] || 'Additional Leader';
      const choice = window.confirm(`Choose who to call:\nOK = ${primaryName} (${leader.phone})\nCancel = ${additionalName} (${leader.additional_leader_phone})`);
      
      const selectedPhone = choice ? phones[0] : phones[1];
      const telUrl = `tel:${selectedPhone}`;
      window.open(telUrl, '_self');
    }
  };

  const handleContactClick = () => {
    const hasMainEmail = !!leader?.email;
    const hasMainPhone = !!leader?.phone;
    const hasAdditionalEmail = !!leader?.additional_leader_email;
    const hasAdditionalPhone = !!leader?.additional_leader_phone;
    
    const hasAnyEmail = hasMainEmail || hasAdditionalEmail;
    const hasAnyPhone = hasMainPhone || hasAdditionalPhone;
    
    if (!hasAnyEmail && !hasAnyPhone) {
      setShowAlert({
        isOpen: true,
        type: 'warning',
        title: 'No Contact Information',
        message: 'No email or phone number available for this leader.'
      });
      return;
    }
    
    // If both email and phone exist, show options
    if (hasAnyEmail && hasAnyPhone) {
      const choice = window.confirm('Choose contact method:\nOK = Email\nCancel = Phone');
      if (choice) {
        handleSendEmail();
      } else {
        handleCallLeader();
      }
    } else if (hasAnyEmail) {
      handleSendEmail();
    } else if (hasAnyPhone) {
      handleCallLeader();
    }
  };

  const handleSetEventSummaryState = async (nextState: EventSummaryState) => {
    if (!leader) return;

    setIsUpdatingEventSummary(true);
    const legacyPayload: Record<string, boolean> = {
      event_summary_received: nextState === 'received',
      // Legacy had only one "did not meet" state via event_summary_skipped.
      // Map both did_not_meet and skipped into the legacy skipped flag.
      event_summary_skipped: nextState === 'did_not_meet' || nextState === 'skipped',
    };

    try {
      // Prefer the new enum column when present, but also keep legacy columns in sync.
      let { error } = await supabase
        .from('circle_leaders')
        .update({ event_summary_state: nextState, ...legacyPayload })
        .eq('id', leaderId);

      // Backward-compat: if event_summary_state doesn't exist yet, fall back to legacy booleans.
      if (error && /event_summary_state/i.test(error.message || '')) {
        setEventSummaryEnumAvailable(false);

        // The legacy schema cannot distinguish 'did_not_meet' vs 'skipped'.
        // To avoid a misleading UI state, treat 'skipped' as 'did_not_meet' until the migration is applied.
        if (nextState === 'skipped') {
          nextState = 'did_not_meet';
          legacyPayload.event_summary_received = false;
          legacyPayload.event_summary_skipped = true;

          if (!eventSummaryEnumWarningShown) {
            setEventSummaryEnumWarningShown(true);
            setShowAlert({
              isOpen: true,
              type: 'warning',
              title: 'Skipped not enabled yet',
              message: "Your database hasn't been migrated to the new 4-state event summary system yet. For now, 'Skipped' behaves like 'Did Not Meet'. Run the Supabase migration to fully enable Skipped."
            });
          }
        } else if ((nextState === 'did_not_meet') && !eventSummaryEnumWarningShown) {
          setEventSummaryEnumWarningShown(true);
          setShowAlert({
            isOpen: true,
            type: 'warning',
            title: '4-state migration needed',
            message: "Your database hasn't been migrated to the new 4-state event summary system yet. 'Did Not Meet' will work, but 'Skipped' can't be stored separately until you run the Supabase migration."
          });
        }

        ({ error } = await supabase
          .from('circle_leaders')
          .update(legacyPayload)
          .eq('id', leaderId));

        // If the legacy skipped column doesn't exist yet, retry without it.
        if (error && /event_summary_skipped/i.test(error.message || '')) {
          if (nextState === 'did_not_meet') {
            throw new Error('Did Not Meet/Skipped is not enabled yet. Apply the event summary migrations to your Supabase database first.');
          }

          ({ error } = await supabase
            .from('circle_leaders')
            .update({ event_summary_received: nextState === 'received' })
            .eq('id', leaderId));
        }
      }

      if (!error) {
        setEventSummaryEnumAvailable(true);
      }

      if (!error) {
        setLeader(prev => prev ? {
          ...prev,
          event_summary_state: nextState,
          ...legacyPayload,
        } : null);

        // Clear sent reminder messages when status changes to received or skipped
        if (nextState !== 'not_received') {
          setSentReminderMessages([]);
        }

        const statusText = nextState === 'received'
          ? 'marked as received'
          : nextState === 'did_not_meet'
            ? 'marked as did not meet'
            : nextState === 'skipped'
              ? 'marked as skipped'
              : 'marked as not received';

        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Event summary status ${statusText}.`,
              created_by: user?.id || null
            }
          ]);

        // When marked as "Yes" (received), sync last 3 weeks of attendance + roster from CCB
        if (nextState === 'received' && leader.ccb_group_id) {
          fetch('/api/ccb/sync-leader-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaderId }),
          })
            .then((res) => res.json())
            .then((result) => {
              if (result.success) {
                console.log(`✅ CCB sync complete for ${leader.name}: ${result.synced} events, roster=${result.rosterCount}`);
                // Refresh attendance graph
                setAttendanceRefreshKey((k) => k + 1);
                // Refresh roster count
                if (result.rosterRefreshed && result.rosterCount > 0) {
                  setRosterCount(result.rosterCount);
                }
              }
            })
            .catch((err) => console.warn('CCB sync after event summary failed (non-blocking):', err));
        }
      } else {
        console.error('Error updating event summary status:', error);
        setShowAlert({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update event summary status. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error updating event summary status:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update event summary status. Please try again.'
      });
    } finally {
      setIsUpdatingEventSummary(false);
    }
  };

  // Follow-up handlers
  const handleFollowUpClick = () => {
    if (!leader) return;

    if (leader.follow_up_required) {
      // Already enabled — ask if they want to turn it off
      setShowClearFollowUpConfirm(true);
    } else {
      // Not enabled — show date picker to set a follow-up
      setFollowUpDateValue('');
      setFollowUpNoteValue('');
      setShowFollowUpDateModal(true);
    }
  };

  const handleFollowUpSave = async () => {
    if (!leader || !followUpDateValue) return;

    setIsUpdatingFollowUp(true);
    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({
          follow_up_required: true,
          follow_up_date: followUpDateValue,
          follow_up_note: followUpNoteValue.trim() || null,
        })
        .eq('id', leaderId);

      if (!error) {
        // Update local state
        setLeader(prev => prev ? {
          ...prev,
          follow_up_required: true,
          follow_up_date: followUpDateValue,
          follow_up_note: followUpNoteValue.trim() || undefined,
        } : null);
        setShowFollowUpDateModal(false);

        // Create follow-up todo
        if (user?.id) {
          try {
            // First, clean up any old completed follow-up todos for this leader
            await supabase
              .from('todo_items')
              .delete()
              .eq('user_id', user.id)
              .eq('linked_leader_id', leaderId)
              .eq('todo_type', 'follow_up')
              .eq('completed', true);

            const { data: existingTodos } = await supabase
              .from('todo_items')
              .select('id')
              .eq('user_id', user.id)
              .eq('linked_leader_id', leaderId)
              .eq('todo_type', 'follow_up')
              .eq('completed', false);

            if (existingTodos && existingTodos.length > 0) {
              const { error: updateErr } = await supabase
                .from('todo_items')
                .update({ due_date: followUpDateValue })
                .eq('id', existingTodos[0].id);
              if (updateErr) console.error('Error updating follow-up todo:', updateErr);
            } else {
              const { error: insertErr } = await supabase
                .from('todo_items')
                .insert({
                  user_id: user.id,
                  text: `Follow up with ${leader.name}`,
                  completed: false,
                  due_date: followUpDateValue,
                  todo_type: 'follow_up',
                  linked_leader_id: leaderId
                });
              if (insertErr) console.error('Error inserting follow-up todo:', insertErr);
            }
          } catch (todoError) {
            console.error('Error creating follow-up todo:', todoError);
          }
        }

        // Add timeline note including the follow-up message entered in the modal
        const enabledNoteSuffix = followUpNoteValue.trim()
          ? ` Follow-up note: ${followUpNoteValue.trim()}`
          : '';
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Follow-up enabled with date ${followUpDateValue}.${enabledNoteSuffix}`,
              created_by: user?.id || null,
            },
          ]);

        setSavedFollowUpDate(followUpDateValue);
        setShowAddToBoardModal(true);
      } else {
        console.error('Error setting follow-up:', error);
        setShowAlert({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to set follow-up. Please try again.' });
      }
    } catch (error) {
      console.error('Error setting follow-up:', error);
      setShowAlert({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to set follow-up. Please try again.' });
    } finally {
      setIsUpdatingFollowUp(false);
    }
  };

  const handleClearFollowUp = async () => {
    if (!leader) return;

    setIsUpdatingFollowUp(true);
    setShowClearFollowUpConfirm(false);
    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({ follow_up_required: false, follow_up_date: null, follow_up_note: null })
        .eq('id', leaderId);

      if (!error) {
        setLeader(prev => prev ? { ...prev, follow_up_required: false, follow_up_date: undefined, follow_up_note: undefined } : null);

        // Add system note
        await supabase
          .from('notes')
          .insert([{ circle_leader_id: leaderId, content: 'Follow-up cleared.', created_by: user?.id || null }]);

        setShowAlert({ isOpen: true, type: 'success', title: 'Follow-Up Cleared', message: `Follow-up for ${leader.name} has been cleared.` });
      } else {
        console.error('Error clearing follow-up:', error);
        setShowAlert({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to clear follow-up. Please try again.' });
      }
    } catch (error) {
      console.error('Error clearing follow-up:', error);
      setShowAlert({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to clear follow-up. Please try again.' });
    } finally {
      setIsUpdatingFollowUp(false);
    }
  };

  const handleFollowUpDetailsChange = async (newDate: string, newNote: string) => {
    if (!leader) return;

    try {
      const { error } = await supabase
        .from('circle_leaders')
        .update({
          follow_up_date: newDate || null,
          follow_up_note: newNote.trim() || null,
        })
        .eq('id', leaderId);

      if (!error) {
        // Update local state
        setLeader(prev => prev ? {
          ...prev,
          follow_up_date: newDate || undefined,
          follow_up_note: newNote.trim() || undefined,
        } : null);
        setShowFollowUpDateModal(false);
        
        // Sync follow-up todo: create if missing, update due_date if exists
        if (user?.id) {
          try {
            // First, clean up any old completed follow-up todos for this leader
            await supabase
              .from('todo_items')
              .delete()
              .eq('user_id', user.id)
              .eq('linked_leader_id', leaderId)
              .eq('todo_type', 'follow_up')
              .eq('completed', true);

            // Check if a follow-up todo already exists for this leader
            const { data: existingTodos } = await supabase
              .from('todo_items')
              .select('id')
              .eq('user_id', user.id)
              .eq('linked_leader_id', leaderId)
              .eq('todo_type', 'follow_up')
              .eq('completed', false);

            if (newDate) {
              if (existingTodos && existingTodos.length > 0) {
                // Update the existing todo's due_date
                const { error: updateErr } = await supabase
                  .from('todo_items')
                  .update({ due_date: newDate })
                  .eq('id', existingTodos[0].id);
                if (updateErr) console.error('Error updating follow-up todo:', updateErr);
              } else {
                // Create a new follow-up todo
                const { error: insertErr } = await supabase
                  .from('todo_items')
                  .insert({
                    user_id: user.id,
                    text: `Follow up with ${leader.name}`,
                    completed: false,
                    due_date: newDate,
                    todo_type: 'follow_up',
                    linked_leader_id: leaderId
                  });
                if (insertErr) console.error('Error inserting follow-up todo:', insertErr);
              }
            }
          } catch (todoError) {
            console.error('Error syncing follow-up todo:', todoError);
            // Non-critical — don't block the main flow
          }
        }

        // Add a note about the date change
        const dateText = newDate ? `set to ${newDate}` : 'cleared';
        const noteText = newNote.trim()
          ? ` Follow-up note: ${newNote.trim()}`
          : ' Follow-up note cleared.';
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: `Follow-up date ${dateText}.${noteText}`,
              created_by: user?.id || null
            }
          ]);

      } else {
        console.error('Error updating follow-up date:', error);
        setShowAlert({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update follow-up date. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error updating follow-up date:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update follow-up date. Please try again.'
      });
    }
  };

  const handleEditLeader = () => {
    if (!leader) return;
    
    setIsEditing(true);
    const editData: Partial<CircleLeader> = {
      name: leader.name,
      email: leader.email,
      phone: leader.phone,
      campus: leader.campus,
      acpd: leader.acpd,
      status: leader.status,
      day: leader.day,
      time: leader.time,
      frequency: leader.frequency,
      meeting_start_date: leader.meeting_start_date,
      circle_type: leader.circle_type as CircleLeader['circle_type'],
      follow_up_required: leader.follow_up_required,
      follow_up_date: leader.follow_up_date,
      circle_name: leader.circle_name || leader.name || '',
      ccb_group_name: leader.ccb_group_name || '',
      ccb_profile_link: leader.ccb_profile_link,
      ccb_group_id: leader.ccb_group_id || extractCcbGroupId(leader.ccb_profile_link) || '',
      leader_ccb_profile_link: leader.leader_ccb_profile_link || '',
      birthday: leader.birthday || '',
      additional_leader_name: leader.additional_leader_name,
      additional_leader_phone: leader.additional_leader_phone,
      additional_leader_email: leader.additional_leader_email,
      additional_leader_birthday: leader.additional_leader_birthday || '',
      additional_leader_ccb_profile_link: leader.additional_leader_ccb_profile_link || '',
      check_in_cadence: leader.check_in_cadence || 'none',
    };
    
    setEditedLeader(editData);
  };

  const handleSaveLeader = async () => {
    if (!leader || !editedLeader) return;

    setIsSavingLeader(true);
    setLeaderError('');

    try {
      const { data, error } = await supabase
        .from('circle_leaders')
        .update({
          circle_name: editedLeader.circle_name || editedLeader.name || null,
          name: editedLeader.name,
          email: editedLeader.email || null,
          phone: editedLeader.phone || null,
          campus: editedLeader.campus || null,
          acpd: editedLeader.acpd || null,
          status: editedLeader.status || 'active',
          day: editedLeader.day || null,
          time: editedLeader.time || null,
          frequency: editedLeader.frequency || null,
          meeting_start_date: editedLeader.meeting_start_date || null,
          circle_type: editedLeader.circle_type || null,
          follow_up_required: editedLeader.follow_up_required || false,
          follow_up_date: editedLeader.follow_up_date || null,
          ccb_profile_link: editedLeader.ccb_profile_link || null,
          ccb_group_id: editedLeader.ccb_group_id || null,
          ccb_group_name: editedLeader.ccb_group_name || null,
          leader_ccb_profile_link: editedLeader.leader_ccb_profile_link || null,
          birthday: editedLeader.birthday || null,
          additional_leader_name: editedLeader.additional_leader_name || null,
          additional_leader_phone: editedLeader.additional_leader_phone || null,
          additional_leader_email: editedLeader.additional_leader_email || null,
          additional_leader_birthday: editedLeader.additional_leader_birthday || null,
          additional_leader_ccb_profile_link: editedLeader.additional_leader_ccb_profile_link || null,
          check_in_cadence: editedLeader.check_in_cadence || 'none',
        })
        .eq('id', leaderId)
        .select()
        .single();

      if (data && !error) {
        setLeader(data);
        setIsEditing(false);
        setEditedLeader({});
        
        // Add a note about the update
        await supabase
          .from('notes')
          .insert([
            {
              circle_leader_id: leaderId,
              content: 'Circle Leader information updated.',
              created_by: user?.id || null
            }
          ]);

      } else {
        console.error('Error updating leader:', error);
        setLeaderError('Failed to update leader information. Please try again.');
        setTimeout(() => setLeaderError(''), 5000);
      }
    } catch (error) {
      console.error('Error updating leader:', error);
      setLeaderError('Failed to update leader information. Please try again.');
      setTimeout(() => setLeaderError(''), 5000);
    } finally {
      setIsSavingLeader(false);
    }
  };

  const handleCancelLeaderEdit = () => {
    setIsEditing(false);
    setEditedLeader({});
    setLeaderError('');
  };

  // Delete leader functionality
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingLeader, setIsDeletingLeader] = useState(false);

  const handleDeleteLeader = async () => {
    if (!leader) return;

    setIsDeletingLeader(true);
    try {
      // First delete all notes associated with the leader
      const { error: notesError } = await supabase
        .from('notes')
        .delete()
        .eq('circle_leader_id', leaderId);

      if (notesError) {
        throw new Error('Failed to delete associated notes');
      }

      // Then delete the leader
      const { error: leaderError } = await supabase
        .from('circle_leaders')
        .delete()
        .eq('id', leaderId);

      if (leaderError) {
        throw new Error('Failed to delete circle leader');
      }

      // Success - redirect to dashboard
      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Circle Leader Deleted',
        message: 'The circle leader has been successfully deleted.'
      });

      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = '/boards';
      }, 2000);

    } catch (error) {
      console.error('Error deleting leader:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete circle leader. Please try again.'
      });
    } finally {
      setIsDeletingLeader(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleLeaderFieldChange = (field: keyof CircleLeader, value: string | boolean) => {
    setEditedLeader(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-extract CCB Group ID when profile link changes
      if (field === 'ccb_profile_link' && typeof value === 'string') {
        const match = value.match(/\/groups\/(\d+)/i);
        if (match) {
          updated.ccb_group_id = match[1];
        }
      }
      return updated;
    });
  };

  const formatTimeToAMPM = (timeString: string) => {
    if (!timeString) return 'Not scheduled';
    
    try {
      // Parse the time string (expecting HH:MM format)
      const [hours, minutes] = timeString.split(':').map(Number);
      
      // Create a date object for today with the given time
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      
      // Format to 12-hour time with AM/PM in Central Time
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago' // Central Time
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return timeString; // Fallback to original time string
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <CircleLeaderProfileSkeleton />
      </ProtectedRoute>
    );
  }

  if (!leader) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Leader Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">The requested Circle Leader could not be found.</p>
            <a href="/boards" className="text-blue-600 dark:text-blue-400 hover:underline">
              Return to Boards
            </a>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Header */}
        <div className="mb-6">
          {/* Nav row: back on left, actions on right */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveLeader}
                  disabled={isSavingLeader || !editedLeader.name?.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.30)', color: 'rgba(134,239,172,1)' }}
                >
                  {isSavingLeader ? (
                    <div className="w-3.5 h-3.5 border-2 border-green-300/30 border-t-green-300 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isSavingLeader ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancelLeaderEdit}
                  disabled={isSavingLeader}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 focus:outline-none disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSavingLeader}
                  className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 focus:outline-none disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.30)', color: 'rgba(252,165,165,1)' }}
                  title="Delete circle leader"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={handleEditLeader}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>

          {/* Name + status */}
          <h1 className="text-xl sm:text-2xl font-bold text-brand-light leading-snug mt-1">
            {leader.circle_name || leader.name}
          </h1>
          {leader.circle_name && (
            <div className="mt-0.5">
              <span className="text-sm text-slate-400">
                {leader.name}{leader.additional_leader_name ? ` · ${leader.additional_leader_name}` : ''}
              </span>
            </div>
          )}
          {/* Context line: circle type, frequency, meeting day & time */}
          {(leader.circle_type || leader.day) && (
            <p className="mt-1.5 text-sm text-slate-400">
              {[
                normalizeCircleTypeValue(leader.circle_type),
                (() => {
                  const freq = leader.frequency && leader.frequency !== 'Weekly' ? formatFrequencyLabel(leader.frequency) : null;
                  if (leader.day && leader.time) {
                    return freq ? `${freq} ${leader.day}s at ${formatTimeToAMPM(leader.time)}` : `${leader.day}s at ${formatTimeToAMPM(leader.time)}`;
                  }
                  if (leader.day) {
                    return freq ? `${freq} ${leader.day}s` : `${leader.day}s`;
                  }
                  return freq;
                })()
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {leader.status && (() => {
            const statusBadgeClass: Record<string, string> = {
              'invited': 'status-badge status-badge-blue',
              'pipeline': 'status-badge status-badge-indigo',
              'active': 'status-badge status-badge-green',
              'paused': 'status-badge status-badge-yellow',
              'off-boarding': 'status-badge status-badge-red',
            };
            const label = leader.status === 'off-boarding' ? 'Off-boarding' : leader.status.charAt(0).toUpperCase() + leader.status.slice(1);
            return (
              <div className="mt-1.5">
                <span className={statusBadgeClass[leader.status] || 'status-badge status-badge-blue'}>
                  {label}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Editing mode sticky footer — mobile only, so Save/Cancel are always reachable */}
        {isEditing && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[10001] bg-slate-900/95 backdrop-blur border-t border-slate-700 px-4 py-3 flex items-center gap-3">
            <button
              onClick={handleSaveLeader}
              disabled={isSavingLeader || !editedLeader.name?.trim()}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-btn-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingLeader ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Save Changes
                </>
              )}
            </button>
            <button
              onClick={handleCancelLeaderEdit}
              disabled={isSavingLeader}
              className="inline-flex items-center px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSavingLeader}
              className="inline-flex items-center px-3 py-2.5 bg-btn-danger text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}

        {/* Mobile Quick Actions - Show on mobile only, right after the name */}
        <div className="lg:hidden mb-6 space-y-4">
          {/* Event Summary - Mobile */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Event Summary</span>
              {(() => {
                const state = getEventSummaryState(leader);
                const colors = getEventSummaryColors(state);
                return (
                  <span className={`text-xs font-medium ${colors.text}`}>{isUpdatingEventSummary ? 'Updating...' : colors.label}</span>
                );
              })()}
            </div>
            <div className="p-4">

              {(() => {
                const eventSummaryState = getEventSummaryState(leader);
                const disabledCls = isUpdatingEventSummary ? 'opacity-50 cursor-not-allowed' : '';

                const activeColors = {
                  not_received: 'bg-slate-600 border-slate-500 text-white',
                  received:     'bg-green-500 border-green-400 text-white',
                  did_not_meet: 'bg-blue-500 border-blue-400 text-white',
                  skipped:      'bg-amber-500 border-amber-400 text-white',
                };

                const btn = (kind: EventSummaryState) => {
                  const active = eventSummaryState === kind;
                  const base = `w-full h-9 flex items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors focus:outline-none ${disabledCls}`;
                  return active
                    ? `${base} ${activeColors[kind]} shadow-sm`
                    : `${base} bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200`;
                };

                const labels = {
                  not_received: 'No',
                  received:     'Yes',
                  did_not_meet: "Didn't Meet",
                  skipped:      'Skip',
                };

                return (
                  <div className="space-y-2">
                    {eventSummaryEnumAvailable === false && (
                      <div className="text-xs text-amber-400">
                        Skipped isn't enabled until the Supabase migration runs.
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {(['not_received', 'received', 'did_not_meet', 'skipped'] as EventSummaryState[]).map((kind) => (
                        <button
                          key={kind}
                          onClick={() => handleSetEventSummaryState(kind)}
                          disabled={isUpdatingEventSummary || (kind === 'skipped' && eventSummaryEnumAvailable === false)}
                          className={btn(kind)}
                          title={kind === 'skipped' && eventSummaryEnumAvailable === false ? 'Run DB migration to enable Skipped' : labels[kind]}
                          aria-pressed={eventSummaryState === kind}
                        >
                          {eventSummaryState === kind && (
                            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.704 5.292a1 1 0 010 1.416l-7.25 7.25a1 1 0 01-1.416 0l-3.25-3.25a1 1 0 011.416-1.416l2.542 2.542 6.542-6.542a1 1 0 011.416 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {labels[kind]}
                        </button>
                      ))}
                    </div>

                  </div>
                );
              })()}
            </div>
          </div>

          {/* Quick Actions - Mobile */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick Actions</span>
            </div>
            <div className="divide-y divide-slate-700/50">

            {/* Follow Up */}
            <div>
              <div className="w-full flex items-center justify-between px-4 py-3 text-slate-200 text-sm">
                <div className="flex items-center gap-2.5">
                  <svg className={`w-4 h-4 ${leader.follow_up_required ? 'text-orange-500' : 'text-slate-400'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d={leader.follow_up_required ?
                      "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" :
                      "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    } clipRule="evenodd" />
                  </svg>
                  {isUpdatingFollowUp ? 'Updating...' : 'Follow-Up'}
                </div>
                <button
                  onClick={handleFollowUpClick}
                  disabled={isUpdatingFollowUp}
                  className="text-xs text-orange-300 hover:text-orange-200 bg-orange-900/30 hover:bg-orange-900/45 border border-orange-800/40 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                >
                  {leader.follow_up_required ? 'Turn Off' : 'Turn On'}
                </button>
              </div>
              {leader.follow_up_required && (leader.follow_up_date || leader.follow_up_note?.trim()) && (
                <div className="px-4 py-3 bg-slate-700/20 border-t border-slate-700/50 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {leader.follow_up_date && (
                        <>
                          <div className="text-xs text-slate-300">
                            {new Date(leader.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className={`text-xs ${
                            getFollowUpStatus(leader.follow_up_date).isOverdue
                              ? 'text-red-400'
                              : 'text-green-400'
                          }`}>
                            {getFollowUpStatus(leader.follow_up_date).isOverdue && 'Overdue'}
                            {!getFollowUpStatus(leader.follow_up_date).isOverdue && 'Scheduled'}
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFollowUpDateValue(leader.follow_up_date || '');
                        setFollowUpNoteValue(leader.follow_up_note || '');
                        setShowFollowUpDateModal(true);
                      }}
                      className="text-xs text-blue-300 hover:text-blue-200 bg-blue-900/30 hover:bg-blue-900/45 border border-blue-800/40 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                  <div>
                    {leader.follow_up_note?.trim() && (
                      <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2.5 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Follow-Up Note</div>
                        <div className="mt-1 text-xs text-slate-200 whitespace-pre-wrap break-words">{leader.follow_up_note}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowLogConnectionModal(true)}
              className="w-full flex items-center px-4 py-3 text-slate-200 hover:bg-slate-700/50 text-sm transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Log Connection
              </div>
            </button>
            
            <button 
              onClick={() => setShowConnectPersonModal(true)}
              className="w-full flex items-center px-4 py-3 text-slate-200 hover:bg-slate-700/50 text-sm transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Connect New Person
              </div>
            </button>
            
            {/* View Roster Link */}
            {leader?.ccb_group_id && (
              <Link
                href={`/circle/${leaderId}/roster`}
                className="w-full flex items-center justify-between px-4 py-3 text-slate-200 hover:bg-slate-700/50 text-sm transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  View Roster
                </div>
                <div className="flex items-center gap-2">
                  {rosterCount !== null && rosterCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold bg-slate-600 text-white rounded-full">{rosterCount}</span>
                  )}
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )}
            </div>
          </div>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Profile Info */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Circle Info */}
            <div className="order-3 lg:order-1 bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
              <div className="px-6 py-4 border-b border-slate-700">
                <h2 className="text-base font-semibold text-white">Circle Info</h2>
              </div>
              <div className="p-6">
                {leaderError && (
                  <div className="mb-4 flex items-center text-sm text-red-600 dark:text-red-400">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {leaderError}
                  </div>
                )}
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Circle Name - full width */}
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-400">Circle Name</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedLeader.circle_name !== undefined ? editedLeader.circle_name : (leader.circle_name || leader.name || '')}
                          onChange={(e) => handleLeaderFieldChange('circle_name', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="e.g. FMT | S3 | Casey and Ashley Bates"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{leader.circle_name || leader.name || 'Not provided'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Status</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.status || 'active'}
                          onChange={(e) => handleLeaderFieldChange('status', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          {statuses.map((status) => (
                            <option key={status.id} value={status.value}>
                              {status.value.charAt(0).toUpperCase() + status.value.slice(1)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-200">
                          {leader.status === 'off-boarding'
                            ? 'Off-boarding'
                            : leader.status
                              ? leader.status.charAt(0).toUpperCase() + leader.status.slice(1)
                              : 'Unknown'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Circle Type</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.circle_type || ''}
                          onChange={(e) => handleLeaderFieldChange('circle_type', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Select Circle Type</option>
                          {circleTypes.map((type) => (
                            <option key={type.id} value={type.value}>
                              {type.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-200">{normalizeCircleTypeValue(leader.circle_type) || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Meeting Day</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.day || ''}
                          onChange={(e) => handleLeaderFieldChange('day', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Select Day</option>
                          <option value="Monday">Monday</option>
                          <option value="Tuesday">Tuesday</option>
                          <option value="Wednesday">Wednesday</option>
                          <option value="Thursday">Thursday</option>
                          <option value="Friday">Friday</option>
                          <option value="Saturday">Saturday</option>
                          <option value="Sunday">Sunday</option>
                        </select>
                      ) : (
                        <span className="text-sm text-slate-200">{leader.day || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Meeting Time</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="time"
                          value={leader.time?.includes('AM') || leader.time?.includes('PM')
                            ? convertAMPMTo24Hour(leader.time)
                            : editedLeader.time || ''}
                          onChange={(e) => handleLeaderFieldChange('time', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{formatTimeToAMPM(leader.time || '') || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Meeting Frequency</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.frequency || ''}
                          onChange={(e) => handleLeaderFieldChange('frequency', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Select Frequency</option>
                          {frequencies.map((frequency) => (
                            <option key={frequency.id} value={frequency.value}>
                              {formatFrequencyLabel(frequency.value)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-200">{leader.frequency || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  {/(bi-?week|every other)/i.test((isEditing ? editedLeader.frequency : leader.frequency) || '') && (
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Bi-weekly Start Date</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editedLeader.meeting_start_date !== undefined ? (editedLeader.meeting_start_date || '') : (leader.meeting_start_date || '')}
                          onChange={(e) => handleLeaderFieldChange('meeting_start_date', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{leader.meeting_start_date || 'Not set'}</span>
                      )}
                    </dd>
                  </div>
                  )}
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Director</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.acpd || ''}
                          onChange={(e) => handleLeaderFieldChange('acpd', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Select Director</option>
                          {directors.map((director) => (
                            <option key={director.id} value={director.name}>
                              {director.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-200">{leader.acpd || 'Not assigned'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Campus</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <select
                          value={editedLeader.campus || ''}
                          onChange={(e) => handleLeaderFieldChange('campus', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Select Campus</option>
                          {campuses.map((campus) => (
                            <option key={campus.id} value={campus.value}>
                              {campus.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-200">{leader.campus || 'Not specified'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">CCB Group ID</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedLeader.ccb_group_id !== undefined ? editedLeader.ccb_group_id : (leader.ccb_group_id || '')}
                          onChange={(e) => handleLeaderFieldChange('ccb_group_id', e.target.value)}
                          placeholder="e.g. 201"
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{leader.ccb_group_id || 'Not set'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">CCB Group Name Override</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedLeader.ccb_group_name !== undefined ? editedLeader.ccb_group_name : (leader.ccb_group_name || '')}
                          onChange={(e) => handleLeaderFieldChange('ccb_group_name', e.target.value)}
                          placeholder="e.g. LVT | S1 | Todd Baden"
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{leader.ccb_group_name || <span className="text-slate-500">Not set — uses leader name</span>}</span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-400">CCB Circle Link</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editedLeader.ccb_profile_link !== undefined ? editedLeader.ccb_profile_link : (leader.ccb_profile_link || '')}
                          onChange={(e) => handleLeaderFieldChange('ccb_profile_link', e.target.value)}
                          placeholder="https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=..."
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">
                          {leader.ccb_profile_link ? (
                            <a
                              href={leader.ccb_profile_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-2 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-600/60 rounded-xl transition-all duration-200 text-sm font-medium hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              View CCB Circle
                            </a>
                          ) : (
                            'Not specified'
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Primary Leader */}
            <div className="order-1 lg:order-2 bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
              <div className="px-6 py-4 border-b border-slate-700">
                <h2 className="text-base font-semibold text-white">Primary Leader</h2>
              </div>
              <div className="p-6">
                {isEditing && (
                  <div className="mb-4">
                    <CCBPersonLookup
                      size="sm"
                      label="Fill from CCB"
                      placeholder="Search CCB by name or phone to auto-fill..."
                      onSelect={(person: CCBPerson) => {
                        handleLeaderFieldChange('name', person.fullName);
                        if (person.mobilePhone || person.phone) {
                          handleLeaderFieldChange('phone', person.mobilePhone || person.phone);
                        }
                        if (person.email) {
                          handleLeaderFieldChange('email', person.email);
                        }
                      }}
                    />
                  </div>
                )}
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-400">Name</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedLeader.name || ''}
                          onChange={(e) => handleLeaderFieldChange('name', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter primary leader name"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{leader.name || 'Not provided'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Phone</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editedLeader.phone || ''}
                          onChange={(e) => handleLeaderFieldChange('phone', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter phone"
                        />
                      ) : leader.phone ? (
                        <button
                          onClick={() => setPhoneActionModal({ phone: leader.phone!, name: leader.name })}
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {leader.phone}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Not provided</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Email</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="email"
                          value={editedLeader.email || ''}
                          onChange={(e) => handleLeaderFieldChange('email', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter email"
                        />
                      ) : leader.email ? (
                        <button
                          onClick={() => openEmailLink(leader.email!, leader.name)}
                          title={leader.email}
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors max-w-full min-w-0"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{leader.email}</span>
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Not provided</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400"><Cake className="h-4 w-4" />Birthday</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editedLeader.birthday !== undefined ? editedLeader.birthday : (leader.birthday || '')}
                          onChange={(e) => handleLeaderFieldChange('birthday', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">
                          {leader.birthday
                            ? new Date(leader.birthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                            : 'Not set'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-400">CCB Profile Link</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editedLeader.leader_ccb_profile_link !== undefined ? editedLeader.leader_ccb_profile_link : (leader.leader_ccb_profile_link || '')}
                          onChange={(e) => handleLeaderFieldChange('leader_ccb_profile_link', e.target.value)}
                          placeholder="https://valleycreekchurch.ccbchurch.com/goto/individuals/..."
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">
                          {leader.leader_ccb_profile_link ? (
                            <a
                              href={leader.leader_ccb_profile_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-2 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-600/60 rounded-xl transition-all duration-200 text-sm font-medium hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              View Leader Profile
                            </a>
                          ) : (
                            'Not specified'
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Additional Leader — only rendered when there is data or in edit mode */}
            {(isEditing || leader.additional_leader_name || leader.additional_leader_phone || leader.additional_leader_email) && (
            <div className="order-2 lg:order-3 bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Additional Leader</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">Co-leader</span>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-400">Name</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedLeader.additional_leader_name !== undefined ? editedLeader.additional_leader_name : (leader.additional_leader_name || '')}
                          onChange={(e) => handleLeaderFieldChange('additional_leader_name', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter additional leader name"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">{leader.additional_leader_name || 'Not provided'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Phone</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editedLeader.additional_leader_phone !== undefined ? editedLeader.additional_leader_phone : (leader.additional_leader_phone || '')}
                          onChange={(e) => handleLeaderFieldChange('additional_leader_phone', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter phone number"
                        />
                      ) : leader.additional_leader_phone ? (
                        <button
                          onClick={() => setPhoneActionModal({ phone: leader.additional_leader_phone!, name: leader.additional_leader_name || 'Additional Leader' })}
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {leader.additional_leader_phone}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Not provided</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-400">Email</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="email"
                          value={editedLeader.additional_leader_email !== undefined ? editedLeader.additional_leader_email : (leader.additional_leader_email || '')}
                          onChange={(e) => handleLeaderFieldChange('additional_leader_email', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="Enter email address"
                        />
                      ) : leader.additional_leader_email ? (
                        <button
                          onClick={() => openEmailLink(leader.additional_leader_email!, leader.additional_leader_name || 'Additional Leader')}
                          title={leader.additional_leader_email}
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors max-w-full min-w-0"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{leader.additional_leader_email}</span>
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Not provided</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400"><Cake className="h-4 w-4" />Birthday</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editedLeader.additional_leader_birthday !== undefined ? editedLeader.additional_leader_birthday : (leader.additional_leader_birthday || '')}
                          onChange={(e) => handleLeaderFieldChange('additional_leader_birthday', e.target.value)}
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-slate-200">
                          {leader.additional_leader_birthday
                            ? new Date(leader.additional_leader_birthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                            : 'Not set'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-slate-400">CCB Profile Link</dt>
                    <dd className="mt-1">
                      {isEditing ? (
                        <input
                          type="url"
                          value={editedLeader.additional_leader_ccb_profile_link !== undefined ? editedLeader.additional_leader_ccb_profile_link : (leader.additional_leader_ccb_profile_link || '')}
                          onChange={(e) => handleLeaderFieldChange('additional_leader_ccb_profile_link', e.target.value)}
                          placeholder="https://valleycreekchurch.ccbchurch.com/goto/individuals/..."
                          className="w-full px-3 py-1 text-sm border border-slate-600 rounded-md bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      ) : leader.additional_leader_ccb_profile_link ? (
                        <a
                          href={leader.additional_leader_ccb_profile_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-2 bg-gray-100/80 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-600/60 rounded-xl transition-all duration-200 text-sm font-medium hover:scale-[1.02] active:scale-[0.98] backdrop-blur-sm"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View Leader Profile
                        </a>
                      ) : (
                        <span className="text-sm text-slate-500">Not specified</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-6 h-full">
            {/* Event Summary - Desktop Only */}
            <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Event Summary</span>
                {(() => {
                  const state = getEventSummaryState(leader);
                  const colors = getEventSummaryColors(state);
                  return (
                    <span className={`text-xs font-medium ${colors.text}`}>{isUpdatingEventSummary ? 'Updating...' : colors.label}</span>
                  );
                })()}
              </div>
              <div className="p-4">

                {(() => {
                  const eventSummaryState = getEventSummaryState(leader);
                  const disabledCls = isUpdatingEventSummary ? 'opacity-50 cursor-not-allowed' : '';

                  const activeColors: Record<EventSummaryState, string> = {
                    not_received: 'bg-slate-600 border-slate-500 text-white',
                    received:     'bg-green-500 border-green-400 text-white',
                    did_not_meet: 'bg-blue-500 border-blue-400 text-white',
                    skipped:      'bg-amber-500 border-amber-400 text-white',
                  };

                  const btn = (kind: EventSummaryState) => {
                    const active = eventSummaryState === kind;
                    const base = `w-full h-9 flex items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors focus:outline-none ${disabledCls}`;
                    return active
                      ? `${base} ${activeColors[kind]} shadow-sm`
                      : `${base} bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200`;
                  };

                  const labels: Record<EventSummaryState, string> = {
                    not_received: 'No',
                    received:     'Yes',
                    did_not_meet: "Didn't Meet",
                    skipped:      'Skip',
                  };

                  return (
                    <div className="space-y-2">
                      {eventSummaryEnumAvailable === false && (
                        <div className="text-xs text-amber-400">
                          Skipped isn't enabled until the Supabase migration runs.
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {(['not_received', 'received', 'did_not_meet', 'skipped'] as EventSummaryState[]).map((kind) => (
                          <button
                            key={kind}
                            onClick={() => handleSetEventSummaryState(kind)}
                            disabled={isUpdatingEventSummary || (kind === 'skipped' && eventSummaryEnumAvailable === false)}
                            className={btn(kind)}
                            title={kind === 'skipped' && eventSummaryEnumAvailable === false ? 'Run DB migration to enable Skipped' : labels[kind]}
                            aria-pressed={eventSummaryState === kind}
                          >
                            {eventSummaryState === kind && (
                              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.704 5.292a1 1 0 010 1.416l-7.25 7.25a1 1 0 01-1.416 0l-3.25-3.25a1 1 0 011.416-1.416l2.542 2.542 6.542-6.542a1 1 0 011.416 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            {labels[kind]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Quick Actions - Desktop Only */}
            <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick Actions</span>
              </div>
              <div className="divide-y divide-slate-700/50">

                {/* Follow Up */}
                <div>
                  <div className="w-full flex items-center justify-between px-4 py-3 text-slate-200 text-sm">
                    <div className="flex items-center gap-2.5">
                      <svg className={`w-4 h-4 ${leader.follow_up_required ? 'text-orange-500' : 'text-slate-400'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d={leader.follow_up_required ?
                          "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" :
                          "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        } clipRule="evenodd" />
                      </svg>
                      {isUpdatingFollowUp ? 'Updating...' : 'Follow-Up'}
                    </div>
                    <button
                      onClick={handleFollowUpClick}
                      disabled={isUpdatingFollowUp}
                      className="text-xs text-orange-300 hover:text-orange-200 bg-orange-900/30 hover:bg-orange-900/45 border border-orange-800/40 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                    >
                      {leader.follow_up_required ? 'Turn Off' : 'Turn On'}
                    </button>
                  </div>
                  {leader.follow_up_required && (leader.follow_up_date || leader.follow_up_note?.trim()) && (
                    <div className="px-4 py-3 bg-slate-700/20 border-t border-slate-700/50 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {leader.follow_up_date && (
                            <>
                              <div className="text-xs text-slate-300">
                                {new Date(leader.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                              <div className={`text-xs ${
                                getFollowUpStatus(leader.follow_up_date).isOverdue
                                  ? 'text-red-400'
                                  : 'text-green-400'
                              }`}>
                                {getFollowUpStatus(leader.follow_up_date).isOverdue && 'Overdue'}
                                {!getFollowUpStatus(leader.follow_up_date).isOverdue && 'Scheduled'}
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFollowUpDateValue(leader.follow_up_date || '');
                            setFollowUpNoteValue(leader.follow_up_note || '');
                            setShowFollowUpDateModal(true);
                          }}
                          className="text-xs text-blue-300 hover:text-blue-200 bg-blue-900/30 hover:bg-blue-900/45 border border-blue-800/40 px-3 py-1.5 rounded-md transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                      <div>
                        {leader.follow_up_note?.trim() && (
                          <div className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2.5 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Follow-Up Note</div>
                            <div className="mt-1 text-xs text-slate-200 whitespace-pre-wrap break-words">{leader.follow_up_note}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowLogConnectionModal(true)}
                  className="w-full flex items-center px-4 py-3 text-slate-200 hover:bg-slate-700/50 text-sm transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Log Connection
                  </div>
                </button>
                
                <button 
                  onClick={() => setShowConnectPersonModal(true)}
                  className="w-full flex items-center px-4 py-3 text-slate-200 hover:bg-slate-700/50 text-sm transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Connect New Person
                  </div>
                </button>
                
                {/* View Roster Link */}
                {leader?.ccb_group_id && (
                  <Link
                    href={`/circle/${leaderId}/roster`}
                    className="w-full flex items-center justify-between px-4 py-3 text-slate-200 hover:bg-slate-700/50 text-sm transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      View Roster
                    </div>
                    <div className="flex items-center gap-2">
                      {rosterCount !== null && rosterCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold bg-slate-600 text-white rounded-full">{rosterCount}</span>
                      )}
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                )}
              </div>
            </div>

            {/* Scorecard Summary - Desktop sidebar */}
            {(() => {
              const scores = scorecardSummary;
              const dims = [
                { key: 'reach',    label: 'Reach',    value: scores?.reach,    color: 'text-blue-400',   bg: 'bg-blue-500/15',   dot: 'bg-blue-400' },
                { key: 'connect',  label: 'Connect',  value: scores?.connect,  color: 'text-green-400',  bg: 'bg-green-500/15',  dot: 'bg-green-400' },
                { key: 'disciple', label: 'Disciple', value: scores?.disciple, color: 'text-violet-400', bg: 'bg-violet-500/15', dot: 'bg-violet-400' },
                { key: 'develop',  label: 'Develop',  value: scores?.develop,  color: 'text-orange-400', bg: 'bg-orange-500/15', dot: 'bg-orange-400' },
              ];
              return (
                <div className="hidden lg:flex lg:flex-col flex-1 bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                    <Link href={`/circle/${leaderId}/scorecard`} className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-400 transition-colors">Scorecard</Link>
                    {scores?.average != null && (
                      <span className="text-sm font-bold text-white">
                        {scores.average}<span className="text-xs font-normal text-slate-500">/5</span>
                      </span>
                    )}
                  </div>
                  {scores != null ? (
                    <>
                      <div className="flex-1 flex flex-col divide-y divide-slate-700/60">
                        {dims.map(d => (
                          <Link
                            key={d.key}
                            href={`/circle/${leaderId}/scorecard?dimension=${d.key}`}
                            className={`flex-1 flex items-center justify-between px-4 gap-3 ${d.bg} hover:brightness-110 transition-all cursor-pointer`}
                          >
                            <span className={`text-sm font-semibold ${d.color} w-16 shrink-0`}>{d.label}</span>
                            <div className="flex gap-1.5 flex-1 justify-center">
                              {[1,2,3,4,5].map(i => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i <= (d.value ?? 0) ? d.dot : 'bg-slate-600/60'}`} />
                              ))}
                            </div>
                            <span className="text-base font-bold text-white w-8 text-right shrink-0">{d.value}<span className="text-xs font-normal text-slate-500">/5</span></span>
                          </Link>
                        ))}
                      </div>
                      <div className="px-4 py-2.5 border-t border-slate-700">
                        <Link
                          href={`/circle/${leaderId}/scorecard`}
                          className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                        >
                          View full scorecard
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="px-4 py-3">
                      <Link
                        href={`/circle/${leaderId}/scorecard`}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                      >
                        View scorecard
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Attendance Trends Section */}
        {leader && (
          <div className="mt-6">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass p-4 sm:p-6">
              <AttendanceTrends leaderId={leaderId} leaderName={leader.ccb_group_name || leader.circle_name || leader.name} meetingDay={leader.day} refreshKey={attendanceRefreshKey} rosterCount={rosterCount} />
              {/* Event Summary action buttons */}
              <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowEventExplorerModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-slate-200 hover:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Pull Event Summary
                </button>
                <button
                  type="button"
                  onClick={() => setShowEventSummaryReminderModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-slate-200 hover:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Send Reminder
                </button>
              </div>
            </div>
          </div>
        )}


        </div>

        {/* Scorecard Summary - Mobile (bottom of page) */}
        {(() => {
          const scores = scorecardSummary;
          const dims = [
            { key: 'reach',    label: 'Reach',    value: scores?.reach,    color: 'text-blue-400',   dot: 'bg-blue-400' },
            { key: 'connect',  label: 'Connect',  value: scores?.connect,  color: 'text-green-400',  dot: 'bg-green-400' },
            { key: 'disciple', label: 'Disciple', value: scores?.disciple, color: 'text-violet-400', dot: 'bg-violet-400' },
            { key: 'develop',  label: 'Develop',  value: scores?.develop,  color: 'text-orange-400', dot: 'bg-orange-400' },
          ];
          return (
            <div className="lg:hidden max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-28">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-card-glass overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <Link href={`/circle/${leaderId}/scorecard`} className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-400 transition-colors">Scorecard</Link>
                {scores?.average != null && (
                  <span className="text-sm font-bold text-white">
                    {scores.average}<span className="text-xs font-normal text-slate-500">/5</span>
                  </span>
                )}
              </div>
              {scores != null ? (
                <div className="divide-y divide-slate-700/60">
                  {dims.map(d => (
                    <Link
                      key={d.key}
                      href={`/circle/${leaderId}/scorecard?dimension=${d.key}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-700/40 transition-colors"
                    >
                      <span className={`text-sm font-semibold ${d.color} w-16 shrink-0`}>{d.label}</span>
                      <div className="flex gap-1.5 flex-1 justify-center">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`w-2.5 h-2.5 rounded-full ${i <= (d.value ?? 0) ? d.dot : 'bg-slate-600/60'}`} />
                        ))}
                      </div>
                      <span className="text-base font-bold text-white w-8 text-right shrink-0">{d.value}<span className="text-xs font-normal text-slate-500">/5</span></span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Link href={`/circle/${leaderId}/scorecard`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-colors">
                  <span className="text-sm text-slate-400">No scores yet — tap to add</span>
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
            </div>
          );
        })()}
        </div>

      {/* Call or Text modal */}
      {phoneActionModal && (
        <div
          className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPhoneActionModal(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Contact</p>
              <p className="text-base font-semibold text-white">{phoneActionModal.name}</p>
              <p className="text-sm text-slate-400 mt-0.5">{phoneActionModal.phone}</p>
            </div>
            <div className="px-3 pb-3 space-y-2">
              <button
                onClick={() => { callNumber(phoneActionModal.phone); setPhoneActionModal(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors text-sm font-medium"
              >
                <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </button>
              <button
                onClick={() => { textNumber(phoneActionModal.phone, phoneActionModal.name); setPhoneActionModal(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors text-sm font-medium"
              >
                <svg className="w-5 h-5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Text
              </button>
            </div>
            <div className="px-3 pb-4">
              <button
                onClick={() => setPhoneActionModal(null)}
                className="w-full py-2.5 text-slate-400 hover:text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />

      {/* Log Connection Modal */}
      <LogConnectionModal
        isOpen={showLogConnectionModal}
        onClose={() => setShowLogConnectionModal(false)}
        circleLeaderId={leader?.id || 0}
        circleLeaderName={leader?.name || ''}
        onConnectionLogged={() => {
          setShowAlert({
            isOpen: true,
            type: 'success',
            title: 'Connection Logged',
            message: 'Connection has been successfully logged.'
          });
        }}
      />

      {/* Connect Person Modal */}
      <ConnectPersonModal
        isOpen={showConnectPersonModal}
        onClose={() => setShowConnectPersonModal(false)}
        leaderName={leader?.name || ''}
        currentUserName={user?.name || ''}
        onSend={handleConnectPerson}
      />

      {/* Event Summary Reminder Modal */}
      <EventSummaryReminderModal
        isOpen={showEventSummaryReminderModal}
        onClose={() => setShowEventSummaryReminderModal(false)}
        leaderName={leader?.name || ''}
        sentMessages={sentReminderMessages}
        onSend={handleSendEventSummaryReminder}
      />

      {/* CCB Event Explorer Modal (re-used from Calendar page) */}
      <EventExplorerModal
        isOpen={showEventExplorerModal}
        onClose={() => {
          setShowEventExplorerModal(false);
          setAttendanceRefreshKey((k) => k + 1);
        }}
        initialDate={getLocalISODate()}
        initialGroupName={leader?.ccb_group_name || leader?.circle_name || leader?.name || ''}
        ccbProfileLink={leader?.ccb_profile_link || null}
        meetingDay={leader?.day || null}
        rosterCount={rosterCount}
      />

      {/* Delete Circle Leader Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteLeader}
        title="Delete Circle Leader"
        message={`Are you sure you want to delete ${leader?.name || 'this circle leader'}? This action cannot be undone and will also delete all associated notes.`}
        confirmText={isDeletingLeader ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        type="danger"
        isLoading={isDeletingLeader}
      />

      {/* Follow-Up Date Picker Modal */}
      {showFollowUpDateModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4"
          onClick={() => setShowFollowUpDateModal(false)}
        >
          <div 
            className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/20 dark:border-gray-700/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {leader?.follow_up_required ? 'Edit Follow-Up' : 'Set Follow-Up'}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {leader?.follow_up_required 
                  ? `Update the follow-up details for ${leader?.name || 'this leader'}.`
                  : `Select a follow-up date for ${leader?.name || 'this leader'}. A todo will be added to your list.`
                }
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Follow-up Date
                </label>
                <input
                  type="date"
                  value={followUpDateValue}
                  onChange={(e) => setFollowUpDateValue(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Follow-up Note
                </label>
                <textarea
                  value={followUpNoteValue}
                  onChange={(e) => setFollowUpNoteValue(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Add context for this follow-up..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-1 text-xs text-slate-500">{followUpNoteValue.length}/500</div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFollowUpDateModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={leader?.follow_up_required ? () => { handleFollowUpDetailsChange(followUpDateValue, followUpNoteValue); } : handleFollowUpSave}
                  disabled={!followUpDateValue || isUpdatingFollowUp}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isUpdatingFollowUp ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Follow-Up Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearFollowUpConfirm}
        onClose={() => setShowClearFollowUpConfirm(false)}
        onConfirm={handleClearFollowUp}
        title="Clear Follow-Up"
        message={`Would you like to turn off the follow-up for ${leader?.name || 'this leader'}? This will clear the follow-up date and mark any linked todo as complete.`}
        confirmText={isUpdatingFollowUp ? 'Clearing...' : 'Turn Off'}
        cancelText="Keep Active"
        type="warning"
        isLoading={isUpdatingFollowUp}
      />

      {/* Add to Board Modal — shown after follow-up is saved */}
      {leader && (
        <AddToBoardModal
          isOpen={showAddToBoardModal}
          onClose={() => setShowAddToBoardModal(false)}
          leaderId={leaderId}
          leaderName={leader.name}
          followUpDate={savedFollowUpDate}
        />
      )}
    </ProtectedRoute>
  );
}
