'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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

interface GeneralPrayer {
  id: number;
  user_id: string;
  content: string;
  is_answered: boolean;
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const { user, isAdmin } = useAuth();
  const [allPrayers, setAllPrayers] = useState<PrayerWithLeader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLeaders, setExpandedLeaders] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [newPrayerLeaderId, setNewPrayerLeaderId] = useState<number | null>(null);
  const [newPrayerText, setNewPrayerText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [filterAcpd, setFilterAcpd] = useState('');

  // General Prayer Points state
  const [generalPrayers, setGeneralPrayers] = useState<GeneralPrayer[]>([]);
  const [newGeneralText, setNewGeneralText] = useState('');
  const [editingGeneralId, setEditingGeneralId] = useState<number | null>(null);
  const [editGeneralText, setEditGeneralText] = useState('');
  const [confirmDeleteGeneral, setConfirmDeleteGeneral] = useState<number | null>(null);
  const [generalExpanded, setGeneralExpanded] = useState(true);

  // ─── Load all unanswered prayers with leader info ───
  const loadPrayers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all unanswered prayer points joined with leader name
      const { data: prayers, error: prayerError } = await supabase
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
        .order('created_at', { ascending: false });

      if (prayerError) throw prayerError;

      const mapped: PrayerWithLeader[] = (prayers || []).map((p: any) => ({
        ...p,
        leader_name: p.circle_leaders?.name || 'Unknown',
        leader_campus: p.circle_leaders?.campus || undefined,
        leader_acpd: p.circle_leaders?.acpd || undefined,
      }));

      setAllPrayers(mapped);

      // Expand all leaders by default
      const leaderIds = new Set(mapped.map(p => p.circle_leader_id));
      setExpandedLeaders(leaderIds);
    } catch (err: any) {
      console.error('Error loading prayers:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrayers();
  }, [loadPrayers]);

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

  // ─── General prayer CRUD ───
  const addGeneralPrayer = async () => {
    if (!newGeneralText.trim()) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error: insertErr } = await supabase
        .from('general_prayer_points')
        .insert([{ user_id: authUser.id, content: newGeneralText.trim(), is_answered: false }])
        .select('*')
        .single();

      if (insertErr) throw insertErr;
      setGeneralPrayers(prev => [data, ...prev]);
      setNewGeneralText('');
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

  const cancelEditingGeneral = () => {
    setEditingGeneralId(null);
    setEditGeneralText('');
  };

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

  // ─── Filtered general prayers (search) ───
  const filteredGeneralPrayers = useMemo(() => {
    if (!searchQuery.trim()) return generalPrayers;
    const q = searchQuery.toLowerCase();
    return generalPrayers.filter(gp => gp.content.toLowerCase().includes(q));
  }, [generalPrayers, searchQuery]);

  // ─── Derived filter option lists ───
  const campusList = useMemo(() => {
    const set = new Set<string>();
    allPrayers.forEach(p => { if (p.leader_campus) set.add(p.leader_campus); });
    return Array.from(set).sort();
  }, [allPrayers]);

  const acpdList = useMemo(() => {
    const set = new Set<string>();
    allPrayers.forEach(p => { if (p.leader_acpd) set.add(p.leader_acpd); });
    return Array.from(set).sort();
  }, [allPrayers]);

  // ─── Group prayers by leader ───
  const groupedPrayers = useMemo(() => {
    let filtered = allPrayers;

    // Campus filter
    if (filterCampus) {
      filtered = filtered.filter(p => p.leader_campus === filterCampus);
    }

    // ACPD filter
    if (filterAcpd) {
      filtered = filtered.filter(p => p.leader_acpd === filterAcpd);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.content.toLowerCase().includes(q) ||
          p.leader_name.toLowerCase().includes(q) ||
          (p.leader_campus && p.leader_campus.toLowerCase().includes(q)) ||
          (p.leader_acpd && p.leader_acpd.toLowerCase().includes(q))
      );
    }

    // Group by leader
    const groups = new Map<number, LeaderPrayerGroup>();
    for (const prayer of filtered) {
      if (!groups.has(prayer.circle_leader_id)) {
        groups.set(prayer.circle_leader_id, {
          leaderId: prayer.circle_leader_id,
          leaderName: prayer.leader_name,
          leaderCampus: prayer.leader_campus,
          leaderAcpd: prayer.leader_acpd,
          prayers: [],
        });
      }
      groups.get(prayer.circle_leader_id)!.prayers.push(prayer);
    }

    // Sort by leader name
    const sorted = Array.from(groups.values()).sort((a, b) => {
      const cmp = a.leaderName.localeCompare(b.leaderName);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [allPrayers, searchQuery, sortDir, filterCampus, filterAcpd]);

  // ─── Toggle prayer answered ───
  const handleToggleAnswered = async (prayer: PrayerWithLeader) => {
    try {
      const { error: updateError } = await supabase
        .from('acpd_prayer_points')
        .update({ is_answered: true, updated_at: new Date().toISOString() })
        .eq('id', prayer.id);

      if (updateError) throw updateError;

      // Add system note
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

      // Remove from local state
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

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
  };

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

  // ─── Add new prayer ───
  const handleAddPrayer = async () => {
    if (!newPrayerText.trim() || !newPrayerLeaderId) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error: insertError } = await supabase
        .from('acpd_prayer_points')
        .insert([{
          circle_leader_id: newPrayerLeaderId,
          user_id: authUser.id,
          content: newPrayerText.trim(),
          is_answered: false,
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
        next.add(newPrayerLeaderId);
        return next;
      });
      setNewPrayerText('');
      setNewPrayerLeaderId(null);
    } catch (err: any) {
      console.error('Error adding prayer:', err);
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

  // ─── Expand/Collapse All ───
  const expandAll = () => {
    setExpandedLeaders(new Set(groupedPrayers.map(g => g.leaderId)));
  };
  const collapseAll = () => {
    setExpandedLeaders(new Set());
  };

  // ─── Stats ───
  const totalPrayers = allPrayers.length;
  const totalLeaders = new Set(allPrayers.map(p => p.circle_leader_id)).size;
  const totalGeneral = generalPrayers.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-800 rounded-xl p-6 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/4 mb-4" />
                <div className="space-y-3">
                  <div className="h-12 bg-gray-700 rounded" />
                  <div className="h-12 bg-gray-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">

        {/* ── Header ────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Prayer List</h1>
              <p className="text-sm text-gray-400">
                All unanswered prayers across circle leaders
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-sm font-medium text-amber-300">{totalPrayers} Prayer{totalPrayers !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700/50 rounded-lg">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm text-gray-300">{totalLeaders} Leader{totalLeaders !== 1 ? 's' : ''}</span>
            </div>
            {totalGeneral > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span className="text-sm font-medium text-purple-300">{totalGeneral} Prayer Point{totalGeneral !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Filters ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={filterCampus}
            onChange={e => setFilterCampus(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
          >
            <option value="">All Campuses</option>
            {campusList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterAcpd}
            onChange={e => setFilterAcpd(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700/50 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-all"
          >
            <option value="">All ACPDs</option>
            {acpdList.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {(filterCampus || filterAcpd) && (
            <button
              onClick={() => { setFilterCampus(''); setFilterAcpd(''); }}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Toolbar ───────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search prayers or leaders..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700/50 rounded-xl text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-none transition-all"
            />
          </div>

          {/* Sort toggle */}
          <button
            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700/50 rounded-xl text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Name {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
          </button>

          {/* Expand/Collapse */}
          <div className="flex items-center gap-1">
            <button
              onClick={expandAll}
              className="px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-l-xl text-xs text-gray-400 hover:text-white hover:border-gray-600 transition-all"
              title="Expand all"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-2.5 bg-gray-800 border border-gray-700/50 rounded-r-xl text-xs text-gray-400 hover:text-white hover:border-gray-600 transition-all"
              title="Collapse all"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* ── Error state ───────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={loadPrayers} className="mt-2 text-xs text-red-300 underline">
              Try again
            </button>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────── */}
        {!error && groupedPrayers.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-amber-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">
              {searchQuery ? 'No matching prayers' : 'No unanswered prayers'}
            </h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              {searchQuery
                ? 'Try adjusting your search terms.'
                : 'All prayers have been answered, or none have been added yet. Add prayer points from individual circle leader pages.'}
            </p>
          </div>
        )}

        {/* ── Prayer Points (General) ──────────────────── */}
        <div className="mb-6">
          <div className="bg-gray-800/80 rounded-xl border border-purple-500/20 overflow-hidden">
            {/* Section header */}
            <button
              onClick={() => setGeneralExpanded(prev => !prev)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-700/20 transition-colors"
            >
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${generalExpanded ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
              <div className="w-9 h-9 rounded-full bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">Prayer Points</h3>
                <p className="text-[11px] text-gray-500">Ministry, church &amp; initiative prayers</p>
              </div>
              <span className="min-w-[24px] h-[24px] flex items-center justify-center px-1.5 text-[11px] font-bold rounded-full bg-purple-500/20 text-purple-400 flex-shrink-0">
                {filteredGeneralPrayers.length}
              </span>
            </button>

            {generalExpanded && (
              <div className="px-5 pb-5 border-t border-gray-700/30">
                {/* Add new prayer point */}
                <div className="flex items-center gap-2 mt-3 mb-3">
                  <input
                    type="text"
                    value={newGeneralText}
                    onChange={e => setNewGeneralText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addGeneralPrayer(); }}
                    placeholder="Add a prayer point..."
                    className="flex-1 px-3 py-2 bg-gray-900/60 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 focus:outline-none transition-all"
                  />
                  <button
                    onClick={addGeneralPrayer}
                    disabled={!newGeneralText.trim()}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>

                {/* Prayer point list */}
                {filteredGeneralPrayers.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">
                    {searchQuery ? 'No matching prayer points' : 'No prayer points yet. Add one above.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredGeneralPrayers.map(gp => (
                      <div
                        key={gp.id}
                        className="p-3 rounded-xl bg-gray-900/30 border border-gray-700/40 hover:border-purple-500/20 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <button
                            onClick={() => toggleGeneralAnswered(gp)}
                            className="mt-0.5 w-5 h-5 rounded-md border-2 border-gray-500 hover:border-purple-400 flex-shrink-0 flex items-center justify-center transition-colors"
                            title="Mark as answered"
                          >
                            <span className="sr-only">Mark answered</span>
                          </button>

                          {/* Content */}
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
                                  className="w-full px-3 py-2 bg-gray-900/60 border border-purple-500/40 rounded-lg text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 focus:outline-none transition-all resize-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={saveGeneralEdit}
                                    disabled={!editGeneralText.trim()}
                                    className="px-3 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditingGeneral}
                                    className="px-3 py-1 text-xs font-medium text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <span className="text-[10px] text-gray-600 ml-auto hidden sm:inline">Enter to save · Esc to cancel</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm text-gray-200 leading-relaxed">{gp.content}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-[10px] text-gray-500">{timeAgo(gp.created_at)} · {formatDate(gp.created_at)}</p>
                                  {/* Mobile action buttons */}
                                  <div className="flex items-center gap-1 sm:hidden">
                                    <button
                                      onClick={() => startEditingGeneral(gp)}
                                      className="p-1.5 rounded-md text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                                      title="Edit"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => deleteGeneralPrayer(gp.id)}
                                      className={`p-1 rounded-md transition-all ${
                                        confirmDeleteGeneral === gp.id
                                          ? 'bg-red-500/20 text-red-400'
                                          : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
                                      }`}
                                      title={confirmDeleteGeneral === gp.id ? 'Click again to delete' : 'Delete'}
                                    >
                                      {confirmDeleteGeneral === gp.id ? (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Desktop action buttons — hover reveal */}
                          {editingGeneralId !== gp.id && (
                            <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={() => startEditingGeneral(gp)}
                                className="flex-shrink-0 p-1.5 rounded-md text-gray-600 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                                title="Edit"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => deleteGeneralPrayer(gp.id)}
                                className={`flex-shrink-0 p-1 rounded-md transition-all ${
                                  confirmDeleteGeneral === gp.id
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
                                }`}
                                title={confirmDeleteGeneral === gp.id ? 'Click again to delete' : 'Delete'}
                              >
                                {confirmDeleteGeneral === gp.id ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Prayer groups by leader ───────────────────── */}
        <div className="space-y-4">
          {groupedPrayers.map(group => {
            const isExpanded = expandedLeaders.has(group.leaderId);

            return (
              <div
                key={group.leaderId}
                className="bg-gray-800/80 rounded-xl border border-gray-700/40 overflow-hidden hover:border-gray-700/60 transition-all"
              >
                {/* Leader header */}
                <button
                  onClick={() => toggleLeader(group.leaderId)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-700/20 transition-colors"
                >
                  {/* Expand chevron */}
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Leader avatar */}
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-amber-400">
                      {group.leaderName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">{group.leaderName}</h3>
                      {group.leaderCampus && (
                        <span className="text-[10px] text-gray-500 bg-gray-700/40 px-1.5 py-0.5 rounded">
                          {group.leaderCampus}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Count badge */}
                  <span className="min-w-[24px] h-[24px] flex items-center justify-center px-1.5 text-[11px] font-bold rounded-full bg-amber-500/20 text-amber-400 flex-shrink-0">
                    {group.prayers.length}
                  </span>
                </button>

                {/* Prayer list */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-2 border-t border-gray-700/30">
                    {group.prayers.map(prayer => (
                      <div
                        key={prayer.id}
                        className="p-3 rounded-xl bg-gray-900/30 border border-gray-700/40 hover:border-amber-500/20 transition-all group mt-2 first:mt-3"
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox to mark answered */}
                          <button
                            onClick={() => handleToggleAnswered(prayer)}
                            className="mt-0.5 w-5 h-5 rounded-md border-2 border-gray-500 hover:border-amber-400 flex-shrink-0 flex items-center justify-center transition-colors"
                            title="Mark as answered"
                          >
                            <span className="sr-only">Mark answered</span>
                          </button>

                          {/* Content — inline edit or display */}
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
                                  className="w-full px-3 py-2 bg-gray-900/60 border border-amber-500/40 rounded-lg text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-none transition-all resize-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={saveEdit}
                                    disabled={!editText.trim()}
                                    className="px-3 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditing}
                                    className="px-3 py-1 text-xs font-medium text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <span className="text-[10px] text-gray-600 ml-auto hidden sm:inline">Enter to save · Esc to cancel</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm text-gray-200 leading-relaxed">{prayer.content}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-[10px] text-gray-500">{timeAgo(prayer.created_at)} · {formatDate(prayer.created_at)}</p>
                                  {/* Mobile action buttons — inline in date row */}
                                  <div className="flex items-center gap-1 sm:hidden">
                                    <button
                                      onClick={() => startEditing(prayer)}
                                      className="p-1.5 rounded-md text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                                      title="Edit prayer"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <Link
                                      href={`/circle/${prayer.circle_leader_id}`}
                                      className="p-1.5 rounded-md text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                      title={`Go to ${prayer.leader_name}`}
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </Link>
                                    <button
                                      onClick={() => handleDelete(prayer.id)}
                                      className={`p-1 rounded-md transition-all ${
                                        confirmDelete === prayer.id
                                          ? 'bg-red-500/20 text-red-400'
                                          : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
                                      }`}
                                      title={confirmDelete === prayer.id ? 'Click again to delete' : 'Delete'}
                                    >
                                      {confirmDelete === prayer.id ? (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Desktop action buttons — hover reveal */}
                          {editingId !== prayer.id && (
                            <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={() => startEditing(prayer)}
                                className="flex-shrink-0 p-1.5 rounded-md text-gray-600 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                                title="Edit prayer"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <Link
                                href={`/circle/${prayer.circle_leader_id}`}
                                className="flex-shrink-0 p-1.5 rounded-md text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                title={`Go to ${prayer.leader_name}`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </Link>
                              <button
                                onClick={() => handleDelete(prayer.id)}
                                className={`flex-shrink-0 p-1 rounded-md transition-all ${
                                  confirmDelete === prayer.id
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
                                }`}
                                title={confirmDelete === prayer.id ? 'Click again to delete' : 'Delete'}
                              >
                                {confirmDelete === prayer.id ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Link to leader page */}
                    <div className="pt-2">
                      <Link
                        href={`/circle/${group.leaderId}`}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-amber-400 transition-colors"
                      >
                        View {group.leaderName}&apos;s profile
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
