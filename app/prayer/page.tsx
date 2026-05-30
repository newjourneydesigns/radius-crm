'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Calendar, X, Heart, PenLine } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Modal from '../../components/ui/Modal';
import PrayerToolbar from '../../components/prayer/PrayerToolbar';
import PrayerSectionHeader from '../../components/prayer/PrayerSectionHeader';
import PrayerRow, { PrayerRowData } from '../../components/prayer/PrayerRow';
import PrayerSessionLogList from '../../components/prayer/PrayerSessionLogList';
import { supabase, PrayerPoint, PrayerSessionLog, PrayerKind } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────

interface PrayerWithLeader extends PrayerPoint {
  leader_name: string;
  leader_campus?: string;
  leader_acpd?: string;
}

interface LeaderPrayerGroup {
  leaderId: number;
  leaderName: string;
  leaderCampus?: string;
  leaderAcpd?: string;
  prayers: PrayerWithLeader[];
}

interface SimpleLeader {
  id: number;
  name: string;
  campus?: string;
  acpd?: string;
}

interface GeneralPrayer {
  id: number;
  user_id: string;
  content: string;
  is_answered: boolean;
  is_shared: boolean;
  pray_date?: string | null;
  created_at: string;
  updated_at: string;
}

function logKey(kind: PrayerKind, id: number) {
  return `${kind}:${id}`;
}

function timeAgoFromTimestamp(ts: string) {
  const now = new Date();
  const d = new Date(ts);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function initialsOf(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── Main Component ─────────────────────────────────────

function PrayerListContent() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  // Data
  const [allLeaders, setAllLeaders] = useState<SimpleLeader[]>([]);
  const [allPrayers, setAllPrayers] = useState<PrayerWithLeader[]>([]);
  const [generalPrayers, setGeneralPrayers] = useState<GeneralPrayer[]>([]);
  const [sessionLogs, setSessionLogs] = useState<PrayerSessionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI controls — restore from localStorage
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('prayer_sortDir');
      if (saved === 'asc' || saved === 'desc') return saved;
    }
    return 'asc';
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('prayer_search') || '';
    return '';
  });
  const [expandedLeaders, setExpandedLeaders] = useState<Set<number>>(new Set());
  const [filterCampus, setFilterCampus] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('prayer_campus') || '';
    return '';
  });
  const [filterAcpd, setFilterAcpd] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('prayer_acpd') || '';
    return '';
  });
  const [generalExpanded, setGeneralExpanded] = useState(true);
  const [leaderSectionExpanded, setLeaderSectionExpanded] = useState(true);

  // Add-prayer state
  const [addingToLeader, setAddingToLeader] = useState<number | null>(null);
  const [newPrayerText, setNewPrayerText] = useState('');
  const [newPrayerDate, setNewPrayerDate] = useState('');
  const [showNewPrayerDate, setShowNewPrayerDate] = useState(false);
  const [newGeneralText, setNewGeneralText] = useState('');
  const [newGeneralDate, setNewGeneralDate] = useState('');
  const [showNewGeneralDate, setShowNewGeneralDate] = useState(false);

  // "Save as note?" prompt after marking a leader prayer answered
  const [answeredNotePrompt, setAnsweredNotePrompt] = useState<{
    leaderId: number;
    leaderName: string;
  } | null>(null);
  const [answeredNoteText, setAnsweredNoteText] = useState('');
  const [savingAnsweredNote, setSavingAnsweredNote] = useState(false);

  // Draft log id (just-created) per prayer key — auto-opens history + note editor
  const [draftLogIds, setDraftLogIds] = useState<Record<string, number | null>>({});
  // Draft log id per leader (for the leader_session note editor)
  const [draftLeaderSessionIds, setDraftLeaderSessionIds] = useState<Record<number, number | null>>({});
  // Which leaders have their session history panel open
  const [leaderSessionHistoryOpen, setLeaderSessionHistoryOpen] = useState<Set<number>>(new Set());

  // Persist filters
  useEffect(() => {
    localStorage.setItem('prayer_sortDir', sortDir);
    localStorage.setItem('prayer_search', searchQuery);
    localStorage.setItem('prayer_campus', filterCampus);
    localStorage.setItem('prayer_acpd', filterAcpd);
  }, [sortDir, searchQuery, filterCampus, filterAcpd]);

  // ─── Load data ───
  const loadData = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [leadersRes, prayersRes, generalRes, logsRes] = await Promise.all([
        supabase
          .from('circle_leaders')
          .select('id, name, campus, acpd')
          .order('name', { ascending: true }),
        supabase
          .from('acpd_prayer_points')
          .select(`
            *,
            circle_leaders!inner ( id, name, campus, acpd )
          `)
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false }),
        supabase
          .from('general_prayer_points')
          .select('*')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false }),
        supabase
          .from('prayer_session_logs')
          .select('*')
          .eq('user_id', currentUserId)
          .order('prayed_on', { ascending: false }),
      ]);

      if (leadersRes.error) throw leadersRes.error;
      if (prayersRes.error) throw prayersRes.error;
      if (generalRes.error) throw generalRes.error;
      if (logsRes.error) throw logsRes.error;

      const leaders: SimpleLeader[] = (leadersRes.data || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        campus: l.campus || undefined,
        acpd: l.acpd || undefined,
      }));

      const mapped: PrayerWithLeader[] = (prayersRes.data || []).map((p: any) => ({
        ...p,
        leader_name: p.circle_leaders?.name || 'Unknown',
        leader_campus: p.circle_leaders?.campus || undefined,
        leader_acpd: p.circle_leaders?.acpd || undefined,
      }));

      setAllLeaders(leaders);
      setAllPrayers(mapped);
      setGeneralPrayers(generalRes.data || []);
      setSessionLogs(logsRes.data || []);

      setExpandedLeaders(new Set(mapped.map((p) => p.circle_leader_id)));
    } catch (err: any) {
      console.error('Error loading prayer data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Derived ───
  const campusList = useMemo(() => {
    const set = new Set<string>();
    allLeaders.forEach((l) => l.campus && set.add(l.campus));
    return Array.from(set).sort();
  }, [allLeaders]);

  const acpdList = useMemo(() => {
    const set = new Set<string>();
    allLeaders.forEach((l) => l.acpd && set.add(l.acpd));
    return Array.from(set).sort();
  }, [allLeaders]);

  const logsByKey = useMemo(() => {
    const map = new Map<string, PrayerSessionLog[]>();
    for (const log of sessionLogs) {
      const key = logKey(log.prayer_kind, log.prayer_point_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }, [sessionLogs]);

  // leader_session logs grouped by leader id (stored in prayer_point_id)
  const leaderSessionLogsByLeader = useMemo(() => {
    const map = new Map<number, PrayerSessionLog[]>();
    for (const log of sessionLogs) {
      if (log.prayer_kind !== 'leader_session') continue;
      const arr = map.get(log.prayer_point_id) || [];
      arr.push(log);
      map.set(log.prayer_point_id, arr);
    }
    return map;
  }, [sessionLogs]);

  const groupedPrayers = useMemo(() => {
    const prayersByLeader = new Map<number, PrayerWithLeader[]>();
    for (const prayer of allPrayers) {
      if (!prayersByLeader.has(prayer.circle_leader_id)) {
        prayersByLeader.set(prayer.circle_leader_id, []);
      }
      prayersByLeader.get(prayer.circle_leader_id)!.push(prayer);
    }

    let leaders = allLeaders;
    if (filterCampus) leaders = leaders.filter((l) => l.campus === filterCampus);
    if (filterAcpd) leaders = leaders.filter((l) => l.acpd === filterAcpd);

    const groups: LeaderPrayerGroup[] = leaders.map((leader) => ({
      leaderId: leader.id,
      leaderName: leader.name,
      leaderCampus: leader.campus,
      leaderAcpd: leader.acpd,
      prayers: prayersByLeader.get(leader.id) || [],
    }));

    let filtered = groups;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = groups.filter(
        (g) =>
          g.leaderName.toLowerCase().includes(q) ||
          (g.leaderCampus && g.leaderCampus.toLowerCase().includes(q)) ||
          (g.leaderAcpd && g.leaderAcpd.toLowerCase().includes(q)) ||
          g.prayers.some((p) => p.content.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      const cmp = a.leaderName.localeCompare(b.leaderName);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [allLeaders, allPrayers, searchQuery, sortDir, filterCampus, filterAcpd]);

  const filteredGeneralPrayers = useMemo(() => {
    if (!searchQuery.trim()) return generalPrayers;
    const q = searchQuery.toLowerCase();
    return generalPrayers.filter((gp) => gp.content.toLowerCase().includes(q));
  }, [generalPrayers, searchQuery]);

  // ─── Stats ───
  const totalPrayers = allPrayers.length;
  const totalLeaders = allLeaders.length;

  const prayedTodayLeaderIds = useMemo(() => {
    const today = todayISO();
    const set = new Set<number>();
    for (const log of sessionLogs) {
      if (log.prayer_kind === 'leader_session' && log.prayed_on === today) {
        set.add(log.prayer_point_id);
      }
    }
    return set;
  }, [sessionLogs]);
  const prayedTodayCount = prayedTodayLeaderIds.size;

  // ─── Mutations: leader prayers ───
  const updateLeaderPrayer = (id: number, patch: Partial<PrayerWithLeader>) => {
    setAllPrayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const handleLeaderContentSave = async (id: number, content: string) => {
    const { error: err } = await supabase
      .from('acpd_prayer_points')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateLeaderPrayer(id, { content });
  };

  const handleLeaderDelete = async (id: number) => {
    const { error: err } = await supabase.from('acpd_prayer_points').delete().eq('id', id);
    if (err) return console.error(err);
    setAllPrayers((prev) => prev.filter((p) => p.id !== id));
    setSessionLogs((prev) =>
      prev.filter((l) => !(l.prayer_kind === 'leader' && l.prayer_point_id === id))
    );
  };

  const handleLeaderShareToggle = async (id: number, next: boolean) => {
    const { error: err } = await supabase
      .from('acpd_prayer_points')
      .update({ is_shared: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateLeaderPrayer(id, { is_shared: next });
  };

  const handleLeaderAnswered = async (id: number, next: boolean) => {
    const prayer = allPrayers.find((p) => p.id === id);
    const { error: err } = await supabase
      .from('acpd_prayer_points')
      .update({ is_answered: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateLeaderPrayer(id, { is_answered: next });
    // After marking answered, offer to save it as a note on the leader's profile
    if (next && prayer) {
      setAnsweredNoteText(`Answered prayer: "${prayer.content}"`);
      setAnsweredNotePrompt({
        leaderId: prayer.circle_leader_id,
        leaderName: prayer.leader_name,
      });
    }
  };

  const closeAnsweredNotePrompt = () => {
    setAnsweredNotePrompt(null);
    setAnsweredNoteText('');
    setSavingAnsweredNote(false);
  };

  const handleSaveAnsweredNote = async () => {
    if (!answeredNotePrompt || !answeredNoteText.trim()) return;
    setSavingAnsweredNote(true);
    const noteData: any = {
      circle_leader_id: answeredNotePrompt.leaderId,
      content: answeredNoteText.trim(),
      created_at: new Date().toISOString(),
    };
    // created_by references auth.users(id) — only set when we have a valid UUID
    if (currentUserId) noteData.created_by = currentUserId;
    const { error: err } = await supabase.from('notes').insert([noteData]);
    if (err) {
      console.error(err);
      setSavingAnsweredNote(false);
      return;
    }
    closeAnsweredNotePrompt();
  };

  const handleLeaderDueDateSave = async (id: number, due: string | null) => {
    const { error: err } = await supabase
      .from('acpd_prayer_points')
      .update({ pray_date: due, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateLeaderPrayer(id, { pray_date: due });
  };

  // ─── Mutations: general prayers ───
  const updateGeneralPrayer = (id: number, patch: Partial<GeneralPrayer>) => {
    setGeneralPrayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const handleGeneralContentSave = async (id: number, content: string) => {
    const { error: err } = await supabase
      .from('general_prayer_points')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateGeneralPrayer(id, { content });
  };

  const handleGeneralDelete = async (id: number) => {
    const { error: err } = await supabase.from('general_prayer_points').delete().eq('id', id);
    if (err) return console.error(err);
    setGeneralPrayers((prev) => prev.filter((p) => p.id !== id));
    setSessionLogs((prev) =>
      prev.filter((l) => !(l.prayer_kind === 'general' && l.prayer_point_id === id))
    );
  };

  const handleGeneralShareToggle = async (id: number, next: boolean) => {
    const { error: err } = await supabase
      .from('general_prayer_points')
      .update({ is_shared: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateGeneralPrayer(id, { is_shared: next });
  };

  const handleGeneralAnswered = async (id: number, next: boolean) => {
    const { error: err } = await supabase
      .from('general_prayer_points')
      .update({ is_answered: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateGeneralPrayer(id, { is_answered: next });
  };

  const handleGeneralDueDateSave = async (id: number, due: string | null) => {
    const { error: err } = await supabase
      .from('general_prayer_points')
      .update({ pray_date: due, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) return console.error(err);
    updateGeneralPrayer(id, { pray_date: due });
  };

  // ─── Session logs ───
  const handleLogNoteSave = async (logId: number, note: string) => {
    const value = note.trim() === '' ? null : note;
    const prev = sessionLogs;
    setSessionLogs((cur) => cur.map((l) => (l.id === logId ? { ...l, note: value } : l)));
    const { error: err } = await supabase
      .from('prayer_session_logs')
      .update({ note: value })
      .eq('id', logId);
    if (err) {
      console.error(err);
      setSessionLogs(prev);
    }
  };

  const handleLogDelete = async (logId: number) => {
    const prev = sessionLogs;
    setSessionLogs((cur) => cur.filter((l) => l.id !== logId));
    const { error: err } = await supabase.from('prayer_session_logs').delete().eq('id', logId);
    if (err) {
      console.error(err);
      setSessionLogs(prev);
    }
  };

  // One-and-done: a single tap logs a prayer session. Pass openNote=true to also
  // open the note editor for that session (the separate "add note" action).
  const handleLogLeaderSession = async (leaderId: number, openNote = false) => {
    if (!currentUserId) return;
    const today = new Date().toISOString().split('T')[0];
    const { data, error: err } = await supabase
      .from('prayer_session_logs')
      .insert([
        {
          prayer_point_id: leaderId,
          prayer_kind: 'leader_session',
          prayed_on: today,
          note: null,
          user_id: currentUserId,
        },
      ])
      .select('*')
      .single();
    if (err || !data) return console.error(err);
    setSessionLogs((prev) => [data as PrayerSessionLog, ...prev]);
    if (!openNote) return;
    // Note flow: reveal the session and open its note editor
    setDraftLeaderSessionIds((prev) => ({ ...prev, [leaderId]: data.id }));
    setLeaderSessionHistoryOpen((prev) => {
      const next = new Set(prev);
      next.add(leaderId);
      return next;
    });
    setExpandedLeaders((prev) => {
      const next = new Set(prev);
      next.add(leaderId);
      return next;
    });
  };

  const clearLeaderSessionDraft = (leaderId: number) => {
    setDraftLeaderSessionIds((prev) => {
      const next = { ...prev };
      delete next[leaderId];
      return next;
    });
  };

  const clearDraft = (kind: PrayerKind, prayerId: number) => {
    setDraftLogIds((prev) => {
      const next = { ...prev };
      delete next[logKey(kind, prayerId)];
      return next;
    });
  };

  // ─── Add new ───
  const addLeaderPrayer = async (leaderId: number) => {
    if (!newPrayerText.trim() || !currentUserId) return;
    const { data, error: err } = await supabase
      .from('acpd_prayer_points')
      .insert([
        {
          circle_leader_id: leaderId,
          user_id: currentUserId,
          content: newPrayerText.trim(),
          is_answered: false,
          is_shared: false,
          pray_date: newPrayerDate || null,
        },
      ])
      .select(`*, circle_leaders!inner ( id, name, campus, acpd )`)
      .single();
    if (err || !data) return console.error(err);
    const mapped: PrayerWithLeader = {
      ...(data as any),
      leader_name: (data as any).circle_leaders?.name || 'Unknown',
      leader_campus: (data as any).circle_leaders?.campus || undefined,
      leader_acpd: (data as any).circle_leaders?.acpd || undefined,
    };
    setAllPrayers((prev) => [mapped, ...prev]);
    setNewPrayerText('');
    setNewPrayerDate('');
    setShowNewPrayerDate(false);
    setAddingToLeader(null);
  };

  const addGeneralPrayer = async () => {
    if (!newGeneralText.trim() || !currentUserId) return;
    const { data, error: err } = await supabase
      .from('general_prayer_points')
      .insert([
        {
          user_id: currentUserId,
          content: newGeneralText.trim(),
          is_answered: false,
          is_shared: false,
          pray_date: newGeneralDate || null,
        },
      ])
      .select('*')
      .single();
    if (err || !data) return console.error(err);
    setGeneralPrayers((prev) => [data as GeneralPrayer, ...prev]);
    setNewGeneralText('');
    setNewGeneralDate('');
    setShowNewGeneralDate(false);
  };

  // ─── Expand/collapse ───
  const expandAll = () => {
    setGeneralExpanded(true);
    setLeaderSectionExpanded(true);
    setExpandedLeaders(new Set(groupedPrayers.map((g) => g.leaderId)));
  };
  const collapseAll = () => {
    setGeneralExpanded(false);
    setLeaderSectionExpanded(false);
    setExpandedLeaders(new Set());
  };
  const toggleLeader = (leaderId: number) => {
    setExpandedLeaders((prev) => {
      const next = new Set(prev);
      if (next.has(leaderId)) next.delete(leaderId);
      else next.add(leaderId);
      return next;
    });
  };

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111318]">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="h-5 bg-white/[0.07] rounded w-32 mb-2 animate-pulse" />
          <div className="h-3 bg-white/[0.07] rounded w-48 mb-8 animate-pulse" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 space-y-2">
                <div className="h-3 bg-white/[0.07] rounded w-40 animate-pulse" />
                <div className="h-4 bg-white/[0.07] rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-white/[0.07] rounded w-32 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ───
  return (
    <div className="min-h-screen bg-[#111318]">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-32">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white tracking-tight">Prayer</h1>
          <p className="text-sm text-slate-500 mt-1">
            {prayedTodayCount > 0 ? (
              <>
                <span className="font-medium text-vc-400">{prayedTodayCount} prayed today</span>
                {' · '}
                {totalLeaders} circles
              </>
            ) : (
              <>
                {totalLeaders} circles · {totalPrayers} prayer point{totalPrayers !== 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>

        <PrayerToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterCampus={filterCampus}
          onFilterCampusChange={setFilterCampus}
          filterAcpd={filterAcpd}
          onFilterAcpdChange={setFilterAcpd}
          campusList={campusList}
          acpdList={acpdList}
          sortDir={sortDir}
          onSortToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
        />

        {error && (
          <div className="mb-5 py-3 border-y border-rose-500/20">
            <p className="text-sm text-rose-400">{error}</p>
            <button
              onClick={loadData}
              className="mt-1 text-xs text-rose-300 hover:text-rose-200 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* General Prayer Points */}
        <section className="mb-8">
          <PrayerSectionHeader
            label="Prayer Points"
            count={filteredGeneralPrayers.length}
            expanded={generalExpanded}
            onToggle={() => setGeneralExpanded((v) => !v)}
          />

          {generalExpanded && (
            <div>
              {filteredGeneralPrayers.length === 0 ? (
                <div className="py-5 text-center">
                  <p className="text-sm text-slate-500">
                    {searchQuery ? 'No matching prayer points' : 'No prayer points yet'}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredGeneralPrayers.map((gp) => {
                    const key = logKey('general', gp.id);
                    const rowData: PrayerRowData = {
                      id: gp.id,
                      content: gp.content,
                      user_id: gp.user_id,
                      is_answered: gp.is_answered,
                      is_shared: gp.is_shared,
                      pray_date: gp.pray_date,
                      created_at: gp.created_at,
                    };
                    return (
                      <PrayerRow
                        key={gp.id}
                        kind="general"
                        data={rowData}
                        isOwner={currentUserId === gp.user_id}
                        currentUserId={currentUserId}
                        logs={logsByKey.get(key) || []}
                        draftLogId={draftLogIds[key] ?? null}
                        onContentSave={handleGeneralContentSave}
                        onDelete={handleGeneralDelete}
                        onShareToggle={handleGeneralShareToggle}
                        onAnswered={handleGeneralAnswered}
                        onDueDateSave={handleGeneralDueDateSave}
                        onLogNoteSave={handleLogNoteSave}
                        onLogDelete={handleLogDelete}
                        onDraftDismiss={() => clearDraft('general', gp.id)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Inline add general prayer */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={newGeneralText}
                  onChange={(e) => setNewGeneralText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addGeneralPrayer();
                  }}
                  placeholder="Add a prayer point"
                  className="flex-1 min-w-0 min-h-[44px] rounded-xl px-3 text-[15px] text-slate-100 placeholder-slate-500"
                />
                <button
                  onClick={() => setShowNewGeneralDate((v) => !v)}
                  className={`flex-shrink-0 h-11 w-11 flex items-center justify-center rounded-xl ring-1 transition-colors ${
                    showNewGeneralDate || newGeneralDate
                      ? 'text-amber-300 bg-amber-300/10 ring-amber-300/30'
                      : 'text-slate-400 ring-white/[0.1] hover:text-white hover:bg-white/[0.06]'
                  }`}
                  aria-label="Set due date"
                >
                  <Calendar strokeWidth={1.8} className="w-4 h-4" />
                </button>
                <button
                  onClick={addGeneralPrayer}
                  disabled={!newGeneralText.trim()}
                  className="flex-shrink-0 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 disabled:opacity-30 disabled:hover:bg-vc-500/15 transition"
                >
                  Add
                </button>
              </div>
              {showNewGeneralDate && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Due</span>
                  <input
                    type="date"
                    value={newGeneralDate}
                    onChange={(e) => setNewGeneralDate(e.target.value)}
                    className="bg-transparent border-0 border-b border-white/[0.1] py-1 text-xs text-slate-200 focus:outline-none focus:border-white/30"
                  />
                  {newGeneralDate && (
                    <button
                      onClick={() => setNewGeneralDate('')}
                      className="text-slate-500 hover:text-slate-200"
                    >
                      <X strokeWidth={1.5} className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Circle Leaders */}
        <section>
          <PrayerSectionHeader
            label="Circle Leaders"
            count={totalPrayers}
            expanded={leaderSectionExpanded}
            onToggle={() => setLeaderSectionExpanded((v) => !v)}
          />

          {leaderSectionExpanded && (
            <div>
              {groupedPrayers.length === 0 ? (
                <div className="mt-3 rounded-2xl bg-white/[0.025] border border-white/[0.06] py-12 text-center">
                  <Heart strokeWidth={1.5} className="h-8 w-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">
                    {searchQuery || filterCampus || filterAcpd
                      ? 'No matching prayers'
                      : 'No active circle leader prayers'}
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-white/[0.025] border border-white/[0.06] overflow-hidden divide-y divide-white/[0.05]">
                  {groupedPrayers.map((group) => {
                    const isExpanded = expandedLeaders.has(group.leaderId);
                    const leaderLogs = leaderSessionLogsByLeader.get(group.leaderId) || [];
                    const leaderSessionDraft = draftLeaderSessionIds[group.leaderId] ?? null;
                    const sessionHistoryOpen = leaderSessionHistoryOpen.has(group.leaderId);
                    const lastLeaderLog = leaderLogs[0];
                    const prayedToday = prayedTodayLeaderIds.has(group.leaderId);
                    const subtitle =
                      [
                        group.leaderCampus,
                        prayedToday
                          ? 'Prayed today'
                          : lastLeaderLog
                            ? `Prayed ${timeAgoFromTimestamp(lastLeaderLog.created_at)}`
                            : null,
                        group.prayers.length > 0
                          ? `${group.prayers.length} pt${group.prayers.length === 1 ? '' : 's'}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Tap to pray';
                    return (
                      <div key={group.leaderId} className={isExpanded ? 'bg-white/[0.015]' : ''}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <button
                            onClick={() => toggleLeader(group.leaderId)}
                            className="flex items-center gap-3 flex-1 min-w-0 min-h-[44px] text-left"
                          >
                            <span
                              className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                                prayedToday
                                  ? 'bg-vc-500/20 text-vc-300 ring-1 ring-vc-500/30'
                                  : 'bg-white/[0.06] text-slate-400'
                              }`}
                            >
                              {initialsOf(group.leaderName)}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[15px] font-medium text-white truncate">
                                {group.leaderName}
                              </span>
                              <span className="block text-xs text-slate-500 truncate">{subtitle}</span>
                            </span>
                          </button>
                          <div className="flex-shrink-0 flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLogLeaderSession(group.leaderId);
                              }}
                              className="inline-flex items-center justify-center rounded-full px-3.5 py-2 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition"
                              aria-label={`Log prayer for ${group.leaderName}`}
                            >
                              Pray
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLogLeaderSession(group.leaderId, true);
                              }}
                              className="h-9 w-9 flex items-center justify-center rounded-full ring-1 ring-white/[0.1] text-slate-400 hover:text-vc-300 hover:bg-vc-500/10 hover:ring-vc-500/25 active:scale-95 transition"
                              aria-label={`Log prayer and add a note for ${group.leaderName}`}
                              title="Pray and add a note"
                            >
                              <PenLine strokeWidth={1.8} className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-2 pt-1 border-t border-white/[0.04]">
                            {leaderLogs.length > 0 && (
                              <div className="py-2 text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                                <span>Last prayed {timeAgoFromTimestamp(leaderLogs[0].created_at)}</span>
                                <span className="text-slate-700">·</span>
                                <span>
                                  {leaderLogs.length} session{leaderLogs.length === 1 ? '' : 's'}
                                </span>
                                <span className="text-slate-700">·</span>
                                <button
                                  onClick={() =>
                                    setLeaderSessionHistoryOpen((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(group.leaderId)) next.delete(group.leaderId);
                                      else next.add(group.leaderId);
                                      return next;
                                    })
                                  }
                                  className="text-slate-400 hover:text-slate-200 transition-colors underline-offset-2 hover:underline"
                                >
                                  {sessionHistoryOpen || leaderSessionDraft
                                    ? 'Hide history'
                                    : 'View history'}
                                </button>
                              </div>
                            )}
                            {(sessionHistoryOpen || leaderSessionDraft) && leaderLogs.length > 0 && (
                              <PrayerSessionLogList
                                logs={leaderLogs}
                                draftLogId={leaderSessionDraft}
                                isOwnerOf={(log) => !!currentUserId && log.user_id === currentUserId}
                                onNoteSave={handleLogNoteSave}
                                onDelete={handleLogDelete}
                                onDraftDismiss={() => clearLeaderSessionDraft(group.leaderId)}
                              />
                            )}
                            {group.prayers.map((prayer) => {
                              const key = logKey('leader', prayer.id);
                              const rowData: PrayerRowData = {
                                id: prayer.id,
                                content: prayer.content,
                                user_id: prayer.user_id,
                                is_answered: prayer.is_answered,
                                is_shared: prayer.is_shared,
                                pray_date: prayer.pray_date,
                                created_at: prayer.created_at,
                                leader_id: prayer.circle_leader_id,
                                leader_name: prayer.leader_name,
                                leader_campus: prayer.leader_campus,
                                leader_acpd: prayer.leader_acpd,
                              };
                              return (
                                <PrayerRow
                                  key={prayer.id}
                                  kind="leader"
                                  data={rowData}
                                  isOwner={currentUserId === prayer.user_id}
                                  currentUserId={currentUserId}
                                  logs={logsByKey.get(key) || []}
                                  draftLogId={draftLogIds[key] ?? null}
                                  onContentSave={handleLeaderContentSave}
                                  onDelete={handleLeaderDelete}
                                  onShareToggle={handleLeaderShareToggle}
                                  onAnswered={handleLeaderAnswered}
                                  onDueDateSave={handleLeaderDueDateSave}
                                  onLogNoteSave={handleLogNoteSave}
                                  onLogDelete={handleLogDelete}
                                  onDraftDismiss={() => clearDraft('leader', prayer.id)}
                                />
                              );
                            })}

                            {/* Add prayer to this leader */}
                            {addingToLeader === group.leaderId ? (
                              <div className="py-3 space-y-2">
                                <textarea
                                  value={newPrayerText}
                                  onChange={(e) => setNewPrayerText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      addLeaderPrayer(group.leaderId);
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingToLeader(null);
                                      setNewPrayerText('');
                                      setNewPrayerDate('');
                                      setShowNewPrayerDate(false);
                                    }
                                  }}
                                  rows={2}
                                  autoFocus
                                  placeholder={`Add a prayer for ${group.leaderName}`}
                                  className="w-full rounded-xl px-3 py-2.5 text-[15px] text-slate-100 placeholder-slate-500 resize-none"
                                />
                                <div className="flex flex-wrap items-center gap-3 text-xs">
                                  <button
                                    onClick={() => setShowNewPrayerDate((v) => !v)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition active:scale-95 ${
                                      showNewPrayerDate || newPrayerDate
                                        ? 'text-amber-300 ring-amber-300/30 bg-amber-300/10'
                                        : 'text-slate-400 ring-white/[0.1] hover:text-white hover:bg-white/[0.06]'
                                    }`}
                                  >
                                    <Calendar strokeWidth={1.5} className="w-3.5 h-3.5" />
                                    {newPrayerDate ? newPrayerDate : 'Add due date'}
                                  </button>
                                  {showNewPrayerDate && (
                                    <input
                                      type="date"
                                      value={newPrayerDate}
                                      onChange={(e) => setNewPrayerDate(e.target.value)}
                                      className="bg-transparent border-0 border-b border-white/[0.1] py-1 text-xs text-slate-200 focus:outline-none focus:border-white/30"
                                    />
                                  )}
                                  <button
                                    onClick={() => addLeaderPrayer(group.leaderId)}
                                    disabled={!newPrayerText.trim()}
                                    className="ml-auto inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition disabled:opacity-30 disabled:hover:bg-vc-500/15"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAddingToLeader(null);
                                      setNewPrayerText('');
                                      setNewPrayerDate('');
                                      setShowNewPrayerDate(false);
                                    }}
                                    className="inline-flex items-center justify-center rounded-full px-3.5 py-2 text-xs font-medium text-slate-400 ring-1 ring-white/[0.1] hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setAddingToLeader(group.leaderId);
                                  setNewPrayerText('');
                                  setNewPrayerDate('');
                                  setShowNewPrayerDate(false);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 mt-1 mb-1 text-xs font-medium text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/15 active:scale-95 transition"
                              >
                                <Plus strokeWidth={1.8} className="w-3.5 h-3.5" />
                                Add prayer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="text-center pt-10">
          <p className="text-xs text-slate-700">
            <Link href="/boards" className="text-slate-500 hover:text-slate-200 transition-colors">
              Boards
            </Link>
            <span className="mx-2 text-white/[0.06]">·</span>
            <Link href="/leaders" className="text-slate-500 hover:text-slate-200 transition-colors">
              All Leaders
            </Link>
            <span className="mx-2 text-white/[0.06]">·</span>
            <Link
              href="/settings"
              className="text-slate-500 hover:text-slate-200 transition-colors"
            >
              Settings
            </Link>
          </p>
        </div>
      </div>

      {/* Save answered prayer as a note */}
      <Modal
        isOpen={!!answeredNotePrompt}
        onClose={closeAnsweredNotePrompt}
        title="Prayer answered 🎉"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Would you like to save this as a note on{' '}
            <span className="font-medium text-slate-200">
              {answeredNotePrompt?.leaderName}
            </span>
            &rsquo;s profile?
          </p>
          <textarea
            value={answeredNoteText}
            onChange={(e) => setAnsweredNoteText(e.target.value)}
            rows={4}
            autoFocus
            className="w-full rounded-xl px-3 py-2.5 text-[15px] text-slate-100 placeholder-slate-500 resize-none bg-white/[0.04] ring-1 ring-white/[0.08] focus:outline-none focus:ring-vc-500/40"
            placeholder="Note to save on the leader's profile"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={closeAnsweredNotePrompt}
              className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium text-slate-400 ring-1 ring-white/[0.1] hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
            >
              Not now
            </button>
            <button
              onClick={handleSaveAnsweredNote}
              disabled={!answeredNoteText.trim() || savingAnsweredNote}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold bg-vc-500/15 text-vc-300 ring-1 ring-vc-500/25 hover:bg-vc-500/25 active:scale-95 transition disabled:opacity-30 disabled:hover:bg-vc-500/15"
            >
              {savingAnsweredNote ? 'Saving…' : 'Save as note'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function PrayerPage() {
  return (
    <ProtectedRoute>
      <PrayerListContent />
    </ProtectedRoute>
  );
}
