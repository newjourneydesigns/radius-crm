'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface Campaign {
  id: string;
  name: string;
  ccb_group_ids: string[];
  ccb_form_id: string;
  form_link: string;
  due_date: string;
  message_template: string;
  archived_at: string | null;
  last_reconciled_at: string | null;
  expected_count: number | null;
  submitted_count: number | null;
  missing_count: number | null;
  not_in_group_count: number | null;
  needs_review_count: number | null;
  contacted_count: number | null;
  completion_pct: number | null;
  created_at: string;
  created_by: string | null;
}

export interface CampaignPerson {
  id: string;
  campaign_id: string;
  ccb_individual_id: string | null;
  first_name: string;
  last_name: string;
  form_first_name: string | null;
  form_last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  in_group: boolean;
  in_form: boolean;
  manually_added: boolean;
  form_response_data: Record<string, unknown> | null;
  reconcile_status: string;
  match_method: string | null;
  match_resolution: 'confirmed' | 'rejected' | null;
  source_group_id: string | null;
  source_group_name: string | null;
  // Free-form columns from a pasted roster (Campus, Team, Age, …) — group-able in the campaign view.
  // A value is an array when one person was listed more than once with different values (e.g. multiple teams).
  attributes: Record<string, string | string[]> | null;
  note: string | null;
  contact_note: string | null;
  contacted_at: string | null;
  contacted_by: string | null;
  created_at: string;
  updated_at: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async (includeArchived = false) => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const url = includeArchived ? '/api/campaigns?archived=true' : '/api/campaigns';
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load campaigns');
      const json = await res.json();
      setCampaigns(json.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async (payload: {
    name: string;
    ccb_group_ids: string[];
    ccb_form_id: string;
    due_date: string;
    message_template: string;
    // Optional pasted roster — an alternative to CCB groups for the invite list
    people?: { ccbId: string; firstName: string; lastName: string; phone: string; email: string; attributes: Record<string, string | string[]> }[];
  }): Promise<Campaign | null> => {
    const headers = await authHeader();
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to create campaign');
    }
    const json = await res.json();
    return json.campaign ?? null;
  }, []);

  const archiveCampaign = useCallback(async (id: string) => {
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to archive');
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }, []);

  const restoreCampaign = useCallback(async (id: string) => {
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to restore');
    await fetchCampaigns(true);
  }, [fetchCampaigns]);

  const updateCampaign = useCallback(async (
    id: string,
    payload: Partial<Pick<Campaign, 'name' | 'ccb_group_ids' | 'ccb_form_id' | 'form_link' | 'due_date' | 'message_template'>>,
  ): Promise<Campaign> => {
    const headers = await authHeader();
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update campaign');
    const json = await res.json();
    const updated: Campaign = json.campaign;
    setCampaigns(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  }, []);

  return { campaigns, loading, error, fetchCampaigns, createCampaign, updateCampaign, archiveCampaign, restoreCampaign };
}
