'use client';

import React, { useState } from 'react';

interface Big4Scores {
  reach: number | null;
  connect: number | null;
  disciple: number | null;
  develop: number | null;
  average: number | null;
  scoredDate: string | null;
}

interface MeetingPrepProps {
  leaderName: string;
  status?: string;
  campus?: string;
  circleType?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingFrequency?: string;
  latestScores: Big4Scores | null;
  recentNotes: Array<{
    content: string;
    created_at: string;
    author?: string;
  }>;
  onInsertNote: (prepText: string) => void;
  disabled?: boolean;
}

export default function MeetingPrepAssistant({
  leaderName,
  status,
  campus,
  circleType,
  meetingDay,
  meetingTime,
  meetingFrequency,
  latestScores,
  recentNotes,
  onInsertNote,
  disabled = false,
}: MeetingPrepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [prepContent, setPrepContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePrep = async () => {
    setIsLoading(true);
    setError(null);
    setPrepContent(null);

    const notesContext = recentNotes
      .slice(0, 10)
      .map((n) => {
        const date = new Date(n.created_at).toLocaleDateString();
        const author = n.author ? ` (by ${n.author})` : '';
        return `[${date}${author}]: ${n.content}`;
      })
      .join('\n\n');

    const scoreLabel = (val: number | null) => val !== null ? `${val}/5` : 'Not yet scored';

    const prompt = `You are a coaching assistant for church circle group leadership. You are preparing an ACPD (Associate Campus Pastor of Discipleship) for a one-on-one meeting with a Circle Leader.

CIRCLE LEADER PROFILE:
- Name: ${leaderName}
- Status: ${status || 'Unknown'}
- Campus: ${campus || 'Unknown'}
- Circle Type: ${circleType || 'Unknown'}
- Meeting Day: ${meetingDay || 'Not set'}
- Meeting Time: ${meetingTime || 'Not set'}
- Meeting Frequency: ${meetingFrequency || 'Not set'}

BIG 4 SCORECARD (rated 1-5, where 1=needs attention and 5=thriving)${latestScores?.scoredDate ? ` — Last scored: ${new Date(latestScores.scoredDate).toLocaleDateString()}` : ''}:
- REACH (inviting new people, outreach): ${scoreLabel(latestScores?.reach ?? null)}
- CONNECT (building relationships, community): ${scoreLabel(latestScores?.connect ?? null)}
- DISCIPLE (spiritual growth, Bible study depth): ${scoreLabel(latestScores?.disciple ?? null)}
- DEVELOP (developing new leaders, multiplication): ${scoreLabel(latestScores?.develop ?? null)}
- OVERALL AVERAGE: ${latestScores?.average !== null && latestScores?.average !== undefined ? `${latestScores.average.toFixed(1)}/5` : 'N/A'}

RECENT NOTES (most recent first):
${notesContext || 'No notes recorded yet.'}

---

Generate a MEETING PREP BRIEFING for the ACPD. Structure it as follows:

📊 LEADER SNAPSHOT
A 2-3 sentence overview of where this leader and their circle stand right now.

🔵 REACH (Inviting & Outreach)
- Current status based on scorecard rating and any notes mentioning outreach, invitations, new people
- Suggested coaching question to ask
- One practical idea to help them grow in this area

🟢 CONNECT (Community & Relationships)
- Current status based on scorecard rating and any notes mentioning fellowship, relationships, group dynamics
- Suggested coaching question to ask
- One practical idea to help them grow in this area

🟡 DISCIPLE (Spiritual Growth)
- Current status based on scorecard rating and any notes mentioning Bible study, prayer, spiritual practices
- Suggested coaching question to ask
- One practical idea to help them grow in this area

🔴 DEVELOP (Leadership Development & Multiplication)
- Current status based on scorecard rating and any notes mentioning apprentices, new leaders, multiplication plans
- Suggested coaching question to ask
- One practical idea to help them grow in this area

💬 CONVERSATION STARTERS
3-4 specific, personalized talking points pulled from their recent notes and data. Reference specific things they've mentioned or patterns you notice.

⚡ WATCH FOR
Any concerns, red flags, or patterns worth monitoring (attendance drops, long gaps between notes, stalled scorecard areas, status concerns). If everything looks healthy, say so and highlight what's working.

Be warm, practical, and specific. Use the leader's name. Reference actual data points and note content. This is for a pastoral coaching conversation, not a corporate review.`;

    try {
      const response = await fetch('/api/ai-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt, mode: 'meeting-prep' }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${response.status})`);
      }

      const data = await response.json();
      setPrepContent(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prep');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertAsNote = () => {
    if (prepContent) {
      onInsertNote(`📋 Meeting Prep — ${new Date().toLocaleDateString()}\n\n${prepContent}`);
      setPrepContent(null);
    }
  };

  return (
    <div className="mb-4">
      {/* Generate Button */}
      {!prepContent && !isLoading && (
        <button
          onClick={generatePrep}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-lg hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          AI Meeting Prep
        </button>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Preparing your meeting briefing...</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Analyzing scorecard progress, notes, and trends</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Prep Preview */}
      {prepContent && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden shadow-sm">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span className="text-sm font-medium text-white">Meeting Prep for {leaderName}</span>
            </div>
            <button
              onClick={() => setPrepContent(null)}
              className="text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 max-h-[500px] overflow-y-auto">
            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {prepContent}
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-blue-200 dark:border-blue-800 flex flex-wrap items-center gap-2">
            <button
              onClick={handleInsertAsNote}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Save as Note
            </button>
            <button
              onClick={generatePrep}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Regenerate
            </button>
            <button
              onClick={() => setPrepContent(null)}
              className="px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
