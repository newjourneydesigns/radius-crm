'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useProjectBoard } from '../../hooks/useProjectBoard';
import { supabase } from '../../lib/supabase';
import ProtectedRoute from '../../components/ProtectedRoute';
import {
  Plus,
  LayoutDashboard,
  Trash2,
  Calendar,
  FolderKanban,
  Globe,
  User,
  CheckSquare,
  AlertCircle,
  Flag,
  Clock,
  ChevronDown,
  Search,
  X,
} from '../../components/icons/BoardIcons';

// ── Lightweight types for stats queries ──
interface CardStub {
  id: string;
  board_id: string;
  due_date: string | null;
  is_complete: boolean;
  priority: string;
  updated_at: string;
}
interface ChecklistStub {
  card_id: string;
  due_date: string | null;
  is_completed: boolean;
}

interface BoardStats {
  totalCards: number;
  completedCards: number;
  dueToday: number;
  overdue: number;
  dueThisWeek: number;
  highPriority: number;
  checklistDueToday: number;
  checklistOverdue: number;
  checklistDueThisWeek: number;
  lastActivity: string | null;
}

// ── Date helpers ──
function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekEnd(): string {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0=Sun
  const daysUntilSat = 6 - dayOfWeek;
  const sat = new Date(d);
  sat.setDate(d.getDate() + daysUntilSat);
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
}

function BoardsListPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { boards, fetchBoards, createBoard, deleteBoard, loading } = useProjectBoard();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('boards-expanded-stats');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // Lightweight stats data
  const [cards, setCards] = useState<CardStub[]>([]);
  const [checklists, setChecklists] = useState<(ChecklistStub & { board_id: string })[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Cross-board card search
  const [cardSearch, setCardSearch] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<{ id: string; title: string; boardId: string; boardTitle: string; columnTitle: string }[]>([]);
  const [cardSearchIdx, setCardSearchIdx] = useState(0);
  const cardSearchBarRef = useRef<HTMLDivElement>(null);

  // Restore last boards view (board detail or calendar)
  useEffect(() => {
    const lastRoute = localStorage.getItem('boards-last-route');
    if (lastRoute && lastRoute !== '/boards') {
      localStorage.removeItem('boards-last-route');
      router.replace(lastRoute);
    }
  }, [router]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    setCardSearchIdx(0);
    if (!cardSearch.trim()) { setCardSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data: cardRows } = await supabase
        .from('board_cards')
        .select('id, title, board_id, column_id')
        .ilike('title', `%${cardSearch}%`)
        .eq('is_archived', false)
        .limit(8);
      if (!cardRows || cardRows.length === 0) { setCardSearchResults([]); return; }
      const boardIds = Array.from(new Set(cardRows.map((c: any) => c.board_id as string)));
      const columnIds = Array.from(new Set(cardRows.map((c: any) => c.column_id as string)));
      const [{ data: boardRows }, { data: colRows }] = await Promise.all([
        supabase.from('project_boards').select('id, title').in('id', boardIds),
        supabase.from('board_columns').select('id, title').in('id', columnIds),
      ]);
      const boardMap = new Map((boardRows || []).map((b: any) => [b.id, b.title]));
      const colMap = new Map((colRows || []).map((c: any) => [c.id, c.title]));
      setCardSearchResults(cardRows.map((c: any) => ({
        id: c.id, title: c.title, boardId: c.board_id,
        boardTitle: boardMap.get(c.board_id) || 'Unknown Board',
        columnTitle: colMap.get(c.column_id) || 'Unknown Column',
      })));
    }, 300);
    return () => clearTimeout(t);
  }, [cardSearch]);

  // Fetch lightweight stats data in parallel once boards load
  const fetchStats = useCallback(async () => {
    const [cardsRes, checklistsRes] = await Promise.all([
      supabase
        .from('board_cards')
        .select('id, board_id, due_date, is_complete, priority, updated_at')
        .eq('is_archived', false),
      supabase
        .from('card_checklists')
        .select('card_id, due_date, is_completed'),
    ]);
    const cardData = (cardsRes.data || []) as CardStub[];
    setCards(cardData);
    // Build card_id → board_id map from cards, then tag each checklist
    const cardBoardMap = new Map<string, string>();
    for (const c of cardData) cardBoardMap.set(c.id, c.board_id);
    const flatChecklists = (checklistsRes.data || [])
      .filter((cl: any) => cardBoardMap.has(cl.card_id))
      .map((cl: any) => ({
        card_id: cl.card_id,
        due_date: cl.due_date,
        is_completed: cl.is_completed,
        board_id: cardBoardMap.get(cl.card_id)!,
      }));
    setChecklists(flatChecklists);
    setStatsLoaded(true);
  }, []);

  useEffect(() => {
    if (boards.length > 0 && !statsLoaded) {
      fetchStats();
    }
  }, [boards, statsLoaded, fetchStats]);

  // Compute stats per board
  const statsByBoard = useMemo(() => {
    const today = getToday();
    const weekEnd = getWeekEnd();
    const map = new Map<string, BoardStats>();

    // Initialize empty stats for all boards
    for (const b of boards) {
      map.set(b.id, {
        totalCards: 0,
        completedCards: 0,
        dueToday: 0,
        overdue: 0,
        dueThisWeek: 0,
        highPriority: 0,
        checklistDueToday: 0,
        checklistOverdue: 0,
        checklistDueThisWeek: 0,
        lastActivity: b.updated_at || b.created_at,
      });
    }

    // Aggregate card stats
    for (const c of cards) {
      const s = map.get(c.board_id);
      if (!s) continue;
      s.totalCards++;
      if (c.is_complete) s.completedCards++;
      if (!c.is_complete && c.due_date) {
        if (c.due_date === today) s.dueToday++;
        else if (c.due_date < today) s.overdue++;
        else if (c.due_date > today && c.due_date <= weekEnd) s.dueThisWeek++;
      }
      if (!c.is_complete && (c.priority === 'high' || c.priority === 'urgent')) {
        s.highPriority++;
      }
      if (c.updated_at && (!s.lastActivity || c.updated_at > s.lastActivity)) {
        s.lastActivity = c.updated_at;
      }
    }

    // Aggregate checklist stats
    for (const cl of checklists) {
      const s = map.get(cl.board_id);
      if (!s) continue;
      if (!cl.is_completed && cl.due_date) {
        if (cl.due_date === today) s.checklistDueToday++;
        else if (cl.due_date < today) s.checklistOverdue++;
        else if (cl.due_date > today && cl.due_date <= weekEnd) s.checklistDueThisWeek++;
      }
    }

    return map;
  }, [boards, cards, checklists]);

  const toggleExpand = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedBoards(prev => {
      const isExpanding = !prev.has(boardId);
      const allIds = boards.map(b => b.id);
      const next = isExpanding ? new Set(allIds) : new Set<string>();
      try { localStorage.setItem('boards-expanded-stats', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const board = await createBoard(newTitle, newDesc);
    setCreating(false);
    if (board) {
      setNewTitle('');
      setNewDesc('');
      setShowCreate(false);
      router.push(`/boards/${board.id}`);
    }
  };

  const formatLastActivity = (dateStr: string | null) => {
    if (!dateStr) return 'No activity';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="kb-root">
      <style>{boardsListStyles}</style>
      {/* Header */}
      <div className="kb-header-wrapper">
        <div className="kb-header">
          <h1 className="kb-page-title">Project Boards</h1>
          <div className="kb-toolbar">
            <div className="kb-view-switcher">
              <button className="kb-view-btn active">
                <FolderKanban size={15} />
                Boards
              </button>
              <button className="kb-view-btn" onClick={() => router.push('/boards/calendar')}>
                <Calendar size={15} />
                Calendar
              </button>
            </div>
            <button className="kb-btn kb-btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} />
              New Board
            </button>
          </div>
        </div>
      </div>

      {/* ── Cross-board card search ── */}
      <div className="kb-search-bar" ref={cardSearchBarRef}>
        <Search size={14} className="kb-search-bar-icon" />
        <input
          className="kb-search-bar-input"
          placeholder="Search cards across all boards..."
          value={cardSearch}
          onChange={e => setCardSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') setCardSearchIdx(i => Math.min(i + 1, cardSearchResults.length - 1));
            else if (e.key === 'ArrowUp') setCardSearchIdx(i => Math.max(i - 1, 0));
            else if (e.key === 'Enter' && cardSearchResults[cardSearchIdx]) {
              const r = cardSearchResults[cardSearchIdx];
              router.push(`/boards/${r.boardId}?card=${r.id}`);
              setCardSearch('');
            } else if (e.key === 'Escape') setCardSearch('');
          }}
        />
        {cardSearch && (
          <button onClick={() => setCardSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}>
            <X size={14} />
          </button>
        )}
        {cardSearchResults.length > 0 && cardSearch && (
          <div className="kb-search-global-dropdown">
            <div className="kb-search-global-label">Cards</div>
            {cardSearchResults.map((r, i) => (
              <div
                key={r.id}
                className={`kb-search-global-item${i === cardSearchIdx ? ' selected' : ''}`}
                onClick={() => { router.push(`/boards/${r.boardId}?card=${r.id}`); setCardSearch(''); }}
              >
                <span className="kb-search-global-title">{r.title}</span>
                <span className="kb-search-global-meta">{r.boardTitle} · {r.columnTitle}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="kb-container">

        {/* Create modal */}
        {showCreate && (
          <div className="kb-modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="kb-modal" onClick={e => e.stopPropagation()}>
              <h2 className="kb-modal-title">Create New Board</h2>
              <div className="kb-form-group">
                <label className="kb-label">Board Title</label>
                <input
                  className="kb-input"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Q1 Ministry Planning"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="kb-form-group">
                <label className="kb-label">Description (optional)</label>
                <textarea
                  className="kb-textarea"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Brief description of this board..."
                  rows={3}
                />
              </div>
              <div className="kb-modal-actions">
                <button className="kb-btn kb-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="kb-btn kb-btn-primary" onClick={handleCreate} disabled={creating || !newTitle.trim()}>
                  {creating ? 'Creating...' : 'Create Board'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Board grid */}
        {loading && boards.length === 0 ? (
          <div className="kb-loading">
            <div className="kb-spinner" />
            <p>Loading boards...</p>
          </div>
        ) : boards.length === 0 ? (
          <div className="kb-empty">
            <LayoutDashboard size={48} style={{ color: '#4b5563', marginBottom: '16px' }} />
            <h3 style={{ color: '#e5e7eb', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No boards yet</h3>
            <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '20px' }}>Create your first project board to get started.</p>
            <button className="kb-btn kb-btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} />
              Create Board
            </button>
          </div>
        ) : (
          <div className="kb-board-grid">
            {boards.map(board => {
              const s = statsByBoard.get(board.id);
              const expanded = expandedBoards.has(board.id);
              const hasAlerts = s && (s.overdue > 0 || s.checklistOverdue > 0);
              const hasDue = s && (s.dueToday > 0 || s.checklistDueToday > 0);


              return (
                <div
                  key={board.id}
                  className="kb-board-card"
                  onClick={() => router.push(`/boards/${board.id}`)}
                >
                  <div className="kb-board-card-header">
                    <FolderKanban size={20} style={{ color: '#818cf8' }} />
                    <h3 className="kb-board-card-title">{board.title}</h3>
                    {board.is_public && (
                      <span className="kb-visibility-badge public"><Globe size={10} /> Public</span>
                    )}
                  </div>
                  {board.user_id !== user?.id && (
                    <div className="kb-shared-by"><User size={11} /> Shared board</div>
                  )}
                  {board.description && (
                    <p className="kb-board-card-desc">{board.description}</p>
                  )}

                  {/* Stats pills */}
                  {s && statsLoaded && (
                    <div className="kb-stats-section">
                      <div className="kb-stats-row">
                        {/* Card count + progress */}
                        <span className="kb-stat-pill">
                          <FolderKanban size={11} />
                          {s.completedCards}/{s.totalCards} done
                        </span>

                        {/* Progress bar */}
                        {s.totalCards > 0 && (
                          <span className="kb-stat-progress">
                            <span
                              className="kb-stat-progress-bar"
                              style={{ width: `${Math.round((s.completedCards / s.totalCards) * 100)}%` }}
                            />
                          </span>
                        )}

                        {/* Overdue alert */}
                        {hasAlerts && (
                          <span className="kb-stat-pill overdue">
                            <AlertCircle size={11} />
                            {(s.overdue + s.checklistOverdue)} overdue
                          </span>
                        )}

                        {/* Due today */}
                        {hasDue && (
                          <span className="kb-stat-pill due-today">
                            <Clock size={11} />
                            {(s.dueToday + s.checklistDueToday)} due today
                          </span>
                        )}

                        {/* High priority */}
                        {s.highPriority > 0 && (
                          <span className="kb-stat-pill priority">
                            <Flag size={11} />
                            {s.highPriority}
                          </span>
                        )}

                        {/* Expand toggle */}
                        {s.totalCards > 0 && (
                          <button
                            className={`kb-stat-expand ${expanded ? 'expanded' : ''}`}
                            onClick={e => toggleExpand(board.id, e)}
                            title={expanded ? 'Collapse details' : 'Expand details'}
                          >
                            <ChevronDown size={13} />
                          </button>
                        )}
                      </div>

                      {/* Expanded detail grid */}
                      {expanded && (
                        <div className="kb-stats-detail">
                          <div className="kb-stats-grid">
                            <div className="kb-stat-item">
                              <span className="kb-stat-label">Cards</span>
                              <span className="kb-stat-value">{s.totalCards}</span>
                            </div>
                            <div className="kb-stat-item">
                              <span className="kb-stat-label">Completed</span>
                              <span className="kb-stat-value done">{s.completedCards}</span>
                            </div>
                            <div className="kb-stat-item">
                              <span className="kb-stat-label">Overdue Cards</span>
                              <span className={`kb-stat-value ${s.overdue > 0 ? 'alert' : ''}`}>{s.overdue}</span>
                            </div>
                            <div className="kb-stat-item">
                              <span className="kb-stat-label">Due Today</span>
                              <span className={`kb-stat-value ${s.dueToday > 0 ? 'warn' : ''}`}>{s.dueToday}</span>
                            </div>
                            <div className="kb-stat-item">
                              <span className="kb-stat-label">Due This Week</span>
                              <span className={`kb-stat-value ${s.dueThisWeek > 0 ? 'info' : ''}`}>{s.dueThisWeek}</span>
                            </div>
                            <div className="kb-stat-item">
                              <span className="kb-stat-label">High/Urgent</span>
                              <span className={`kb-stat-value ${s.highPriority > 0 ? 'warn' : ''}`}>{s.highPriority}</span>
                            </div>
                          </div>
                          {(s.checklistOverdue > 0 || s.checklistDueToday > 0 || s.checklistDueThisWeek > 0) && (
                            <div className="kb-stats-checklist-section">
                              <span className="kb-stat-section-title"><CheckSquare size={11} /> Checklist Items</span>
                              <div className="kb-stats-grid">
                                <div className="kb-stat-item">
                                  <span className="kb-stat-label">Overdue</span>
                                  <span className={`kb-stat-value ${s.checklistOverdue > 0 ? 'alert' : ''}`}>{s.checklistOverdue}</span>
                                </div>
                                <div className="kb-stat-item">
                                  <span className="kb-stat-label">Due Today</span>
                                  <span className={`kb-stat-value ${s.checklistDueToday > 0 ? 'warn' : ''}`}>{s.checklistDueToday}</span>
                                </div>
                                <div className="kb-stat-item">
                                  <span className="kb-stat-label">Due This Week</span>
                                  <span className={`kb-stat-value ${s.checklistDueThisWeek > 0 ? 'info' : ''}`}>{s.checklistDueThisWeek}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="kb-board-card-footer">
                    <span className="kb-board-card-date">
                      <Clock size={12} />
                      {s ? formatLastActivity(s.lastActivity) : new Date(board.created_at).toLocaleDateString()}
                    </span>
                    {board.user_id === user?.id && (
                      <button
                        className="kb-btn-icon kb-btn-icon-danger"
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Delete this board? This cannot be undone.')) {
                            deleteBoard(board.id);
                          }
                        }}
                        title="Delete board"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute>
      <BoardsListPage />
    </ProtectedRoute>
  );
}

const boardsListStyles = `
  .kb-root {
    min-height: 100vh;
    background: #0f1117 !important;
    color: #e5e7eb !important;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }
  .kb-header-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 16px 0;
  }
  .kb-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 16px 100px;
  }
  .kb-header {
    margin-bottom: 0;
  }
  .kb-page-title {
    font-size: 26px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    margin: 0 0 16px 0 !important;
  }
  .kb-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .kb-view-switcher {
    display: flex;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  .kb-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    outline: none;
    background: transparent !important;
    color: #6b7280 !important;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .kb-view-btn:hover {
    color: #d1d5db !important;
    background: rgba(255,255,255,0.04) !important;
  }
  .kb-view-btn.active {
    background: #2563eb !important;
    color: #fff !important;
    box-shadow: 0 1px 4px rgba(37,99,235,0.3);
  }
  .kb-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Buttons */
  .kb-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    outline: none;
    white-space: nowrap;
  }
  .kb-btn-primary {
    background: #6366f1 !important;
    color: #fff !important;
  }
  .kb-btn-primary:hover {
    background: #4f46e5 !important;
    transform: translateY(-1px);
  }
  .kb-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  .kb-btn-ghost {
    background: transparent !important;
    color: #9ca3af !important;
    border: 1px solid #374151 !important;
  }
  .kb-btn-ghost:hover {
    background: #1f2937 !important;
    color: #e5e7eb !important;
  }
  .kb-btn-icon {
    background: none !important;
    border: none;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kb-btn-icon:hover {
    background: #1f2937 !important;
    color: #e5e7eb !important;
  }
  .kb-btn-icon-danger:hover {
    background: rgba(239, 68, 68, 0.15) !important;
    color: #ef4444 !important;
  }

  /* Board grid */
  .kb-board-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }
  .kb-board-card {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .kb-board-card:hover {
    border-color: #6366f1;
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3), 0 8px 24px rgba(0,0,0,0.3);
    transform: translateY(-2px);
  }
  .kb-board-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .kb-board-card-title {
    font-size: 16px !important;
    font-weight: 600 !important;
    color: #f9fafb !important;
    margin: 0 !important;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-visibility-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .kb-visibility-badge.public {
    background: rgba(34,197,94,0.12) !important;
    color: #22c55e;
    border: 1px solid rgba(34,197,94,0.25);
  }
  .kb-shared-by {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #818cf8;
    margin-bottom: 6px;
  }
  .kb-board-card-desc {
    font-size: 13px !important;
    color: #9ca3af !important;
    margin: 0 0 12px 0 !important;
    line-height: 1.4 !important;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Stats section ── */
  .kb-stats-section {
    margin: 10px 0 12px;
  }
  .kb-stats-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .kb-stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(255,255,255,0.06);
    color: #9ca3af;
    white-space: nowrap;
    line-height: 1;
  }
  .kb-stat-pill.overdue {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }
  .kb-stat-pill.due-today {
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.2);
  }
  .kb-stat-pill.priority {
    background: rgba(249, 115, 22, 0.12);
    color: #fb923c;
    border: 1px solid rgba(249, 115, 22, 0.2);
  }

  /* Mini progress bar */
  .kb-stat-progress {
    flex: 1;
    min-width: 32px;
    max-width: 60px;
    height: 4px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
    overflow: hidden;
  }
  .kb-stat-progress-bar {
    display: block;
    height: 100%;
    background: #22c55e;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* Expand button */
  .kb-stat-expand {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: none;
    background: rgba(255,255,255,0.06) !important;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0;
    margin-left: auto;
    flex-shrink: 0;
  }
  .kb-stat-expand:hover {
    background: rgba(255,255,255,0.1) !important;
    color: #d1d5db;
  }
  .kb-stat-expand svg {
    transition: transform 0.2s ease;
  }
  .kb-stat-expand.expanded svg {
    transform: rotate(180deg);
  }

  /* Expanded detail grid */
  .kb-stats-detail {
    margin-top: 10px;
    padding: 10px 12px;
    background: rgba(0,0,0,0.2);
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.04);
    animation: kb-slide-down 0.15s ease-out;
  }
  @keyframes kb-slide-down {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .kb-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .kb-stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kb-stat-label {
    font-size: 10px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kb-stat-value {
    font-size: 16px;
    font-weight: 700;
    color: #d1d5db;
  }
  .kb-stat-value.done { color: #22c55e; }
  .kb-stat-value.alert { color: #f87171; }
  .kb-stat-value.warn { color: #fbbf24; }
  .kb-stat-value.info { color: #60a5fa; }
  .kb-stats-checklist-section {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .kb-stat-section-title {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    color: #818cf8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }

  .kb-board-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .kb-board-card-date {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #6b7280;
  }

  /* Modal */
  .kb-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50000;
    padding: 16px;
  }
  .kb-modal {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 16px;
    padding: 28px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  }
  .kb-modal-title {
    font-size: 18px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    margin: 0 0 20px 0 !important;
  }
  .kb-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }

  /* Form */
  .kb-form-group { margin-bottom: 16px; }
  .kb-label {
    display: block;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #9ca3af !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px !important;
  }
  .kb-input, .kb-textarea, .kb-select {
    width: 100%;
    background: #0f1117 !important;
    border: 1px solid #374151 !important;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px !important;
    color: #e5e7eb !important;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }
  .kb-input:focus, .kb-textarea:focus, .kb-select:focus {
    border-color: #6366f1 !important;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
  }
  .kb-textarea {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
  }

  /* Loading / Empty */
  .kb-loading, .kb-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
  }
  .kb-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #374151;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: kb-spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes kb-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Search bar ── */
  .kb-search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.6);
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }
  .kb-search-bar-icon { color: #4b5563; flex-shrink: 0; }
  .kb-search-bar-input {
    flex: 1;
    background: transparent !important;
    border: none !important;
    outline: none !important;
    color: #e5e7eb !important;
    font-size: 13px !important;
    padding: 4px 0 !important;
    font-family: inherit;
  }
  .kb-search-bar-input::placeholder { color: #4b5563 !important; }
  .kb-search-global-dropdown {
    position: absolute;
    top: 100%;
    left: 0; right: 0;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-top: none;
    border-radius: 0 0 10px 10px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    z-index: 200;
    overflow: hidden;
  }
  .kb-search-global-label {
    font-size: 10px; font-weight: 600; color: #4b5563;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 8px 14px 4px;
  }
  .kb-search-global-item {
    display: flex; flex-direction: column; gap: 2px;
    padding: 8px 14px; cursor: pointer;
    transition: background 0.1s;
  }
  .kb-search-global-item.selected,
  .kb-search-global-item:hover { background: #22252f; }
  .kb-search-global-title { font-size: 13px; font-weight: 500; color: #f9fafb; }
  .kb-search-global-meta { font-size: 11px; color: #6366f1; }
`;
