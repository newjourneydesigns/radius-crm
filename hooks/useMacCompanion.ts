'use client';

import { useState, useCallback, useEffect } from 'react';

const BASE = 'http://localhost:5123';
const PING_TIMEOUT_MS = 2000;

// Bump this whenever server.py changes — RADIUS will prompt users to reinstall.
export const COMPANION_VERSION = '1.2.1';

export interface CompanionSendResult {
  success: boolean;
  error?: string;
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

  return { available, needsUpdate, send, notify, recheck };
}
