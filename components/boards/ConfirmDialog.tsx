'use client';

/**
 * In-app replacement for window.confirm() in the boards feature. Native
 * confirm() dialogs are suppressed in embedded browser contexts (e.g. the
 * Claude preview pane), which made destructive actions silently no-op.
 *
 * Usage:
 *   const { requestConfirm, confirmDialog } = useConfirm();
 *   ...
 *   if (await requestConfirm({ message: 'Delete this card?' })) { ... }
 *   ...
 *   return (<>...{confirmDialog}</>);
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

const confirmStyles = `
  .kb-confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60000;
    padding: 16px;
  }
  .kb-confirm-dialog {
    width: 360px;
    max-width: 100%;
    background: #1a1d2e;
    border: 1px solid #2a2d3e;
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  }
  .kb-confirm-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
    color: #f3f4f6;
  }
  .kb-confirm-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #9ca3af;
    overflow-wrap: break-word;
  }
  .kb-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  .kb-confirm-btn {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.15s ease, filter 0.15s ease;
  }
  .kb-confirm-btn-cancel {
    background: rgba(255, 255, 255, 0.06);
    color: #d1d5db;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .kb-confirm-btn-cancel:hover { background: rgba(255, 255, 255, 0.12); }
  .kb-confirm-btn-danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: #fff;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
  }
  .kb-confirm-btn-danger:hover { filter: brightness(1.08); }
`;

function ConfirmDialogView({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    // Capture-phase so underlying keyboard shortcuts (e.g. the board's
    // Delete-key handler) don't also fire while the dialog is open.
    const handler = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onConfirm, onCancel]);

  return (
    // role/aria-modal live on the overlay: globals.css force-positions any
    // [aria-modal="true"] element to fixed inset-0, which is what the overlay
    // already is (the inner card must NOT get that treatment).
    <div className="kb-confirm-overlay" role="alertdialog" aria-modal="true" onClick={onCancel}>
      <style>{confirmStyles}</style>
      <div className="kb-confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3 className="kb-confirm-title">{options.title || 'Are you sure?'}</h3>
        <p className="kb-confirm-message">{options.message}</p>
        <div className="kb-confirm-actions">
          <button className="kb-confirm-btn kb-confirm-btn-cancel" onClick={onCancel}>
            {options.cancelLabel || 'Cancel'}
          </button>
          <button ref={confirmRef} className="kb-confirm-btn kb-confirm-btn-danger" onClick={onConfirm}>
            {options.confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): {
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: React.ReactNode;
} {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const requestConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setPending(prev => {
        prev?.resolve(false); // a superseded request answers "cancel"
        return { options, resolve };
      });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setPending(prev => {
      prev?.resolve(value);
      return null;
    });
  }, []);

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  const confirmDialog = pending ? (
    <ConfirmDialogView options={pending.options} onConfirm={onConfirm} onCancel={onCancel} />
  ) : null;

  return { requestConfirm, confirmDialog };
}
