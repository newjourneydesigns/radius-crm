'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CardAssignment } from '../../lib/supabase';

interface SystemUser {
  id: string;
  name: string;
  email: string;
}

interface AssigneePickerProps {
  assignments: CardAssignment[];
  onAssign: (userId: string) => Promise<void>;
  onUnassign: (userId: string) => Promise<void>;
  fetchSystemUsers: () => Promise<SystemUser[]>;
}

export default function AssigneePicker({ assignments, onAssign, onUnassign, fetchSystemUsers }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadUsers = useCallback(async () => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    const data = await fetchSystemUsers();
    setUsers(data);
    setLoadingUsers(false);
  }, [fetchSystemUsers, users.length]);

  useEffect(() => {
    if (open) {
      loadUsers();
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [open, loadUsers]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const assignedIds = new Set(assignments.map(a => a.user_id));

  const filtered = users.filter(u => {
    if (assignedIds.has(u.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const getInitials = (name: string) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const handleAssign = async (userId: string) => {
    if (assigning) return;
    setAssigning(userId);
    try {
      await onAssign(userId);
      setSearch('');
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Assigned users chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: assignments.length > 0 ? 8 : 0 }}>
        {assignments.map(a => {
          const name = a.users?.name || a.users?.email || 'Unknown';
          return (
            <div
              key={a.user_id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#252836',
                border: '1px solid #2a2d3a',
                borderRadius: 6,
                padding: '3px 8px 3px 4px',
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#4f46e5',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getInitials(a.users?.name || '')}
              </span>
              <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{name}</span>
              <button
                onClick={() => onUnassign(a.user_id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 2,
                  fontSize: 14,
                  lineHeight: 1,
                }}
                title="Remove"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Add button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: open ? '#252836' : 'transparent',
          border: '1px dashed #2a2d3a',
          borderRadius: 6,
          color: '#9ca3af',
          cursor: 'pointer',
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 500,
          width: '100%',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
      >
        + Assign user
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#12141f',
            border: '1px solid #2a2d3a',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 100,
            maxHeight: 240,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #2a2d3a' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              style={{
                width: '100%',
                background: '#1a1d27',
                border: '1px solid #2a2d3a',
                borderRadius: 6,
                color: '#e2e8f0',
                padding: '6px 10px',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>

          {/* User list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loadingUsers ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                Loading users...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                {search ? 'No matching users' : 'All users assigned'}
              </div>
            ) : (
              filtered.map(u => (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAssign(u.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAssign(u.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    background: assigning === u.id ? '#252836' : 'transparent',
                    border: 'none',
                    padding: '8px 12px',
                    cursor: assigning ? 'default' : 'pointer',
                    color: '#e2e8f0',
                    fontSize: 12,
                    textAlign: 'left',
                    transition: 'background 0.1s',
                    opacity: assigning && assigning !== u.id ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!assigning) e.currentTarget.style.background = '#252836'; }}
                  onMouseLeave={e => { if (assigning !== u.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: '#374151',
                      color: '#d1d5db',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(u.name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || 'Unnamed'}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
