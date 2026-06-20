'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import CCBPersonLookup from '../../components/ui/CCBPersonLookup';
import type { CCBPerson } from '../../components/ui/CCBPersonLookup';

interface CCBPosition {
  id: number;
  name: string;
}

interface CCBTeam {
  id: number;
  name: string;
  positions: CCBPosition[];
}

interface SchedulingCategoryPreview {
  id: number;
  name: string;
  campus?: { id: number; name: string };
  organizer?: { id: number; name: string; email?: string };
  recurrence_pattern?: string;
  archived?: boolean;
  positionCount: number;
  activeVolunteers: number;
  teams: CCBTeam[];
}

interface SelectedPosition {
  ccb_position_id: string;
  ccb_team_id: string;
  position_name: string;
}

interface DirectorEntry {
  id: number;
  name: string;
  active: boolean;
}

interface SettingsItem {
  id: number;
  value: string;
}

const VALID_STATUS_VALUES = ['invited', 'pipeline', 'on-boarding', 'active', 'paused', 'off-boarding'] as const;

const dedupeDirectorsByName = (items: DirectorEntry[] = []): DirectorEntry[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = (item?.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeItemsByValue = (items: SettingsItem[] = []): SettingsItem[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = (item?.value || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const recurrenceLabel: Record<string, string> = {
  WEEKLY: 'Weekly',
  DAILY: 'Daily',
  MONTHLY: 'Monthly',
  DOES_NOT_REPEAT: 'Does not repeat',
};

export default function ImportTeamPage() {
  const router = useRouter();

  // Category lookup state
  const [categoryIdInput, setCategoryIdInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [category, setCategory] = useState<SchedulingCategoryPreview | null>(null);

  // Position selection state
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    campus: '',
    director: '',
    status: '',
    teamName: '',
    leaderCcbProfileLink: '',
    ccbIndividualId: '',
  });

  // Reference data
  const [directors, setDirectors] = useState<DirectorEntry[]>([]);
  const [campuses, setCampuses] = useState<SettingsItem[]>([]);
  const [statuses, setStatuses] = useState<SettingsItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Submit state
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoadingData(true);
        const [directorsRes, campusesRes, statusesRes] = await Promise.all([
          supabase.from('directors_list').select('*').eq('active', true).order('name'),
          supabase.from('campuses').select('*').order('value'),
          supabase.from('statuses').select('*').order('value'),
        ]);
        if (directorsRes.data) setDirectors(dedupeDirectorsByName(directorsRes.data));
        if (campusesRes.data) setCampuses(dedupeItemsByValue(campusesRes.data));
        if (statusesRes.data) {
          const filtered = statusesRes.data.filter(s =>
            VALID_STATUS_VALUES.includes((s.value || '').trim().toLowerCase() as typeof VALID_STATUS_VALUES[number])
          );
          setStatuses(dedupeItemsByValue(filtered));
        }
      } finally {
        setIsLoadingData(false);
      }
    };
    load();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  async function handleLookup() {
    const id = categoryIdInput.trim();
    if (!id) return;
    setLookupLoading(true);
    setLookupError('');
    setCategory(null);
    setSelectedPositions(new Set());
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(`/api/ccb/scheduling-category?id=${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        setLookupError(json.error || 'Category not found. Check the ID and try again.');
        return;
      }
      setCategory(json);
      setFormData(prev => ({
        ...prev,
        teamName: json.name ?? prev.teamName,
        campus: json.campus?.name ?? prev.campus,
      }));
    } catch {
      setLookupError('Failed to reach CCB. Check your connection and try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  function togglePosition(positionId: string) {
    setSelectedPositions(prev => {
      const next = new Set(prev);
      if (next.has(positionId)) {
        next.delete(positionId);
      } else {
        next.add(positionId);
      }
      return next;
    });
  }

  function getSelectedPositionPayload(): SelectedPosition[] {
    if (!category) return [];
    const result: SelectedPosition[] = [];
    for (const team of category.teams) {
      for (const pos of team.positions) {
        if (selectedPositions.has(String(pos.id))) {
          result.push({
            ccb_position_id: String(pos.id),
            ccb_team_id: String(team.id),
            position_name: pos.name,
          });
        }
      }
    }
    return result;
  }

  const allPositions = category?.teams.flatMap(t => t.positions) ?? [];
  const hasPositions = allPositions.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    if (hasPositions && selectedPositions.size === 0) {
      setError('Select at least one position this leader manages.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess(false);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      // Step 1: create the leader
      const res = await fetch('/api/circle-leaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          leader_type: 'host_team',
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          campus: formData.campus || null,
          status: formData.status || null,
          team_name: formData.teamName || null,
          director: formData.director || null,
          ccb_category_id: String(category.id),
          leader_ccb_profile_link: formData.leaderCcbProfileLink || null,
          ccb_individual_id: formData.ccbIndividualId || null,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to import team leader. Please try again.');
      }

      const created = await res.json();
      const leaderId = created?.id ?? created?.data?.id;

      // Step 2: save managed positions
      const positions = getSelectedPositionPayload();
      if (leaderId && positions.length > 0) {
        await fetch('/api/host-team-positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ leader_id: leaderId, positions }),
        });
      }

      setSuccess(true);
      setTimeout(() => router.push(leaderId ? `/circle/${leaderId}/roster` : '/boards'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import team leader. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-vc-500 focus:border-vc-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Import Host Team</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Look up a CCB scheduling category, choose which positions this leader manages, and create their RADIUS profile.
          </p>
        </div>

        {isLoadingData ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vc-500 mx-auto"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Loading form data...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">

            {/* Card 1: CCB Category Lookup */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">CCB Scheduling Category</h2>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <p className={`${labelClass} mb-1`}>
                  Enter the numeric ID from the CCB scheduling URL
                  {' '}(<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs font-mono">scheduling/categories/238</code>)
                </p>
                <div className="flex gap-3 items-start">
                  <div>
                    <input
                      type="number"
                      placeholder="e.g. 238"
                      value={categoryIdInput}
                      onChange={e => setCategoryIdInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleLookup())}
                      className={inputClass + ' w-36'}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleLookup}
                    disabled={lookupLoading || !categoryIdInput.trim()}
                    className="btn-primary px-4 py-2 rounded-lg text-sm mt-1"
                  >
                    {lookupLoading ? 'Looking up…' : 'Look up'}
                  </button>
                </div>

                {lookupError && (
                  <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
                    <div className="flex">
                      <svg className="h-5 w-5 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="ml-2 text-sm text-red-800 dark:text-red-400">{lookupError}</p>
                    </div>
                  </div>
                )}

                {category && (
                  <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4 space-y-1">
                    {category.archived && (
                      <span className="inline-block text-xs font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded mb-1">Archived</span>
                    )}
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{category.name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {category.campus && <span>📍 {category.campus.name}</span>}
                      {category.recurrence_pattern && (
                        <span>🔁 {recurrenceLabel[category.recurrence_pattern] ?? category.recurrence_pattern}</span>
                      )}
                      <span>👥 {category.activeVolunteers} active volunteer{category.activeVolunteers !== 1 ? 's' : ''}</span>
                      <span>🗂 {category.positionCount} position{category.positionCount !== 1 ? 's' : ''}</span>
                    </div>
                    {category.organizer && (
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Organizer: {category.organizer.name}
                        {category.organizer.email && ` · ${category.organizer.email}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Position Selector — shown after successful lookup */}
            {category && hasPositions && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Managed Positions</h2>
                    {selectedPositions.size > 0 && (
                      <span className="text-xs font-medium bg-vc-500/20 text-vc-400 px-2 py-0.5 rounded-full">
                        {selectedPositions.size} selected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Select the positions this team leader manages. Their serve team roster will show everyone in these positions.
                  </p>
                </div>
                <div className="p-4 sm:p-6 space-y-5">
                  {category.teams.map(team => (
                    <div key={team.id}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">{team.name}</p>
                      <div className="space-y-2">
                        {team.positions.map(pos => {
                          const posKey = String(pos.id);
                          const checked = selectedPositions.has(posKey);
                          return (
                            <label
                              key={pos.id}
                              className={`flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-vc-500/10 border border-vc-500/40'
                                  : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePosition(posKey)}
                                className="h-4 w-4 rounded border-gray-300 text-vc-500 focus:ring-vc-500"
                              />
                              <span className={`text-sm font-medium ${checked ? 'text-vc-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {pos.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cards below only shown after successful lookup */}
            {category && (
              <>
                {/* Card 3: Team Information */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Team Leader Details</h2>
                  </div>
                  <div className="p-4 sm:p-6 space-y-4">

                    {/* CCB Person Lookup */}
                    <div>
                      <CCBPersonLookup
                        label="Fill from CCB"
                        placeholder="Search CCB by name or phone to auto-fill..."
                        onSelect={(person: CCBPerson) => {
                          setFormData(prev => ({
                            ...prev,
                            name: person.fullName,
                            phone: person.mobilePhone || person.phone || prev.phone,
                            email: person.email || prev.email,
                            leaderCcbProfileLink: person.profileLink || prev.leaderCcbProfileLink,
                            ccbIndividualId: person.id || prev.ccbIndividualId,
                          }));
                        }}
                      />
                      <div className="relative mt-3 mb-1">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-2 bg-white dark:bg-gray-800 text-gray-400">or enter manually</span>
                        </div>
                      </div>
                    </div>

                    {/* Team Name */}
                    <div>
                      <label htmlFor="teamName" className={labelClass}>Team Name</label>
                      <input
                        type="text"
                        name="teamName"
                        id="teamName"
                        value={formData.teamName}
                        onChange={handleChange}
                        className={inputClass}
                        placeholder="Pre-filled from CCB"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The name of the scheduling category from CCB.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="name" className={labelClass}>Leader Name *</label>
                        <input
                          type="text"
                          name="name"
                          id="name"
                          required
                          value={formData.name}
                          onChange={handleChange}
                          className={inputClass}
                          placeholder="Enter leader name"
                        />
                      </div>

                      <div>
                        <label htmlFor="email" className={labelClass}>Email</label>
                        <input
                          type="email"
                          name="email"
                          id="email"
                          value={formData.email}
                          onChange={handleChange}
                          className={inputClass}
                          placeholder="Enter email address"
                        />
                      </div>

                      <div>
                        <label htmlFor="phone" className={labelClass}>Phone</label>
                        <input
                          type="tel"
                          name="phone"
                          id="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          className={inputClass}
                          placeholder="Enter phone number"
                        />
                      </div>

                      <div>
                        <label htmlFor="campus" className={labelClass}>Campus</label>
                        <select name="campus" id="campus" value={formData.campus} onChange={handleChange} className={inputClass}>
                          <option value="">Select Campus</option>
                          {campuses.map(c => (
                            <option key={c.id} value={c.value}>{c.value}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="director" className={labelClass}>Director</label>
                        <select name="director" id="director" value={formData.director} onChange={handleChange} className={inputClass}>
                          <option value="">Select Director</option>
                          {directors.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                        {directors.length === 0 && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No directors found. Add them in Settings → Team Directors.</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="status" className={labelClass}>Status</label>
                        <select name="status" id="status" value={formData.status} onChange={handleChange} className={inputClass}>
                          <option value="">Select Status</option>
                          {statuses.map(s => (
                            <option key={s.id} value={s.value}>
                              {s.value.charAt(0).toUpperCase() + s.value.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {success && (
                  <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
                    <div className="flex">
                      <svg className="h-5 w-5 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800 dark:text-green-400">Team Leader imported — redirecting to their profile…</h3>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                    <div className="flex">
                      <svg className="h-5 w-5 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800 dark:text-red-400">{error}</h3>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => window.history.back()}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vc-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary px-4 py-2 rounded-lg text-sm"
                  >
                    {isLoading ? 'Importing…' : 'Import Team Leader'}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
