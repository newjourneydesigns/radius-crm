'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import ProtectedRoute from '../../components/ProtectedRoute';
import AlertModal from '../../components/ui/AlertModal';
import Link from 'next/link';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface EmailPreferences {
  email_enabled: boolean;
  email_address: string | null;
  include_follow_ups: boolean;
  include_overdue_tasks: boolean;
  include_planned_encouragements: boolean;
  include_upcoming_meetings: boolean;
  include_birthdays: boolean;
  include_board_cards_owned: boolean;
  include_board_cards_assigned: boolean;
  include_checklist_items: boolean;
  preferred_time: string;
  timezone: string;
  frequency_hours: number;
  weather_city: string;
  weather_state: string;
  weather_zip: string;
  include_weather: boolean;
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<EmailPreferences>({
    email_enabled: true,
    email_address: null,
    include_follow_ups: true,
    include_overdue_tasks: true,
    include_planned_encouragements: true,
    include_upcoming_meetings: false,
    include_birthdays: true,
    include_board_cards_owned: true,
    include_board_cards_assigned: true,
    include_checklist_items: true,
    preferred_time: '08:00',
    timezone: 'America/Chicago',
    frequency_hours: 24,
    weather_city: '',
    weather_state: '',
    weather_zip: '',
    include_weather: true,
  });
  const [hasPreferences, setHasPreferences] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  // UI state
  const [activeTab, setActiveTab] = useState<'profile' | 'email'>('profile');
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
    loadProfileData();
  }, [user]);

  const loadProfileData = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load profile');
      }

      const data = await response.json();
      setProfile(data.profile);
      setPreferences(data.preferences);
      setHasPreferences(data.hasPreferences);
      setName(data.profile.name || '');
      setEmail(data.profile.email || '');
      setAiAssistantEnabled(data.profile.ai_assistant_enabled ?? false);
      
    } catch (error: any) {
      console.error('Error loading profile:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Loading Profile',
        message: error.message || 'Failed to load profile data'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    try {
      setIsSaving(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile: { name, email }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully.'
      });
      
      // Reload profile
      await loadProfileData();
      
    } catch (error: any) {
      console.error('Error saving profile:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Saving Profile',
        message: error.message || 'Failed to save profile'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmailPreferences = async () => {
    if (!user) return;
    
    try {
      setIsSaving(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          preferences
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update email preferences');
      }

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Email Preferences Updated',
        message: 'Your email preferences have been updated successfully.'
      });
      
      // Reload profile
      await loadProfileData();
      
    } catch (error: any) {
      console.error('Error saving email preferences:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Saving Preferences',
        message: error.message || 'Failed to save email preferences'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!user) return;
    
    try {
      setIsSendingTest(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/profile/test-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send test email');
      }

      const result = await response.json();

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Test Email Sent',
        message: `A test daily summary email has been sent to ${result.recipient}. Check your inbox!`
      });
      
    } catch (error: any) {
      console.error('Error sending test email:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Sending Test Email',
        message: error.message || 'Failed to send test email'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading profile...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Helper: Toggle switch component
  const ToggleSwitch = ({ checked, onChange, disabled = false, id }: { checked: boolean; onChange: (val: boolean) => void; disabled?: boolean; id?: string }) => (
    <button
      type="button"
      id={id}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );

  // Get user initials for avatar
  const getInitials = () => {
    const n = name || profile?.name || '';
    if (!n) return '?';
    return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setShowAlert({ isOpen: true, type: 'error', title: 'Too Short', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setShowAlert({ isOpen: true, type: 'error', title: 'Mismatch', message: 'Passwords do not match.' });
      return;
    }
    setIsSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSavingPassword(false);
    if (error) {
      setShowAlert({ isOpen: true, type: 'error', title: 'Error', message: error.message });
    } else {
      setNewPassword('');
      setConfirmPassword('');
      setShowAlert({ isOpen: true, type: 'success', title: 'Password Updated', message: 'Your password has been changed.' });
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-6">
            <Link 
              href="/boards"
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Boards
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          </div>

          {/* Pill Tab Navigation */}
          <div className="mb-6">
            <div className="inline-flex bg-gray-200 dark:bg-gray-800 rounded-lg p-1 gap-1">
              {[
                { id: 'profile' as const, label: 'Profile', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )},
                { id: 'email' as const, label: 'Email Digest', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )},
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  style={{ outline: 'none' }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Avatar & Name Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 h-24" />
                <div className="px-6 pb-6 -mt-10">
                  <div className="flex items-end gap-4 mb-6">
                    <div className="w-20 h-20 rounded-full bg-white dark:bg-gray-700 border-4 border-white dark:border-gray-800 shadow-md flex items-center justify-center text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {getInitials()}
                    </div>
                    <div className="pb-1">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{name || 'Your Name'}</h2>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {profile?.role || 'User'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Enter your full name"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Enter your email address"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Role
                      </label>
                      <input
                        type="text"
                        id="role"
                        value={profile?.role || 'User'}
                        disabled
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      />
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                        Contact an administrator to change your role
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Radius AI Assistant Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${aiAssistantEnabled ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-gray-100 dark:bg-gray-700'} transition-colors`}>
                      <svg className={`w-5 h-5 ${aiAssistantEnabled ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.341 4.024A2.25 2.25 0 0115.54 20.5H8.46a2.25 2.25 0 01-2.119-1.476L5 14.5m14 0H5" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Radius AI Assistant</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Enable the AI assistant to help you manage todos, notes, and more
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={aiAssistantEnabled}
                    onChange={async (val) => {
                      setAiAssistantEnabled(val);
                      setIsSavingAi(true);
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const token = session?.access_token;
                        if (!token) throw new Error('No token');
                        const response = await fetch('/api/profile', {
                          method: 'PUT',
                          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ preferences: { ai_assistant_enabled: val } })
                        });
                        if (!response.ok) throw new Error('Failed to save');
                        await refreshUser();
                        setShowAlert({ isOpen: true, type: 'success', title: val ? 'AI Assistant Enabled' : 'AI Assistant Disabled', message: val ? 'The Radius AI assistant is now active. Look for the Radius icon in the bottom-right corner.' : 'The AI assistant has been turned off.' });
                      } catch {
                        setAiAssistantEnabled(!val); // Revert on error
                        setShowAlert({ isOpen: true, type: 'error', title: 'Error', message: 'Failed to update AI assistant setting.' });
                      } finally {
                        setIsSavingAi(false);
                      }
                    }}
                    disabled={isSavingAi}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Email Settings Tab */}
          {activeTab === 'email' && (
            <div className="space-y-6">

              {/* Master Toggle Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${preferences.email_enabled ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'} transition-colors`}>
                      <svg className={`w-5 h-5 ${preferences.email_enabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Daily Summary Emails</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Receive a daily digest of your circle leaders and tasks
                      </p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={preferences.email_enabled}
                    onChange={(val) => setPreferences(prev => ({ ...prev, email_enabled: val }))}
                  />
                </div>
              </div>

              {/* Delivery Settings Card */}
              <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity duration-200 ${!preferences.email_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-[1.125rem] h-[1.125rem] flex-shrink-0 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery</h3>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  {/* Frequency */}
                  <div>
                    <label htmlFor="frequency_hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Frequency
                    </label>
                    <div className="flex items-center gap-3">
                      <select
                        id="frequency_hours"
                        value={preferences.frequency_hours}
                        onChange={(e) => setPreferences(prev => ({ ...prev, frequency_hours: parseInt(e.target.value) }))}
                        disabled={!preferences.email_enabled}
                        className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <option value={24}>Every 24 hours</option>
                        <option value={12}>Every 12 hours</option>
                        <option value={8}>Every 8 hours</option>
                        <option value={6}>Every 6 hours</option>
                        <option value={4}>Every 4 hours</option>
                      </select>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      {preferences.frequency_hours === 24 && 'One email per day at 4:00 AM CST'}
                      {preferences.frequency_hours === 12 && 'Emails at 4:00 AM and 4:00 PM CST'}
                      {preferences.frequency_hours === 8 && 'Emails at 4:00 AM, 12:00 PM, and 8:00 PM CST'}
                      {preferences.frequency_hours === 6 && 'Emails at 4:00 AM, 10:00 AM, 4:00 PM, and 10:00 PM CST'}
                      {preferences.frequency_hours === 4 && 'Emails at 4:00 AM, 8:00 AM, 12:00 PM, 4:00 PM, 8:00 PM, and 12:00 AM CST'}
                    </p>
                  </div>

                  {/* Override Email */}
                  <div>
                    <label htmlFor="email_address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Send to a different email <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                    </label>
                    <input
                      type="email"
                      id="email_address"
                      value={preferences.email_address || ''}
                      onChange={(e) => setPreferences(prev => ({ ...prev, email_address: e.target.value || null }))}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder={email || profile?.email || 'Enter alternate email'}
                      disabled={!preferences.email_enabled}
                    />
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      Defaults to your account email ({email || profile?.email})
                    </p>
                  </div>
                </div>
              </div>

              {/* Weather Card */}
              <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity duration-200 ${!preferences.email_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">🌤️</span>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Weather Forecast</h3>
                  </div>
                  <ToggleSwitch
                    checked={preferences.include_weather}
                    onChange={(val) => setPreferences(prev => ({ ...prev, include_weather: val }))}
                    disabled={!preferences.email_enabled}
                  />
                </div>
                <div className={`p-5 transition-opacity duration-200 ${!preferences.include_weather ? 'opacity-50 pointer-events-none' : ''}`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Set your location for the weather forecast. Leave blank to use the default (Flower Mound, TX).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="weather_city" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        id="weather_city"
                        value={preferences.weather_city}
                        onChange={(e) => setPreferences(prev => ({ ...prev, weather_city: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
                        placeholder="City"
                        disabled={!preferences.email_enabled || !preferences.include_weather}
                      />
                    </div>
                    <div>
                      <label htmlFor="weather_state" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        State
                      </label>
                      <select
                        id="weather_state"
                        value={preferences.weather_state}
                        onChange={(e) => setPreferences(prev => ({ ...prev, weather_state: e.target.value }))}
                        disabled={!preferences.email_enabled || !preferences.include_weather}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                      >
                        <option value="">Select state...</option>
                        <option value="AL">Alabama</option>
                        <option value="AK">Alaska</option>
                        <option value="AZ">Arizona</option>
                        <option value="AR">Arkansas</option>
                        <option value="CA">California</option>
                        <option value="CO">Colorado</option>
                        <option value="CT">Connecticut</option>
                        <option value="DE">Delaware</option>
                        <option value="FL">Florida</option>
                        <option value="GA">Georgia</option>
                        <option value="HI">Hawaii</option>
                        <option value="ID">Idaho</option>
                        <option value="IL">Illinois</option>
                        <option value="IN">Indiana</option>
                        <option value="IA">Iowa</option>
                        <option value="KS">Kansas</option>
                        <option value="KY">Kentucky</option>
                        <option value="LA">Louisiana</option>
                        <option value="ME">Maine</option>
                        <option value="MD">Maryland</option>
                        <option value="MA">Massachusetts</option>
                        <option value="MI">Michigan</option>
                        <option value="MN">Minnesota</option>
                        <option value="MS">Mississippi</option>
                        <option value="MO">Missouri</option>
                        <option value="MT">Montana</option>
                        <option value="NE">Nebraska</option>
                        <option value="NV">Nevada</option>
                        <option value="NH">New Hampshire</option>
                        <option value="NJ">New Jersey</option>
                        <option value="NM">New Mexico</option>
                        <option value="NY">New York</option>
                        <option value="NC">North Carolina</option>
                        <option value="ND">North Dakota</option>
                        <option value="OH">Ohio</option>
                        <option value="OK">Oklahoma</option>
                        <option value="OR">Oregon</option>
                        <option value="PA">Pennsylvania</option>
                        <option value="RI">Rhode Island</option>
                        <option value="SC">South Carolina</option>
                        <option value="SD">South Dakota</option>
                        <option value="TN">Tennessee</option>
                        <option value="TX">Texas</option>
                        <option value="UT">Utah</option>
                        <option value="VT">Vermont</option>
                        <option value="VA">Virginia</option>
                        <option value="WA">Washington</option>
                        <option value="WV">West Virginia</option>
                        <option value="WI">Wisconsin</option>
                        <option value="WY">Wyoming</option>
                        <option value="DC">Washington DC</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="weather_zip" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        ZIP Code
                      </label>
                      <input
                        type="text"
                        id="weather_zip"
                        value={preferences.weather_zip}
                        onChange={(e) => setPreferences(prev => ({ ...prev, weather_zip: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
                        placeholder="ZIP Code"
                        maxLength={5}
                        disabled={!preferences.email_enabled || !preferences.include_weather}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Sections Card */}
              <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-opacity duration-200 ${!preferences.email_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-[1.125rem] h-[1.125rem] flex-shrink-0 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Content Sections</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Choose what&apos;s included in your digest</p>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {[
                    { id: 'include_board_cards_owned', label: 'Cards on My Boards', desc: 'Cards due/overdue on boards you own', icon: '📋' },
                    { id: 'include_board_cards_assigned', label: 'Cards Assigned to Me', desc: 'Cards due/overdue that are assigned to you', icon: '🎯' },
                    { id: 'include_checklist_items', label: 'Checklist Items Due', desc: 'Checklist items with due dates on your cards', icon: '☑️' },
                    { id: 'include_follow_ups', label: 'Follow-up Leaders', desc: 'Leaders marked for follow-up with upcoming or overdue dates', icon: '👤' },
                    { id: 'include_planned_encouragements', label: 'Planned Encouragements', desc: 'Encouragement messages scheduled for today', icon: '💬' },
                    { id: 'include_upcoming_meetings', label: "Today's Circles", desc: 'Circles meeting today and tomorrow', icon: '📅' },
                    { id: 'include_birthdays', label: 'Birthdays', desc: 'Circle leaders with a birthday today', icon: '🎂' },
                  ].map(item => (
                    <div key={item.id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg flex-shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.desc}</p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={(preferences as any)[item.id]}
                        onChange={(val) => setPreferences(prev => ({ ...prev, [item.id]: val }))}
                        disabled={!preferences.email_enabled}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest || !preferences.email_enabled}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {isSendingTest ? 'Sending...' : 'Send Test Email'}
                </button>
                <button
                  onClick={handleSaveEmailPreferences}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}

        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Change Password</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Leave blank if you prefer to sign in with a magic link code.
          </p>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New password</label>
              <input type="password" autoComplete="new-password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm new password</label>
              <input type="password" autoComplete="new-password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
            </div>
            <button type="submit" disabled={isSavingPassword || !newPassword || !confirmPassword}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isSavingPassword ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>

        </div>

        {/* Alert Modal */}
        <AlertModal
          isOpen={showAlert.isOpen}
          onClose={() => setShowAlert(prev => ({ ...prev, isOpen: false }))}
          type={showAlert.type}
          title={showAlert.title}
          message={showAlert.message}
        />
      </div>
    </ProtectedRoute>
  );
}
