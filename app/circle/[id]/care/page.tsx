'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/AuthContext';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import ACPDTrackingSection from '../../../../components/circle/ACPDTrackingSection';

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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600/20 border-t-blue-600" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

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
            {leaderName && <h1 className="text-2xl font-bold text-white">{leaderName}</h1>}
          </div>

          {isAdmin() ? (
            <ACPDTrackingSection
              leaderId={leaderId}
              leaderName={leaderName}
              onNoteSaved={async () => {}}
            />
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
