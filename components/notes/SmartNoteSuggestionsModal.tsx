'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { type NoteInsight } from '../../lib/noteKeywordDetector';

interface SmartNoteSuggestionsModalProps {
  isOpen: boolean;
  /** Called on close. `suppressed` = insight categories that were shown but not logged. */
  onClose: (suppressed: NoteInsight[]) => void;
  insights: NoteInsight[];
  matchedPhrases: Partial<Record<NoteInsight, string>>;
  leaderId: number;
  leaderName: string;
}

interface ExistingProspect {
  id: number;
  name: string;
}

export default function SmartNoteSuggestionsModal({
  isOpen,
  onClose,
  insights,
  matchedPhrases,
  leaderId,
  leaderName,
}: SmartNoteSuggestionsModalProps) {
  const { user } = useAuth();

  const [prayerContent, setPrayerContent] = useState('');
  const [prayerLogged, setPrayerLogged] = useState(false);
  const [prayerLoading, setPrayerLoading] = useState(false);
  const [prayerError, setPrayerError] = useState('');

  const [developmentName, setDevelopmentName] = useState('');
  const [developmentNotes, setDevelopmentNotes] = useState('');
  const [developmentLogged, setDevelopmentLogged] = useState(false);
  const [developmentLoading, setDevelopmentLoading] = useState(false);
  const [developmentError, setDevelopmentError] = useState('');
  const [existingProspects, setExistingProspects] = useState<ExistingProspect[]>([]);

  const hasPrayer = insights.includes('prayer');
  const hasDevelopment = insights.includes('development');

  // Load existing development prospects for dedup awareness
  useEffect(() => {
    if (!isOpen || !hasDevelopment) return;
    supabase
      .from('development_prospects')
      .select('id, name')
      .eq('circle_leader_id', leaderId)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setExistingProspects(data);
      });
  }, [isOpen, hasDevelopment, leaderId]);

  const duplicateMatch = existingProspects.find(
    p => p.name.toLowerCase() === developmentName.trim().toLowerCase()
  );

  const resetAndClose = (wasLogged: { prayer: boolean; development: boolean }) => {
    const suppressed: NoteInsight[] = [];
    if (hasPrayer && !wasLogged.prayer) suppressed.push('prayer');
    if (hasDevelopment && !wasLogged.development) suppressed.push('development');

    setPrayerContent('');
    setPrayerLogged(false);
    setPrayerError('');
    setDevelopmentName('');
    setDevelopmentNotes('');
    setDevelopmentLogged(false);
    setDevelopmentError('');
    setExistingProspects([]);

    onClose(suppressed);
  };

  const handleLogPrayer = async () => {
    if (!prayerContent.trim() || !user?.id) return;
    setPrayerLoading(true);
    setPrayerError('');
    try {
      const { error } = await supabase.from('acpd_prayer_points').insert([{
        circle_leader_id: leaderId,
        user_id: user.id,
        content: prayerContent.trim(),
        is_answered: false,
        is_shared: false,
      }]);
      if (error) throw error;
      setPrayerLogged(true);
    } catch {
      setPrayerError('Failed to log prayer point. Please try again.');
    } finally {
      setPrayerLoading(false);
    }
  };

  const handleLogDevelopment = async () => {
    if (!developmentName.trim() || !user?.id) return;
    setDevelopmentLoading(true);
    setDevelopmentError('');
    try {
      const { error } = await supabase.from('development_prospects').insert([{
        circle_leader_id: leaderId,
        user_id: user.id,
        name: developmentName.trim(),
        notes: developmentNotes.trim() || null,
        is_active: true,
      }]);
      if (error) throw error;
      const noteText = developmentNotes.trim() ? ` — "${developmentNotes.trim()}"` : '';
      await supabase.from('notes').insert([{
        circle_leader_id: leaderId,
        content: `Developing: Added ${developmentName.trim()} as a development prospect.${noteText}`,
        created_by: 'System',
      }]);
      setDevelopmentLogged(true);
    } catch {
      setDevelopmentError('Failed to log development prospect. Please try again.');
    } finally {
      setDevelopmentLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => resetAndClose({ prayer: prayerLogged, development: developmentLogged })}
      title="We noticed something"
      size="md"
    >
      <div className="space-y-4 py-1">
        <p className="text-sm text-slate-400">
          Your note may mention{' '}
          {[hasPrayer && 'a prayer request', hasDevelopment && 'a development opportunity']
            .filter(Boolean)
            .join(' and ')}
          . Want to log {hasPrayer && hasDevelopment ? 'either or both' : 'it'}?
        </p>

        {/* Prayer Section */}
        {hasPrayer && (
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-amber-300">Log a Prayer Point</h3>
                  {matchedPhrases.prayer && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      &ldquo;{matchedPhrases.prayer}&rdquo;
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Added to {leaderName}&rsquo;s Care tab</p>
              </div>
              {prayerLogged && (
                <span className="flex items-center gap-1 text-xs text-green-400 font-medium flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Logged
                </span>
              )}
            </div>

            {prayerLogged ? (
              <p className="text-xs text-slate-500">Prayer point added to the Care tab.</p>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={prayerContent}
                  onChange={e => setPrayerContent(e.target.value)}
                  placeholder="What should we pray for?"
                  rows={2}
                  className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none transition-colors"
                />
                {prayerError && <p className="text-xs text-red-400">{prayerError}</p>}
                <button
                  onClick={handleLogPrayer}
                  disabled={!prayerContent.trim() || prayerLoading}
                  className="w-full py-2 text-sm font-medium text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {prayerLoading ? 'Logging...' : 'Add Prayer Point'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Development Section */}
        {hasDevelopment && (
          <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-xl p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-indigo-300">Log Development Opportunity</h3>
                  {matchedPhrases.development && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                      &ldquo;{matchedPhrases.development}&rdquo;
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Added to {leaderName}&rsquo;s Scorecard</p>
              </div>
              {developmentLogged && (
                <span className="flex items-center gap-1 text-xs text-green-400 font-medium flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Logged
                </span>
              )}
            </div>

            {/* Existing prospects context */}
            {existingProspects.length > 0 && !developmentLogged && (
              <div className="flex items-start gap-2 mb-3 px-2.5 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <svg className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-slate-400">
                  Already tracking:{' '}
                  <span className="text-slate-300">{existingProspects.map(p => p.name).join(', ')}</span>
                </p>
              </div>
            )}

            {developmentLogged ? (
              <p className="text-xs text-slate-500">Development prospect added to the Scorecard tab.</p>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={developmentName}
                  onChange={e => setDevelopmentName(e.target.value)}
                  placeholder="Person's name (required)"
                  className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                />
                {duplicateMatch && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Already tracking someone named &ldquo;{duplicateMatch.name}&rdquo;
                  </p>
                )}
                <textarea
                  value={developmentNotes}
                  onChange={e => setDevelopmentNotes(e.target.value)}
                  placeholder="Context or notes (optional)"
                  rows={2}
                  className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-colors"
                />
                {developmentError && <p className="text-xs text-red-400">{developmentError}</p>}
                <button
                  onClick={handleLogDevelopment}
                  disabled={!developmentName.trim() || developmentLoading}
                  className="w-full py-2 text-sm font-medium text-white bg-btn-primary hover:opacity-90 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {developmentLoading ? 'Logging...' : 'Add to Scorecard'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={() => resetAndClose({ prayer: prayerLogged, development: developmentLogged })}
            className="text-slate-400 hover:text-white hover:bg-slate-700 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {prayerLogged || developmentLogged ? 'Done' : 'Skip for now'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
