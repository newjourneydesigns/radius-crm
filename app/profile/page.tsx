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
  preferred_time: string;
  timezone: string;
  frequency_hours: number;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<EmailPreferences>({
    email_enabled: true,
    email_address: null,
    include_follow_ups: true,
    include_overdue_tasks: true,
    include_planned_encouragements: true,
    include_upcoming_meetings: false,
    preferred_time: '08:00',
    timezone: 'America/Chicago',
    frequency_hours: 24
  });
  const [hasPreferences, setHasPreferences] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // UI state
  const [activeTab, setActiveTab] = useState<'profile' | 'email' | 'password'>('profile');
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

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Missing Fields',
        message: 'Please enter both password fields.'
      });
      return;
    }

    if (newPassword.length < 6) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Password Too Short',
        message: 'Password must be at least 6 characters long.'
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Passwords Don\'t Match',
        message: 'The passwords you entered do not match.'
      });
      return;
    }

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
          password: { newPassword }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update password');
      }

      setShowAlert({
        isOpen: true,
        type: 'success',
        title: 'Password Updated',
        message: 'Your password has been updated successfully.'
      });
      
      // Clear password fields
      setNewPassword('');
      setConfirmPassword('');
      
    } catch (error: any) {
      console.error('Error updating password:', error);
      setShowAlert({
        isOpen: true,
        type: 'error',
        title: 'Error Updating Password',
        message: error.message || 'Failed to update password'
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link 
              href="/dashboard"
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Manage your account settings and email preferences
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('profile')}
                className={`${
                  activeTab === 'profile'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
              >
                Profile
              </button>
              <button
                onClick={() => setActiveTab('email')}
                className={`${
                  activeTab === 'email'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
              >
                Email Settings
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`${
                  activeTab === 'password'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
              >
                Password
              </button>
            </nav>
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Profile Information</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Update your account information
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter your email address"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter your full name"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Role
                    </label>
                    <input
                      type="text"
                      id="role"
                      value={profile?.role || 'User'}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Contact an administrator to change your role
                    </p>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Email Settings Tab */}
          {activeTab === 'email' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Email Preferences</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Configure your daily summary email settings
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {/* Enable/Disable Emails */}
                  <div className="flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id="email_enabled"
                        type="checkbox"
                        checked={preferences.email_enabled}
                        onChange={(e) => setPreferences(prev => ({ ...prev, email_enabled: e.target.checked }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-3">
                      <label htmlFor="email_enabled" className="font-medium text-gray-700 dark:text-gray-300">
                        Enable Daily Summary Emails
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Receive a daily summary of your circle leaders and tasks
                      </p>
                    </div>
                  </div>

                  {/* Override Email Address */}
                  <div>
                    <label htmlFor="email_address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email Address Override (Optional)
                    </label>
                    <input
                      type="email"
                      id="email_address"
                      value={preferences.email_address || ''}
                      onChange={(e) => setPreferences(prev => ({ ...prev, email_address: e.target.value || null }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={email || profile?.email || 'Enter alternate email'}
                      disabled={!preferences.email_enabled}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Leave blank to use your account email ({email || profile?.email})
                    </p>
                  </div>

                  {/* Email Content Sections */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                      Email Frequency
                    </h3>
                    <div className="mb-2">
                      <label htmlFor="frequency_hours" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Send digest every
                      </label>
                      <div className="flex items-center gap-3">
                        <select
                          id="frequency_hours"
                          value={preferences.frequency_hours}
                          onChange={(e) => setPreferences(prev => ({ ...prev, frequency_hours: parseInt(e.target.value) }))}
                          disabled={!preferences.email_enabled}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value={4}>4 hours</option>
                          <option value={6}>6 hours</option>
                          <option value={8}>8 hours</option>
                          <option value={12}>12 hours</option>
                          <option value={24}>24 hours</option>
                        </select>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          starting at 12:00 AM CST
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {preferences.frequency_hours === 24 && 'You\'ll receive one email per day at 12:00 AM CST.'}
                        {preferences.frequency_hours === 12 && 'You\'ll receive emails at 12:00 AM and 12:00 PM CST.'}
                        {preferences.frequency_hours === 8 && 'You\'ll receive emails at 12:00 AM, 8:00 AM, and 4:00 PM CST.'}
                        {preferences.frequency_hours === 6 && 'You\'ll receive emails at 12:00 AM, 6:00 AM, 12:00 PM, and 6:00 PM CST.'}
                        {preferences.frequency_hours === 4 && 'You\'ll receive emails at 12:00 AM, 4:00 AM, 8:00 AM, 12:00 PM, 4:00 PM, and 8:00 PM CST.'}
                      </p>
                    </div>
                  </div>

                  {/* Email Content Sections */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                      Email Content Sections
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id="include_follow_ups"
                            type="checkbox"
                            checked={preferences.include_follow_ups}
                            onChange={(e) => setPreferences(prev => ({ ...prev, include_follow_ups: e.target.checked }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            disabled={!preferences.email_enabled}
                          />
                        </div>
                        <div className="ml-3">
                          <label htmlFor="include_follow_ups" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Circle Leaders Requiring Follow-up
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Leaders marked for follow-up with upcoming or overdue dates
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id="include_overdue_tasks"
                            type="checkbox"
                            checked={preferences.include_overdue_tasks}
                            onChange={(e) => setPreferences(prev => ({ ...prev, include_overdue_tasks: e.target.checked }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            disabled={!preferences.email_enabled}
                          />
                        </div>
                        <div className="ml-3">
                          <label htmlFor="include_overdue_tasks" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Overdue Tasks
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Todo items that are past their due date
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id="include_planned_encouragements"
                            type="checkbox"
                            checked={preferences.include_planned_encouragements}
                            onChange={(e) => setPreferences(prev => ({ ...prev, include_planned_encouragements: e.target.checked }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            disabled={!preferences.email_enabled}
                          />
                        </div>
                        <div className="ml-3">
                          <label htmlFor="include_planned_encouragements" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Planned Encouragements
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Encouragement messages scheduled for today
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="flex items-center h-5">
                          <input
                            id="include_upcoming_meetings"
                            type="checkbox"
                            checked={preferences.include_upcoming_meetings}
                            onChange={(e) => setPreferences(prev => ({ ...prev, include_upcoming_meetings: e.target.checked }))}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            disabled={!preferences.email_enabled}
                          />
                        </div>
                        <div className="ml-3">
                          <label htmlFor="include_upcoming_meetings" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Today&apos;s Circles
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Circles meeting today and tomorrow
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-between items-center">
                  <button
                    onClick={handleSendTestEmail}
                    disabled={isSendingTest || !preferences.email_enabled}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSendingTest ? 'Sending...' : 'Send Test Email'}
                  </button>
                  <button
                    onClick={handleSaveEmailPreferences}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Change Password</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Update your password to keep your account secure
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-6 max-w-md">
                  <div>
                    <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="new_password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter new password"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Must be at least 6 characters
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      id="confirm_password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleUpdatePassword}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
