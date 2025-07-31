'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AlertModal from '../../components/ui/AlertModal';
import ServiceWorkerUtils from '../../components/ServiceWorkerUtils';

interface Director {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

interface SettingsItem {
  id: number;
  value: string;
}

export default function SettingsPage() {
  // Directors state
  const [directors, setDirectors] = useState<Director[]>([]);
  const [newDirector, setNewDirector] = useState<{ name: string; description: string; status: 'active' | 'inactive' }>({ name: '', description: '', status: 'active' });
  const [editingDirector, setEditingDirector] = useState<Director | null>(null);
  
  // Settings items state
  const [circleTypes, setCircleTypes] = useState<SettingsItem[]>([]);
  const [statuses, setStatuses] = useState<SettingsItem[]>([]);
  const [frequencies, setFrequencies] = useState<SettingsItem[]>([]);
  const [campuses, setCampuses] = useState<SettingsItem[]>([]);
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'directors' | 'circles' | 'statuses' | 'frequencies' | 'campuses' | 'app'>('directors');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{isOpen: boolean, type: string, id: number, name: string}>({
    isOpen: false, type: '', id: 0, name: ''
  });
  const [showAlert, setShowAlert] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      // Test basic connectivity first
      console.log('🔍 Testing basic Supabase connectivity...');
      
      // Try to list all tables we might have access to
      const tableTests = [
        { name: 'acpd_list', query: () => supabase.from('acpd_list').select('*').limit(1) },
        { name: 'circle_leaders', query: () => supabase.from('circle_leaders').select('*').limit(1) },
        { name: 'circle_types', query: () => supabase.from('circle_types').select('*').limit(1) },
        { name: 'statuses', query: () => supabase.from('statuses').select('*').limit(1) },
        { name: 'frequencies', query: () => supabase.from('frequencies').select('*').limit(1) },
        { name: 'campuses', query: () => supabase.from('campuses').select('*').limit(1) }
      ];
      
      console.log('📋 Testing table access...');
      for (const test of tableTests) {
        try {
          const { data, error } = await test.query();
          console.log(`Table "${test.name}":`, error ? `❌ ${error.message}` : `✅ exists, sample:`, data);
        } catch (e) {
          console.log(`Table "${test.name}": ❌ ${e}`);
        }
      }
      
      await Promise.all([
        loadDirectors(),
        loadCircleTypes(),
        loadStatuses(),
        loadFrequencies(),
        loadCampuses()
      ]);
    } catch (error) {
      console.error('Error loading settings data:', error);
      showAlertMessage('error', 'Load Error', 'Failed to load settings data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDirectors = async () => {
    try {
      console.log('🔍 Loading directors from acpd_list table...');
      
      // First, let's test basic connectivity
      const { data: testData, error: testError } = await supabase
        .from('acpd_list')
        .select('count', { count: 'exact' });
      
      console.log('📊 Table count test:', { testData, testError });
      
      const { data, error } = await supabase
        .from('acpd_list')
        .select('*')
        .order('name');
      
      console.log('📊 Directors query result:', { 
        data, 
        error, 
        dataLength: data?.length,
        errorCode: error?.code,
        errorMessage: error?.message,
        errorDetails: error?.details 
      });
      
      if (data && !error && data.length > 0) {
        console.log('✅ Successfully loaded directors from database:', data);
        // Convert the boolean 'active' field to string 'status' for our UI
        const formattedData = data.map(director => ({
          ...director,
          status: director.active ? 'active' : 'inactive'
        }));
        console.log('✅ Formatted data:', formattedData);
        setDirectors(formattedData);
      } else if (data && data.length === 0) {
        console.log('⚠️ Table exists but is empty');
        setDirectors([]);
      } else {
        console.warn('⚠️ Could not load directors from database:', error);
        // Fallback to mock data to show the UI is working
        setDirectors([
          { id: 1, name: 'Jane Doe (Mock)', description: 'Mock director', status: 'active' },
          { id: 2, name: 'John Smith (Mock)', description: 'Mock director', status: 'active' },
          { id: 3, name: 'Trip Ochenski (Mock)', description: 'Mock director', status: 'active' },
          { id: 4, name: 'Sarah Johnson (Mock)', description: 'Mock director', status: 'inactive' },
        ]);
      }
    } catch (error) {
      console.error('❌ Error in loadDirectors:', error);
      // Fallback to mock data
      setDirectors([
        { id: 1, name: 'Jane Doe (Error)', description: 'Mock director', status: 'active' },
        { id: 2, name: 'John Smith (Error)', description: 'Mock director', status: 'active' },
        { id: 3, name: 'Trip Ochenski (Error)', description: 'Mock director', status: 'active' },
        { id: 4, name: 'Sarah Johnson (Error)', description: 'Mock director', status: 'inactive' },
      ]);
    }
  };

  const loadCircleTypes = async () => {
    try {
      console.log('🔍 Loading circle types from circle_types table...');
      const { data, error } = await supabase
        .from('circle_types')
        .select('*')
        .order('value');
      
      console.log('📊 Circle types query result:', { data, error });
      
      if (data && !error) {
        console.log('✅ Successfully loaded circle types from database:', data);
        setCircleTypes(data);
      } else {
        console.warn('⚠️ Could not load circle types from database:', error);
        // Fallback to empty array if table doesn't exist
        setCircleTypes([]);
      }
    } catch (error) {
      console.error('❌ Error in loadCircleTypes:', error);
      setCircleTypes([]);
    }
  };

  const loadStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .order('value');
      
      if (data && !error) {
        setStatuses(data);
      } else {
        console.error('Error loading statuses:', error);
        // Fallback to empty array if table doesn't exist
        setStatuses([]);
      }
    } catch (error) {
      console.error('Error loading statuses:', error);
      setStatuses([]);
    }
  };

  const loadFrequencies = async () => {
    try {
      const { data, error } = await supabase
        .from('frequencies')
        .select('*')
        .order('value');
      
      if (data && !error) {
        setFrequencies(data);
      } else {
        console.error('Error loading frequencies:', error);
        // Fallback to empty array if table doesn't exist
        setFrequencies([]);
      }
    } catch (error) {
      console.error('Error loading frequencies:', error);
      setFrequencies([]);
    }
  };

  const loadCampuses = async () => {
    try {
      const { data, error } = await supabase
        .from('campuses')
        .select('*')
        .order('value');
      
      if (data && !error) {
        setCampuses(data);
      } else {
        console.error('Error loading campuses:', error);
        // Fallback to empty array if table doesn't exist
        setCampuses([]);
      }
    } catch (error) {
      console.error('Error loading campuses:', error);
      setCampuses([]);
    }
  };

  const showAlertMessage = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setShowAlert({ isOpen: true, type, title, message });
  };

  // Director management functions
  const handleAddDirector = async () => {
    if (!newDirector.name.trim()) return;

    try {
      const { data, error } = await supabase
        .from('acpd_list')
        .insert([{
          name: newDirector.name,
          description: newDirector.description || null,
          active: newDirector.status === 'active'
        }])
        .select()
        .single();

      if (data && !error) {
        setDirectors(prev => [...prev, { ...data, status: data.active ? 'active' : 'inactive' }]);
        setNewDirector({ name: '', description: '', status: 'active' });
        showAlertMessage('success', 'Success', 'Director added successfully');
      } else {
        throw new Error(error?.message || 'Failed to add director');
      }
    } catch (error) {
      console.error('Error adding director:', error);
      showAlertMessage('error', 'Error', 'Failed to add director');
    }
  };

  const handleEditDirector = async (director: Director) => {
    if (!director.name.trim()) return;

    try {
      const { data, error } = await supabase
        .from('acpd_list')
        .update({
          name: director.name,
          description: director.description || null,
          active: director.status === 'active'
        })
        .eq('id', director.id)
        .select()
        .single();

      if (data && !error) {
        setDirectors(prev => prev.map(d => d.id === director.id ? { ...data, status: data.active ? 'active' : 'inactive' } : d));
        setEditingDirector(null);
        showAlertMessage('success', 'Success', 'Director updated successfully');
      } else {
        throw new Error(error?.message || 'Failed to update director');
      }
    } catch (error) {
      console.error('Error updating director:', error);
      showAlertMessage('error', 'Error', 'Failed to update director');
    }
  };

  const handleDeleteDirector = async () => {
    try {
      const { error } = await supabase
        .from('acpd_list')
        .delete()
        .eq('id', showDeleteConfirm.id);

      if (!error) {
        setDirectors(prev => prev.filter(d => d.id !== showDeleteConfirm.id));
        showAlertMessage('success', 'Success', 'Director deleted successfully');
      } else {
        throw new Error(error?.message || 'Failed to delete director');
      }
    } catch (error) {
      console.error('Error deleting director:', error);
      showAlertMessage('error', 'Error', 'Failed to delete director');
    } finally {
      setShowDeleteConfirm({ isOpen: false, type: '', id: 0, name: '' });
    }
  };

  const confirmDelete = (type: string, id: number, name: string) => {
    setShowDeleteConfirm({ isOpen: true, type, id, name });
  };

  const tabs = [
    { id: 'directors', label: 'Directors', icon: '👥' },
    { id: 'circles', label: 'Circle Types', icon: '🔵' },
    { id: 'statuses', label: 'Statuses', icon: '📊' },
    { id: 'frequencies', label: 'Frequencies', icon: '📅' },
    { id: 'campuses', label: 'Campuses', icon: '🏢' },
    { id: 'app', label: 'App Management', icon: '⚙️' }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Organization Settings</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage directors, circle types, statuses, and other organizational data
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          {/* Directors Tab */}
          {activeTab === 'directors' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Directors (ACD/Ps)</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage Directors</p>
                </div>
              </div>

              {/* Add New Director Form */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Add New Director</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Full Name *"
                    value={newDirector.name}
                    onChange={(e) => setNewDirector(prev => ({ ...prev, name: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newDirector.description}
                    onChange={(e) => setNewDirector(prev => ({ ...prev, description: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={newDirector.status}
                    onChange={(e) => setNewDirector(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button
                    onClick={handleAddDirector}
                    disabled={!newDirector.name.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Director
                  </button>
                </div>
              </div>

              {/* Directors List */}
              <div className="space-y-3">
                {directors.map((director) => (
                  <div key={director.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                    {editingDirector?.id === director.id ? (
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 mr-4">
                        <input
                          type="text"
                          value={editingDirector.name}
                          onChange={(e) => setEditingDirector(prev => prev ? { ...prev, name: e.target.value } : null)}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={editingDirector.description || ''}
                          onChange={(e) => setEditingDirector(prev => prev ? { ...prev, description: e.target.value } : null)}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={editingDirector.status}
                          onChange={(e) => setEditingDirector(prev => prev ? { ...prev, status: e.target.value as 'active' | 'inactive' } : null)}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">{director.name}</h4>
                            {director.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">{director.description}</p>
                            )}
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            director.status === 'active' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}>
                            {director.status}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-2">
                      {editingDirector?.id === director.id ? (
                        <>
                          <button
                            onClick={() => handleEditDirector(editingDirector)}
                            className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingDirector(null)}
                            className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingDirector(director)}
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDelete('director', director.id, director.name)}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other tabs show simple lists for now */}
          {activeTab === 'circles' && (
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Circle Types</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Manage circle types used throughout the application.</p>
              
              {circleTypes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No circle types found in database.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    Expected table: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">circle_types</code> with columns: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">id, value</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {circleTypes.map((type) => (
                    <div key={type.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <span className="text-gray-900 dark:text-white">{type.value}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Database</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'statuses' && (
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Circle Leader Statuses</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Manage available statuses for circle leaders in the system.</p>
              
              {statuses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No statuses found in database.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    Expected table: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">statuses</code> with columns: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">id, value</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {statuses.map((status) => (
                    <div key={status.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <span className="text-gray-900 dark:text-white capitalize">{status.value}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Database</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'frequencies' && (
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Meeting Frequencies</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Manage available meeting frequency options.</p>
              
              {frequencies.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No frequencies found in database.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    Expected table: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">frequencies</code> with columns: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">id, value</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {frequencies.map((frequency) => (
                    <div key={frequency.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <span className="text-gray-900 dark:text-white">{frequency.value}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Database</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'campuses' && (
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Campus Locations</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Manage available campus locations for circle leaders.</p>
              
              {campuses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No campuses found in database.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    Expected table: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">campuses</code> with columns: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">id, value</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {campuses.map((campus) => (
                    <div key={campus.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <span className="text-gray-900 dark:text-white">{campus.value}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Database</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'app' && (
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">App Management</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Manage app cache, service worker, and troubleshoot PWA issues.
              </p>
              
              <ServiceWorkerUtils />
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm.isOpen}
        onClose={() => setShowDeleteConfirm({ isOpen: false, type: '', id: 0, name: '' })}
        onConfirm={handleDeleteDirector}
        title={`Delete ${showDeleteConfirm.type}`}
        message={`Are you sure you want to delete "${showDeleteConfirm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert.isOpen}
        onClose={() => setShowAlert({ ...showAlert, isOpen: false })}
        type={showAlert.type}
        title={showAlert.title}
        message={showAlert.message}
      />
    </div>
  );
}
