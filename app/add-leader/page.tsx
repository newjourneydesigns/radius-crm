'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function AddLeaderPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    campus: '',
    acpd: '',
    status: '',
    day: '',
    time: '',
    frequency: '',
    circleType: '',
    ccbProfileLink: '',
    calendarLink: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    try {
      const { error: insertError } = await supabase
        .from('circle_leaders')
        .insert([
          {
            name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
            campus: formData.campus || null,
            acpd: formData.acpd || null,
            status: formData.status || null,
            day: formData.day || null,
            time: formData.time || null,
            frequency: formData.frequency || null,
            circle_type: formData.circleType || null,
            ccb_profile_link: formData.ccbProfileLink || null,
            event_summary_received: false
          }
        ]);

      if (insertError) {
        throw insertError;
      }
      
      setSuccess(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        campus: '',
        acpd: '',
        status: '',
        day: '',
        time: '',
        frequency: '',
        circleType: '',
        ccbProfileLink: '',
        calendarLink: ''
      });

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to add leader. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Add New Circle Leader</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Add a new Circle Leader to the system
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Basic Information</h2>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter email address"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label htmlFor="campus" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Campus
                  </label>
                  <select
                    name="campus"
                    id="campus"
                    value={formData.campus}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Campus</option>
                    <option value="Downtown">Downtown</option>
                    <option value="North">North</option>
                    <option value="South">South</option>
                    <option value="East">East</option>
                    <option value="West">West</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="acpd" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    ACPD
                  </label>
                  <select
                    name="acpd"
                    id="acpd"
                    value={formData.acpd}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select ACPD</option>
                    <option value="John Smith">John Smith</option>
                    <option value="Jane Doe">Jane Doe</option>
                    <option value="Mike Johnson">Mike Johnson</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Status
                  </label>
                  <select
                    name="status"
                    id="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Status</option>
                    <option value="invited">Invited</option>
                    <option value="pipeline">Pipeline</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="off-boarding">Off-boarding</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Meeting Details</h2>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="day" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Meeting Day
                  </label>
                  <select
                    name="day"
                    id="day"
                    value={formData.day}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Day</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="time" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Meeting Time
                  </label>
                  <input
                    type="time"
                    name="time"
                    id="time"
                    value={formData.time}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Frequency
                  </label>
                  <select
                    name="frequency"
                    id="frequency"
                    value={formData.frequency}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Frequency</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Bi-weekly">Bi-weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="circleType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Circle Type
                </label>
                <select
                  name="circleType"
                  id="circleType"
                  value={formData.circleType}
                  onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Circle Type</option>
                  <option value="Men's Circle">Men's Circle</option>
                  <option value="Women's Circle">Women's Circle</option>
                  <option value="Mixed Circle">Mixed Circle</option>
                  <option value="Youth Circle">Youth Circle</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Additional Links</h2>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label htmlFor="ccbProfileLink" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  CCB Profile Link
                </label>
                <input
                  type="url"
                  name="ccbProfileLink"
                  id="ccbProfileLink"
                  value={formData.ccbProfileLink}
                  onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label htmlFor="calendarLink" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Calendar Link
                </label>
                <input
                  type="url"
                  name="calendarLink"
                  id="calendarLink"
                  value={formData.calendarLink}
                  onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://..."
                />
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
                    Circle Leader added successfully!
                  </h3>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-400">
                    {error}
                  </h3>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Adding...' : 'Add Circle Leader'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
