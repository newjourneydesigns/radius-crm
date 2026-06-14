'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, type CoachingConfigOverride } from '../../../../lib/supabase';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import { useAuth } from '../../../../contexts/AuthContext';
import CoachingAutomationEditor from '../../../../components/circle/CoachingAutomationEditor';

export default function CircleLeaderCoachingPage() {
  const params = useParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;
  const { isAdmin } = useAuth();

  const [leader, setLeader] = useState<{ name: string; coaching_automation_overrides: CoachingConfigOverride | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leaderId || !isAdmin()) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('circle_leaders')
        .select('name, coaching_automation_overrides')
        .eq('id', leaderId)
        .single();
      if (data) setLeader(data as any);
      setLoading(false);
    })();
  }, [leaderId, isAdmin]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-6">
          <div className="mb-6">
            <a
              href={`/circle/${leaderId}`}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm mb-3 w-fit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </a>
            {leader && (
              <>
                <h1 className="text-2xl font-bold text-white">{leader.name}</h1>
                <p className="text-sm text-slate-400 mt-0.5">Coaching Automations</p>
              </>
            )}
          </div>

          {!isAdmin() ? (
            <p className="text-slate-400 text-sm">This page is available to ACPD admins only.</p>
          ) : loading ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : leader ? (
            <CoachingAutomationEditor
              leaderId={leaderId}
              initialOverride={leader.coaching_automation_overrides}
            />
          ) : (
            <p className="text-slate-400 text-sm">Circle Leader not found.</p>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
