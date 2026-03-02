'use client';

import { useState, useCallback } from 'react';
import CCBPersonLookup from '../../components/ui/CCBPersonLookup';
import type { CCBPerson } from '../../components/ui/CCBPersonLookup';

export default function PersonLookupPage() {
  const [selectedPerson, setSelectedPerson] = useState<CCBPerson | null>(null);
  const [lookupKey, setLookupKey] = useState(0);

  const handleSelect = useCallback((person: CCBPerson) => {
    setSelectedPerson(person);
  }, []);

  const handleClear = () => {
    setSelectedPerson(null);
    setLookupKey((k) => k + 1);
  };

  // Format phone for tel: link (strip non-digits)
  const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

  const contactPhone = selectedPerson?.mobilePhone || selectedPerson?.phone || '';

  return (
    <div style={{ minHeight: '100vh', background: '#111827' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 16px 120px' }}>
        {/* Page header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', margin: 0 }}>
            Person Lookup
          </h1>
          <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '6px' }}>
            Search CCB for a person by name or phone number
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '24px' }}>
          <CCBPersonLookup
            key={lookupKey}
            onSelect={handleSelect}
            label="Search CCB"
            placeholder="Enter name or phone number..."
            autoFocus
          />
        </div>

        {/* Selected person card */}
        {selectedPerson && (
          <div
            style={{
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {/* Person info header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #374151' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Avatar */}
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {selectedPerson.firstName?.[0]?.toUpperCase() || ''}
                  {selectedPerson.lastName?.[0]?.toUpperCase() || ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2
                    style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: '#fff',
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {selectedPerson.fullName}
                  </h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    {contactPhone && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          color: '#9ca3af',
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        {contactPhone}
                      </span>
                    )}
                    {selectedPerson.email && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          color: '#9ca3af',
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        {selectedPerson.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: contactPhone ? 'repeat(3, 1fr)' : '1fr',
                gap: '1px',
                background: '#374151',
              }}
            >
              {/* Text */}
              {contactPhone && (
                <a
                  href={`sms:${phoneDigits(contactPhone)}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '16px 8px',
                    background: '#1f2937',
                    color: '#34d399',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'background 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#374151')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = '#1f2937')
                  }
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Text
                </a>
              )}

              {/* Call */}
              {contactPhone && (
                <a
                  href={`tel:${phoneDigits(contactPhone)}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '16px 8px',
                    background: '#1f2937',
                    color: '#60a5fa',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'background 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#374151')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = '#1f2937')
                  }
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C7.82 21 3 16.18 3 10V5z" />
                  </svg>
                  Call
                </a>
              )}

              {/* Email */}
              {selectedPerson.email ? (
                <a
                  href={`mailto:${selectedPerson.email}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '16px 8px',
                    background: '#1f2937',
                    color: '#a78bfa',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    transition: 'background 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#374151')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = '#1f2937')
                  }
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </a>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '16px 8px',
                    background: '#1f2937',
                    color: '#6b7280',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  No Email
                </div>
              )}
            </div>

            {/* Clear selection */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #374151' }}>
              <button
                onClick={handleClear}
                type="button"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#9ca3af',
                  background: 'transparent',
                  border: '1px solid #4b5563',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = '#6b7280';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9ca3af';
                  e.currentTarget.style.borderColor = '#4b5563';
                }}
              >
                Clear &amp; Search Again
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedPerson && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: '#6b7280',
            }}
          >
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
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <p style={{ fontSize: '14px', margin: 0 }}>
              Search above to find someone in CCB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
