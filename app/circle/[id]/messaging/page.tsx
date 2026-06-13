'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import LeaderMessaging from '../../../../components/circle/LeaderMessaging';

export default function CircleLeaderMessagingPage() {
  const params = useParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;

  const [leader, setLeader] = useState<{ name: string; circle_summary_access_enabled: boolean | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leaderId) return;
    (async () => {
      const { data } = await supabase
        .from('circle_leaders')
        .select('name, circle_summary_access_enabled')
        .eq('id', leaderId)
        .single();
      if (data) setLeader(data);
      setLoading(false);
    })();
  }, [leaderId]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-6">
          {/* Header */}
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
                <p className="text-sm text-slate-400 mt-0.5">Messaging</p>
              </>
            )}
          </div>

          {!loading && leader && (
            <LeaderMessaging
              leaderId={leaderId}
              leaderName={leader.name}
              accessEnabled={leader.circle_summary_access_enabled !== false}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
