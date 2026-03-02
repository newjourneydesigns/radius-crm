'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface LeaderBirthday {
  id: number;
  uniqueKey: string;
  name: string;
  campus?: string;
  birthday?: string;
  ccb_profile_link?: string;
  status?: string;
  role: 'Circle Leader' | 'Additional Leader';
  circleLeaderId: number; // parent circle leader id (same as id for circle leaders)
  circleLeaderName?: string; // name of the parent circle leader (for additional leaders)
}

function parseBirthday(raw: string | undefined | null): { month: number; day: number; year?: number; iso: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let m: number, d: number, y: number | undefined;
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    m = parseInt(parts[0], 10);
    d = parseInt(parts[1], 10);
    if (parts[2]) y = parseInt(parts[2], 10);
  } else if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else {
    return null;
  }
  if (isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = y ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : `2000-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { month: m, day: d, year: y, iso };
}

function formatBirthday(raw: string | undefined | null): string {
  const parsed = parseBirthday(raw);
  if (!parsed) return '';
  const { month, day, year } = parsed;
  const date = new Date(year ?? 2000, month - 1, day);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (year && year > 1900) opts.year = 'numeric';
  return date.toLocaleDateString('en-US', opts);
}

function isBirthdayToday(raw: string | undefined | null): boolean {
  const parsed = parseBirthday(raw);
  if (!parsed) return false;
  const now = new Date();
  return parsed.month === now.getMonth() + 1 && parsed.day === now.getDate();
}

function isBirthdayThisWeek(raw: string | undefined | null): boolean {
  const parsed = parseBirthday(raw);
  if (!parsed) return false;
  const now = new Date();
  const thisYear = now.getFullYear();
  const bdayThisYear = new Date(thisYear, parsed.month - 1, parsed.day);
  const diffMs = bdayThisYear.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 7;
}

/** Days until next birthday occurrence (0 = today) */
function daysUntilBirthday(raw: string | undefined | null): number {
  const parsed = parseBirthday(raw);
  if (!parsed) return 9999;
  const now = new Date();
  const thisYear = now.getFullYear();
  let bdayThisYear = new Date(thisYear, parsed.month - 1, parsed.day);
  // Reset "now" to start of day for clean comparison
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  if (bdayThisYear < today) {
    bdayThisYear = new Date(thisYear + 1, parsed.month - 1, parsed.day);
  }
  return Math.round((bdayThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type SortKey = 'name' | 'birthday' | 'campus' | 'role';

export default function BirthdayListPage() {
  const { isAuthenticated, isAdmin } = useAuth();
  const [leaders, setLeaders] = useState<LeaderBirthday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [selectedCampus, setSelectedCampus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'birthday', direction: 'asc' });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBirthdayValue, setEditBirthdayValue] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Load leaders
  useEffect(() => {
    if (!isClient) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('circle_leaders')
          .select('id, name, campus, birthday, ccb_profile_link, status, additional_leader_name, additional_leader_birthday')
          .not('status', 'in', '("archive","Inactive","Removed")')
          .order('name');
        if (error) throw error;

        // Build unified list: circle leaders + additional leaders
        const unified: LeaderBirthday[] = [];
        (data || []).forEach(l => {
          unified.push({
            id: l.id,
            uniqueKey: `cl-${l.id}`,
            name: l.name,
            campus: l.campus,
            birthday: l.birthday,
            ccb_profile_link: l.ccb_profile_link,
            status: l.status,
            role: 'Circle Leader',
            circleLeaderId: l.id,
          });
          if (l.additional_leader_name && l.additional_leader_name.trim()) {
            unified.push({
              id: l.id,
              uniqueKey: `al-${l.id}`,
              name: l.additional_leader_name,
              campus: l.campus,
              birthday: l.additional_leader_birthday,
              ccb_profile_link: undefined,
              status: l.status,
              role: 'Additional Leader',
              circleLeaderId: l.id,
              circleLeaderName: l.name,
            });
          }
        });
        setLeaders(unified);

        // Extract unique campuses
        const campusSet = new Set<string>();
        (data || []).forEach(l => { if (l.campus) campusSet.add(l.campus); });
        const uniqueCampuses = Array.from(campusSet);
        uniqueCampuses.sort();
        setCampuses(uniqueCampuses);
      } catch (err) {
        console.error('Failed to load leaders:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isClient]);

  // Filter and sort
  const filteredLeaders = useMemo(() => {
    let list = [...leaders];

    // Campus filter
    if (selectedCampus !== 'all') {
      list = list.filter(l => l.campus === selectedCampus);
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(l => l.name.toLowerCase().includes(term));
    }

    // Missing birthday filter
    if (showOnlyMissing) {
      list = list.filter(l => !l.birthday || !l.birthday.trim());
    }

    // Sort
    list.sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'name') {
        return dir * a.name.localeCompare(b.name);
      }
      if (sortConfig.key === 'campus') {
        return dir * (a.campus || '').localeCompare(b.campus || '');
      }
      if (sortConfig.key === 'role') {
        return dir * a.role.localeCompare(b.role);
      }
      if (sortConfig.key === 'birthday') {
        // Sort by upcoming birthday (soonest first)
        const dA = daysUntilBirthday(a.birthday);
        const dB = daysUntilBirthday(b.birthday);
        return dir * (dA - dB);
      }
      return 0;
    });

    return list;
  }, [leaders, selectedCampus, searchTerm, sortConfig, showOnlyMissing]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  const startEditing = (leader: LeaderBirthday) => {
    setEditingKey(leader.uniqueKey);
    const parsed = parseBirthday(leader.birthday);
    setEditBirthdayValue(parsed ? parsed.iso : '');
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditBirthdayValue('');
  };

  const saveBirthday = async (leader: LeaderBirthday) => {
    setSavingKey(leader.uniqueKey);
    try {
      const updateField = leader.role === 'Additional Leader' ? 'additional_leader_birthday' : 'birthday';
      const { error } = await supabase
        .from('circle_leaders')
        .update({ [updateField]: editBirthdayValue || null })
        .eq('id', leader.circleLeaderId);
      if (error) throw error;
      // Update local state
      setLeaders(prev =>
        prev.map(l => l.uniqueKey === leader.uniqueKey ? { ...l, birthday: editBirthdayValue || undefined } : l)
      );
      setEditingKey(null);
      setEditBirthdayValue('');
    } catch (err) {
      console.error('Failed to save birthday:', err);
      alert('Failed to save birthday. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const todayCount = useMemo(() => leaders.filter(l => isBirthdayToday(l.birthday)).length, [leaders]);
  const thisWeekCount = useMemo(() => leaders.filter(l => isBirthdayThisWeek(l.birthday) && !isBirthdayToday(l.birthday)).length, [leaders]);
  const missingCount = useMemo(() => leaders.filter(l => !l.birthday || !l.birthday.trim()).length, [leaders]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) {
      return (
        <svg className="w-3.5 h-3.5 ml-1 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l4 4 4-4M8 9l4-4 4 4" />
        </svg>
      );
    }
    return sortConfig.direction === 'asc' ? (
      <svg className="w-3.5 h-3.5 ml-1 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l4 4 4-4" />
      </svg>
    ) : (
      <svg className="w-3.5 h-3.5 ml-1 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4" />
      </svg>
    );
  };

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            🎂 Birthday List
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View and manage birthdays for all Circle leaders
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{filteredLeaders.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Leaders</div>
          </div>
          <div className={`rounded-xl border p-4 ${todayCount > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
            <div className={`text-2xl font-bold ${todayCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{todayCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Today 🎉</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{thisWeekCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">This Week</div>
          </div>
          <button
            onClick={() => setShowOnlyMissing(v => !v)}
            className={`rounded-xl border p-4 text-left transition-colors ${showOnlyMissing ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 ring-2 ring-red-500/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700'}`}
          >
            <div className={`text-2xl font-bold ${missingCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{missingCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{showOnlyMissing ? 'Showing Missing ✕' : 'Missing'}</div>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Campus filter */}
          <div className="relative">
            <select
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 pr-8 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-auto"
            >
              <option value="all">All Campuses</option>
              {campuses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 animate-pulse">
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        ) : filteredLeaders.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="text-4xl mb-3">🎂</div>
            <p className="text-gray-500 dark:text-gray-400">No leaders found matching your filters.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70">
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <span className="flex items-center">
                        Circle Leader
                        <SortIcon columnKey="name" />
                      </span>
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                      onClick={() => handleSort('campus')}
                    >
                      <span className="flex items-center">
                        Campus
                        <SortIcon columnKey="campus" />
                      </span>
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                      onClick={() => handleSort('birthday')}
                    >
                      <span className="flex items-center">
                        Birthday
                        <SortIcon columnKey="birthday" />
                      </span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Links
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {filteredLeaders.map((leader) => {
                    const isToday = isBirthdayToday(leader.birthday);
                    const isThisWeek = isBirthdayThisWeek(leader.birthday);
                    const isEditingThis = editingKey === leader.uniqueKey;
                    const isSavingThis = savingKey === leader.uniqueKey;

                    return (
                      <tr
                        key={leader.uniqueKey}
                        className={`transition-colors ${
                          isToday
                            ? 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/circle/${leader.circleLeaderId}`}
                              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                            >
                              {leader.name}
                            </Link>
                            {isToday && <span className="text-xs">🎉</span>}
                            {leader.role === 'Additional Leader' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                Additional
                              </span>
                            )}
                          </div>
                          {leader.role === 'Additional Leader' && leader.circleLeaderName && (
                            <Link href={`/circle/${leader.circleLeaderId}`} className="text-xs text-gray-400 dark:text-gray-500 hover:underline">
                              {leader.circleLeaderName}&apos;s Circle
                            </Link>
                          )}
                        </td>

                        {/* Campus */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 dark:text-gray-300">{leader.campus || '—'}</span>
                        </td>

                        {/* Birthday */}
                        <td className="px-4 py-3">
                          {isEditingThis ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={editBirthdayValue}
                                onChange={(e) => setEditBirthdayValue(e.target.value)}
                                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveBirthday(leader);
                                  if (e.key === 'Escape') cancelEditing();
                                }}
                              />
                              <button
                                onClick={() => saveBirthday(leader)}
                                disabled={isSavingThis}
                                className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50"
                                title="Save"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                title="Cancel"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(leader)}
                              className={`group flex items-center gap-1.5 text-sm rounded-md px-2 py-0.5 -ml-2 transition-colors ${
                                leader.birthday
                                  ? isToday
                                    ? 'text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30'
                                    : isThisWeek
                                      ? 'text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                                  : 'text-gray-400 dark:text-gray-500 italic hover:bg-gray-100 dark:hover:bg-gray-700/50'
                              }`}
                              title="Click to edit birthday"
                            >
                              {leader.birthday ? formatBirthday(leader.birthday) : 'Add birthday'}
                              <svg className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                          )}
                        </td>

                        {/* Links */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {leader.ccb_profile_link && (
                              <a
                                href={leader.ccb_profile_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                                title="View in CCB"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                                CCB
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700/50">
              {filteredLeaders.map((leader) => {
                const isToday = isBirthdayToday(leader.birthday);
                const isThisWeek = isBirthdayThisWeek(leader.birthday);
                const isEditingThis = editingKey === leader.uniqueKey;
                const isSavingThis = savingKey === leader.uniqueKey;

                return (
                  <div
                    key={leader.uniqueKey}
                    className={`p-4 ${
                      isToday ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/circle/${leader.circleLeaderId}`}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {leader.name}
                          </Link>
                          {isToday && <span className="text-xs">🎉</span>}
                          {leader.role === 'Additional Leader' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              Additional
                            </span>
                          )}
                        </div>
                        {leader.role === 'Additional Leader' && leader.circleLeaderName && (
                          <Link href={`/circle/${leader.circleLeaderId}`} className="text-xs text-gray-400 dark:text-gray-500 hover:underline">
                            {leader.circleLeaderName}&apos;s Circle
                          </Link>
                        )}
                        {leader.campus && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{leader.campus}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {leader.ccb_profile_link && (
                          <a
                            href={leader.ccb_profile_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 rounded-md"
                            title="CCB"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Birthday row */}
                    {isEditingThis ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="date"
                          value={editBirthdayValue}
                          onChange={(e) => setEditBirthdayValue(e.target.value)}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => saveBirthday(leader)}
                          disabled={isSavingThis}
                          className="p-1.5 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1.5 text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-md"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditing(leader)}
                        className={`flex items-center gap-1 text-sm mt-1 ${
                          leader.birthday
                            ? isToday
                              ? 'text-amber-700 dark:text-amber-300 font-semibold'
                              : isThisWeek
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-600 dark:text-gray-400'
                            : 'text-gray-400 dark:text-gray-500 italic'
                        }`}
                      >
                        🎂 {leader.birthday ? formatBirthday(leader.birthday) : 'Add birthday'}
                        <svg className="w-3 h-3 ml-1 opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
