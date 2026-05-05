'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useNotebookContext } from '../../contexts/NotebookContext';
import type { CircleLeader, ProjectBoard, NotebookPageCard } from '../../lib/supabase';
import LeaderPickerModal from './LeaderPickerModal';
import BoardPickerModal from './BoardPickerModal';
import CardPickerModal from './CardPickerModal';
import QuickAddCardModal from './QuickAddCardModal';
import CardDetailDrawer from './CardDetailDrawer';
import ChecklistsWidget from './ChecklistsWidget';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#f59e0b',
  low:    '#6b7280',
};

export default function NotebookRightPanel() {
  const { activePage, linkLeader, unlinkLeader, linkBoard, unlinkBoard, linkCard, unlinkCard, fetchPage } = useNotebookContext();

  const [leaderPickerOpen, setLeaderPickerOpen] = useState(false);
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<NotebookPageCard | null>(null);

  if (!activePage) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-gray-600 text-center">Open a page to see linked people and boards</p>
      </div>
    );
  }

  const linkedLeaders = activePage.linked_leaders || [];
  const linkedBoards  = activePage.linked_boards  || [];
  const linkedCards   = activePage.linked_cards   || [];
  const linkedLeaderIds = linkedLeaders.map(l => l.circle_leader_id);
  const linkedBoardIds  = linkedBoards.map(b => b.board_id);
  const linkedCardIds   = linkedCards.map(c => c.card_id);

  async function handleSelectLeader(leader: CircleLeader) {
    setLeaderPickerOpen(false);
    await linkLeader(activePage!.id, leader.id);
  }

  async function handleSelectBoard(board: ProjectBoard) {
    setBoardPickerOpen(false);
    await linkBoard(activePage!.id, board.id);
  }

  async function handleSelectCard(card: { id: string }) {
    setCardPickerOpen(false);
    await linkCard(activePage!.id, card.id);
  }

  async function handleQuickAddCreated() {
    setQuickAddOpen(false);
    await fetchPage(activePage!.id);
  }

  return (
    <div className="p-4 space-y-5">

      {/* ── Linked Leaders ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Leaders</h3>
          <button
            onClick={() => setLeaderPickerOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Link
          </button>
        </div>

        {linkedLeaders.length === 0 ? (
          <p className="text-xs text-gray-600 italic">None linked</p>
        ) : (
          <div className="space-y-0.5">
            {linkedLeaders.map(ll => (
              <div key={ll.circle_leader_id} className="group flex items-center gap-2 py-1.5 rounded-lg px-1 hover:bg-white/[0.04] transition-colors">
                <Link
                  href={`/circle/${ll.circle_leader_id}`}
                  className="flex items-center gap-2 flex-1 min-w-0"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-[10px] font-bold text-indigo-300 flex-shrink-0">
                    {ll.circle_leader?.name.charAt(0).toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-200 truncate">{ll.circle_leader?.name ?? 'Leader'}</p>
                    {ll.circle_leader?.campus && (
                      <p className="text-[10px] text-gray-500">{ll.circle_leader.campus}</p>
                    )}
                  </div>
                </Link>
                <button
                  onClick={() => unlinkLeader(activePage.id, ll.circle_leader_id)}
                  className="sm:opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-red-400"
                  title="Remove link"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="h-px bg-white/[0.06]" />

      {/* ── Linked Boards ──────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Boards</h3>
          <button
            onClick={() => setBoardPickerOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Link
          </button>
        </div>

        {linkedBoards.length === 0 ? (
          <p className="text-xs text-gray-600 italic">None linked</p>
        ) : (
          <div className="space-y-0.5">
            {linkedBoards.map(lb => (
              <div key={lb.board_id} className="group flex items-center gap-2 py-1.5 rounded-lg px-1 hover:bg-white/[0.04] transition-colors">
                <Link
                  href={`/boards/${lb.board_id}`}
                  className="flex items-center gap-2 flex-1 min-w-0"
                >
                  <div className="w-7 h-7 rounded-md bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <rect x="3" y="3" width="7" height="9" rx="1.5" strokeLinecap="round" />
                      <rect x="14" y="3" width="7" height="5" rx="1.5" strokeLinecap="round" />
                      <rect x="14" y="12" width="7" height="9" rx="1.5" strokeLinecap="round" />
                      <rect x="3" y="16" width="7" height="5" rx="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-gray-200 truncate">{lb.project_board?.title ?? 'Board'}</p>
                </Link>
                <button
                  onClick={() => unlinkBoard(activePage.id, lb.board_id)}
                  className="sm:opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-red-400"
                  title="Remove link"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="h-px bg-white/[0.06]" />

      {/* ── Linked Cards ───────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Cards</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuickAddOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
              title="Create a new card and link it"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
            <button
              onClick={() => setCardPickerOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
              title="Link an existing card"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              Link
            </button>
          </div>
        </div>

        {linkedCards.length === 0 ? (
          <p className="text-xs text-gray-600 italic">None linked</p>
        ) : (
          <div className="space-y-0.5">
            {linkedCards.map(lc => {
              const card = lc.board_card;
              if (!card) return null;
              return (
                <div key={lc.card_id} className="group flex items-start gap-2 py-1.5 px-1 rounded-lg hover:bg-white/[0.04] transition-colors">
                  {/* Completion toggle */}
                  <button
                    onClick={() => setEditingCard(lc)}
                    className="mt-0.5 flex-shrink-0"
                    title="Edit card"
                  >
                    {card.is_complete ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    )}
                  </button>

                  {/* Card info */}
                  <button onClick={() => setEditingCard(lc)} className="flex-1 min-w-0 text-left">
                    <p className={`text-xs font-medium leading-tight truncate ${card.is_complete ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {card.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PRIORITY_COLORS[card.priority] ?? '#6b7280' }}
                      />
                      <span className="text-[10px] text-gray-500 truncate">{card.project_board?.title ?? 'Board'}</span>
                      {card.due_date && (
                        <span className="text-[10px] text-gray-600">
                          · {new Date(card.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Unlink */}
                  <button
                    onClick={() => unlinkCard(activePage.id, lc.card_id)}
                    className="sm:opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-red-400 flex-shrink-0 mt-0.5"
                    title="Remove link"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="h-px bg-white/[0.06]" />

      {/* ── Checklists ─────────────────────────────────── */}
      <section>
        <ChecklistsWidget />
      </section>

      {/* ── Modals & Drawers ───────────────────────────── */}
      {leaderPickerOpen && (
        <LeaderPickerModal
          excludeIds={linkedLeaderIds}
          onSelect={handleSelectLeader}
          onClose={() => setLeaderPickerOpen(false)}
        />
      )}
      {boardPickerOpen && (
        <BoardPickerModal
          excludeIds={linkedBoardIds}
          onSelect={handleSelectBoard}
          onClose={() => setBoardPickerOpen(false)}
        />
      )}
      {cardPickerOpen && (
        <CardPickerModal
          excludeIds={linkedCardIds}
          onSelect={handleSelectCard}
          onClose={() => setCardPickerOpen(false)}
        />
      )}
      {quickAddOpen && (
        <QuickAddCardModal
          pageId={activePage.id}
          onCreated={handleQuickAddCreated}
          onClose={() => setQuickAddOpen(false)}
        />
      )}
      {editingCard && (
        <CardDetailDrawer
          link={editingCard}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
}
