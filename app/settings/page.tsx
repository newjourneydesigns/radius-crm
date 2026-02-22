'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import NoteTemplatesManager from '../../components/settings/NoteTemplatesManager';
import ScorecardQuestionsManager from '../../components/settings/ScorecardQuestionsManager';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AlertModal from '../../components/ui/AlertModal';
import ServiceWorkerUtils from '../../components/ServiceWorkerUtils';
import ProtectedRoute from '../../components/ProtectedRoute';

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
  
  // New item state for each category
  const [newCircleType, setNewCircleType] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newFrequency, setNewFrequency] = useState('');
  const [newCampus, setNewCampus] = useState('');
  
  // Editing state for each category
  const [editingCircleType, setEditingCircleType] = useState<SettingsItem | null>(null);
  const [editingStatus, setEditingStatus] = useState<SettingsItem | null>(null);
  const [editingFrequency, setEditingFrequency] = useState<SettingsItem | null>(null);
  const [editingCampus, setEditingCampus] = useState<SettingsItem | null>(null);
  
  // Notification settings state
  const [digestSubscribed, setDigestSubscribed] = useState<boolean | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestUserId, setDigestUserId] = useState<string | null>(null);
  const [digestFrequencyHours, setDigestFrequencyHours] = useState<number>(24);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'directors' | 'circles' | 'statuses' | 'frequencies' | 'campuses' | 'templates' | 'scorecard' | 'app'>('directors');
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
    loadDigestSubscription();
  }, []);

  const loadDigestSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setDigestUserId(user.id);
      const { data } = await supabase
        .from('users')
        .select('daily_email_subscribed, daily_email_frequency_hours')
        .eq('id', user.id)
        .single();
      setDigestSubscribed(data?.daily_email_subscribed ?? false);
      setDigestFrequencyHours(data?.daily_email_frequency_hours ?? 24);
    } catch (err) {
      console.error('Error loading digest subscription:', err);
    }
  };

  const toggleDigestSubscription = async () => {
    if (!digestUserId || digestLoading) return;
    setDigestLoading(true);
    try {
      const newValue = !digestSubscribed;
      const { error } = await supabase
        .from('users')
        .update({ daily_email_subscribed: newValue })
        .eq('id', digestUserId);
      if (error) throw error;
      setDigestSubscribed(newValue);
      showAlertMessage('success', newValue ? 'Subscribed!' : 'Unsubscribed', newValue
        ? 'You will receive a daily digest email each morning.'
        : 'You have unsubscribed from the daily digest.');
    } catch (err: any) {
      showAlertMessage('error', 'Error', err.message || 'Failed to update subscription');
    } finally {
      setDigestLoading(false);
    }
  };

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

  // Settings item management functions
  const handleAddSettingItem = async (table: string, value: string, setNewValue: (value: string) => void, setItems: React.Dispatch<React.SetStateAction<SettingsItem[]>>) => {
    if (!value.trim()) return;

    try {
      const { data, error } = await supabase
        .from(table)
        .insert([{ value: value.trim() }])
        .select()
        .single();

      if (data && !error) {
        setItems(prev => [...prev, data]);
        setNewValue('');
        showAlertMessage('success', 'Success', `${table.replace('_', ' ')} added successfully`);
      } else {
        throw new Error(error?.message || `Failed to add ${table}`);
      }
    } catch (error) {
      console.error(`Error adding ${table}:`, error);
      showAlertMessage('error', 'Error', `Failed to add ${table.replace('_', ' ')}`);
    }
  };

  const handleEditSettingItem = async (table: string, item: SettingsItem, setEditingItem: (item: SettingsItem | null) => void, setItems: React.Dispatch<React.SetStateAction<SettingsItem[]>>) => {
    if (!item.value.trim()) return;

    try {
      const { data, error } = await supabase
        .from(table)
        .update({ value: item.value.trim() })
        .eq('id', item.id)
        .select()
        .single();

      if (data && !error) {
        setItems(prev => prev.map(i => i.id === item.id ? data : i));
        setEditingItem(null);
        showAlertMessage('success', 'Success', `${table.replace('_', ' ')} updated successfully`);
      } else {
        throw new Error(error?.message || `Failed to update ${table}`);
      }
    } catch (error) {
      console.error(`Error updating ${table}:`, error);
      showAlertMessage('error', 'Error', `Failed to update ${table.replace('_', ' ')}`);
    }
  };

  const handleDeleteSettingItem = async (table: string, id: number, setItems: React.Dispatch<React.SetStateAction<SettingsItem[]>>) => {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (!error) {
        setItems(prev => prev.filter(i => i.id !== id));
        showAlertMessage('success', 'Success', `${table.replace('_', ' ')} deleted successfully`);
      } else {
        throw new Error(error?.message || `Failed to delete ${table}`);
      }
    } catch (error) {
      console.error(`Error deleting ${table}:`, error);
      showAlertMessage('error', 'Error', `Failed to delete ${table.replace('_', ' ')}`);
    } finally {
      setShowDeleteConfirm({ isOpen: false, type: '', id: 0, name: '' });
    }
  };

  // Specific handlers for each setting type
  const handleAddCircleType = () => handleAddSettingItem('circle_types', newCircleType, setNewCircleType, setCircleTypes);
  const handleAddStatus = () => handleAddSettingItem('statuses', newStatus, setNewStatus, setStatuses);
  const handleAddFrequency = () => handleAddSettingItem('frequencies', newFrequency, setNewFrequency, setFrequencies);
  const handleAddCampus = () => handleAddSettingItem('campuses', newCampus, setNewCampus, setCampuses);

  const handleEditCircleType = (item: SettingsItem) => handleEditSettingItem('circle_types', item, setEditingCircleType, setCircleTypes);
  const handleEditStatus = (item: SettingsItem) => handleEditSettingItem('statuses', item, setEditingStatus, setStatuses);
  const handleEditFrequency = (item: SettingsItem) => handleEditSettingItem('frequencies', item, setEditingFrequency, setFrequencies);
  const handleEditCampus = (item: SettingsItem) => handleEditSettingItem('campuses', item, setEditingCampus, setCampuses);

  const handleDeleteItem = async () => {
    const { type, id } = showDeleteConfirm;
    
    switch(type) {
      case 'director':
        await handleDeleteDirector();
        break;
      case 'circle-type':
        await handleDeleteSettingItem('circle_types', id, setCircleTypes);
        break;
      case 'status':
        await handleDeleteSettingItem('statuses', id, setStatuses);
        break;
      case 'frequency':
        await handleDeleteSettingItem('frequencies', id, setFrequencies);
        break;
      case 'campus':
        await handleDeleteSettingItem('campuses', id, setCampuses);
        break;
      default:
        console.error('Unknown delete type:', type);
        setShowDeleteConfirm({ isOpen: false, type: '', id: 0, name: '' });
    }
  };

  const tabs = [
    { id: 'directors', label: 'Directors', icon: '👥' },
    { id: 'circles', label: 'Circle Types', icon: '🔵' },
    { id: 'statuses', label: 'Statuses', icon: '📊' },
    { id: 'frequencies', label: 'Frequencies', icon: '📅' },
    { id: 'campuses', label: 'Campuses', icon: '🏢' },
    { id: 'templates', label: 'Note Templates', icon: '📝' },
    { id: 'scorecard', label: 'Scorecard Questions', icon: '📋' },
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
    <ProtectedRoute>
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

          {/* Circle Types Tab */}
          {activeTab === 'circles' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Circle Types</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage circle types used throughout the application</p>
                </div>
              </div>

              {/* Add New Circle Type Form */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Add New Circle Type</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Circle Type Name *"
                    value={newCircleType}
                    onChange={(e) => setNewCircleType(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCircleType()}
                  />
                  <button
                    onClick={handleAddCircleType}
                    disabled={!newCircleType.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Type
                  </button>
                </div>
              </div>

              {/* Circle Types List */}
              {circleTypes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No circle types found.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Add your first circle type above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {circleTypes.map((type) => (
                    <div key={type.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                      {editingCircleType?.id === type.id ? (
                        <div className="flex-1 mr-4">
                          <input
                            type="text"
                            value={editingCircleType.value}
                            onChange={(e) => setEditingCircleType(prev => prev ? { ...prev, value: e.target.value } : null)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleEditCircleType(editingCircleType)}
                          />
                        </div>
                      ) : (
                        <div className="flex-1">
                          <span className="text-gray-900 dark:text-white font-medium">{type.value}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        {editingCircleType?.id === type.id ? (
                          <>
                            <button
                              onClick={() => handleEditCircleType(editingCircleType)}
                              className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCircleType(null)}
                              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingCircleType(type)}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => confirmDelete('circle-type', type.id, type.value)}
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
              )}
            </div>
          )}

          {/* Statuses Tab */}
          {activeTab === 'statuses' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Circle Leader Statuses</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage available statuses for circle leaders in the system</p>
                </div>
              </div>

              {/* Add New Status Form */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Add New Status</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Status Name *"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                  />
                  <button
                    onClick={handleAddStatus}
                    disabled={!newStatus.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Status
                  </button>
                </div>
              </div>

              {/* Statuses List */}
              {statuses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No statuses found.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Add your first status above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {statuses.map((status) => (
                    <div key={status.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                      {editingStatus?.id === status.id ? (
                        <div className="flex-1 mr-4">
                          <input
                            type="text"
                            value={editingStatus.value}
                            onChange={(e) => setEditingStatus(prev => prev ? { ...prev, value: e.target.value } : null)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleEditStatus(editingStatus)}
                          />
                        </div>
                      ) : (
                        <div className="flex-1">
                          <span className="text-gray-900 dark:text-white font-medium capitalize">{status.value}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        {editingStatus?.id === status.id ? (
                          <>
                            <button
                              onClick={() => handleEditStatus(editingStatus)}
                              className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingStatus(null)}
                              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingStatus(status)}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => confirmDelete('status', status.id, status.value)}
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
              )}
            </div>
          )}

          {/* Frequencies Tab */}
          {activeTab === 'frequencies' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Meeting Frequencies</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage available meeting frequency options</p>
                </div>
              </div>

              {/* Add New Frequency Form */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Add New Frequency</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Frequency Name *"
                    value={newFrequency}
                    onChange={(e) => setNewFrequency(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFrequency()}
                  />
                  <button
                    onClick={handleAddFrequency}
                    disabled={!newFrequency.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Frequency
                  </button>
                </div>
              </div>

              {/* Frequencies List */}
              {frequencies.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No frequencies found.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Add your first frequency above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {frequencies.map((frequency) => (
                    <div key={frequency.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                      {editingFrequency?.id === frequency.id ? (
                        <div className="flex-1 mr-4">
                          <input
                            type="text"
                            value={editingFrequency.value}
                            onChange={(e) => setEditingFrequency(prev => prev ? { ...prev, value: e.target.value } : null)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleEditFrequency(editingFrequency)}
                          />
                        </div>
                      ) : (
                        <div className="flex-1">
                          <span className="text-gray-900 dark:text-white font-medium">{frequency.value}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        {editingFrequency?.id === frequency.id ? (
                          <>
                            <button
                              onClick={() => handleEditFrequency(editingFrequency)}
                              className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingFrequency(null)}
                              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingFrequency(frequency)}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => confirmDelete('frequency', frequency.id, frequency.value)}
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
              )}
            </div>
          )}

          {/* Campuses Tab */}
          {activeTab === 'campuses' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Campus Locations</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Manage available campus locations for circle leaders</p>
                </div>
              </div>

              {/* Add New Campus Form */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Add New Campus</h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Campus Name *"
                    value={newCampus}
                    onChange={(e) => setNewCampus(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCampus()}
                  />
                  <button
                    onClick={handleAddCampus}
                    disabled={!newCampus.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Campus
                  </button>
                </div>
              </div>

              {/* Campuses List */}
              {campuses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No campuses found.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Add your first campus above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {campuses.map((campus) => (
                    <div key={campus.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                      {editingCampus?.id === campus.id ? (
                        <div className="flex-1 mr-4">
                          <input
                            type="text"
                            value={editingCampus.value}
                            onChange={(e) => setEditingCampus(prev => prev ? { ...prev, value: e.target.value } : null)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleEditCampus(editingCampus)}
                          />
                        </div>
                      ) : (
                        <div className="flex-1">
                          <span className="text-gray-900 dark:text-white font-medium">{campus.value}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        {editingCampus?.id === campus.id ? (
                          <>
                            <button
                              onClick={() => handleEditCampus(editingCampus)}
                              className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCampus(null)}
                              className="text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingCampus(campus)}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => confirmDelete('campus', campus.id, campus.value)}
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
              )}
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 dark:border-gray-600">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Note Templates</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Create and manage your personal note templates</p>
                </div>
              </div>

              <div className="p-6">
                <NoteTemplatesManager />
              </div>
            </div>
          )}

          {activeTab === 'scorecard' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 dark:border-gray-600">
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white">Scorecard Questions</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Customize the evaluation questions for each scorecard category (Reach, Connect, Disciple, Develop)</p>
                </div>
              </div>

              <div className="p-6">
                <ScorecardQuestionsManager />
              </div>
            </div>
          )}

          {activeTab === 'app' && (
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">App Management</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Manage app cache, service worker, troubleshoot PWA issues, and perform bulk actions.
              </p>

              {/* Bulk Actions Section */}
              <div className="mb-8 flex flex-col sm:flex-row gap-4">
                <a
                  href="/import"
                  className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  Import CSV
                </a>
                <a
                  href="/add-leader"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add A Circle
                </a>
              </div>

              <ServiceWorkerUtils />

              {/* Daily Digest Notifications */}
              <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">📧 Daily Digest Email</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Receive a personalized morning email with your upcoming tasks, circle visits,
                  encouragements, and follow-ups due today — including anything overdue.
                </p>

                <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {digestSubscribed ? '✅ Subscribed to daily digest' : '🔕 Not subscribed'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {digestSubscribed
                        ? "You'll get an email each morning with your to-dos, visits, encouragements, and follow-ups."
                        : 'Turn on to get a daily summary of everything on your plate.'}
                    </p>
                  </div>
                  <button
                    onClick={toggleDigestSubscription}
                    disabled={digestLoading || digestSubscribed === null}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
                      digestSubscribed ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    role="switch"
                    aria-checked={digestSubscribed ?? false}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        digestSubscribed ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {digestSubscribed && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Digests are sent every {digestFrequencyHours} hour{digestFrequencyHours !== 1 ? 's' : ''} starting at 12:00 AM CST.
                    </p>
                    <a
                      href="/profile"
                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Customize frequency &amp; content in Email Settings
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm.isOpen}
        onClose={() => setShowDeleteConfirm({ isOpen: false, type: '', id: 0, name: '' })}
        onConfirm={handleDeleteItem}
        title={`Delete ${showDeleteConfirm.type.replace('-', ' ')}`}
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
    </ProtectedRoute>
  );
}
