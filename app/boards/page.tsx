'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useProjectBoard } from '../../hooks/useProjectBoard';
import ProtectedRoute from '../../components/ProtectedRoute';
import {
  Plus,
  LayoutDashboard,
  Trash2,
  Archive,
  Calendar,
  FolderKanban,
  Globe,
  Lock,
  User,
} from '../../components/icons/BoardIcons';

function BoardsListPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { boards, fetchBoards, createBoard, deleteBoard, loading } = useProjectBoard();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

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

  return (
    <div className="kb-root">
      <style>{boardsListStyles}</style>
      <div className="kb-container">
        {/* Header */}
        <div className="kb-header">
          <div className="kb-header-left">
            <FolderKanban size={28} style={{ color: '#818cf8' }} />
            <h1 className="kb-page-title">Project Boards</h1>
          </div>
          <button className="kb-btn kb-btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            New Board
          </button>
        </div>

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
            {boards.map(board => (
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
                <div className="kb-board-card-footer">
                  <span className="kb-board-card-date">
                    <Calendar size={12} />
                    {new Date(board.created_at).toLocaleDateString()}
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
            ))}
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
  .kb-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 16px 100px;
  }
  .kb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
  }
  .kb-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .kb-page-title {
    font-size: 24px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    margin: 0 !important;
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
`;
