'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { supabase, PrayerPoint, CircleLeader } from '../../lib/supabase';
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
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(ts: string) {
  const now = new Date();
  const d = new Date(ts);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

// ── Main Component ─────────────────────────────────────

function PrayerListContent() {
  const { user } = useAuth();

  // Data
  const [allLeaders, setAllLeaders] = useState<SimpleLeader[]>([]);
  const [allPrayers, setAllPrayers] = useState<PrayerWithLeader[]>([]);
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

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('prayer_sortDir', sortDir);
    localStorage.setItem('prayer_search', searchQuery);
    localStorage.setItem('prayer_campus', filterCampus);
    localStorage.setItem('prayer_acpd', filterAcpd);
  }, [sortDir, searchQuery, filterCampus, filterAcpd]);

  // CRUD state
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [addingToLeader, setAddingToLeader] = useState<number | null>(null);
  const [newPrayerText, setNewPrayerText] = useState('');
  const [newPrayerDate, setNewPrayerDate] = useState('');

  // General Prayer Points state
  const [generalPrayers, setGeneralPrayers] = useState<GeneralPrayer[]>([]);
  const [newGeneralText, setNewGeneralText] = useState('');
  const [newGeneralDate, setNewGeneralDate] = useState('');
  const [editingGeneralId, setEditingGeneralId] = useState<number | null>(null);
  const [editGeneralText, setEditGeneralText] = useState('');
  const [confirmDeleteGeneral, setConfirmDeleteGeneral] = useState<number | null>(null);
  const [generalExpanded, setGeneralExpanded] = useState(true);

  // ─── Load all leaders + prayers ───
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [leadersRes, prayersRes] = await Promise.all([
        supabase
          .from('circle_leaders')
          .select('id, name, campus, acpd')
          .order('name', { ascending: true }),
        supabase
          .from('acpd_prayer_points')
          .select(`
            *,
            circle_leaders!inner (
              id,
              name,
              campus,
              acpd
            )
          `)
          .eq('is_answered', false)
          .order('created_at', { ascending: false }),
      ]);

      if (leadersRes.error) throw leadersRes.error;
      if (prayersRes.error) throw prayersRes.error;

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

      const leaderIdsWithPrayers = new Set(mapped.map(p => p.circle_leader_id));
      setExpandedLeaders(leaderIdsWithPrayers);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Load general prayer points ───
  const loadGeneralPrayers = useCallback(async () => {
    try {
      const { data, error: gpError } = await supabase
        .from('general_prayer_points')
        .select('*')
        .eq('is_answered', false)
        .order('created_at', { ascending: false });

      if (gpError) throw gpError;
      setGeneralPrayers(data || []);
    } catch (err: any) {
      console.error('Error loading general prayer points:', err);
    }
  }, []);

  useEffect(() => {
    loadGeneralPrayers();
  }, [loadGeneralPrayers]);

  // ─── Derived filter option lists ───
  const campusList = useMemo(() => {
    const set = new Set<string>();
    allLeaders.forEach(l => { if (l.campus) set.add(l.campus); });
    return Array.from(set).sort();
  }, [allLeaders]);

  const acpdList = useMemo(() => {
    const set = new Set<string>();
    allLeaders.forEach(l => { if (l.acpd) set.add(l.acpd); });
    return Array.from(set).sort();
  }, [allLeaders]);

  // ─── Group ALL leaders with their prayers ───
  const groupedPrayers = useMemo(() => {
    const prayersByLeader = new Map<number, PrayerWithLeader[]>();
    for (const prayer of allPrayers) {
      if (!prayersByLeader.has(prayer.circle_leader_id)) {
        prayersByLeader.set(prayer.circle_leader_id, []);
      }
      prayersByLeader.get(prayer.circle_leader_id)!.push(prayer);
    }

    let leaders = allLeaders;
    if (filterCampus) leaders = leaders.filter(l => l.campus === filterCampus);
    if (filterAcpd) leaders = leaders.filter(l => l.acpd === filterAcpd);

    const groups: LeaderPrayerGroup[] = leaders.map(leader => ({
      leaderId: leader.id,
      leaderName: leader.name,
      leaderCampus: leader.campus,
      leaderAcpd: leader.acpd,
      prayers: prayersByLeader.get(leader.id) || [],
    }));

    let filtered = groups;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = groups.filter(g =>
        g.leaderName.toLowerCase().includes(q) ||
        (g.leaderCampus && g.leaderCampus.toLowerCase().includes(q)) ||
        (g.leaderAcpd && g.leaderAcpd.toLowerCase().includes(q)) ||
        g.prayers.some(p => p.content.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      const cmp = a.leaderName.localeCompare(b.leaderName);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [allLeaders, allPrayers, searchQuery, sortDir, filterCampus, filterAcpd]);

  // ─── Filtered general prayers ───
  const filteredGeneralPrayers = useMemo(() => {
    if (!searchQuery.trim()) return generalPrayers;
    const q = searchQuery.toLowerCase();
    return generalPrayers.filter(gp => gp.content.toLowerCase().includes(q));
  }, [generalPrayers, searchQuery]);

  // ─── Toggle prayer answered ───
  const handleToggleAnswered = async (prayer: PrayerWithLeader) => {
    try {
      const { error: updateError } = await supabase
        .from('acpd_prayer_points')
        .update({ is_answered: true, updated_at: new Date().toISOString() })
        .eq('id', prayer.id);

      if (updateError) throw updateError;

      const truncated = prayer.content.length > 100
        ? prayer.content.substring(0, 100) + '...'
        : prayer.content;
      await supabase
        .from('notes')
        .insert([{
          circle_leader_id: prayer.circle_leader_id,
          content: `Prayer answered: "${truncated}"`,
          created_by: 'System',
        }]);

      setAllPrayers(prev => prev.filter(p => p.id !== prayer.id));
    } catch (err: any) {
      console.error('Error marking prayer answered:', err);
    }
  };

  // ─── Edit prayer ───
  const startEditing = (prayer: PrayerWithLeader) => {
    setEditingId(prayer.id);
    setEditText(prayer.content);
  };
  const cancelEditing = () => { setEditingId(null); setEditText(''); };
  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    try {
      const { error: updateError } = await supabase
        .from('acpd_prayer_points')
        .update({ content: editText.trim(), updated_at: new Date().toISOString() })
        .eq('id', editingId);
      if (updateError) throw updateError;
      setAllPrayers(prev =>
        prev.map(p => p.id === editingId ? { ...p, content: editText.trim() } : p)
      );
      setEditingId(null);
      setEditText('');
    } catch (err: any) {
      console.error('Error updating prayer:', err);
    }
  };

  // ─── Delete prayer ───
  const handleDelete = async (id: number) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    try {
      const { error: deleteError } = await supabase
        .from('acpd_prayer_points')
        .delete()
        .eq('id', id);
      if (deleteError) throw deleteError;
      setAllPrayers(prev => prev.filter(p => p.id !== id));
      setConfirmDelete(null);
    } catch (err: any) {
      console.error('Error deleting prayer:', err);
    }
  };

  // ─── Add prayer to leader ───
  const handleAddPrayer = async (leaderId: number) => {
    if (!newPrayerText.trim()) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error: insertError } = await supabase
        .from('acpd_prayer_points')
        .insert([{
          circle_leader_id: leaderId,
          user_id: authUser.id,
          content: newPrayerText.trim(),
          is_answered: false,
          is_shared: false,
          pray_date: newPrayerDate || null,
        }])
        .select(`
          *,
          circle_leaders!inner (
            id,
            name,
            campus,
            acpd
          )
        `)
        .single();

      if (insertError) throw insertError;

      const mapped: PrayerWithLeader = {
        ...data,
        leader_name: (data as any).circle_leaders?.name || 'Unknown',
        leader_campus: (data as any).circle_leaders?.campus || undefined,
        leader_acpd: (data as any).circle_leaders?.acpd || undefined,
      };

      setAllPrayers(prev => [mapped, ...prev]);
      setExpandedLeaders(prev => {
        const next = new Set(prev);
        next.add(leaderId);
        return next;
      });
      setNewPrayerText('');
      setNewPrayerDate('');
      setAddingToLeader(null);
    } catch (err: any) {
      console.error('Error adding prayer:', err);
    }
  };

  // ─── General prayer CRUD ───
  const addGeneralPrayer = async () => {
    if (!newGeneralText.trim()) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data, error: insertErr } = await supabase
        .from('general_prayer_points')
        .insert([{ user_id: authUser.id, content: newGeneralText.trim(), is_answered: false, is_shared: false, pray_date: newGeneralDate || null }])
        .select('*')
        .single();
      if (insertErr) throw insertErr;
      setGeneralPrayers(prev => [data, ...prev]);
      setNewGeneralText('');
      setNewGeneralDate('');
    } catch (err: any) {
      console.error('Error adding general prayer:', err);
    }
  };

  const toggleGeneralAnswered = async (gp: GeneralPrayer) => {
    try {
      const { error: updateErr } = await supabase
        .from('general_prayer_points')
        .update({ is_answered: true, updated_at: new Date().toISOString() })
        .eq('id', gp.id);
      if (updateErr) throw updateErr;
      setGeneralPrayers(prev => prev.filter(p => p.id !== gp.id));
    } catch (err: any) {
      console.error('Error toggling general prayer:', err);
    }
  };

  const startEditingGeneral = (gp: GeneralPrayer) => {
    setEditingGeneralId(gp.id);
    setEditGeneralText(gp.content);
  };
  const cancelEditingGeneral = () => { setEditingGeneralId(null); setEditGeneralText(''); };
  const saveGeneralEdit = async () => {
    if (!editingGeneralId || !editGeneralText.trim()) return;
    try {
      const { error: updateErr } = await supabase
        .from('general_prayer_points')
        .update({ content: editGeneralText.trim(), updated_at: new Date().toISOString() })
        .eq('id', editingGeneralId);
      if (updateErr) throw updateErr;
      setGeneralPrayers(prev =>
        prev.map(p => p.id === editingGeneralId ? { ...p, content: editGeneralText.trim() } : p)
      );
      setEditingGeneralId(null);
      setEditGeneralText('');
    } catch (err: any) {
      console.error('Error updating general prayer:', err);
    }
  };

  const deleteGeneralPrayer = async (id: number) => {
    if (confirmDeleteGeneral !== id) {
      setConfirmDeleteGeneral(id);
      setTimeout(() => setConfirmDeleteGeneral(null), 3000);
      return;
    }
    try {
      const { error: delErr } = await supabase
        .from('general_prayer_points')
        .delete()
        .eq('id', id);
      if (delErr) throw delErr;
      setGeneralPrayers(prev => prev.filter(p => p.id !== id));
      setConfirmDeleteGeneral(null);
    } catch (err: any) {
      console.error('Error deleting general prayer:', err);
    }
  };

  // ─── Toggle shared (leader prayer) ───
  const togglePrayerShared = async (prayer: PrayerWithLeader) => {
    try {
      const newState = !prayer.is_shared;
      const { error: updateError } = await supabase
        .from('acpd_prayer_points')
        .update({ is_shared: newState, updated_at: new Date().toISOString() })
        .eq('id', prayer.id);
      if (updateError) throw updateError;
      setAllPrayers(prev =>
        prev.map(p => p.id === prayer.id ? { ...p, is_shared: newState } : p)
      );
    } catch (err: any) {
      console.error('Error toggling prayer shared:', err);
    }
  };

  // ─── Toggle shared (general prayer) ───
  const toggleGeneralShared = async (gp: GeneralPrayer) => {
    try {
      const newState = !gp.is_shared;
      const { error: updateErr } = await supabase
        .from('general_prayer_points')
        .update({ is_shared: newState, updated_at: new Date().toISOString() })
        .eq('id', gp.id);
      if (updateErr) throw updateErr;
      setGeneralPrayers(prev =>
        prev.map(p => p.id === gp.id ? { ...p, is_shared: newState } : p)
      );
    } catch (err: any) {
      console.error('Error toggling general prayer shared:', err);
    }
  };

  // ─── Toggle leader expand/collapse ───
  const toggleLeader = (leaderId: number) => {
    setExpandedLeaders(prev => {
      const next = new Set(prev);
      if (next.has(leaderId)) {
        next.delete(leaderId);
      } else {
        next.add(leaderId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedLeaders(new Set(groupedPrayers.map(g => g.leaderId)));
  };
  const collapseAll = () => {
    setExpandedLeaders(new Set());
  };

  // ─── Stats ───
  const totalPrayers = allPrayers.length;
  const totalLeaders = allLeaders.length;
  const leadersWithPrayers = new Set(allPrayers.map(p => p.circle_leader_id)).size;
  const totalGeneral = generalPrayers.length;

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111318]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-white/[0.07] animate-pulse" />
            <div>
              <div className="h-5 bg-white/[0.07] rounded w-28 mb-1.5 animate-pulse" />
              <div className="h-3 bg-white/[0.07] rounded w-44 animate-pulse" />
            </div>
          </div>
          <div className="bg-[#161820] rounded-xl border border-white/[0.08] p-5 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#1a1c22] rounded-lg border border-white/[0.08] p-4 animate-pulse">
                <div className="h-4 bg-white/[0.07] rounded w-1/3 mb-3" />
                <div className="h-3 bg-white/[0.07] rounded w-full mb-2" />
                <div className="h-3 bg-white/[0.07] rounded w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111318]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">

        {/* ── Header ────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Prayer List</h1>
              <p className="text-xs text-slate-500">
                {totalPrayers} prayer{totalPrayers !== 1 ? 's' : ''} across {leadersWithPrayers} of {totalLeaders} circle{totalLeaders !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* ── Toolbar ───────────────────────────────── */}
        <div className="bg-[#161820] rounded-xl border border-white/[0.08] p-4 sm:p-5 mb-2 space-y-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search prayers or leaders..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2">
            <select
              value={filterCampus}
              onChange={e => setFilterCampus(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-sm text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Campuses</option>
              {campusList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterAcpd}
              onChange={e => setFilterAcpd(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-sm text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All ACPDs</option>
              {acpdList.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {(filterCampus || filterAcpd) && (
              <button
                onClick={() => { setFilterCampus(''); setFilterAcpd(''); }}
                className="flex-shrink-0 p-2 text-slate-500 hover:text-amber-400 transition-colors"
                title="Clear filters"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* Sort */}
            <button
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-colors"
            >
              {sortDir === 'asc' ? '↑ A–Z' : '↓ Z–A'}
            </button>

            {/* Expand */}
            <button
              onClick={expandAll}
              className="flex-1 flex items-center justify-center px-3 py-2 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-colors"
              title="Expand all"
            >
              Expand All
            </button>

            {/* Collapse */}
            <button
              onClick={collapseAll}
              className="flex-1 flex items-center justify-center px-3 py-2 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-colors"
              title="Collapse all"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* ── Error state ───────────────────────────── */}
        {error && (
          <div className="mb-2 p-4 bg-red-900/20 border border-red-500/30 rounded-xl">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={loadData} className="mt-2 text-xs text-red-300 hover:text-red-200 underline transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* ── Main Content Area ─────────────────────── */}
        <div className="bg-[#161820] rounded-xl border border-white/[0.08] p-5 sm:p-6">

          {/* ── Prayer Points (General) Section ──────── */}
          <div className="mb-7 mt-4">
            {/* Section header — email style */}
            <button
              onClick={() => setGeneralExpanded(prev => !prev)}
              className="w-full"
            >
              <div className="border-b-2 border-violet-500 pb-3.5 pt-2 mb-0 flex items-center gap-2.5 pl-2">
                <span className="bg-violet-500 text-white rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5 text-[11px] font-bold flex-shrink-0">
                  {filteredGeneralPrayers.length}
                </span>
                <span className="text-base font-bold text-slate-200 flex-1 text-left">Prayer Points</span>
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 mr-2 ${generalExpanded ? '' : '-rotate-90'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {generalExpanded && (
              <div className="mt-5">
                {/* Add new */}
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  <input
                    type="text"
                    value={newGeneralText}
                    onChange={e => setNewGeneralText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addGeneralPrayer(); }}
                    placeholder="Add a prayer point..."
                    className="flex-1 px-3.5 py-2.5 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <input
                    type="date"
                    value={newGeneralDate}
                    onChange={e => setNewGeneralDate(e.target.value)}
                    title="Pray on (optional)"
                    className="px-2 py-2.5 bg-[#1a1c22] border border-white/[0.08] rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36"
                  />
                  <button
                    onClick={addGeneralPrayer}
                    disabled={!newGeneralText.trim()}
                    className="btn-primary px-4 py-2.5 rounded-lg text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>

                {filteredGeneralPrayers.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    {searchQuery ? 'No matching prayer points' : 'No prayer points yet — add your first one above!'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredGeneralPrayers.map(gp => {
                      const isOwner = user?.id === gp.user_id;
                      return (
                      <div
                        key={gp.id}
                        className="bg-[#1a1c22] border border-white/[0.08] border-l-4 border-l-violet-500 rounded-md p-3 sm:p-3.5 group hover:border-white/[0.12] transition-all"
                      >
                        <div className="flex items-start gap-3">
                          {isOwner && (
                          <button
                            onClick={() => toggleGeneralAnswered(gp)}
                            className="mt-0.5 w-5 h-5 rounded border-2 border-white/[0.12] hover:border-violet-400 hover:bg-violet-500/10 flex-shrink-0 flex items-center justify-center transition-colors"
                            title="Mark as answered"
                          />
                          )}
                          <div className="flex-1 min-w-0">
                            {editingGeneralId === gp.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editGeneralText}
                                  onChange={e => setEditGeneralText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveGeneralEdit(); }
                                    if (e.key === 'Escape') cancelEditingGeneral();
                                  }}
                                  rows={2}
                                  autoFocus
                                  className="w-full px-3 py-2 bg-[#1a1c22] border border-white/[0.12] rounded-md text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button onClick={saveGeneralEdit} disabled={!editGeneralText.trim()} className="btn-primary px-3.5 py-1.5 rounded-lg text-xs font-semibold">Save</button>
                                  <button onClick={cancelEditingGeneral} className="px-3 py-1.5 text-xs font-semibold text-slate-400 bg-white/[0.07] hover:bg-white/[0.1] rounded-md transition-colors">Cancel</button>
                                  <span className="text-[10px] text-slate-600 ml-auto hidden sm:inline">Enter to save · Esc to cancel</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">{gp.content}</p>
                                <div className="flex items-center justify-between mt-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-slate-600">{timeAgo(gp.created_at)} · {formatDate(gp.created_at)}</span>
                                    {gp.is_shared && !isOwner && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        Shared
                                      </span>
                                    )}
                                  </div>
                                  {/* Mobile actions */}
                                  {isOwner && (
                                  <div className="flex items-center gap-1 sm:hidden">
                                    <button onClick={() => toggleGeneralShared(gp)} className={`p-1.5 rounded transition-colors ${gp.is_shared ? 'text-slate-400' : 'text-slate-600 hover:text-slate-400'}`} title={gp.is_shared ? 'Make private' : 'Share with team'}>
                                      <svg className="w-3.5 h-3.5" fill={gp.is_shared ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </button>
                                    <button onClick={() => startEditingGeneral(gp)} className="p-1.5 rounded text-slate-600 hover:text-slate-400 transition-colors" title="Edit">
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button onClick={() => deleteGeneralPrayer(gp.id)} className={`p-1 rounded transition-colors ${confirmDeleteGeneral === gp.id ? 'text-red-400' : 'text-slate-600 hover:text-red-400'}`} title={confirmDeleteGeneral === gp.id ? 'Click again to delete' : 'Delete'}>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={confirmDeleteGeneral === gp.id ? "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" : "M6 18L18 6M6 6l12 12"} /></svg>
                                    </button>
                                  </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {editingGeneralId !== gp.id && isOwner && (
                            <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => toggleGeneralShared(gp)} className={`p-2 rounded transition-colors ${gp.is_shared ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.07]'}`} title={gp.is_shared ? 'Make private' : 'Share with team'}>
                                <svg className="w-3.5 h-3.5" fill={gp.is_shared ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </button>
                              <button onClick={() => startEditingGeneral(gp)} className="p-2 rounded text-slate-600 hover:text-slate-400 hover:bg-white/[0.07] transition-colors" title="Edit">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => deleteGeneralPrayer(gp.id)} className={`p-2 rounded transition-colors ${confirmDeleteGeneral === gp.id ? 'text-red-400' : 'text-slate-600 hover:text-red-400 hover:bg-white/[0.07]'}`} title="Delete">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={confirmDeleteGeneral === gp.id ? "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" : "M6 18L18 6M6 6l12 12"} /></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Circle Leader Prayers Section ────────── */}
          <div>
            {/* Section header — email style */}
            <div className="border-b-2 border-amber-500 pb-2.5 mb-4 flex items-center gap-2.5">
              <span className="bg-amber-500 text-white rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5 text-[11px] font-bold flex-shrink-0">
                {totalPrayers}
              </span>
              <span className="text-base font-bold text-slate-200 flex-1">Circle Leader Prayers</span>
            </div>

            <div className="space-y-2.5">
              {groupedPrayers.map(group => {
                const isExpanded = expandedLeaders.has(group.leaderId);
                const hasPrayers = group.prayers.length > 0;
                const isAddingHere = addingToLeader === group.leaderId;

                return (
                  <div
                    key={group.leaderId}
                    className="bg-[#1a1c22] border border-white/[0.08] rounded-[10px] overflow-hidden hover:border-white/[0.12] transition-all"
                  >
                    {/* Leader header */}
                    <button
                      onClick={() => toggleLeader(group.leaderId)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.04] transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 text-slate-600 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/circle/${group.leaderId}`}
                            onClick={e => e.stopPropagation()}
                            className="text-[15px] font-bold text-white hover:text-indigo-300 truncate transition-colors"
                          >
                            {group.leaderName}
                          </Link>
                          {group.leaderCampus && (
                            <span className="hidden sm:inline text-xs text-slate-500">• {group.leaderCampus}</span>
                          )}
                          {group.leaderAcpd && (
                            <span className="hidden sm:inline text-xs text-slate-600">{group.leaderAcpd}</span>
                          )}
                        </div>
                      </div>

                      {/* Count badge */}
                      <span className={`min-w-[22px] h-[22px] flex items-center justify-center px-1.5 text-[11px] font-bold rounded-full flex-shrink-0 ${
                        hasPrayers
                          ? 'bg-amber-500 text-white'
                          : 'bg-white/[0.07] text-slate-600'
                      }`}>
                        {group.prayers.length}
                      </span>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-white/[0.08]">
                        {/* Prayer items */}
                        {group.prayers.length > 0 && (
                          <div className="space-y-2 mt-3">
                            {group.prayers.map(prayer => {
                              const isPrayerOwner = user?.id === prayer.user_id;
                              return (
                              <div
                                key={prayer.id}
                                className="bg-[#111318] border border-white/[0.08] border-l-4 border-l-amber-500 rounded-md p-3 group hover:border-white/[0.12] transition-all"
                              >
                                <div className="flex items-start gap-3">
                                  {isPrayerOwner && (
                                  <button
                                    onClick={() => handleToggleAnswered(prayer)}
                                    className="mt-0.5 w-5 h-5 rounded border-2 border-white/[0.12] hover:border-amber-400 hover:bg-amber-500/10 flex-shrink-0 flex items-center justify-center transition-colors"
                                    title="Mark as answered"
                                  />
                                  )}

                                  <div className="flex-1 min-w-0">
                                    {editingId === prayer.id ? (
                                      <div className="space-y-2">
                                        <textarea
                                          value={editText}
                                          onChange={e => setEditText(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                            if (e.key === 'Escape') cancelEditing();
                                          }}
                                          rows={2}
                                          autoFocus
                                          className="w-full px-3 py-2 bg-[#1a1c22] border border-white/[0.12] rounded-md text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                        />
                                        <div className="flex items-center gap-2">
                                          <button onClick={saveEdit} disabled={!editText.trim()} className="btn-primary px-3.5 py-1.5 rounded-lg text-xs font-semibold">Save</button>
                                          <button onClick={cancelEditing} className="px-3 py-1.5 text-xs font-semibold text-slate-400 bg-white/[0.07] hover:bg-white/[0.1] rounded-md transition-colors">Cancel</button>
                                          <span className="text-[10px] text-slate-600 ml-auto hidden sm:inline">Enter to save · Esc to cancel</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">{prayer.content}</p>
                                        <div className="flex items-center justify-between mt-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-slate-600">{timeAgo(prayer.created_at)} · {formatDate(prayer.created_at)}</span>
                                            {prayer.is_shared && !isPrayerOwner && (
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                Shared
                                              </span>
                                            )}
                                          </div>
                                          {/* Mobile actions */}
                                          <div className="flex items-center gap-1 sm:hidden">
                                            {isPrayerOwner && (
                                              <button onClick={() => togglePrayerShared(prayer)} className={`p-1.5 rounded transition-colors ${prayer.is_shared ? 'text-slate-400' : 'text-slate-600 hover:text-slate-400'}`} title={prayer.is_shared ? 'Make private' : 'Share with team'}>
                                                <svg className="w-3.5 h-3.5" fill={prayer.is_shared ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                              </button>
                                            )}
                                            {isPrayerOwner && (
                                              <button onClick={() => startEditing(prayer)} className="p-1.5 rounded text-slate-600 hover:text-slate-400 transition-colors" title="Edit">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                              </button>
                                            )}
                                            <Link href={`/circle/${prayer.circle_leader_id}`} className="p-1.5 rounded text-slate-600 hover:text-slate-400 transition-colors" title={`Go to ${prayer.leader_name}`}>
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            </Link>
                                            {isPrayerOwner && (
                                              <button onClick={() => handleDelete(prayer.id)} className={`p-1 rounded transition-colors ${confirmDelete === prayer.id ? 'text-red-400' : 'text-slate-600 hover:text-red-400'}`} title="Delete">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={confirmDelete === prayer.id ? "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" : "M6 18L18 6M6 6l12 12"} /></svg>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>

                                  {/* Desktop actions */}
                                  {editingId !== prayer.id && (
                                    <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                      {isPrayerOwner && (
                                        <button onClick={() => togglePrayerShared(prayer)} className={`p-2 rounded transition-colors ${prayer.is_shared ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.07]'}`} title={prayer.is_shared ? 'Make private' : 'Share with team'}>
                                          <svg className="w-3.5 h-3.5" fill={prayer.is_shared ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </button>
                                      )}
                                      {isPrayerOwner && (
                                        <button onClick={() => startEditing(prayer)} className="p-2 rounded text-slate-600 hover:text-slate-400 hover:bg-white/[0.07] transition-colors" title="Edit">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                      )}
                                      <Link href={`/circle/${prayer.circle_leader_id}`} className="p-2 rounded text-slate-600 hover:text-slate-400 hover:bg-white/[0.07] transition-colors" title={`Go to ${prayer.leader_name}`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                      </Link>
                                      {isPrayerOwner && (
                                        <button onClick={() => handleDelete(prayer.id)} className={`p-2 rounded transition-colors ${confirmDelete === prayer.id ? 'text-red-400' : 'text-slate-600 hover:text-red-400 hover:bg-white/[0.07]'}`} title="Delete">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={confirmDelete === prayer.id ? "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" : "M6 18L18 6M6 6l12 12"} /></svg>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Empty state */}
                        {!hasPrayers && !isAddingHere && (
                          <div className="text-center py-8">
                            <p className="text-sm text-slate-600 mb-3">No active prayers</p>
                            <button
                              onClick={() => { setAddingToLeader(group.leaderId); setNewPrayerText(''); }}
                              className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                              Add a prayer
                            </button>
                          </div>
                        )}

                        {/* Inline add prayer form */}
                        {isAddingHere && (
                          <div className="mt-3 p-3 rounded-md bg-[#111318] border border-white/[0.08] space-y-2">
                            <textarea
                              value={newPrayerText}
                              onChange={e => setNewPrayerText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddPrayer(group.leaderId); }
                                if (e.key === 'Escape') { setAddingToLeader(null); setNewPrayerText(''); }
                              }}
                              rows={2}
                              autoFocus
                              placeholder={`Add a prayer for ${group.leaderName}...`}
                              className="w-full px-3 py-2 bg-[#1a1c22] border border-white/[0.12] rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                            />
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500 shrink-0">Pray on:</label>
                              <input
                                type="date"
                                value={newPrayerDate}
                                onChange={e => setNewPrayerDate(e.target.value)}
                                className="px-2 py-1 bg-[#1a1c22] border border-white/[0.12] rounded-md text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAddPrayer(group.leaderId)}
                                disabled={!newPrayerText.trim()}
                                className="btn-primary px-4 py-1.5 rounded-lg text-xs font-semibold"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setAddingToLeader(null); setNewPrayerText(''); }}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-400 bg-white/[0.07] hover:bg-white/[0.1] rounded-md transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Footer: add + profile link */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.08]/50">
                          {!isAddingHere ? (
                            <button
                              onClick={() => { setAddingToLeader(group.leaderId); setNewPrayerText(''); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-400 hover:bg-white/[0.07]/50 rounded-md transition-colors font-semibold"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                              Add prayer
                            </button>
                          ) : <div />}
                          <Link
                            href={`/circle/${group.leaderId}`}
                            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                          >
                            View in Radius →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Empty search state ───────────────────── */}
          {!error && groupedPrayers.length === 0 && (
            <div className="text-center py-12">
              <div className="mb-3 flex justify-center">
                <SearchX className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-base text-slate-400 font-semibold mb-1">No matching circles</h3>
              <p className="text-sm text-slate-600">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────── */}
        <div className="text-center pt-6 pb-2">
          <p className="text-xs text-slate-700">
            <Link href="/boards" className="text-slate-400 hover:text-white no-underline transition-colors">Boards</Link>
            <span className="mx-2 text-white/[0.08]">•</span>
            <Link href="/leaders" className="text-slate-400 hover:text-white no-underline transition-colors">All Leaders</Link>
            <span className="mx-2 text-white/[0.08]">•</span>
            <Link href="/settings" className="text-slate-400 hover:text-white no-underline transition-colors">Settings</Link>
          </p>
        </div>
      </div>
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
