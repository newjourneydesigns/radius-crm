'use client';

import { useState, useCallback, useEffect } from 'react';

const BASE = 'http://localhost:5123';
const PING_TIMEOUT_MS = 2000;

// Bump this whenever server.py changes — RADIUS will prompt users to reinstall.
export const COMPANION_VERSION = '1.4.0';

export interface CompanionSendResult {
  success: boolean;
  error?: string;
}

export interface CompanionPreflightResult {
  ok: boolean;
  error?: string;
}

export type DeliveryStatus = 'delivered' | 'failed' | 'pending' | 'unknown';

export interface CompanionVerifyResult {
  ok: boolean;
  /** Present when ok — keyed by the phone string passed in. */
  results?: Record<string, { status: DeliveryStatus; service: string | null; error: number }>;
  /** 'no_access' when Full Disk Access hasn't been granted. */
  error?: string;
}

export interface CompanionVerifyCapability {
  capable: boolean;
  /** The python binary the user must add to Full Disk Access. */
  pythonPath?: string;
}

export function useMacCompanion() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);

  const ping = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      const res = await fetch(`${BASE}/ping`, { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const checkVersion = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${BASE}/version`);
      const data = await res.json();
      setNeedsUpdate(data.version !== COMPANION_VERSION);
    } catch {
      setNeedsUpdate(false);
    }
  }, []);

  // Verify Messages is open and signed in to iMessage before a batch.
  // AppleScript reports success even when Messages is closed/signed out and
  // nothing actually sends, so this is the only honest pre-batch signal.
  const preflight = useCallback(async (): Promise<CompanionPreflightResult> => {
    try {
      const res = await fetch(`${BASE}/preflight`);
      // Companions older than 1.3.0 don't have this endpoint — don't block
      // sending; the version banner already prompts the reinstall.
      if (res.status === 404) return { ok: true };
      return await res.json();
    } catch {
      return { ok: false, error: 'Companion is not responding — is it still running?' };
    }
  }, []);

  const send = useCallback(async (
    phone: string,
    message: string,
    delayMs = 0,
  ): Promise<CompanionSendResult> => {
    try {
      const res = await fetch(`${BASE}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message, delay_ms: delayMs }),
      });
      return await res.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, []);

  // Read Apple's delivery receipts for a batch we just sent. Returns per-phone
  // delivered/failed/pending, or { ok: false, error: 'no_access' } when the
  // companion can't read chat.db (Full Disk Access missing).
  const verify = useCallback(async (
    phones: string[],
    sinceMs: number,
  ): Promise<CompanionVerifyResult> => {
    try {
      const res = await fetch(`${BASE}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones, since_ms: sinceMs }),
      });
      // Companions older than 1.4.0 don't have /verify — treat as unavailable
      // rather than an error so sending still works.
      if (res.status === 404) return { ok: false, error: 'unsupported' };
      return await res.json();
    } catch {
      return { ok: false, error: 'Companion is not responding.' };
    }
  }, []);

  // Whether delivery verification is available (Full Disk Access granted), plus
  // the python path the user must authorize if it isn't.
  const verifyCapable = useCallback(async (): Promise<CompanionVerifyCapability> => {
    try {
      const res = await fetch(`${BASE}/verify-capable`);
      if (res.status === 404) return { capable: false };
      const data = await res.json();
      return { capable: !!data.capable, pythonPath: data.python_path };
    } catch {
      return { capable: false };
    }
  }, []);

  const notify = useCallback(async (sent: number, failed: number): Promise<void> => {
    try {
      await fetch(`${BASE}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sent, failed }),
      });
    } catch {
      // Non-critical — ignore if companion is gone by the time batch finishes
    }
  }, []);

  const recheck = useCallback(async () => {
    setAvailable(null);
    setNeedsUpdate(false);
    const ok = await ping();
    setAvailable(ok);
    if (ok) await checkVersion();
  }, [ping, checkVersion]);

  // Silent ping + version check on mount
  useEffect(() => {
    ping().then(async ok => {
      setAvailable(ok);
      if (ok) await checkVersion();
    });
  }, [ping, checkVersion]);

  return { available, needsUpdate, preflight, send, verify, verifyCapable, notify, recheck };
}
