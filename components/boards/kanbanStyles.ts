
/* ═══════════════════════════════════════════════════════════
   Kanban Styles — injected as <style> to override global CSS
   ═══════════════════════════════════════════════════════════ */
export const kanbanStyles = `
  .kb-root {
    min-height: 100vh;
    background: #0f1117 !important;
    color: #e5e7eb !important;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  }

  /* ── Top bar ── */
  .kb-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.95);
    backdrop-filter: blur(8px);
    position: sticky;
    top: 0;
    z-index: 100;
    gap: 12px;
    flex-wrap: wrap;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .kb-topbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 0 1 auto;
  }
  .kb-topbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex: 0 0 auto;
  }
  .kb-board-title {
    font-size: 18px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kb-public-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(34,197,94,0.12) !important;
    color: #22c55e;
    border: 1px solid rgba(34,197,94,0.25);
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kb-archived-badge {
    background: rgba(148,163,184,0.12) !important;
    color: #cbd5e1;
    border-color: rgba(148,163,184,0.25);
  }
  .kb-shared-badge {
    background: rgba(59,130,246,0.12) !important;
    color: #93c5fd;
    border-color: rgba(59,130,246,0.25);
  }
  .kb-archived-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 14px 16px 0;
    padding: 12px 14px;
    border: 1px solid rgba(148,163,184,0.18);
    border-radius: 10px;
    background: rgba(30,41,59,0.55);
    color: #cbd5e1;
  }
  .kb-archived-notice div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .kb-archived-notice strong {
    color: #f8fafc;
    font-size: 13px;
  }
  .kb-archived-notice span {
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.4;
  }
  .kb-board-label-summary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1 1 280px;
    min-width: 0;
    overflow: hidden;
  }
  .kb-board-label-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 190px;
    min-width: 0;
    min-height: 30px;
    padding: 4px 8px;
    border: 1px solid currentColor;
    border-radius: 7px;
    color: #fff;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.25;
    cursor: pointer;
    transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.12s ease;
  }
  .kb-board-label-badge:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  .kb-board-label-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-board-label-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: rgba(15, 17, 23, 0.28);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    flex-shrink: 0;
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
  .kb-search-global-meta { font-size: 11px; color: #33B233; }

  /* ── Filter button + dropdown ── */
  .kb-filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid #2a2d3a;
    background: #1a1d27;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0;
    flex-shrink: 0;
  }
  .kb-filter-btn:hover { border-color: #52525b; color: #e5e7eb; }
  .kb-filter-btn-active { border-color: #a1a1aa !important; color: #c5d8e8 !important; background: rgba(76, 103, 133, 0.18) !important; }
  .kb-filter-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background: linear-gradient(135deg, #52525b 0%, #a1a1aa 100%);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .kb-filter-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 50;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    padding: 12px 14px;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .kb-filter-dropdown-title {
    font-size: 12px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .kb-filter-row-label {
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    margin-top: 4px;
  }
  .kb-filter-clear-btn {
    margin-top: 6px;
    align-self: flex-end;
    font-size: 11px;
    font-weight: 600;
    color: #33B233;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px 0;
  }
  .kb-filter-clear-btn:hover { color: #56c93f; }

  /* ── Filter select ── */
  .kb-filter-select {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a !important;
    border-radius: 10px !important;
    padding: 6px 10px !important;
    color: #e5e7eb !important;
    font-size: 12px !important;
    cursor: pointer;
    outline: none;
    -webkit-appearance: none;
  }
  .kb-filter-select:focus { border-color: #33B233 !important; }

  /* ── Buttons ── */
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
  .kb-btn-sm { padding: 5px 12px; font-size: 12px; }
  .kb-btn-primary {
    background: linear-gradient(135deg, #52525b 0%, #a1a1aa 100%) !important;
    color: #fff !important;
    box-shadow: 0 2px 8px rgba(76, 103, 133, 0.35) !important;
  }
  .kb-btn-primary:hover {
    filter: brightness(1.08) !important;
    box-shadow: 0 4px 14px rgba(76, 103, 133, 0.5) !important;
  }
  .kb-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none !important; }
  .kb-btn-ghost {
    background: transparent !important;
    color: rgba(238, 244, 237, 0.7) !important;
    border: 1px solid rgba(76, 103, 133, 0.4) !important;
  }
  .kb-btn-ghost:hover { background: rgba(76, 103, 133, 0.18) !important; color: #eef4ed !important; border-color: rgba(141, 169, 196, 0.45) !important; }
  .kb-btn-danger {
    background: rgba(239, 68, 68, 0.1) !important;
    color: #ef4444 !important;
    border: 1px solid rgba(239, 68, 68, 0.2) !important;
  }
  .kb-btn-danger:hover { background: rgba(239, 68, 68, 0.2) !important; }
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
  .kb-btn-icon:hover { background: #1f2937 !important; color: #e5e7eb !important; }
  .kb-btn-icon-sm {
    background: none !important;
    border: none;
    padding: 3px;
    border-radius: 6px;
    cursor: pointer;
    color: #4b5563;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
  }
  .kb-btn-icon-sm:hover { background: #1f2937 !important; color: #9ca3af !important; }

  /* ── Dropdown ── */
  .kb-click-away { position: fixed; inset: 0; z-index: 999; }
  .kb-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    padding: 6px;
    min-width: 180px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    z-index: 1000;
  }
  .kb-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: #d1d5db;
    background: none !important;
    border: none;
    cursor: pointer;
    transition: all 0.1s ease;
    text-align: left;
  }
  .kb-dropdown-item:hover { background: #252836 !important; color: #f9fafb; }
  .kb-dropdown-item.danger { color: #f87171; }
  .kb-dropdown-item.danger:hover { background: rgba(239,68,68,0.1) !important; }

  /* ── Columns scroll container ── */
  .kb-columns-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 20px 16px 120px;
    -webkit-overflow-scrolling: touch;
  }
  .kb-columns-scroll::-webkit-scrollbar { height: 6px; }
  .kb-columns-scroll::-webkit-scrollbar-track { background: transparent; }
  .kb-columns-scroll::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }

  .kb-columns {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    min-height: calc(100vh - 140px);
  }

  /* ── Collapsed column bar ── */
  .kb-column-collapsed {
    flex-shrink: 0;
    width: 44px;
    min-width: 44px;
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0 14px;
    gap: 8px;
    max-height: calc(100vh - 140px);
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    overflow: hidden;
  }
  .kb-column-collapsed:hover {
    border-color: #33B233;
  }
  .kb-column-collapsed.drag-over {
    border-color: #33B233 !important;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.2) inset;
  }
  .kb-column-collapsed-title {
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
    writing-mode: vertical-lr;
    text-orientation: mixed;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 160px;
    margin-top: 4px;
  }

  /* ── Column ── */
  .kb-column {
    flex-shrink: 0;
    width: 300px;
    min-width: 300px;
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 140px);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .kb-column.drag-over {
    border-color: #33B233 !important;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.2) inset;
  }
  .kb-column-header {
    padding: 12px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-bottom: 1px solid #1e2130;
  }
  .kb-column-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .kb-column-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    justify-content: flex-end;
  }
  .kb-color-dot-wrapper {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .kb-column-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .kb-column-dot:hover {
    transform: scale(1.3);
    box-shadow: 0 0 0 3px rgba(255,255,255,0.15);
  }
  .kb-color-picker-popover {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 2000;
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    width: 136px;
  }
  .kb-color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s ease, border-color 0.12s ease;
  }
  .kb-color-swatch:hover { transform: scale(1.2); }
  .kb-color-swatch.active { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.3); }
  .kb-column-title {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #e5e7eb !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kb-column-count {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    background: #1e2130;
    padding: 1px 7px;
    border-radius: 10px;
    flex-shrink: 0;
  }
  .kb-column-cards {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kb-column-cards::-webkit-scrollbar { width: 4px; }
  .kb-column-cards::-webkit-scrollbar-track { background: transparent; }
  .kb-column-cards::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }

  /* ── Card wrapper & drop indicators ── */
  .kb-card-wrapper {
    position: relative;
  }
  .kb-list-row {
    position: relative;
  }
  .kb-card-wrapper.drop-above::before {
    content: '';
    position: absolute;
    top: -5px;
    left: 4px;
    right: 4px;
    height: 3px;
    background: linear-gradient(90deg, #52525b, #a1a1aa);
    border-radius: 2px;
    z-index: 10;
  }
  .kb-card-wrapper.drop-below::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 4px;
    right: 4px;
    height: 3px;
    background: linear-gradient(90deg, #52525b, #a1a1aa);
    border-radius: 2px;
    z-index: 10;
  }

  /* ── Card ── */
  .kb-card {
    background: #1a1d27 !important;
    border: 1px solid #252836;
    border-radius: 10px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }
  .kb-card:hover {
    border-color: #3b3f52;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transform: translateY(-1px);
  }
  .kb-card.dragging {
    opacity: 0.5;
    transform: rotate(2deg);
  }
  .kb-card-due-picker {
    position: absolute;
    inset: 8px 8px auto;
    z-index: 30;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(141, 169, 196, 0.35);
    background: rgba(9, 27, 52, 0.96);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(10px);
  }
  .kb-list-row-date-picker .kb-card-due-picker {
    inset: 8px 8px auto auto;
  }
  .kb-card-due-picker-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #a1a1aa;
    margin-bottom: 8px;
  }
  .kb-card-due-picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kb-card-due-picker-input {
    min-width: 140px;
    background: #14161e !important;
    border: 1px solid #2a2d3a !important;
    border-radius: 8px !important;
    color: #eef4ed !important;
    padding: 7px 10px !important;
    font-size: 12px !important;
    outline: none;
  }
  .kb-card-due-picker-input:focus {
    border-color: #a1a1aa !important;
    box-shadow: 0 0 0 2px rgba(141, 169, 196, 0.16);
  }
  .kb-card-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }
  .kb-card-label {
    font-size: 10px;
    font-weight: 600;
    color: #fff !important;
    padding: 2px 8px;
    border-radius: 6px;
    white-space: nowrap;
  }
  .kb-card-title {
    font-size: 13px !important;
    font-weight: 500 !important;
    color: #e5e7eb !important;
    margin: 0 0 8px 0 !important;
    line-height: 1.4 !important;
    word-break: break-word;
  }
  .kb-card-title.completed {
    text-decoration: line-through;
    color: #6b7280 !important;
  }
  .kb-card-title-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }
  .kb-card-title-row .kb-card-title {
    margin: 0 !important;
    flex: 1;
  }
  .kb-card-complete-btn {
    width: 16px;
    height: 16px;
    min-width: 16px;
    border-radius: 50%;
    border: 2px solid #4b5563;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    margin-top: 1px;
    transition: all 0.15s;
    padding: 0;
    flex-shrink: 0;
  }
  .kb-card-complete-btn:hover {
    border-color: #22c55e;
    background: rgba(34,197,94,0.1);
  }
  .kb-card-complete-btn.checked {
    border-color: #22c55e;
    background: #22c55e;
    color: #fff;
  }
  .kb-card-complete {
    opacity: 0.6;
  }

  /* Detail modal complete toggle */
  .kb-detail-title-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid #2a2d3a;
  }
  .kb-detail-title-row .kb-detail-title-input {
    flex: 1;
    padding-bottom: 0 !important;
    margin-bottom: 0 !important;
    border-bottom: none !important;
  }
  .kb-complete-toggle {
    width: 22px;
    height: 22px;
    min-width: 22px;
    border-radius: 50%;
    border: 2px solid #4b5563;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: all 0.15s;
    padding: 0;
    margin-top: 3px;
    flex-shrink: 0;
  }
  .kb-complete-toggle:hover {
    border-color: #22c55e;
    background: rgba(34,197,94,0.1);
  }
  .kb-complete-toggle.checked {
    border-color: #22c55e;
    background: #22c55e;
    color: #fff;
  }
  .kb-detail-title-input.completed {
    text-decoration: line-through;
    color: #6b7280 !important;
  }

  /* List row complete state */
  .kb-list-row-complete {
    opacity: 0.6;
  }
  .kb-list-row-title.completed {
    text-decoration: line-through;
    color: #6b7280 !important;
  }
  .kb-card-schedule {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .kb-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .kb-card-priority {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 6px;
  }
  .kb-card-dates {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: #9ca3af;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(255,255,255,0.04);
  }
  .kb-card-dates.overdue {
    color: #ef4444;
    background: rgba(239,68,68,0.12);
    font-weight: 600;
  }
  .kb-card-dates.due-soon {
    color: #f59e0b;
    background: rgba(245,158,11,0.12);
    font-weight: 600;
  }
  .kb-card-date-sep {
    opacity: 0.5;
    margin: 0 1px;
  }
  .kb-card-snooze {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    margin-top: 6px;
    padding: 5px 8px;
    font-size: 10px;
    font-weight: 600;
    color: #9ca3af;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }
  .kb-card-snooze:hover {
    color: #56c93f;
    background: rgba(86,201,63,0.12);
    border-color: rgba(86,201,63,0.3);
  }
  .kb-modal-snooze-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 6px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 700;
    color: #f59e0b;
    background: rgba(245,158,11,0.10) !important;
    border: 1px solid rgba(245,158,11,0.28);
    border-radius: 8px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }
  .kb-modal-snooze-btn:hover {
    color: #fbbf24;
    background: rgba(245,158,11,0.16) !important;
    border-color: rgba(245,158,11,0.45);
  }
  .kb-card-counts {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .kb-card-count {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: #6b7280;
  }
  .kb-card-count.done { color: #22c55e; }
  .kb-card-count.overdue { color: #ef4444; }
  .kb-card-count.due-today { color: #f59e0b; }
  .kb-card-cl-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 2px;
  }
  .kb-card-cl-badge.overdue {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
  .kb-card-cl-badge.due-today {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }
  .kb-card-assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #6b7280;
    margin-top: 6px;
  }

  /* ── Add card ── */
  .kb-add-card-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 10px 14px;
    background: none !important;
    border: none;
    border-top: 1px solid #1e2130;
    border-radius: 0 0 14px 14px;
    font-size: 13px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .kb-add-card-btn:hover { color: #e5e7eb; background: rgba(255,255,255,0.03) !important; }
  .kb-quick-add {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kb-quick-add-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Add column ── */
  .kb-add-column {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    padding-top: 2px;
    min-width: fit-content;
  }
  .kb-add-column:has(.kb-add-column-form) {
    width: 300px;
    min-width: 300px;
  }
  .kb-add-column-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(255,255,255,0.10) !important;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .kb-add-column-btn:hover { background: rgba(255,255,255,0.15) !important; color: rgba(255,255,255,1); border-color: rgba(255,255,255,0.18); }
  .kb-add-column-form {
    background: #14161e !important;
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── Inline edit ── */
  .kb-inline-edit {
    background: rgba(76, 103, 133, 0.15) !important;
    border: 1px solid rgba(141, 169, 196, 0.5) !important;
    border-radius: 6px;
    padding: 2px 8px;
    font-size: inherit;
    font-weight: inherit;
    color: #e5e7eb !important;
    outline: none;
    width: 100%;
  }

  /* ── Inputs ── */
  .kb-input, .kb-textarea {
    width: 100%;
    background: #0f1117 !important;
    border: 1px solid #374151 !important;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px !important;
    color: #e5e7eb !important;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
    font-family: inherit;
  }
  select.kb-input {
    appearance: none !important;
    -webkit-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 12px center !important;
    padding-right: 32px !important;
    cursor: pointer !important;
  }
  select.kb-input option {
    background: #1a1d2e;
    color: #e5e7eb;
  }
  .kb-input:focus, .kb-textarea:focus { border-color: rgba(141, 169, 196, 0.65) !important; box-shadow: 0 0 0 3px rgba(76, 103, 133, 0.18), 0 0 0 1px rgba(141, 169, 196, 0.4) !important; }
  .kb-textarea { resize: vertical; min-height: 60px; }
  input[type="date"].kb-input {
    padding: 11px 12px;
    min-height: 44px;
    cursor: pointer;
  }

  /* ── Loading ── */
  .kb-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 120px 20px;
    text-align: center;
  }
  .kb-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #374151;
    border-top-color: #33B233;
    border-radius: 50%;
    animation: kb-spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes kb-spin { to { transform: rotate(360deg); } }

  /* ── Modal (detail) ── */
  .kb-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 50000;
    padding: 40px 16px 120px;
    overflow-y: auto;
  }
  .kb-detail-modal {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 18px;
    max-width: 900px;
    width: 100%;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
    position: relative;
    animation: kb-modal-in 0.2s ease;
  }
  @keyframes kb-modal-in {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .kb-detail-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none !important;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.15s ease;
    z-index: 10;
    display: flex;
  }
  .kb-detail-close:hover { background: #252836 !important; color: #e5e7eb; }
  .kb-detail-body {
    display: flex;
    gap: 0;
  }
  .kb-detail-main {
    flex: 1;
    padding: 28px 24px;
    min-width: 0;
    border-right: 1px solid #2a2d3a;
  }
  .kb-detail-sidebar {
    width: 260px;
    flex-shrink: 0;
    padding: 28px 20px;
  }
  .kb-detail-title-input {
    width: 100%;
    background: transparent !important;
    border: none !important;
    outline: none;
    font-size: 20px !important;
    font-weight: 700 !important;
    color: #f9fafb !important;
    padding: 0 0 12px 0 !important;
    margin-bottom: 12px;
    border-bottom: 1px solid #2a2d3a !important;
  }
  .kb-detail-column-badge {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid;
    margin-bottom: 16px;
    background: rgba(255,255,255,0.03);
  }
  .kb-detail-section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: #9ca3af !important;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }

  /* ── Labels ── */
  .kb-label-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .kb-label-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid;
  }
  .kb-hash-dropdown {
    background: #14161e;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }
  .kb-hash-empty {
    font-size: 12px;
    color: #6b7280;
    padding: 6px 10px;
    margin: 0;
  }
  .kb-hash-create {
    border-top: 1px solid #2a2d3a !important;
    margin-top: 4px !important;
    padding-top: 8px !important;
    color: #a5b4fc !important;
  }
  .kb-label-picker {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: #14161e !important;
    border: 1px solid #2a2d3a;
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .kb-label-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    color: #d1d5db;
    background: none !important;
    border: none;
    cursor: pointer;
    transition: all 0.1s ease;
    text-align: left;
  }
  .kb-label-picker-item:hover { background: #1e2130 !important; }
  .kb-label-picker-item.selected { background: rgba(99,102,241,0.1) !important; }
  .kb-label-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* ── Priority buttons ── */
  .kb-priority-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .kb-priority-btn {
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid #2a2d3a;
    background: transparent !important;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .kb-priority-btn.active {
    background: var(--pri-bg) !important;
    color: var(--pri-color);
    border-color: var(--pri-color);
  }

  /* ── Form groups ── */
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

  /* ── Checklist ── */
  .kb-checklist-progress { margin-bottom: 10px; }
  .kb-checklist-bar {
    height: 6px;
    background: #252836;
    border-radius: 3px;
    overflow: hidden;
  }
  .kb-checklist-fill {
    height: 100%;
    background: linear-gradient(90deg, #52525b 0%, #a1a1aa 100%);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .kb-checklist-items { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .kb-checklist-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .kb-checklist-item.dragging {
    opacity: 0.45;
  }
  .kb-checklist-item.drop-above::before,
  .kb-checklist-item.drop-below::after {
    content: '';
    position: absolute;
    left: 28px;
    right: 0;
    height: 2px;
    border-radius: 999px;
    background: #a1a1aa;
    box-shadow: 0 0 0 1px rgba(141,169,196,0.2);
  }
  .kb-checklist-item.drop-above::before { top: -3px; }
  .kb-checklist-item.drop-below::after { bottom: -3px; }
  .kb-checklist-drag-handle {
    width: 18px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
    color: #4b5563;
    background: transparent !important;
    border: none !important;
    cursor: grab;
    transition: color 0.15s ease;
  }
  .kb-checklist-drag-handle:hover,
  .kb-checklist-drag-handle:focus-visible {
    color: #9ca3af;
  }
  .kb-checklist-drag-handle:active {
    cursor: grabbing;
  }
  .kb-checkbox {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 2px solid #4b5563;
    background: transparent !important;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
    color: transparent;
    padding: 0;
  }
  .kb-checkbox.checked {
    background: linear-gradient(135deg, #52525b 0%, #a1a1aa 100%) !important;
    border-color: #a1a1aa;
    color: #fff;
  }
  .kb-checklist-text { font-size: 13px; color: #d1d5db; flex: 1; }
  .kb-checklist-text.completed { text-decoration: line-through; color: #6b7280; }
  .kb-checklist-link { text-decoration: underline; text-decoration-color: rgba(141,169,196,0.5); text-underline-offset: 2px; }
  .kb-checklist-link:hover { color: #a1a1aa; text-decoration-color: #a1a1aa; }
  .kb-checklist-link.completed { color: #6b7280; text-decoration: line-through; }
  .kb-checklist-open-btn { display: inline-flex; align-items: center; color: #6b7280; flex-shrink: 0; padding: 0 2px; transition: color 0.15s; }
  .kb-checklist-open-btn:hover { color: #a1a1aa; }
  .kb-checklist-link-active { color: #a1a1aa !important; }
  .kb-checklist-url-row { display: flex; align-items: center; gap: 6px; padding: 4px 0 2px 28px; }
  .kb-checklist-url-input { font-size: 12px; padding: 2px 6px; height: auto; flex: 1; }
  .kb-checklist-convert-row { display: flex; align-items: center; gap: 6px; padding: 4px 0 2px 28px; }
  .kb-checklist-convert-select { font-size: 12px; padding: 2px 6px; height: auto; flex: 1; }
  .kb-checklist-edit-input { font-size: 13px; padding: 2px 6px; height: auto; flex: 1; }
  .kb-checklist-due-wrapper { display: flex; align-items: center; flex-shrink: 0; }
  .kb-checklist-date-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 4px;
    color: transparent; background: transparent; border: none; cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .kb-checklist-item:hover .kb-checklist-date-btn { color: #6b7280; }
  .kb-checklist-date-btn:hover { color: #9ca3af !important; background: rgba(255,255,255,0.06); }
  .kb-checklist-date-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 11px; font-weight: 500;
    padding: 2px 6px; border-radius: 4px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
    color: #9ca3af; cursor: pointer; white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
  }
  .kb-checklist-date-badge:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15); }
  .kb-checklist-date-badge.overdue { color: #f87171; background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.25); }
  .kb-checklist-date-badge.due-today { color: #fbbf24; background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.25); }
  .kb-checklist-due-input-edit {
    font-size: 11px; padding: 2px 4px; height: 22px;
    border: 1px solid rgba(141,169,196,0.5); border-radius: 4px;
    background: #1e2130; color: #d1d5db; cursor: pointer; width: 110px; outline: none;
  }
  .kb-checklist-due-input-edit::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
  .kb-checklist-add { display: flex; gap: 8px; align-items: center; }
  .kb-checklist-add-btn {
    font-size: 12px !important; gap: 4px; padding: 4px 8px !important; margin-top: 4px;
  }

  /* ── Checklist Groups ── */
  .kb-checklist-group {
    margin-top: 14px;
    border-top: 1px solid #252836;
    padding-top: 10px;
  }
  .kb-checklist-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .kb-checklist-group-title {
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: text;
    flex: 1;
  }
  .kb-checklist-group-title:hover { color: #d1d5db; }
  .kb-checklist-group-title-input {
    font-size: 12px !important;
    font-weight: 600 !important;
    padding: 2px 6px !important;
    height: auto !important;
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .kb-checklist-group-count {
    font-size: 11px;
    color: #6b7280;
    flex-shrink: 0;
  }

  /* ── Checklist Templates ── */
  .kb-template-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .kb-template-save-row { display: flex; gap: 6px; align-items: center; width: 100%; }
  .kb-btn-ghost {
    background: transparent !important;
    color: #9ca3af !important;
    border: 1px dashed #374151 !important;
  }
  .kb-btn-ghost:hover {
    background: rgba(99, 102, 241, 0.1) !important;
    color: #a5b4fc !important;
    border-color: #33B233 !important;
  }
  .kb-template-picker {
    margin-top: 8px;
    border: 1px solid #1e2130;
    border-radius: 10px;
    overflow: hidden;
    background: #14161e !important;
  }
  .kb-template-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #1e2130;
  }
  .kb-template-item:last-child { border-bottom: none; }
  .kb-template-apply {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent !important;
    border: none !important;
    color: #d1d5db !important;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }
  .kb-template-apply:hover { background: rgba(99, 102, 241, 0.1) !important; }
  .kb-template-name { flex: 1; }
  .kb-template-count { font-size: 11px; color: #6b7280; }

  /* ── Import Modal ── */
  .kb-import-modal {
    width: 640px;
    max-width: 95vw;
    max-height: 85vh;
    background: #1a1d2e !important;
    border: 1px solid #2a2d3e;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kb-import-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #1e2130;
  }
  .kb-import-title {
    font-size: 16px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;
  }
  .kb-import-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px 20px;
    border-bottom: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.5);
  }
  .kb-import-select {
    font-size: 12px !important;
    padding: 6px 28px 6px 10px !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 10px center !important;
  }
  select.kb-import-select option {
    background: #1a1d2e !important;
    color: #e5e7eb !important;
  }
  .kb-import-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid #1e2130;
  }
  .kb-import-count {
    font-size: 12px;
    color: #56c93f;
    white-space: nowrap;
  }
  .kb-import-list {
    flex: 1;
    overflow-y: auto;
    min-height: 200px;
    max-height: 400px;
  }
  .kb-import-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #6b7280;
    font-size: 13px;
  }
  .kb-import-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px;
    cursor: pointer;
    border-bottom: 1px solid #14161e;
    transition: background 0.15s;
  }
  .kb-import-row:hover { background: rgba(99, 102, 241, 0.06); }
  .kb-import-row-selected { background: rgba(99, 102, 241, 0.1); }
  .kb-import-leader-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .kb-import-leader-name { font-size: 13px; color: #e5e7eb; font-weight: 500; }
  .kb-import-leader-meta { font-size: 11px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kb-import-leader-status {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.15) !important;
    color: #a5b4fc;
    white-space: nowrap;
    text-transform: capitalize;
  }
  .kb-import-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid #1e2130;
    background: rgba(15, 17, 23, 0.5);
  }
  .kb-import-label { font-size: 12px; color: #9ca3af; white-space: nowrap; }

  /* ── Share Modal ── */
  .kb-share-modal {
    width: 620px;
    max-width: 95vw;
    max-height: 85vh;
    background: #1a1d2e !important;
    border: 1px solid #2a2d3e;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kb-share-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .kb-share-title span {
    display: block;
    margin-top: 2px;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #6b7280;
    font-size: 12px;
  }
  .kb-share-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 20px;
    overflow-y: auto;
  }
  .kb-share-everyone {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    background: rgba(15,17,23,0.55) !important;
    border: 1px solid #2a2d3e;
    border-radius: 12px;
    color: #e5e7eb;
    cursor: pointer;
    text-align: left;
  }
  .kb-share-everyone.active {
    border-color: rgba(86,201,63,0.45);
    background: rgba(86,201,63,0.08) !important;
  }
  .kb-share-everyone:disabled { opacity: 0.65; cursor: not-allowed; }
  .kb-share-everyone-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #56c93f;
    background: rgba(86,201,63,0.12);
  }
  .kb-share-everyone strong,
  .kb-share-person strong {
    display: block;
    color: #e5e7eb;
    font-size: 13px;
    font-weight: 600;
  }
  .kb-share-everyone span,
  .kb-share-person span {
    display: block;
    margin-top: 2px;
    color: #6b7280;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-share-switch {
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
    color: #9ca3af !important;
    font-size: 11px !important;
    font-weight: 700;
  }
  .kb-share-section {
    border: 1px solid #232636;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(15,17,23,0.28);
  }
  .kb-share-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid #232636;
    color: #cbd5e1;
    font-size: 12px;
    font-weight: 700;
  }
  .kb-share-member-list,
  .kb-share-user-list {
    max-height: 220px;
    overflow-y: auto;
  }
  .kb-share-member-row,
  .kb-share-user-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #14161e;
  }
  .kb-share-member-row:last-child,
  .kb-share-user-row:last-child { border-bottom: none; }
  .kb-share-avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #93c5fd;
    background: rgba(59,130,246,0.12);
    flex-shrink: 0;
  }
  .kb-share-person { flex: 1; min-width: 0; }
  .kb-share-role {
    color: #56c93f;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kb-share-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid #232636;
    color: #6b7280;
  }
  .kb-share-search .kb-input { flex: 1; }
  .kb-share-user-row {
    cursor: pointer;
    transition: background 0.15s;
  }
  .kb-share-user-row:hover,
  .kb-share-user-row.selected {
    background: rgba(86,201,63,0.08);
  }
  .kb-share-user-row input {
    width: 16px;
    height: 16px;
    accent-color: #56c93f;
  }
  .kb-share-error {
    padding: 9px 11px;
    border-radius: 10px;
    background: rgba(239,68,68,0.12);
    color: #fca5a5;
    border: 1px solid rgba(239,68,68,0.22);
    font-size: 12px;
  }

  /* ── List Actions Modal ── */
  .kb-list-actions-modal {
    width: 520px;
    max-width: 95vw;
    max-height: 85vh;
    background: #1a1d2e !important;
    border: 1px solid #2a2d3e;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kb-list-actions-body {
    padding: 8px 0;
    overflow-y: auto;
  }
  .kb-list-action-row {
    padding: 12px 20px;
    border-bottom: 1px solid #14161e;
  }
  .kb-list-action-row:last-child { border-bottom: none; }
  .kb-list-action-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .kb-list-action-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .kb-list-action-danger .kb-list-action-label { color: #f87171; }
  .kb-btn-danger {
    background: rgba(239, 68, 68, 0.15) !important;
    color: #f87171 !important;
    border: 1px solid rgba(239, 68, 68, 0.3) !important;
  }
  .kb-btn-danger:hover {
    background: rgba(239, 68, 68, 0.25) !important;
  }
  .kb-list-action-result {
    padding: 10px 20px;
    font-size: 12px;
    color: #34d399;
    text-align: center;
  }

  /* ── Comments ── */
  .kb-comments { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .kb-comment {
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 10px;
    padding: 10px 12px;
  }
  .kb-comment-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .kb-comment-author { font-size: 12px; font-weight: 600; color: #a5b4fc; }
  .kb-comment-date { font-size: 10px; color: #6b7280; flex: 1; }
  .kb-comment-text { font-size: 13px; color: #d1d5db; margin: 0 !important; line-height: 1.5; }
  .kb-comment-text .kb-link,
  .kb-desc-display .kb-link {
    color: #56c93f !important;
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-all;
    cursor: pointer;
    transition: color 0.12s ease;
  }
  .kb-comment-text .kb-link:hover,
  .kb-desc-display .kb-link:hover {
    color: #a5b4fc !important;
  }
  .kb-desc-display {
    padding: 10px 12px;
    background: #14161e !important;
    border: 1px solid #1e2130;
    border-radius: 10px;
    font-size: 13px;
    color: #d1d5db;
    line-height: 1.6;
    min-height: 60px;
    cursor: text;
    transition: border-color 0.15s ease;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .kb-desc-display:hover {
    border-color: #374151;
  }
  .kb-desc-placeholder {
    color: #4b5563;
    font-style: italic;
  }
  /* ── Rich Text Editor in Card Description ── */
  .kb-desc-editor > div {
    background: #14161e !important;
    border: 1px solid #1e2130 !important;
    border-radius: 10px !important;
  }
  .kb-desc-editor > div:focus-within {
    border-color: rgba(141, 169, 196, 0.65) !important;
    box-shadow: 0 0 0 3px rgba(76, 103, 133, 0.18), 0 0 0 1px rgba(141, 169, 196, 0.4) !important;
    ring: none !important;
  }
  .kb-desc-editor > div > div:first-child {
    background: #0f1117 !important;
    border-color: #1e2130 !important;
  }
  .kb-desc-editor [contenteditable] {
    background: #14161e !important;
    color: #d1d5db !important;
  }
  .kb-desc-editor button {
    color: #9ca3af !important;
  }
  .kb-desc-editor button:hover {
    background: #1e2130 !important;
    color: #e5e7eb !important;
  }
  .kb-desc-editor [contenteditable] a { color: #56c93f !important; }
  .kb-desc-editor [contenteditable] h3 { color: #f3f4f6 !important; }
  .kb-desc-editor [contenteditable] ul,
  .kb-desc-editor [contenteditable] ol { color: #d1d5db !important; }
  .kb-contact-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .kb-contact-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 6px 8px;
    border-radius: 999px;
    background: rgba(20, 22, 30, 0.88);
    border: 1px solid #1e2130;
  }
  .kb-contact-actions-comment {
    margin-top: 6px;
  }
  .kb-contact-value {
    font-size: 11px;
    color: #d1d5db;
    word-break: break-all;
  }
  .kb-contact-links {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .kb-contact-link {
    font-size: 11px;
    font-weight: 600;
    color: #a5b4fc;
    text-decoration: none;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid rgba(129, 140, 248, 0.25);
    background: rgba(99, 102, 241, 0.12);
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }
  .kb-contact-link:hover {
    color: #c7d2fe;
    background: rgba(99, 102, 241, 0.2);
    border-color: rgba(129, 140, 248, 0.4);
  }
  .kb-comment-edit { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .kb-comment-edit-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .kb-comment-add { display: flex; flex-direction: column; }

  /* ── Label Manager ── */
  .kb-lm-modal {
    background: #1a1d27 !important;
    border: 1px solid #2a2d3a;
    border-radius: 18px;
    max-width: 520px;
    width: 100%;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
    animation: kb-modal-in 0.2s ease;
    overflow: hidden;
  }
  .kb-lm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid #2a2d3a;
  }
  .kb-lm-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 700;
    color: #f9fafb;
  }
  .kb-lm-create {
    padding: 16px 20px;
    border-bottom: 1px solid #2a2d3a;
    background: rgba(255,255,255,0.02);
  }
  .kb-lm-create-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .kb-lm-color-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px !important;
    border: 2px solid rgba(255,255,255,0.15) !important;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
    background-color: var(--swatch-color) !important;
  }
  .kb-lm-color-btn:hover {
    border-color: rgba(255,255,255,0.35) !important;
    transform: scale(1.08);
    background-color: var(--swatch-color) !important;
  }
  .kb-lm-color-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .kb-lm-color-swatch {
    width: 26px;
    height: 26px;
    border-radius: 50% !important;
    border: 2px solid transparent !important;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff !important;
    transition: all 0.12s ease;
    flex-shrink: 0;
    background-color: var(--swatch-color) !important;
  }
  .kb-lm-color-swatch:hover {
    transform: scale(1.15);
    border-color: rgba(255,255,255,0.5) !important;
    background-color: var(--swatch-color) !important;
  }
  .kb-lm-color-swatch.active {
    border-color: #fff !important;
    transform: scale(1.15);
    box-shadow: 0 0 0 2px rgba(255,255,255,0.3);
    background-color: var(--swatch-color) !important;
  }
  .kb-lm-list {
    padding: 8px 12px 12px;
    max-height: 380px;
    overflow-y: auto;
  }
  .kb-lm-empty {
    text-align: center;
    color: #6b7280;
    font-size: 13px;
    padding: 28px 16px;
  }
  .kb-lm-item {
    padding: 6px 8px;
    border-radius: 10px;
    transition: background 0.1s ease;
  }
  .kb-lm-item:hover {
    background: rgba(255,255,255,0.03);
  }
  .kb-lm-display-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .kb-lm-label-preview {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid;
  }
  .kb-lm-item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .kb-lm-item:hover .kb-lm-item-actions {
    opacity: 1;
  }
  .kb-lm-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Note Panel ── */
  .kb-note-panel {
    position: fixed;
    top: 64px;
    right: 0;
    bottom: 0;
    width: 400px;
    background: #1a1d2e;
    border-left: 1px solid #2a2d3a;
    display: flex;
    flex-direction: column;
    z-index: 900;
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: -4px 0 24px rgba(0,0,0,0.3);
  }
  .kb-note-panel.open {
    transform: translateX(0);
  }
  .kb-note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #2a2d3a;
    flex-shrink: 0;
  }
  .kb-note-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: #e2e8f0;
  }
  .kb-note-close-btn {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 8px !important;
    border: 1px solid #3b3f54 !important;
    background: #1e2235 !important;
    color: #94a3b8 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
    flex-shrink: 0 !important;
    padding: 0 !important;
  }
  .kb-note-close-btn:hover {
    background: #ef4444 !important;
    border-color: #ef4444 !important;
    color: #fff !important;
  }
  /* ── Note Toolbar ── */
  .kb-note-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid #2a2d3a;
    background: rgba(15, 17, 23, 0.5);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .kb-note-tool-btn {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 6px !important;
    border: none !important;
    background: transparent !important;
    color: #94a3b8 !important;
    cursor: pointer !important;
    transition: all 0.12s ease !important;
    padding: 0 !important;
  }
  .kb-note-tool-btn:hover {
    background: rgba(99, 102, 241, 0.15) !important;
    color: #a5b4fc !important;
  }
  .kb-note-tool-btn:active {
    background: rgba(99, 102, 241, 0.25) !important;
    color: #c7d2fe !important;
  }
  .kb-note-tool-btn.active {
    background: rgba(99, 102, 241, 0.2) !important;
    color: #a5b4fc !important;
  }
  .kb-note-tool-sep {
    width: 1px;
    height: 20px;
    background: #2a2d3a;
    margin: 0 4px;
    flex-shrink: 0;
  }
  /* ── Note Editable Area ── */
  .kb-note-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }
  .kb-note-editable {
    min-height: 100%;
    outline: none;
    color: #e2e8f0;
    font-size: 14px;
    line-height: 1.7;
    word-break: break-word;
    caret-color: #56c93f;
  }
  .kb-note-editable:empty::before {
    content: 'Start typing your notes...';
    color: #4b5068;
    font-style: italic;
    pointer-events: none;
  }
  .kb-note-editable h3 {
    font-size: 17px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 16px 0 8px 0;
    line-height: 1.3;
  }
  .kb-note-editable h3:first-child {
    margin-top: 0;
  }
  .kb-note-editable a {
    color: #56c93f;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: text;
    position: relative;
  }
  .kb-note-editable a:hover {
    color: #a5b4fc;
    cursor: pointer;
  }
  .kb-note-editable a:hover::after {
    content: '⌘ click to open';
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #1e2235;
    color: #94a3b8;
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #3b3f54;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    font-style: normal;
    font-weight: 500;
    text-decoration: none;
    line-height: 1.4;
  }
  .kb-note-editable ul {
    padding-left: 24px;
    margin: 8px 0;
    list-style-type: disc !important;
  }
  .kb-note-editable ol {
    padding-left: 24px;
    margin: 8px 0;
    list-style-type: decimal !important;
  }
  .kb-note-editable li {
    margin: 2px 0;
    display: list-item !important;
  }
  .kb-note-editable blockquote {
    border-left: 3px solid #52525b;
    padding-left: 12px;
    margin: 8px 0;
    color: #94a3b8;
    font-style: italic;
  }
  .kb-note-editable s {
    color: #71717a;
  }
  .kb-btn-icon-active {
    background: rgba(76, 103, 133, 0.25) !important;
    color: #a1a1aa !important;
  }

  /* ── View toggle ── */
  .kb-view-toggle {
    display: flex;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  .kb-view-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255,255,255,0.55);
    background: transparent !important;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .kb-view-btn:hover { color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.06) !important; }
  .kb-view-btn.active {
    background: rgba(255,255,255,0.12) !important;
    color: #fff !important;
    box-shadow: none;
  }
  .kb-view-btn-notes.active {
    background: rgba(255,255,255,0.12) !important;
    color: #fff !important;
    box-shadow: none;
  }

  /* ── List View ── */
  .kb-list-view {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 100px;
  }
  .kb-list-group {
    margin-bottom: 8px;
  }
  .kb-list-group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    position: sticky;
    top: 0;
    z-index: 5;
    background: #0f1117;
    border-bottom: 1px solid #22252f;
  }
  .kb-list-group-title {
    font-size: 13px;
    font-weight: 700;
    color: #e5e7eb;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .kb-list-group-count {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    background: #1a1d27;
    padding: 1px 7px;
    border-radius: 10px;
  }
  .kb-list-empty {
    padding: 12px 16px;
    font-size: 12px;
    color: #4b5563;
    font-style: italic;
  }
  .kb-list-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    cursor: pointer;
    border-bottom: 1px solid #1a1d27;
    transition: background 0.1s;
  }
  .kb-list-row:hover {
    background: #1a1d27;
  }
  .kb-list-row:last-child {
    border-bottom: none;
  }
  .kb-list-priority {
    width: 4px;
    height: 28px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .kb-list-row-main {
    flex: 1;
    min-width: 0;
  }
  .kb-list-row-title {
    font-size: 14px;
    font-weight: 500;
    color: #e5e7eb;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kb-list-row-labels {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .kb-list-row-label {
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    padding: 1px 7px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .kb-list-row-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .kb-list-row-assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
  }
  .kb-list-row-date {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #56c93f;
    white-space: nowrap;
  }
  .kb-list-row-date.overdue { color: #ef4444; }
  .kb-list-row-date.due-soon { color: #f59e0b; }
  .kb-list-row-count {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: #6b7280;
  }
  .kb-list-row-count.done { color: #22c55e; }
  .kb-list-row-count.overdue { color: #ef4444; }
  .kb-list-row-count.due-today { color: #f59e0b; }
  .kb-list-quick-add {
    padding: 8px 12px 8px 28px;
  }

  /* ── Column automations button highlight ── */
  .kb-automations-active {
    color: #33B233 !important;
  }

  /* ── Automations Modal ── */
  .kb-auto-modal {
    background: #1a1d27;
    border: 1px solid #2a2d3a;
    border-radius: 14px;
    width: 480px;
    max-width: 95vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .kb-auto-body {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .kb-auto-hint {
    font-size: 13px;
    color: #9ca3af;
    margin: 0;
  }
  .kb-auto-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .kb-auto-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #12141e;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
  }
  .kb-auto-rule {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
  }
  .kb-auto-trigger {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8b93a7;
    background: #1e2235;
    border: 1px solid #2a2d3a;
    border-radius: 6px;
    padding: 3px 7px;
    white-space: nowrap;
  }
  .kb-auto-label {
    font-size: 13px;
    color: #e5e7eb;
    font-weight: 500;
    min-width: 90px;
  }
  .kb-auto-arrow {
    color: #4b5563;
    font-size: 14px;
  }
  .kb-auto-value {
    font-size: 13px;
    color: #e5e7eb;
    font-weight: 500;
  }
  .kb-auto-empty {
    font-size: 13px;
    color: #6b7280;
    text-align: center;
    padding: 14px;
    background: #12141e;
    border: 1px dashed #2a2d3a;
    border-radius: 8px;
  }
  .kb-auto-offset {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kb-auto-pair {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kb-auto-add-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #12141e;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
  }
  .kb-auto-add-label {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .kb-auto-add-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kb-auto-value-input {
    margin-top: 4px;
  }
  .kb-auto-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 2px;
  }
  .kb-auto-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid #3b3f54;
    background: #1e2235;
    color: #9ca3af;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .kb-auto-chip:hover {
    border-color: #33B233;
    color: #e5e7eb;
  }
  .kb-auto-chip.selected {
    background: #33B233;
    border-color: #33B233;
    color: #0b160b;
    font-weight: 600;
  }
  .kb-auto-chip.selected:hover {
    color: #0b160b;
  }
  .kb-auto-chip.selected .kb-label-dot {
    box-shadow: 0 0 0 1.5px rgba(255,255,255,0.9);
  }
  .kb-auto-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #2a2d3a;
  }
  .kb-auto-saved {
    margin-right: auto;
    font-size: 12px;
    color: #6b7280;
  }

  /* ── Hovered card highlight ── */
  .kb-card-hovered .kb-card,
  .kb-list-row.kb-card-hovered {
    outline: 2px solid rgba(99, 102, 241, 0.6);
    outline-offset: -1px;
  }

  /* ── Keyboard shortcuts legend bar ── */
  .kb-shortcut-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 6px 16px;
    background: rgba(15, 17, 23, 0.92);
    backdrop-filter: blur(8px);
    border-top: 1px solid #1e2235;
    z-index: 50;
    pointer-events: none;
  }
  .kb-shortcut-hint {
    font-size: 11px;
    color: #71717a;
    letter-spacing: 0.01em;
  }
  .kb-shortcut-key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #94a3b8;
  }
  .kb-shortcut-key kbd {
    display: inline-block;
    padding: 1px 6px;
    background: #1e2235;
    border: 1px solid #2a2d3a;
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    color: #cbd5e1;
    min-width: 22px;
    text-align: center;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .kb-topbar { flex-direction: column; align-items: flex-start; max-width: 100%; overflow: visible; }
    .kb-topbar-left { max-width: 100%; overflow: hidden; width: 100%; }
    .kb-board-label-summary {
      order: 2;
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
      overflow: visible;
      flex-basis: auto;
      gap: 6px;
    }
    .kb-board-label-badge {
      max-width: min(100%, 180px);
      min-height: 29px;
    }
    .kb-topbar-right { width: 100%; flex-wrap: nowrap; overflow: visible; gap: 6px; justify-content: space-between; }
    .kb-btn-label { display: none; }
    .kb-view-toggle { flex: 1; }
    .kb-view-btn { flex: 1; justify-content: center; padding: 7px 6px; }
    .kb-filter-btn { flex-shrink: 0; }
    .kb-btn-icon { flex-shrink: 0; }
    .kb-filter-dropdown { position: fixed; top: 110px; right: 16px; left: auto; min-width: 260px; z-index: 10001; }
    .kb-dropdown { position: fixed; top: 110px; right: 16px; left: auto; z-index: 10001; }
    .kb-column { width: 280px; min-width: 280px; }
    .kb-add-column { width: 280px; min-width: 280px; }
    .kb-detail-body { flex-direction: column; }
    .kb-detail-sidebar { width: 100%; border-top: 1px solid #2a2d3a; }
    .kb-detail-main { border-right: none; }
    .kb-note-panel { width: 100%; }
    .kb-shortcut-bar { display: none; }
    /* Prevent iOS Safari from zooming in when focusing inputs */
    .kb-input, .kb-textarea, select.kb-input { font-size: 16px !important; }
    .kb-detail-title-input { font-size: 18px !important; }
    .kb-modal-overlay { padding: 16px 12px 80px; }
  }
`;
