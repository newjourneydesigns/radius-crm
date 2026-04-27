'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase, type ScorecardDimension } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/AuthContext';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import ScorecardSection from '../../../../components/circle/ScorecardSection';
import AlertModal from '../../../../components/ui/AlertModal';

export default function CircleLeaderScorecardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const leaderId = params?.id ? parseInt(params.id as string) : 0;
  const { isAdmin } = useAuth();

  const VALID_DIMENSIONS: ScorecardDimension[] = ['reach', 'connect', 'disciple', 'develop'];
  const dimParam = searchParams?.get('dimension') as ScorecardDimension | null;
  const initialDimension = dimParam && VALID_DIMENSIONS.includes(dimParam) ? dimParam : null;

  const [leaderName, setLeaderName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({ isOpen: false, type: 'info', title: '', message: '' });

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

  const handleAddToCoaching = async (lid: number, category: ScorecardDimension, content: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data, error } = await supabase
      .from('acpd_coaching_notes')
      .insert([{ circle_leader_id: lid, user_id: authUser.id, dimension: category, content, is_resolved: false }])
      .select()
      .single();

    if (error) {
      console.error('Error adding coaching note:', error);
      setShowAlert({ isOpen: true, type: 'error', title: 'Error', message: 'Failed to add coaching note.' });
      return null;
    }

    setShowAlert({ isOpen: true, type: 'success', title: 'Added to Coaching', message: 'Note added to the Care section.' });
    return data;
  };

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
            {leaderName && <h1 className="text-2xl font-bold text-white">{leaderName}</h1>}
          </div>

          <ScorecardSection
            leaderId={leaderId}
            isAdmin={isAdmin()}
            initialDimension={initialDimension}
            onNoteSaved={() => {}}
            onAddToCoaching={handleAddToCoaching}
          />

        </div>
      </div>

      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />
    </ProtectedRoute>
  );
}
