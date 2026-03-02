'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';

interface RosterPerson {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  mobilePhone: string;
}

interface CachedRosterPerson {
  ccb_individual_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  mobile_phone: string;
}

export default function CircleRosterPage() {
  const params = useParams();
  const router = useRouter();
  const leaderId = params.id as string;

  const [leaderName, setLeaderName] = useState('');
  const [ccbGroupId, setCcbGroupId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState('');
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load leader info and cached roster
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError('');

      try {
        // Get leader info
        const { data: leader, error: leaderErr } = await supabase
          .from('circle_leaders')
          .select('name, ccb_group_id')
          .eq('id', leaderId)
          .single();

        if (leaderErr || !leader) {
          setError('Leader not found');
          setIsLoading(false);
          return;
        }

        setLeaderName(leader.name || '');
        setCcbGroupId(leader.ccb_group_id || null);

        if (!leader.ccb_group_id) {
          setError('This leader does not have a CCB Group ID configured. Edit the leader profile to add one.');
          setIsLoading(false);
          return;
        }

        // Load cached roster
        const { data: cached, error: cacheErr } = await supabase
          .from('circle_roster_cache')
          .select('ccb_individual_id, first_name, last_name, full_name, email, phone, mobile_phone, fetched_at')
          .eq('circle_leader_id', leaderId)
          .order('full_name');

        if (!cacheErr && cached && cached.length > 0) {
          setRoster(
            cached.map((c: CachedRosterPerson & { fetched_at: string }) => ({
              id: c.ccb_individual_id,
              firstName: c.first_name,
              lastName: c.last_name,
              fullName: c.full_name,
              email: c.email || '',
              phone: c.phone || '',
              mobilePhone: c.mobile_phone || '',
            }))
          );
          setLastFetched(cached[0]?.fetched_at || null);
        }
      } catch (err) {
        setError('Failed to load leader data');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [leaderId]);

  // Fetch fresh roster from CCB
  const fetchRoster = useCallback(async () => {
    if (!ccbGroupId) return;

    setIsFetching(true);
    setError('');

    try {
      const res = await fetch('/api/ccb/group-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: ccbGroupId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || 'Failed to fetch roster');
      }

      const data = await res.json();
      const people: RosterPerson[] = data.data || [];

      // Save to Supabase cache
      // First delete old cache for this leader
      await supabase
        .from('circle_roster_cache')
        .delete()
        .eq('circle_leader_id', leaderId);

      // Insert new cache entries
      if (people.length > 0) {
        const rows = people.map((p) => ({
          circle_leader_id: parseInt(leaderId),
          ccb_group_id: ccbGroupId,
          ccb_individual_id: p.id,
          first_name: p.firstName,
          last_name: p.lastName,
          full_name: p.fullName,
          email: p.email || '',
          phone: p.phone || '',
          mobile_phone: p.mobilePhone || '',
          fetched_at: new Date().toISOString(),
        }));

        const { error: insertErr } = await supabase
          .from('circle_roster_cache')
          .insert(rows);

        if (insertErr) {
          console.error('Failed to cache roster:', insertErr);
        }
      }

      setRoster(people);
      setLastFetched(new Date().toISOString());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roster from CCB');
    } finally {
      setIsFetching(false);
    }
  }, [ccbGroupId, leaderId]);

  // Auto-fetch if no cached data
  useEffect(() => {
    if (!isLoading && ccbGroupId && roster.length === 0 && !error) {
      fetchRoster();
    }
  }, [isLoading, ccbGroupId, roster.length, error, fetchRoster]);

  const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

  const filteredRoster = searchQuery.trim()
    ? roster.filter(
        (p) =>
          p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.phone.includes(searchQuery) ||
          p.mobilePhone.includes(searchQuery)
      )
    : roster;

  const formatLastFetched = (date: string | null) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#111827' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 120px' }}>
        {/* Back nav */}
        <div style={{ marginBottom: '20px' }}>
          <Link
            href={`/circle/${leaderId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              color: '#9ca3af',
              textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Back to {leaderName || 'Circle Profile'}
          </Link>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0 }}>
              Circle Roster
            </h1>
            {leaderName && (
              <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '4px' }}>
                {leaderName}&rsquo;s circle group members
              </p>
            )}
          </div>
          {roster.length > 0 && !isLoading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1e3a5f',
                border: '1px solid #2563eb',
                borderRadius: '12px',
                padding: '8px 16px',
                minWidth: '64px',
              }}
            >
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#60a5fa', lineHeight: 1 }}>{roster.length}</span>
              <span style={{ fontSize: '11px', color: '#93c5fd', marginTop: '2px' }}>members</span>
            </div>
          )}
        </div>

        {/* CCB Group Link */}
        {ccbGroupId && !isLoading && (
          <a
            href={`https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=${ccbGroupId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: '#818cf8',
              textDecoration: 'none',
              marginBottom: '16px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Group in CCB
          </a>
        )}

        {/* Toolbar: search + refresh */}
        {ccbGroupId && !isLoading && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search roster..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  fontSize: '14px',
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6b7280"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <button
              onClick={fetchRoster}
              disabled={isFetching}
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 500,
                background: isFetching ? '#374151' : '#1d4ed8',
                color: isFetching ? '#9ca3af' : '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: isFetching ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {isFetching ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              )}
              {isFetching ? 'Fetching...' : 'Refresh'}
            </button>
          </div>
        )}

        {/* Last fetched indicator */}
        {lastFetched && !isLoading && (
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
            Last synced: {formatLastFetched(lastFetched)} &middot; {roster.length} member{roster.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Loading state */}
        {(isLoading || (isFetching && roster.length === 0)) && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 16px' }}>
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p style={{ fontSize: '14px' }}>
              {isLoading ? 'Loading...' : 'Fetching roster from CCB...'}
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div
            style={{
              background: '#7f1d1d20',
              border: '1px solid #991b1b',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '14px', color: '#fca5a5', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Roster list */}
        {!isLoading && !error && filteredRoster.length > 0 && (
          <div
            style={{
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {filteredRoster.map((person, idx) => {
              const contactPhone = person.mobilePhone || person.phone || '';
              const hasPhone = !!contactPhone;
              const hasEmail = !!person.email;

              return (
                <div
                  key={person.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: idx < filteredRoster.length - 1 ? '1px solid #374151' : 'none',
                  }}
                >
                  {/* Person info row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    {/* Avatar */}
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {person.firstName?.[0]?.toUpperCase() || ''}
                      {person.lastName?.[0]?.toUpperCase() || ''}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 600,
                          color: '#fff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {person.fullName}
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
                        {contactPhone && (
                          <span style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
                              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                            </svg>
                            {contactPhone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '6px', marginLeft: '52px' }}>
                    {/* Text */}
                    {hasPhone && (
                      <a
                        href={`sms:${phoneDigits(contactPhone)}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#34d399',
                          background: '#06543520',
                          border: '1px solid #065435',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Text
                      </a>
                    )}

                    {/* Call */}
                    {hasPhone && (
                      <a
                        href={`tel:${phoneDigits(contactPhone)}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#60a5fa',
                          background: '#1e3a5f20',
                          border: '1px solid #1e3a5f',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C7.82 21 3 16.18 3 10V5z" />
                        </svg>
                        Call
                      </a>
                    )}

                    {/* Email */}
                    {hasEmail && (
                      <a
                        href={`mailto:${person.email}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#a78bfa',
                          background: '#4c1d9520',
                          border: '1px solid #4c1d95',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Email
                      </a>
                    )}

                    {/* No contact info */}
                    {!hasPhone && !hasEmail && (
                      <span style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                        No contact info available
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state (after fetch, no results) */}
        {!isLoading && !isFetching && !error && roster.length === 0 && ccbGroupId && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: '0 auto 16px', opacity: 0.5 }}
            >
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p style={{ fontSize: '14px', margin: 0 }}>No members found in this group</p>
          </div>
        )}

        {/* No search results */}
        {!isLoading && !error && roster.length > 0 && filteredRoster.length === 0 && searchQuery && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: '#6b7280' }}>
            <p style={{ fontSize: '14px', margin: 0 }}>No members match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
