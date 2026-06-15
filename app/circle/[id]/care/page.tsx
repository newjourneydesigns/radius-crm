'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/AuthContext';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import ACPDTrackingSection from '../../../../components/circle/ACPDTrackingSection';
import CoachingTimeline from '../../../../components/circle/CoachingTimeline';

export default function CircleLeaderCarePage() {
  const params = useParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;
  const { isAdmin } = useAuth();

  const [leaderName, setLeaderName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('circle_leaders')
      .select('name')
      .eq('id', leaderId)
      .single()
      .then(({ data }) => {
        if (data) setLeaderName(data.name);
        setIsLoading(false);
      });
  }, [leaderId]);

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-vc-500 rounded-full animate-spin" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#0f1117]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-6">

          {leaderName && (
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-white tracking-tight">{leaderName}</h1>
              <p className="text-sm text-slate-400 mt-0.5">Care & Development</p>
            </div>
          )}

          {isAdmin() ? (
            <div className="space-y-10">
              <ACPDTrackingSection
                leaderId={leaderId}
                leaderName={leaderName}
                onNoteSaved={async () => {}}
              />

              <section>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-white tracking-tight">Timeline</h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Every coaching touchpoint for this leader — nudges sent, notes, encouragements, and scorecard changes.
                  </p>
                </div>
                <CoachingTimeline leaderId={leaderId} />
              </section>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-400">
              You do not have access to this section.
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}
