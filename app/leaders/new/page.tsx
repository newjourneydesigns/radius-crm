'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../../components/ProtectedRoute';
import AddLeaderForm, { type AddLeaderReferenceData } from '../../../components/circle/AddLeaderForm';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

export default function AddLeaderPage() {
  const { isAdmin } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [referenceData, setReferenceData] = useState<AddLeaderReferenceData>({
    directors: [],
    campuses: [],
    circleTypes: [],
    frequencies: [],
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || null);
    });
  }, []);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const res = await fetch('/api/reference-data');
        if (!res.ok) return;
        const data = await res.json();
        setReferenceData({
          directors: data.directors || [],
          campuses: data.campuses || [],
          circleTypes: data.circleTypes || [],
          frequencies: data.frequencies || [],
        });
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    loadReferenceData();
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add a Leader</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create a circle leader or a team leader without importing them from CCB.
              </p>
            </div>
            <Link
              href="/search"
              className="shrink-0 inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              ← Back
            </Link>
          </div>

          {/* The create endpoint is admin-only, so say that up front rather than
              letting a viewer fill the whole form out and hit a 403. */}
          {isAdmin() ? (
            <AddLeaderForm accessToken={accessToken} referenceData={referenceData} />
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Adding leaders is limited to ACPDs and admins. Ask an admin to add this leader for you.
              </p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
