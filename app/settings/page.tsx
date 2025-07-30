'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    weeklyReports: true,
    autoBackup: true,
    darkMode: false,
    timezone: 'America/New_York',
    reminderDays: '7'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccess(false);

    try {
      // TODO: Implement actual API call to save settings
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Configure your RADIUS preferences and notifications
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Notifications</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose how you want to receive notifications
              </p>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label htmlFor="emailNotifications" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Notifications
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Receive email updates about event summaries and leader activities
                  </p>
                </div>
                <input
                  type="checkbox"
                  name="emailNotifications"
                  id="emailNotifications"
                  checked={settings.emailNotifications}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0 mt-1 sm:mt-0"
                />
              </div>

              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label htmlFor="smsNotifications" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    SMS Notifications
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Receive text message alerts for urgent updates
                  </p>
                </div>
                <input
                  type="checkbox"
                  name="smsNotifications"
                  id="smsNotifications"
                  checked={settings.smsNotifications}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0 mt-1 sm:mt-0"
                />
              </div>

              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label htmlFor="weeklyReports" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Weekly Reports
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Receive weekly summary reports of Circle Leader activities
                  </p>
                </div>
                <input
                  type="checkbox"
                  name="weeklyReports"
                  id="weeklyReports"
                  checked={settings.weeklyReports}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0 mt-1 sm:mt-0"
                />
              </div>
            </div>
          </div>

          {/* System Preferences */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">System Preferences</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure system-wide settings and preferences
              </p>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label htmlFor="autoBackup" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Automatic Backup
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Automatically backup data daily
                  </p>
                </div>
                <input
                  type="checkbox"
                  name="autoBackup"
                  id="autoBackup"
                  checked={settings.autoBackup}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0 mt-1 sm:mt-0"
                />
              </div>

              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label htmlFor="darkMode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Dark Mode
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Use dark theme throughout the application
                  </p>
                </div>
                <input
                  type="checkbox"
                  name="darkMode"
                  id="darkMode"
                  checked={settings.darkMode}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0 mt-1 sm:mt-0"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Timezone
                  </label>
                  <select
                    name="timezone"
                    id="timezone"
                    value={settings.timezone}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="America/New_York">Eastern Time (UTC-5)</option>
                    <option value="America/Chicago">Central Time (UTC-6)</option>
                    <option value="America/Denver">Mountain Time (UTC-7)</option>
                    <option value="America/Los_Angeles">Pacific Time (UTC-8)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="reminderDays" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reminder Days Before Event
                  </label>
                  <select
                    name="reminderDays"
                    id="reminderDays"
                    value={settings.reminderDays}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Account Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Account</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage your account settings and security
              </p>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Update Profile
                </button>
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  Export Data
                </button>
              </div>
            </div>
          </div>

          {success && (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800 dark:text-green-400">
                    Settings saved successfully!
                  </h3>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
