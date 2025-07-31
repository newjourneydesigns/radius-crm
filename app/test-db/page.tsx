'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function TestPage() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const testDatabase = async () => {
      console.log('🧪 Starting database tests...');
      const testResults: any = {};

      try {
        // Test 1: Basic connection
        console.log('Test 1: Basic connection test');
        const { data: basicTest, error: basicError } = await supabase
          .from('acpd_list')
          .select('count', { count: 'exact' });
        
        testResults.basicConnection = {
          success: !basicError,
          data: basicTest,
          error: basicError,
        };
        console.log('Basic connection result:', testResults.basicConnection);

        // Test 2: Select all from acpd_list
        console.log('Test 2: Select all from acpd_list');
        const { data: allData, error: allError } = await supabase
          .from('acpd_list')
          .select('*');
        
        testResults.selectAll = {
          success: !allError,
          data: allData,
          error: allError,
        };
        console.log('Select all result:', testResults.selectAll);

        // Test 3: Check authentication status
        console.log('Test 3: Check auth status');
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        testResults.auth = {
          user,
          error: authError,
        };
        console.log('Auth result:', testResults.auth);

        // Test 4: Try other tables
        const tables = ['circle_types', 'statuses', 'frequencies', 'campuses'];
        testResults.otherTables = {};
        
        for (const table of tables) {
          try {
            console.log(`Test 4.${table}: Testing ${table} table`);
            const { data, error } = await supabase
              .from(table)
              .select('*')
              .limit(5);
            
            testResults.otherTables[table] = {
              success: !error,
              data,
              error,
            };
            console.log(`${table} result:`, testResults.otherTables[table]);
          } catch (e) {
            testResults.otherTables[table] = {
              success: false,
              error: e,
            };
          }
        }

      } catch (error) {
        console.error('❌ Test suite error:', error);
        testResults.error = error;
      }

      setResults(testResults);
      setLoading(false);
    };

    testDatabase();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Testing database connection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Database Connection Test</h1>
        
        <div className="space-y-6">
          {/* Basic Connection Test */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-xl font-semibold mb-4">Basic Connection Test</h2>
            <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(results.basicConnection, null, 2)}
            </pre>
          </div>

          {/* Select All Test */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-xl font-semibold mb-4">ACPD List Data</h2>
            <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(results.selectAll, null, 2)}
            </pre>
          </div>

          {/* Auth Test */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
            <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(results.auth, null, 2)}
            </pre>
          </div>

          {/* Other Tables Test */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-xl font-semibold mb-4">Other Tables</h2>
            <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(results.otherTables, null, 2)}
            </pre>
          </div>
        </div>

        <div className="mt-8">
          <a 
            href="/settings" 
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Back to Settings
          </a>
        </div>
      </div>
    </div>
  );
}
