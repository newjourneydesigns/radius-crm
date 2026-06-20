'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Fuse from 'fuse.js';
import { supabase } from '../../lib/supabase';

interface Volunteer {
  id: number;
  name: string;
  email: string;
  mobile: string;
  birthday: string;
  status: string;
}

interface PositionRoster {
  positionId: string;
  positionName: string;
  volunteers: Volunteer[];
}

interface CCBPosition {
  id: number;
  name: string;
}

interface CCBTeam {
  id: number;
  name: string;
  positions: CCBPosition[];
}

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

function formatBirthday(raw: string) {
  if (!raw) return '';
  try {
    const d = new Date(raw + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ServeTeamRoster({ leaderId }: { leaderId: string | number }) {
  const [positions, setPositions] = useState<PositionRoster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [noPositions, setNoPositions] = useState(false);
  const [ccbCategoryId, setCcbCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [managedPositions, setManagedPositions] = useState<Array<{ ccb_position_id: string; position_name: string }>>([]);
  const [removingPosition, setRemovingPosition] = useState<string | null>(null);

  // Position configurator state
  const [configuring, setConfiguring] = useState(false);
  const [categoryInput, setCategoryInput] = useState(''); // resolved numeric category ID (source of truth for save)
  const [categoryQuery, setCategoryQuery] = useState(''); // what the user types — name or ID
  const [allCategories, setAllCategories] = useState<Array<{ id: number; name: string; campus: string }>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categoryLookupLoading, setCategoryLookupLoading] = useState(false);
  const [categoryLookupError, setCategoryLookupError] = useState('');
  const [availableTeams, setAvailableTeams] = useState<CCBTeam[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');
    setNoPositions(false);

    try {
      const headers = await getAuthHeader();

      // Fetch leader's ccb_category_id
      const { data: leaderRow } = await supabase
        .from('circle_leaders')
        .select('ccb_category_id')
        .eq('id', String(leaderId))
        .single();

      const catId = leaderRow?.ccb_category_id ?? null;
      setCcbCategoryId(catId);
      if (catId) {
        setCategoryInput(catId);
        // Resolve the category name for the header (best-effort).
        fetch(`/api/ccb/scheduling-category?id=${encodeURIComponent(catId)}`, { headers })
          .then(r => (r.ok ? r.json() : null))
          .then(j => { if (j?.name) setCategoryName(j.name); })
          .catch(() => { /* name is best-effort */ });
      } else {
        setCategoryName('');
      }

      const res = await fetch(`/api/ccb/serve-team-roster?leader_id=${leaderId}`, { headers });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to load serve team roster');
      }

      const data: PositionRoster[] = await res.json();

      // Always load the leader's managed positions so we can show + remove them,
      // even when CCB returns no volunteers for them.
      const posRes = await fetch(`/api/host-team-positions?leader_id=${leaderId}`, { headers });
      const posData = await posRes.json().catch(() => []);
      const managed = Array.isArray(posData) ? posData : [];
      setManagedPositions(managed);
      if (managed.length === 0) {
        setNoPositions(true);
      }

      setPositions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load roster');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [leaderId, getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  const openConfigurator = useCallback(async () => {
    setConfiguring(true);
    setAvailableTeams([]);
    setSelectedPositions(new Set());
    setSaveError('');
    setCategoryLookupError('');
    setShowCategoryDropdown(false);
    // Seed the search box with the current category name (or ID) if set.
    setCategoryQuery(categoryName || ccbCategoryId || '');

    const headers = await getAuthHeader();

    // Load the category list once for name/ID search.
    if (allCategories.length === 0) {
      setCategoriesLoading(true);
      try {
        const res = await fetch('/api/ccb/scheduling-categories', { headers });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) setAllCategories(json);
        }
      } catch {
        /* search list is best-effort — manual ID entry still works */
      } finally {
        setCategoriesLoading(false);
      }
    }

    // Resolve the category name for display (best-effort) if we have an ID but
    // haven't fetched the name yet.
    if (ccbCategoryId && !categoryName) {
      try {
        const res = await fetch(`/api/ccb/scheduling-category?id=${encodeURIComponent(ccbCategoryId)}`, { headers });
        if (res.ok) {
          const json = await res.json();
          if (json?.name) {
            setCategoryName(json.name);
            setCategoryQuery(prev => prev || json.name);
          }
        }
      } catch {
        /* name is best-effort — ignore */
      }
    }
  }, [ccbCategoryId, categoryName, allCategories.length, getAuthHeader]);

  async function handleCategoryLookup(idArg?: string) {
    const id = (idArg ?? categoryInput).trim();
    if (!id) {
      setCategoryLookupError('Pick a category from the list or enter its ID.');
      return;
    }
    setShowCategoryDropdown(false);
    setCategoryInput(id);
    setCategoryLookupLoading(true);
    setCategoryLookupError('');
    setAvailableTeams([]);
    setSelectedPositions(new Set());

    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/ccb/scheduling-category?id=${encodeURIComponent(id)}`, { headers });
      const json = await res.json();
      if (!res.ok) {
        setCategoryLookupError(json.error || 'Category not found. Check the ID and try again.');
        return;
      }
      const teams: CCBTeam[] = json.teams ?? [];
      setAvailableTeams(teams);
      if (json.name) { setCategoryName(json.name); setCategoryQuery(json.name); }
      // Pre-check the positions this leader already manages so the checkboxes
      // reflect current state — unchecking + Save then removes them.
      const availableIds = new Set(teams.flatMap(t => t.positions.map(p => String(p.id))));
      const preChecked = new Set(
        managedPositions
          .map(p => String(p.ccb_position_id))
          .filter(id => availableIds.has(id))
      );
      setSelectedPositions(preChecked);
    } catch {
      setCategoryLookupError('Failed to reach CCB.');
    } finally {
      setCategoryLookupLoading(false);
    }
  }

  function togglePosition(posKey: string) {
    setSelectedPositions(prev => {
      const next = new Set(prev);
      if (next.has(posKey)) next.delete(posKey);
      else next.add(posKey);
      return next;
    });
  }

  async function handleSavePositions() {
    if (selectedPositions.size === 0) {
      setSaveError('Select at least one position.');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const headers = await getAuthHeader();
      const catId = categoryInput.trim();

      // Save category ID if it's not set yet (or if it changed)
      if (catId && catId !== ccbCategoryId) {
        const patchRes = await fetch('/api/circle-leaders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ leaderIds: [Number(leaderId)], field: 'ccb_category_id', value: catId }),
        });
        if (!patchRes.ok) {
          const json = await patchRes.json().catch(() => ({}));
          throw new Error(json.error || 'Failed to save CCB category ID');
        }
      }

      // Build position payload
      const positions: Array<{ ccb_position_id: string; ccb_team_id: string; position_name: string }> = [];
      for (const team of availableTeams) {
        for (const pos of team.positions) {
          if (selectedPositions.has(String(pos.id))) {
            positions.push({
              ccb_position_id: String(pos.id),
              ccb_team_id: String(team.id),
              position_name: pos.name,
            });
          }
        }
      }

      const res = await fetch('/api/host-team-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ leader_id: Number(leaderId), positions }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to save positions');
      }

      setConfiguring(false);
      setAvailableTeams([]);
      setSelectedPositions(new Set());
      load();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save positions');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveManagedPosition(positionId: string, positionName: string) {
    if (!window.confirm(`Remove "${positionName.trim()}" from this leader? Its volunteers will no longer show on the roster.`)) {
      return;
    }
    setRemovingPosition(positionId);
    setSaveError('');
    try {
      const headers = await getAuthHeader();
      const res = await fetch(
        `/api/host-team-positions?leader_id=${leaderId}&ccb_position_id=${encodeURIComponent(positionId)}`,
        { method: 'DELETE', headers }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to remove position');
      }
      // Reflect the removal locally, then refresh from the server.
      setSelectedPositions(prev => {
        const next = new Set(prev);
        next.delete(positionId);
        return next;
      });
      await load();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove position');
    } finally {
      setRemovingPosition(null);
    }
  }

  const allVolunteers = positions.flatMap(p => p.volunteers);
  const uniqueCount = new Set(allVolunteers.map(v => v.id)).size;

  const filtered: PositionRoster[] = searchQuery.trim()
    ? positions.map(p => ({
        ...p,
        volunteers: p.volunteers.filter(v =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.mobile.includes(searchQuery)
        ),
      })).filter(p => p.volunteers.length > 0)
    : positions;

  const allTeamPositions = availableTeams.flatMap(t => t.positions);

  // Fuzzy category search (by name) + direct ID match.
  const categoryFuse = useMemo(
    () => new Fuse(allCategories, { keys: ['name', 'campus'], threshold: 0.4, ignoreLocation: true }),
    [allCategories]
  );
  const categoryMatches = useMemo(() => {
    const q = categoryQuery.trim();
    if (!q) return [];
    // Selected already (query equals the resolved name) — don't show the dropdown.
    if (q === categoryName) return [];
    const byId = /^\d+$/.test(q)
      ? allCategories.filter(c => String(c.id).startsWith(q))
      : [];
    const byName = categoryFuse.search(q).map(r => r.item);
    const seen = new Set<number>();
    return [...byId, ...byName].filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, 8);
  }, [categoryQuery, categoryName, allCategories, categoryFuse]);

  function selectCategory(cat: { id: number; name: string }) {
    setCategoryQuery(cat.name);
    setCategoryName(cat.name);
    setShowCategoryDropdown(false);
    handleCategoryLookup(String(cat.id));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 120px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0 }}>Serve Team Roster</h1>
            {(categoryName || uniqueCount > 0) && (
              <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '4px' }}>
                {categoryName && <span style={{ color: '#93c5fd', fontWeight: 600 }}>{categoryName}</span>}
                {categoryName && uniqueCount > 0 && <span style={{ color: '#4b5563' }}> · </span>}
                {uniqueCount > 0 && `${uniqueCount} volunteer${uniqueCount !== 1 ? 's' : ''} across ${positions.length} position${positions.length !== 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          {!isLoading && !configuring && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {positions.length > 0 && (
                <button
                  type="button"
                  onClick={() => load(true)}
                  disabled={isRefreshing}
                  title="Refresh roster from CCB"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: isRefreshing ? '#374151' : '#1d4ed8',
                    color: isRefreshing ? '#9ca3af' : '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isRefreshing ? (
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  )}
                  {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              )}
              <button
                type="button"
                onClick={openConfigurator}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: '#374151',
                  color: '#d1d5db',
                  border: '1px solid #4b5563',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Positions
              </button>
            </div>
          )}
        </div>

        {/* ── Inline position configurator ── */}
        {configuring && (
          <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: 0 }}>Configure Managed Positions</p>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                  Enter the CCB scheduling category ID, then select which positions this leader manages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfiguring(false)}
                style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                aria-label="Cancel"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Currently managed positions — remove without re-looking up */}
              {managedPositions.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#9ca3af', marginBottom: categoryName ? '2px' : '8px' }}>
                    Currently managed
                  </label>
                  {categoryName && (
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#93c5fd', margin: '0 0 8px' }}>
                      {categoryName}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {managedPositions.map(p => {
                      const id = String(p.ccb_position_id);
                      const isRemoving = removingPosition === id;
                      return (
                        <div
                          key={id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: '#111827',
                            border: '1px solid #374151',
                            opacity: isRemoving ? 0.5 : 1,
                          }}
                        >
                          <span style={{ fontSize: '14px', color: '#d1d5db' }}>{p.position_name.trim()}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveManagedPosition(id, p.position_name)}
                            disabled={isRemoving}
                            title="Remove this position from the leader"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: isRemoving ? '#9ca3af' : '#f87171',
                              background: isRemoving ? '#37415130' : '#7f1d1d20',
                              border: `1px solid ${isRemoving ? '#374151' : '#991b1b'}`,
                              borderRadius: '6px',
                              cursor: isRemoving ? 'not-allowed' : 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            {isRemoving ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ borderBottom: '1px solid #374151', margin: '20px 0 0' }} />
                </div>
              )}

              {/* Category search — by name or ID */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#9ca3af', marginBottom: '6px' }}>
                  CCB Scheduling Category
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      value={categoryQuery}
                      onChange={e => {
                        setCategoryQuery(e.target.value);
                        setShowCategoryDropdown(true);
                        setAvailableTeams([]);
                        setSelectedPositions(new Set());
                        // Editing the text invalidates any resolved name/ID until re-selected.
                        if (e.target.value !== categoryName) setCategoryName('');
                      }}
                      onFocus={() => setShowCategoryDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 150)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (categoryMatches.length > 0) selectCategory(categoryMatches[0]);
                          else if (/^\d+$/.test(categoryQuery.trim())) handleCategoryLookup(categoryQuery.trim());
                        } else if (e.key === 'Escape') {
                          setShowCategoryDropdown(false);
                        }
                      }}
                      placeholder={categoriesLoading ? 'Loading categories…' : 'Search by name or ID (e.g. Host Teams or 238)'}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '14px',
                        background: '#111827',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    {showCategoryDropdown && categoryMatches.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          left: 0,
                          right: 0,
                          zIndex: 20,
                          background: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                          maxHeight: '280px',
                          overflowY: 'auto',
                        }}
                      >
                        {categoryMatches.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); selectCategory(cat); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px',
                              width: '100%',
                              padding: '10px 12px',
                              background: 'none',
                              border: 'none',
                              borderBottom: '1px solid #374151',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#111827')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: '14px', color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {cat.name}
                              </span>
                              {cat.campus && (
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>{cat.campus}</span>
                              )}
                            </span>
                            <span style={{ fontSize: '11px', color: '#6b7280', background: '#111827', border: '1px solid #374151', borderRadius: '6px', padding: '1px 6px', flexShrink: 0 }}>
                              #{cat.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (categoryMatches.length > 0) selectCategory(categoryMatches[0]);
                      else handleCategoryLookup(/^\d+$/.test(categoryQuery.trim()) ? categoryQuery.trim() : undefined);
                    }}
                    disabled={categoryLookupLoading || !categoryQuery.trim()}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      background: categoryLookupLoading ? '#374151' : '#2563eb',
                      color: categoryLookupLoading ? '#9ca3af' : '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: categoryLookupLoading ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {categoryLookupLoading ? 'Looking up…' : 'Look up'}
                  </button>
                </div>
                {categoryLookupError && (
                  <p style={{ fontSize: '13px', color: '#f87171', marginTop: '6px' }}>{categoryLookupError}</p>
                )}
              </div>

              {/* Position checkboxes */}
              {availableTeams.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#9ca3af' }}>
                      Select positions this leader manages
                    </label>
                    {selectedPositions.size > 0 && (
                      <span style={{ fontSize: '12px', color: '#60a5fa', background: '#1e3a5f', borderRadius: '10px', padding: '1px 8px' }}>
                        {selectedPositions.size} selected
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {availableTeams.map(team => (
                      <div key={team.id}>
                        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '6px' }}>
                          {team.name}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {team.positions.map(pos => {
                            const key = String(pos.id);
                            const checked = selectedPositions.has(key);
                            return (
                              <label
                                key={pos.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  background: checked ? '#1e3a5f30' : '#111827',
                                  border: `1px solid ${checked ? '#3b82f6' : '#374151'}`,
                                  transition: 'border-color 0.1s',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePosition(key)}
                                  style={{ width: '16px', height: '16px', accentColor: '#3b82f6', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '14px', fontWeight: checked ? 500 : 400, color: checked ? '#93c5fd' : '#d1d5db' }}>
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

              {saveError && (
                <p style={{ fontSize: '13px', color: '#f87171', marginBottom: '12px' }}>{saveError}</p>
              )}

              {allTeamPositions.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setConfiguring(false)}
                    style={{ padding: '8px 16px', fontSize: '13px', background: 'none', color: '#9ca3af', border: '1px solid #374151', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePositions}
                    disabled={saving || selectedPositions.size === 0}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      background: saving || selectedPositions.size === 0 ? '#374151' : '#2563eb',
                      color: saving || selectedPositions.size === 0 ? '#9ca3af' : '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: saving || selectedPositions.size === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? 'Saving…' : `Save ${selectedPositions.size > 0 ? `(${selectedPositions.size})` : ''}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        {!isLoading && positions.length > 0 && !configuring && (
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search volunteers..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                fontSize: '14px',
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px' }}>
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p style={{ fontSize: '14px' }}>Loading serve team roster…</p>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div style={{ background: '#7f1d1d20', border: '1px solid #991b1b', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', color: '#fca5a5', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* No positions configured empty state */}
        {noPositions && !isLoading && !error && !configuring && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px', opacity: 0.5 }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#d1d5db', marginBottom: '8px' }}>No positions configured</p>
            <p style={{ fontSize: '14px', marginBottom: '20px' }}>
              Select which CCB positions this leader manages to build their serve team roster.
            </p>
            <button
              type="button"
              onClick={openConfigurator}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Configure Positions
            </button>
          </div>
        )}

        {/* Positions + volunteers */}
        {!isLoading && !error && !configuring && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {filtered.map(position => (
              <div key={position.positionId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>
                    {position.positionName}
                  </span>
                  <span style={{ fontSize: '11px', color: '#4b5563', background: '#1f2937', border: '1px solid #374151', borderRadius: '10px', padding: '1px 8px' }}>
                    {position.volunteers.length}
                  </span>
                </div>

                <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '12px', overflow: 'hidden' }}>
                  {position.volunteers.map((person, idx) => {
                    const bday = formatBirthday(person.birthday);
                    const isInactive = person.status === 'INACTIVE';

                    return (
                      <div
                        key={person.id}
                        style={{
                          padding: '14px 16px',
                          borderBottom: idx < position.volunteers.length - 1 ? '1px solid #374151' : 'none',
                          opacity: isInactive ? 0.55 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <div style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #2a9329, #56c93f)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0,
                          }}>
                            {person.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {person.name}
                              </span>
                              {isInactive && (
                                <span style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', background: '#374151', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                              {person.email && (
                                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
                                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                  </svg>
                                  {person.email}
                                </span>
                              )}
                              {person.mobile && (
                                <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
                                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                                  </svg>
                                  {person.mobile}
                                </span>
                              )}
                              {bday && (
                                <span style={{ fontSize: '12px', color: '#fbbf24' }}>🎂 {bday}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', marginLeft: '52px' }}>
                          {person.mobile && (
                            <>
                              <a href={`sms:${phoneDigits(person.mobile)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '12px', fontWeight: 500, color: '#34d399', background: '#06543520', border: '1px solid #065435', borderRadius: '6px', textDecoration: 'none' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                Text
                              </a>
                              <a href={`tel:${phoneDigits(person.mobile)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '12px', fontWeight: 500, color: '#60a5fa', background: '#1e3a5f20', border: '1px solid #1e3a5f', borderRadius: '6px', textDecoration: 'none' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C7.82 21 3 16.18 3 10V5z" />
                                </svg>
                                Call
                              </a>
                            </>
                          )}
                          {person.email && (
                            <a href={`mailto:${person.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '12px', fontWeight: 500, color: '#a78bfa', background: '#4c1d9520', border: '1px solid #4c1d95', borderRadius: '6px', textDecoration: 'none' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              Email
                            </a>
                          )}
                          <a href={`https://valleycreekchurch.ccbchurch.com/goto/individuals/${person.id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', fontSize: '12px', fontWeight: 500, color: '#94a3b8', background: '#1e293b', border: '1px solid #3f3f46', borderRadius: '6px', textDecoration: 'none' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            CCB
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && positions.length > 0 && filtered.length === 0 && searchQuery && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: '#6b7280' }}>
            <p style={{ fontSize: '14px', margin: 0 }}>No volunteers match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}

        {/* Positions configured but roster returned empty — something is off */}
        {!isLoading && !error && !noPositions && !configuring && positions.length === 0 && !searchQuery && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#d1d5db', marginBottom: '8px' }}>No volunteers found</p>
            <p style={{ fontSize: '14px', marginBottom: '20px' }}>
              Positions are configured but no volunteers were returned from CCB.<br />
              Try re-saving your position selection or refreshing.
            </p>
            <button
              type="button"
              onClick={openConfigurator}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                background: '#374151',
                color: '#d1d5db',
                border: '1px solid #4b5563',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Re-configure positions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
