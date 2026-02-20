'use client';

import { useState, useEffect } from 'react';
import { useACPDTracking } from '../../hooks/useACPDTracking';
import { ScorecardDimension } from '../../lib/supabase';

const DIMENSIONS: { key: ScorecardDimension; label: string; color: string }[] = [
  { key: 'reach', label: 'Reach', color: 'text-blue-400' },
  { key: 'connect', label: 'Connect', color: 'text-green-400' },
  { key: 'disciple', label: 'Disciple', color: 'text-purple-400' },
  { key: 'develop', label: 'Develop', color: 'text-orange-400' },
];

interface ACPDTrackingSectionProps {
  leaderId: number;
  leaderName: string;
}

export default function ACPDTrackingSection({ leaderId, leaderName }: ACPDTrackingSectionProps) {
  const {
    prayerPoints, encouragements, coachingNotes,
    isLoading, loadAll,
    addPrayerPoint, togglePrayerAnswered, deletePrayerPoint,
    addEncouragement, markEncouragementSent, deleteEncouragement,
    addCoachingNote, toggleCoachingResolved, deleteCoachingNote,
  } = useACPDTracking();

  const [expandedSection, setExpandedSection] = useState<'pray' | 'encourage' | 'coach' | null>('pray');
  const [newPrayer, setNewPrayer] = useState('');
  const [newEncourageNote, setNewEncourageNote] = useState('');
  const [newEncourageType, setNewEncourageType] = useState<'sent' | 'planned'>('planned');
  const [newCoachDimension, setNewCoachDimension] = useState<ScorecardDimension>('reach');
  const [newCoachContent, setNewCoachContent] = useState('');

  useEffect(() => {
    loadAll(leaderId);
  }, [leaderId, loadAll]);

  const toggleSection = (section: 'pray' | 'encourage' | 'coach') => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const handleAddPrayer = async () => {
    if (!newPrayer.trim()) return;
    await addPrayerPoint(leaderId, newPrayer.trim());
    setNewPrayer('');
  };

  const handleAddEncouragement = async () => {
    await addEncouragement(leaderId, newEncourageType, newEncourageNote.trim() || undefined);
    setNewEncourageNote('');
  };

  const handleAddCoachNote = async () => {
    if (!newCoachContent.trim()) return;
    await addCoachingNote(leaderId, newCoachDimension, newCoachContent.trim());
    setNewCoachContent('');
  };

  const activePrayers = prayerPoints.filter(p => !p.is_answered);
  const lastSent = encouragements.find(e => e.message_type === 'sent');
  const nextPlanned = encouragements.find(e => e.message_type === 'planned');
  const openCoachNotes = coachingNotes.filter(n => !n.is_resolved);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          <div className="h-20 bg-gray-700 rounded"></div>
          <div className="h-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">ACPD Tracking</h2>
        <p className="text-xs text-gray-500 mt-0.5">Your engagement with {leaderName}</p>
      </div>

      <div className="divide-y divide-gray-700/50">
        {/* ─── Pray Section ──────────────────────────────────── */}
        <div>
          <button
            onClick={() => toggleSection('pray')}
            className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-sm font-medium text-white">Pray</span>
              {activePrayers.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full">{activePrayers.length}</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedSection === 'pray' ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSection === 'pray' && (
            <div className="px-6 pb-4 space-y-2">
              {/* Add prayer input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPrayer}
                  onChange={e => setNewPrayer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddPrayer()}
                  placeholder="Add a prayer point..."
                  className="flex-1 px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={handleAddPrayer}
                  disabled={!newPrayer.trim()}
                  className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Prayer list */}
              {prayerPoints.length === 0 ? (
                <p className="text-xs text-gray-500 py-2">No prayer points yet</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {prayerPoints.map(prayer => (
                    <div key={prayer.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-700/30 group">
                      <button
                        onClick={() => togglePrayerAnswered(prayer.id)}
                        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          prayer.is_answered
                            ? 'bg-amber-500 border-amber-500'
                            : 'border-gray-500 hover:border-amber-400'
                        }`}
                      >
                        {prayer.is_answered && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`text-sm flex-1 ${prayer.is_answered ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                        {prayer.content}
                      </span>
                      <button
                        onClick={() => deletePrayerPoint(prayer.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Encourage Section ──────────────────────────────── */}
        <div>
          <button
            onClick={() => toggleSection('encourage')}
            className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-sm font-medium text-white">Encourage</span>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedSection === 'encourage' ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSection === 'encourage' && (
            <div className="px-6 pb-4 space-y-3">
              {/* Last & Next message cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-3 bg-gray-900/40 rounded-lg border border-gray-700/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Last Message</span>
                  {lastSent ? (
                    <div className="mt-1">
                      <p className="text-sm text-white">{formatDate(lastSent.message_date)}</p>
                      {lastSent.note && <p className="text-xs text-gray-400 mt-0.5">{lastSent.note}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">No messages sent yet</p>
                  )}
                </div>
                <div className="p-3 bg-gray-900/40 rounded-lg border border-gray-700/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Next Planned</span>
                  {nextPlanned ? (
                    <div className="mt-1">
                      <p className="text-sm text-white">{formatDate(nextPlanned.message_date)}</p>
                      {nextPlanned.note && <p className="text-xs text-gray-400 mt-0.5">{nextPlanned.note}</p>}
                      <button
                        onClick={() => markEncouragementSent(nextPlanned.id, leaderId)}
                        className="mt-2 px-2 py-1 bg-green-600/30 text-green-400 text-xs rounded hover:bg-green-600/50 transition-colors"
                      >
                        Mark Sent
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">No message planned</p>
                  )}
                </div>
              </div>

              {/* Add encouragement */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newEncourageNote}
                    onChange={e => setNewEncourageNote(e.target.value)}
                    placeholder="Message note..."
                    className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
                  />
                </div>
                <select
                  value={newEncourageType}
                  onChange={e => setNewEncourageType(e.target.value as 'sent' | 'planned')}
                  className="px-2 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-white focus:outline-none"
                >
                  <option value="planned">Plan</option>
                  <option value="sent">Sent</option>
                </select>
                <button
                  onClick={handleAddEncouragement}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Encouragement history */}
              {encouragements.length > 2 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-xs text-gray-500">History</p>
                  {encouragements.slice(0, 10).map(enc => (
                    <div key={enc.id} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-gray-700/30 group">
                      <div className="flex items-center gap-2">
                        <span className={enc.message_type === 'sent' ? 'text-green-400' : 'text-gray-400'}>
                          {enc.message_type === 'sent' ? '✓ Sent' : '○ Planned'}
                        </span>
                        <span className="text-gray-500">{formatDate(enc.message_date)}</span>
                        {enc.note && <span className="text-gray-400 truncate max-w-48">{enc.note}</span>}
                      </div>
                      <button
                        onClick={() => deleteEncouragement(enc.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Coach Section ──────────────────────────────── */}
        <div>
          <button
            onClick={() => toggleSection('coach')}
            className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium text-white">Coach</span>
              {openCoachNotes.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">{openCoachNotes.length}</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedSection === 'coach' ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expandedSection === 'coach' && (
            <div className="px-6 pb-4 space-y-3">
              <p className="text-xs text-gray-500">Opportunities for growth</p>

              {/* Add coaching note */}
              <div className="flex gap-2 items-end">
                <select
                  value={newCoachDimension}
                  onChange={e => setNewCoachDimension(e.target.value as ScorecardDimension)}
                  className="px-2 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-white focus:outline-none"
                >
                  {DIMENSIONS.map(d => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newCoachContent}
                  onChange={e => setNewCoachContent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCoachNote()}
                  placeholder="Growth opportunity..."
                  className="flex-1 px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleAddCoachNote}
                  disabled={!newCoachContent.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Coaching notes grouped by dimension */}
              {DIMENSIONS.map(dim => {
                const dimNotes = coachingNotes.filter(n => n.dimension === dim.key);
                if (dimNotes.length === 0) return null;
                return (
                  <div key={dim.key} className="space-y-1">
                    <span className={`text-xs font-medium ${dim.color}`}>{dim.label}</span>
                    {dimNotes.map(note => (
                      <div key={note.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-700/30 group">
                        <button
                          onClick={() => toggleCoachingResolved(note.id)}
                          className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            note.is_resolved
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-gray-500 hover:border-blue-400'
                          }`}
                        >
                          {note.is_resolved && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span className={`text-sm flex-1 ${note.is_resolved ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                          {note.content}
                        </span>
                        <button
                          onClick={() => deleteCoachingNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}

              {coachingNotes.length === 0 && (
                <p className="text-xs text-gray-500 py-1">No coaching notes yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
