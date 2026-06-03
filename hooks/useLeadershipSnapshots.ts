import { useState, useCallback } from 'react';
import { supabase, LeadershipSnapshot, LeadershipSnapshotRevision } from '../lib/supabase';

export interface SnapshotSubmission {
  respondent_name: string;
  respondent_email: string;
  respondent_phone?: string;
  role: string;
  campus: string;
  circle_type: string;
  group_size: string;
  answers: Record<string, number>;
  reflections: Record<string, string>;
}

export interface SnapshotTrendPoint {
  date: string;            // YYYY-MM-DD
  overall: number;
  categories: Record<string, number>; // catId -> score
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const useLeadershipSnapshots = () => {
  const [snapshots, setSnapshots] = useState<LeadershipSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadForLeader = useCallback(async (leaderId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leadership-snapshot?leader_id=${leaderId}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load snapshots');
        return [];
      }
      const list = (json.snapshots || []) as LeadershipSnapshot[];
      setSnapshots(list);
      return list;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAll = useCallback(async (unlinkedOnly = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leadership-snapshot${unlinkedOnly ? '?unlinked=true' : ''}`, {
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load snapshots');
        return [];
      }
      const list = (json.snapshots || []) as LeadershipSnapshot[];
      setSnapshots(list);
      return list;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOne = useCallback(
    async (id: string): Promise<{ snapshot: LeadershipSnapshot; revisions: LeadershipSnapshotRevision[] } | null> => {
      try {
        const res = await fetch(`/api/leadership-snapshot?id=${id}`, { headers: await authHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load snapshot');
          return null;
        }
        return { snapshot: json.snapshot, revisions: json.revisions || [] };
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    },
    []
  );

  const submit = useCallback(async (payload: SnapshotSubmission): Promise<LeadershipSnapshot | null> => {
    setError(null);
    try {
      const res = await fetch('/api/leadership-snapshot', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Submission failed');
        return null;
      }
      return json.snapshot as LeadershipSnapshot;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const update = useCallback(async (id: string, changes: Record<string, any>): Promise<LeadershipSnapshot | null> => {
    setError(null);
    try {
      const res = await fetch('/api/leadership-snapshot', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ id, ...changes }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Update failed');
        return null;
      }
      return json.snapshot as LeadershipSnapshot;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const confirmLink = useCallback(
    async (id: string, circleLeaderId: number | null): Promise<LeadershipSnapshot | null> => {
      return update(id, { action: 'confirm_link', circle_leader_id: circleLeaderId, leader_link_confirmed: true });
    },
    [update]
  );

  const revert = useCallback(async (id: string, version: number): Promise<LeadershipSnapshot | null> => {
    setError(null);
    try {
      const res = await fetch('/api/leadership-snapshot/revert', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ id, version }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Revert failed');
        return null;
      }
      return json.snapshot as LeadershipSnapshot;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  // Build a chronological trend from the loaded snapshots (oldest -> newest).
  const getTrend = useCallback((): SnapshotTrendPoint[] => {
    return [...snapshots]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((s) => ({
        date: s.created_at.slice(0, 10),
        overall: s.overall_score,
        categories: Object.fromEntries((s.category_scores || []).map((c) => [c.id, c.score])),
      }));
  }, [snapshots]);

  return {
    snapshots,
    isLoading,
    error,
    loadForLeader,
    loadAll,
    loadOne,
    submit,
    update,
    confirmLink,
    revert,
    getTrend,
  };
};
