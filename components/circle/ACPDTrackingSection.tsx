'use client';

import { useState, useEffect } from 'react';
import { useACPDTracking } from '../../hooks/useACPDTracking';
import { useDevelopmentProspects } from '../../hooks/useDevelopmentProspects';
import { ScorecardDimension, EncourageMethod } from '../../lib/supabase';

const DIMENSIONS: { key: ScorecardDimension; label: string; color: string; bg: string; border: string; dot: string }[] = [
  { key: 'reach', label: 'Reach', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  { key: 'connect', label: 'Connect', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', dot: 'bg-green-400' },
  { key: 'disciple', label: 'Disciple', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', dot: 'bg-purple-400' },
  { key: 'develop', label: 'Develop', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-400' },
];

interface ACPDTrackingSectionProps {
  leaderId: number;
  leaderName: string;
  onNoteSaved?: () => Promise<void>;
}

const ENCOURAGE_METHODS: { key: EncourageMethod; label: string; icon: string }[] = [
  { key: 'text', label: 'Text', icon: '💬' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'call', label: 'Call', icon: '📞' },
  { key: 'in_person', label: 'In Person', icon: '🤝' },
  { key: 'card', label: 'Card', icon: '✉️' },
  { key: 'other', label: 'Other', icon: '📝' },
];

export default function ACPDTrackingSection({ leaderId, leaderName, onNoteSaved }: ACPDTrackingSectionProps) {
  const {
    prayerPoints, encouragements, coachingNotes,
    isLoading, loadAll,
    addPrayerPoint, togglePrayerAnswered, deletePrayerPoint,
    addEncouragement, markEncouragementSent, deleteEncouragement,
    addCoachingNote, toggleCoachingResolved, deleteCoachingNote,
  } = useACPDTracking();

  const {
    prospects, loadAll: loadProspects,
    addProspect, updateProspect, toggleActive, deleteProspect,
  } = useDevelopmentProspects();

  const [prayOpen, setPrayOpen] = useState(true);
  const [encourageOpen, setEncourageOpen] = useState(true);
  const [coachOpen, setCoachOpen] = useState(true);
  const [developOpen, setDevelopOpen] = useState(true);
  const [newPrayer, setNewPrayer] = useState('');
  const [newEncourageNote, setNewEncourageNote] = useState('');
  const [newEncourageType, setNewEncourageType] = useState<'sent' | 'planned'>('sent');
  const [newEncourageMethod, setNewEncourageMethod] = useState<EncourageMethod>('text');
  const [newEncourageDate, setNewEncourageDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCoachDimension, setNewCoachDimension] = useState<ScorecardDimension>('reach');
  const [newCoachContent, setNewCoachContent] = useState('');
  const [showAnswered, setShowAnswered] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: number } | null>(null);
  const [newProspectName, setNewProspectName] = useState('');
  const [newProspectNotes, setNewProspectNotes] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<number | null>(null);
  const [editProspectName, setEditProspectName] = useState('');
  const [editProspectNotes, setEditProspectNotes] = useState('');

  const activeProspects = prospects.filter(p => p.is_active);
  const inactiveProspects = prospects.filter(p => !p.is_active);

  useEffect(() => {
    loadAll(leaderId);
    loadProspects(leaderId);
  }, [leaderId, loadAll, loadProspects]);

  const handleAddPrayer = async () => {
    if (!newPrayer.trim()) return;
    await addPrayerPoint(leaderId, newPrayer.trim());
    setNewPrayer('');
  };

  const handleAddEncouragement = async () => {
    await addEncouragement(leaderId, newEncourageType, newEncourageNote.trim() || undefined, newEncourageDate, newEncourageMethod, leaderName);
    setNewEncourageNote('');
    setNewEncourageDate(new Date().toISOString().split('T')[0]);
    if (onNoteSaved) await onNoteSaved();
  };

  const handleAddCoachNote = async () => {
    if (!newCoachContent.trim()) return;
    await addCoachingNote(leaderId, newCoachDimension, newCoachContent.trim());
    setNewCoachContent('');
  };

  const handleAddProspect = async () => {
    if (!newProspectName.trim()) return;
    await addProspect(leaderId, newProspectName, newProspectNotes || undefined);
    setNewProspectName('');
    setNewProspectNotes('');
  };

  const handleStartEditProspect = (prospect: { id: number; name: string; notes?: string }) => {
    setEditingProspectId(prospect.id);
    setEditProspectName(prospect.name);
    setEditProspectNotes(prospect.notes || '');
  };

  const handleSaveEditProspect = async () => {
    if (!editingProspectId || !editProspectName.trim()) return;
    await updateProspect(editingProspectId, { name: editProspectName, notes: editProspectNotes || undefined });
    setEditingProspectId(null);
    setEditProspectName('');
    setEditProspectNotes('');
  };

  const handleCancelEditProspect = () => {
    setEditingProspectId(null);
    setEditProspectName('');
    setEditProspectNotes('');
  };

  const handleTogglePrayerAnswered = async (prayerId: number) => {
    await togglePrayerAnswered(prayerId, leaderId);
    if (onNoteSaved) await onNoteSaved();
  };

  const handleToggleCoachingResolved = async (noteId: number) => {
    await toggleCoachingResolved(noteId, leaderId);
    if (onNoteSaved) await onNoteSaved();
  };

  const handleDelete = (type: string, id: number) => {
    if (confirmDelete?.type === type && confirmDelete?.id === id) {
      if (type === 'prayer') deletePrayerPoint(id);
      else if (type === 'encourage') deleteEncouragement(id);
      else if (type === 'coach') deleteCoachingNote(id);
      else if (type === 'prospect') deleteProspect(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete({ type, id });
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const activePrayers = prayerPoints.filter(p => !p.is_answered);
  const answeredPrayers = prayerPoints.filter(p => p.is_answered);
  const sentEncouragements = encouragements.filter(e => e.message_type === 'sent');
  const plannedEncouragements = encouragements.filter(e => e.message_type === 'planned');
  const openCoachNotes = coachingNotes.filter(n => !n.is_resolved);
  const resolvedCoachNotes = coachingNotes.filter(n => n.is_resolved);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
  };

  const formatDateFull = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-700 rounded w-1/4"></div>
              <div className="h-10 bg-gray-700 rounded"></div>
              <div className="h-16 bg-gray-700 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ═══ PRAY SECTION ═══════════════════════════════ */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <button
          onClick={() => setPrayOpen(!prayOpen)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-white">Pray</h3>
              <p className="text-[10px] text-gray-500">
                {activePrayers.length > 0
                  ? `${activePrayers.length} active prayer point${activePrayers.length !== 1 ? 's' : ''}`
                  : 'Track prayer points'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activePrayers.length > 0 && (
              <span className="min-w-[20px] h-[20px] flex items-center justify-center px-1.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400">
                {activePrayers.length}
              </span>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${prayOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {prayOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-700/40">
            {/* Add prayer input */}
            <div className="flex gap-2 pt-4">
              <input
                type="text"
                value={newPrayer}
                onChange={e => setNewPrayer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPrayer()}
                placeholder="Add a prayer point..."
                className="flex-1 px-3 py-2.5 bg-gray-900/50 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 focus:outline-none transition-all"
              />
              <button
                onClick={handleAddPrayer}
                disabled={!newPrayer.trim()}
                className="score-btn px-4 py-2.5 text-sm font-medium rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  '--score-bg': 'rgb(217 119 6)',
                  '--score-color': 'white',
                  '--score-border': 'rgb(180 83 9)',
                  '--score-shadow': 'rgba(217, 119, 6, 0.3)',
                } as React.CSSProperties}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* Active prayer points */}
            {activePrayers.length === 0 && answeredPrayers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">No prayer points yet</p>
                <p className="text-xs text-gray-500 mt-1">Add a prayer request for {leaderName}</p>
              </div>
            ) : (
              <>
                {activePrayers.length > 0 && (
                  <div className="space-y-2">
                    {activePrayers.map(prayer => (
                      <div
                        key={prayer.id}
                        className="flex items-start gap-3 p-3 rounded-xl bg-gray-900/30 border border-gray-700/40 hover:border-amber-500/20 transition-all group"
                      >
                        <button
                          onClick={() => handleTogglePrayerAnswered(prayer.id)}
                          className="mt-0.5 w-5 h-5 rounded-md border-2 border-gray-500 hover:border-amber-400 flex-shrink-0 flex items-center justify-center transition-colors"
                          title="Mark as answered"
                        >
                          <span className="sr-only">Mark answered</span>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 leading-relaxed">{prayer.content}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{formatTimestamp(prayer.created_at)}</p>
                        </div>
                        <button
                          onClick={() => handleDelete('prayer', prayer.id)}
                          className={`flex-shrink-0 p-1 rounded-md transition-all ${
                            confirmDelete?.type === 'prayer' && confirmDelete?.id === prayer.id
                              ? 'bg-red-500/20 text-red-400'
                              : 'text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10'
                          }`}
                          title={confirmDelete?.type === 'prayer' && confirmDelete?.id === prayer.id ? 'Click again to delete' : 'Delete'}
                        >
                          {confirmDelete?.type === 'prayer' && confirmDelete?.id === prayer.id ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Answered prayers (collapsible) */}
                {answeredPrayers.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowAnswered(!showAnswered)}
                      className="flex items-center gap-2 text-xs text-gray-500 hover:text-amber-400 transition-colors py-1"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showAnswered ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                      <span>{answeredPrayers.length} answered prayer{answeredPrayers.length !== 1 ? 's' : ''}</span>
                    </button>
                    {showAnswered && (
                      <div className="space-y-1.5 mt-2 pl-1">
                        {answeredPrayers.map(prayer => (
                          <div
                            key={prayer.id}
                            className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-900/20 group"
                          >
                            <button
                              onClick={() => handleTogglePrayerAnswered(prayer.id)}
                              className="mt-0.5 w-5 h-5 rounded-md bg-amber-500 border-2 border-amber-500 flex-shrink-0 flex items-center justify-center transition-colors"
                              title="Mark as unanswered"
                            >
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-500 line-through">{prayer.content}</p>
                              <p className="text-[10px] text-gray-600 mt-0.5">{formatTimestamp(prayer.created_at)}</p>
                            </div>
                            <button
                              onClick={() => handleDelete('prayer', prayer.id)}
                              className={`flex-shrink-0 p-1 rounded-md transition-all ${
                                confirmDelete?.type === 'prayer' && confirmDelete?.id === prayer.id
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400'
                              }`}
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
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ ENCOURAGE SECTION ══════════════════════════ */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <button
          onClick={() => setEncourageOpen(!encourageOpen)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-white">Encourage</h3>
              <p className="text-[10px] text-gray-500">
                {plannedEncouragements.length > 0
                  ? `${plannedEncouragements.length} planned`
                  : `Track encouragements to ${leaderName}`}
                {sentEncouragements.length > 0 ? ` · ${sentEncouragements.length} sent` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {plannedEncouragements.length > 0 && (
              <span className="min-w-[20px] h-[20px] flex items-center justify-center px-1.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400">
                {plannedEncouragements.length}
              </span>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${encourageOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {encourageOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-700/40">
            {/* Status summary cards */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Last Sent</span>
                </div>
                {sentEncouragements.length > 0 ? (
                  <>
                    <p className="text-sm font-medium text-white">{formatDateFull(sentEncouragements[0].message_date)}</p>
                    {sentEncouragements[0].note && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{sentEncouragements[0].note}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-500">None yet</p>
                )}
              </div>
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-500/5 border border-sky-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider">Next Planned</span>
                </div>
                {plannedEncouragements.length > 0 ? (
                  <>
                    <p className="text-sm font-medium text-white">{formatDateFull(plannedEncouragements[0].message_date)}</p>
                    {plannedEncouragements[0].note && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{plannedEncouragements[0].note}</p>
                    )}
                    <button
                      onClick={async () => {
                        await markEncouragementSent(plannedEncouragements[0].id, leaderId);
                        if (onNoteSaved) await onNoteSaved();
                      }}
                      className="score-btn mt-2.5 w-full py-1.5 text-xs font-medium rounded-lg transition-all"
                      style={{
                        '--score-bg': 'rgba(16, 185, 129, 0.2)',
                        '--score-color': 'rgb(52, 211, 153)',
                        '--score-border': 'rgba(16, 185, 129, 0.3)',
                        '--score-shadow': 'rgba(16, 185, 129, 0.1)',
                      } as React.CSSProperties}
                    >
                      ✓ Mark as Sent
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Nothing planned</p>
                )}
              </div>
            </div>

            {/* ── Add encouragement form ── */}
            <div className="p-4 rounded-xl bg-gray-900/30 border border-gray-700/40 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Log an Encouragement</p>

              {/* Intent radio: sent vs planned */}
              <div className="flex gap-3">
                <label
                  className={`flex-1 flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    newEncourageType === 'sent'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="encourageType"
                    value="sent"
                    checked={newEncourageType === 'sent'}
                    onChange={() => setNewEncourageType('sent')}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    newEncourageType === 'sent' ? 'border-emerald-400' : 'border-gray-500'
                  }`}>
                    {newEncourageType === 'sent' && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                  </div>
                  <div>
                    <span className="text-sm font-medium">I sent one</span>
                    <p className="text-[10px] text-gray-500">Log a message already sent</p>
                  </div>
                </label>
                <label
                  className={`flex-1 flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    newEncourageType === 'planned'
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="encourageType"
                    value="planned"
                    checked={newEncourageType === 'planned'}
                    onChange={() => setNewEncourageType('planned')}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    newEncourageType === 'planned' ? 'border-sky-400' : 'border-gray-500'
                  }`}>
                    {newEncourageType === 'planned' && <div className="w-2 h-2 rounded-full bg-sky-400" />}
                  </div>
                  <div>
                    <span className="text-sm font-medium">Plan to send</span>
                    <p className="text-[10px] text-gray-500">Schedule a future message</p>
                  </div>
                </label>
              </div>

              {/* Method & Date row */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">How</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ENCOURAGE_METHODS.map(m => (
                      <button
                        key={m.key}
                        onClick={() => setNewEncourageMethod(m.key)}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${
                          newEncourageMethod === m.key
                            ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30 scale-105'
                            : 'border-gray-800 text-gray-600 hover:text-gray-300 hover:border-gray-600 hover:bg-gray-800/50 opacity-60'
                        }`}
                      >
                        <span className="mr-1">{m.icon}</span>{m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">
                  {newEncourageType === 'sent' ? 'Date Sent' : 'Planned Date'}
                </label>
                <input
                  type="date"
                  value={newEncourageDate}
                  onChange={e => setNewEncourageDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-xl text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all [color-scheme:dark]"
                />
              </div>

              {/* Note input */}
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">Note (optional)</label>
                <input
                  type="text"
                  value={newEncourageNote}
                  onChange={e => setNewEncourageNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddEncouragement()}
                  placeholder={`What did you say to ${leaderName}?`}
                  className="w-full px-3 py-2.5 bg-gray-900/50 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                />
              </div>

              {/* Submit button */}
              <button
                onClick={handleAddEncouragement}
                className="score-btn w-full py-2.5 text-sm font-medium rounded-xl transition-all"
                style={{
                  '--score-bg': newEncourageType === 'sent' ? 'rgb(16 185 129)' : 'rgb(14 165 233)',
                  '--score-color': 'white',
                  '--score-border': newEncourageType === 'sent' ? 'rgb(5 150 105)' : 'rgb(2 132 199)',
                  '--score-shadow': newEncourageType === 'sent' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(14, 165, 233, 0.3)',
                } as React.CSSProperties}
              >
                {newEncourageType === 'sent' ? 'Save Encouragement' : 'Plan Encouragement'}
              </button>
            </div>

            {/* Encouragement history timeline */}
            {encouragements.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">No encouragements yet</p>
                <p className="text-xs text-gray-500 mt-1">Start tracking messages to {leaderName}</p>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">History</p>
                <div className="space-y-1 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                  {encouragements.map(enc => {
                    const method = ENCOURAGE_METHODS.find(m => m.key === enc.encourage_method);
                    return (
                    <div
                      key={enc.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-700/20 transition-colors group"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        enc.message_type === 'sent' ? 'bg-emerald-400' : 'bg-gray-500 ring-2 ring-gray-500/30'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${
                            enc.message_type === 'sent' ? 'text-emerald-400' : 'text-gray-400'
                          }`}>
                            {enc.message_type === 'sent' ? 'Sent' : 'Planned'}
                          </span>
                          {method && <span className="text-[10px] text-gray-500">{method.icon} {method.label}</span>}
                          <span className="text-[10px] text-gray-500">{formatDate(enc.message_date)}</span>
                        </div>
                        {enc.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{enc.note}</p>}
                      </div>
                      {enc.message_type === 'planned' && (
                        <button
                          onClick={async () => {
                            await markEncouragementSent(enc.id, leaderId);
                            if (onNoteSaved) await onNoteSaved();
                          }}
                          className="flex-shrink-0 text-[10px] text-emerald-400/70 hover:text-emerald-400 transition-colors px-2 py-1 rounded-md hover:bg-emerald-500/10"
                        >
                          ✓ Sent
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete('encourage', enc.id)}
                        className={`flex-shrink-0 p-1 rounded-md transition-all ${
                          confirmDelete?.type === 'encourage' && confirmDelete?.id === enc.id
                            ? 'bg-red-500/20 text-red-400'
                            : 'text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ COACH SECTION ══════════════════════════════ */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <button
          onClick={() => setCoachOpen(!coachOpen)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-white">Coach</h3>
              <p className="text-[10px] text-gray-500">
                {openCoachNotes.length > 0
                  ? `${openCoachNotes.length} open note${openCoachNotes.length !== 1 ? 's' : ''}`
                  : 'Track growth opportunities'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {openCoachNotes.length > 0 && (
              <span className="min-w-[20px] h-[20px] flex items-center justify-center px-1.5 text-[10px] font-bold rounded-full bg-sky-500/20 text-sky-400">
                {openCoachNotes.length}
              </span>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${coachOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {coachOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-700/40">
            {/* Add coaching note */}
            <div className="space-y-2 pt-4">
              <div className="flex gap-2">
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {DIMENSIONS.map(d => (
                    <button
                      key={d.key}
                      onClick={() => setNewCoachDimension(d.key)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        newCoachDimension === d.key
                          ? `${d.bg} ${d.color} ${d.border}`
                          : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCoachContent}
                  onChange={e => setNewCoachContent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCoachNote()}
                  placeholder="Growth opportunity..."
                  className="flex-1 px-3 py-2.5 bg-gray-900/50 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 focus:outline-none transition-all"
                />
                <button
                  onClick={handleAddCoachNote}
                  disabled={!newCoachContent.trim()}
                  className="score-btn px-4 py-2.5 text-sm font-medium rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    '--score-bg': 'rgb(14 165 233)',
                    '--score-color': 'white',
                    '--score-border': 'rgb(2 132 199)',
                    '--score-shadow': 'rgba(14, 165, 233, 0.3)',
                  } as React.CSSProperties}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Coaching notes grouped by dimension */}
            {openCoachNotes.length === 0 && resolvedCoachNotes.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">No coaching notes yet</p>
                <p className="text-xs text-gray-500 mt-1">Track growth opportunities by dimension</p>
              </div>
            ) : (
              <>
                {DIMENSIONS.map(dim => {
                  const dimNotes = openCoachNotes.filter(n => n.dimension === dim.key);
                  if (dimNotes.length === 0) return null;
                  return (
                    <div key={dim.key}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${dim.dot}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wider ${dim.color}`}>{dim.label}</span>
                        <span className="text-[10px] text-gray-600">{dimNotes.length}</span>
                      </div>
                      <div className="space-y-1.5 ml-4">
                        {dimNotes.map(note => (
                          <div
                            key={note.id}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition-all group ${dim.bg} ${dim.border}`}
                          >
                            <button
                              onClick={() => handleToggleCoachingResolved(note.id)}
                              className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors border-gray-500 hover:border-sky-400`}
                              title="Mark resolved"
                            >
                              <span className="sr-only">Mark resolved</span>
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-200 leading-relaxed">{note.content}</p>
                              <p className="text-[10px] text-gray-500 mt-1">{formatTimestamp(note.created_at)}</p>
                            </div>
                            <button
                              onClick={() => handleDelete('coach', note.id)}
                              className={`flex-shrink-0 p-1 rounded-md transition-all ${
                                confirmDelete?.type === 'coach' && confirmDelete?.id === note.id
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10'
                              }`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Resolved coaching notes (collapsible) */}
                {resolvedCoachNotes.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowResolved(!showResolved)}
                      className="flex items-center gap-2 text-xs text-gray-500 hover:text-sky-400 transition-colors py-1"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showResolved ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                      <span>{resolvedCoachNotes.length} resolved note{resolvedCoachNotes.length !== 1 ? 's' : ''}</span>
                    </button>
                    {showResolved && (
                      <div className="space-y-1.5 mt-2 ml-4">
                        {resolvedCoachNotes.map(note => {
                          const dim = DIMENSIONS.find(d => d.key === note.dimension);
                          return (
                            <div
                              key={note.id}
                              className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-900/20 group"
                            >
                              <button
                                onClick={() => handleToggleCoachingResolved(note.id)}
                                className="mt-0.5 w-5 h-5 rounded-md bg-sky-500 border-2 border-sky-500 flex-shrink-0 flex items-center justify-center"
                                title="Mark unresolved"
                              >
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {dim && <span className={`text-[10px] ${dim.color}`}>{dim.label}</span>}
                                </div>
                                <p className="text-sm text-gray-500 line-through">{note.content}</p>
                              </div>
                              <button
                                onClick={() => handleDelete('coach', note.id)}
                                className={`flex-shrink-0 p-1 rounded-md transition-all ${
                                  confirmDelete?.type === 'coach' && confirmDelete?.id === note.id
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'text-gray-600 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ DEVELOP SECTION ═══════════════════════════════ */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <button
          onClick={() => setDevelopOpen(!developOpen)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-white">Develop</h3>
              <p className="text-[10px] text-gray-500">
                {activeProspects.length > 0
                  ? `${activeProspects.length} person${activeProspects.length !== 1 ? 's' : ''} being developed`
                  : 'Track people being developed by this leader'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeProspects.length > 0 && (
              <span className="min-w-[20px] h-[20px] flex items-center justify-center px-1.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400">
                {activeProspects.length}
              </span>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${developOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {developOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-700/40">
            {/* Add new prospect form */}
            <div className="pt-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProspectName}
                  onChange={e => setNewProspectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddProspect()}
                  placeholder="Person's name..."
                  className="flex-1 px-3 py-2.5 bg-gray-900/50 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                />
                <button
                  onClick={handleAddProspect}
                  disabled={!newProspectName.trim()}
                  className="score-btn px-4 py-2.5 text-sm font-medium rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    '--score-bg': 'rgb(16 185 129)',
                    '--score-color': 'white',
                    '--score-border': 'rgb(5 150 105)',
                    '--score-shadow': 'rgba(16, 185, 129, 0.3)',
                  } as React.CSSProperties}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              <textarea
                value={newProspectNotes}
                onChange={e => setNewProspectNotes(e.target.value)}
                placeholder="Notes (optional)..."
                rows={2}
                className="w-full px-3 py-2.5 bg-gray-900/50 border border-gray-600 rounded-xl text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all resize-none"
              />
            </div>

            {/* Empty state */}
            {activeProspects.length === 0 && inactiveProspects.length === 0 && (
              <div className="text-center py-6 text-gray-500">
                <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-xs">No one being developed yet</p>
                <p className="text-[10px] mt-0.5">Add a name above to start tracking</p>
              </div>
            )}

            {/* Active prospects list */}
            {activeProspects.map(prospect => (
              <div key={prospect.id} className="bg-gray-900/40 rounded-xl border border-gray-700/50 p-3">
                {editingProspectId === prospect.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editProspectName}
                      onChange={e => setEditProspectName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none"
                    />
                    <textarea
                      value={editProspectNotes}
                      onChange={e => setEditProspectNotes(e.target.value)}
                      placeholder="Notes..."
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCancelEditProspect}
                        className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEditProspect}
                        disabled={!editProspectName.trim()}
                        className="score-btn px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-30"
                        style={{
                          '--score-bg': 'rgb(16 185 129)',
                          '--score-color': 'white',
                          '--score-border': 'rgb(5 150 105)',
                          '--score-shadow': 'rgba(16, 185, 129, 0.3)',
                        } as React.CSSProperties}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-emerald-400">
                              {prospect.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <h4 className="text-sm font-medium text-white truncate">{prospect.name}</h4>
                        </div>
                        {prospect.notes && (
                          <p className="text-xs text-gray-400 mt-1.5 ml-8 whitespace-pre-wrap">{prospect.notes}</p>
                        )}
                        <p className="text-[10px] text-gray-600 mt-1 ml-8">Added {formatTimestamp(prospect.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleStartEditProspect(prospect)}
                          className="p-1.5 text-gray-500 hover:text-emerald-400 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleActive(prospect.id)}
                          className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors"
                          title="Mark as inactive"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete('prospect', prospect.id)}
                          className={`p-1.5 transition-colors ${confirmDelete?.type === 'prospect' && confirmDelete?.id === prospect.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                          title={confirmDelete?.type === 'prospect' && confirmDelete?.id === prospect.id ? 'Click again to delete' : 'Delete'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Inactive prospects toggle */}
            {inactiveProspects.length > 0 && (
              <div>
                <button
                  onClick={() => setShowInactive(!showInactive)}
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-emerald-400 transition-colors py-1"
                >
                  <svg className={`w-3 h-3 transition-transform ${showInactive ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                  <span>{inactiveProspects.length} inactive</span>
                </button>

                {showInactive && (
                  <div className="space-y-2 mt-2">
                    {inactiveProspects.map(prospect => (
                      <div key={prospect.id} className="bg-gray-900/20 rounded-xl border border-gray-700/30 p-3 opacity-60">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gray-600/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-bold text-gray-500">
                                  {prospect.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <h4 className="text-sm font-medium text-gray-400 truncate line-through">{prospect.name}</h4>
                            </div>
                            {prospect.notes && (
                              <p className="text-xs text-gray-500 mt-1.5 ml-8 whitespace-pre-wrap">{prospect.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleActive(prospect.id)}
                              className="p-1.5 text-gray-500 hover:text-emerald-400 transition-colors"
                              title="Reactivate"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete('prospect', prospect.id)}
                              className={`p-1.5 transition-colors ${confirmDelete?.type === 'prospect' && confirmDelete?.id === prospect.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                              title={confirmDelete?.type === 'prospect' && confirmDelete?.id === prospect.id ? 'Click again to delete' : 'Delete'}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
