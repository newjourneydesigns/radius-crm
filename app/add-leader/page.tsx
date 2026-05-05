'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ensureDefaultFrequencies, formatFrequencyLabel } from '../../lib/frequencyUtils';
import CCBPersonLookup from '../../components/ui/CCBPersonLookup';
import type { CCBPerson } from '../../components/ui/CCBPersonLookup';

interface DirectorEntry {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

interface SettingsItem {
  id: number;
  value: string;
}

const VALID_STATUS_VALUES = ['invited', 'pipeline', 'on-boarding', 'active', 'paused', 'off-boarding'] as const;

const dedupeItemsByValue = (items: SettingsItem[] = []): SettingsItem[] => {
  const seen = new Set<string>();
  const deduped: SettingsItem[] = [];

  for (const item of items) {
    const normalized = (item?.value || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(item);
  }

  return deduped;
};

const dedupeDirectorsByName = (items: DirectorEntry[] = []): DirectorEntry[] => {
  const seen = new Set<string>();
  const deduped: DirectorEntry[] = [];

  for (const item of items) {
    const normalized = (item?.name || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(item);
  }

  return deduped;
};

export default function AddLeaderPage() {
  const [leaderType, setLeaderType] = useState<'circle' | 'host_team'>('circle');
  const [formData, setFormData] = useState({
    circleName: '',
    teamName: '',
    name: '',
    email: '',
    phone: '',
    campus: '',
    acpd: '',
    hostTeamDirector: '',
    status: '',
    day: '',
    time: '',
    frequency: '',
    meeting_start_date: '',
    circleType: '',
    ccbProfileLink: '',
    leaderCcbProfileLink: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Reference data state
  const [acpdDirectors, setAcpdDirectors] = useState<DirectorEntry[]>([]);
  const [hostTeamDirectors, setHostTeamDirectors] = useState<DirectorEntry[]>([]);
  const [campuses, setCampuses] = useState<SettingsItem[]>([]);
  const [circleTypes, setCircleTypes] = useState<SettingsItem[]>([]);
  const [statuses, setStatuses] = useState<SettingsItem[]>([]);
  const [frequencies, setFrequencies] = useState<SettingsItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    try {
      setIsLoadingData(true);
      const [acpdResult, htDirectorsResult, campusesResult, circleTypesResult, statusesResult, frequenciesResult] = await Promise.all([
        supabase.from('acpd_list').select('*').eq('active', true).order('name'),
        supabase.from('directors_list').select('*').eq('active', true).order('name'),
        supabase.from('campuses').select('*').order('value'),
        supabase.from('circle_types').select('*').order('value'),
        supabase.from('statuses').select('*').order('value'),
        supabase.from('frequencies').select('*').order('value')
      ]);

      if (acpdResult.data) {
        setAcpdDirectors(
          dedupeDirectorsByName(acpdResult.data.map(d => ({ ...d, status: d.active ? 'active' : 'inactive' })))
        );
      }
      if (htDirectorsResult.data) {
        setHostTeamDirectors(
          dedupeDirectorsByName(htDirectorsResult.data.map(d => ({ ...d, status: d.active ? 'active' : 'inactive' })))
        );
      }
      if (campusesResult.data) setCampuses(dedupeItemsByValue(campusesResult.data));
      if (circleTypesResult.data) setCircleTypes(dedupeItemsByValue(circleTypesResult.data));
      if (statusesResult.data) {
        const filteredStatuses = statusesResult.data.filter((status) => {
          const normalized = (status?.value || '').trim().toLowerCase();
          return VALID_STATUS_VALUES.includes(normalized as (typeof VALID_STATUS_VALUES)[number]);
        });
        setStatuses(dedupeItemsByValue(filteredStatuses));
      }
      if (frequenciesResult.data) {
        setFrequencies(dedupeItemsByValue(ensureDefaultFrequencies(frequenciesResult.data)));
      }
    } catch (err) {
      console.error('Error loading reference data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      circleName: '',
      teamName: '',
      name: '',
      email: '',
      phone: '',
      campus: '',
      acpd: '',
      hostTeamDirector: '',
      status: '',
      day: '',
      time: '',
      frequency: '',
      meeting_start_date: '',
      circleType: '',
      ccbProfileLink: '',
      leaderCcbProfileLink: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    try {
      const isHostTeam = leaderType === 'host_team';
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionToken = sessionData?.session?.access_token;

      const response = await fetch('/api/circle-leaders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          leader_type: leaderType,
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          campus: formData.campus || null,
          status: formData.status || null,
          // Circle-specific fields
          circle_name: !isHostTeam ? (formData.circleName || formData.name || null) : null,
          acpd: !isHostTeam ? (formData.acpd || null) : null,
          day: !isHostTeam ? (formData.day || null) : null,
          time: !isHostTeam ? (formData.time || null) : null,
          frequency: !isHostTeam ? (formData.frequency || null) : null,
          meeting_start_date: !isHostTeam ? (formData.meeting_start_date || null) : null,
          circle_type: !isHostTeam ? (formData.circleType || null) : null,
          ccb_profile_link: !isHostTeam ? (formData.ccbProfileLink || null) : null,
          leader_ccb_profile_link: !isHostTeam ? (formData.leaderCcbProfileLink || null) : null,
          // Host team-specific fields
          team_name: isHostTeam ? (formData.teamName || null) : null,
          director: isHostTeam ? (formData.hostTeamDirector || null) : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to add leader. Please try again.');
      }

      setSuccess(true);
      resetForm();
      setTimeout(() => { router.push('/boards'); }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to add leader. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Add New Leader</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Add a new leader to RADIUS
          </p>
        </div>

        {isLoadingData ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Loading form data...</p>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">

          {/* Leader Type Selector */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <p className={`${labelClass} mb-3`}>Leader Type</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setLeaderType('circle')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  leaderType === 'circle'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <div className="font-semibold">Circle Leader</div>
                <div className="text-xs mt-0.5 opacity-75">Leads a circle</div>
              </button>
              <button
                type="button"
                onClick={() => setLeaderType('host_team')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  leaderType === 'host_team'
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <div className="font-semibold">Team Leader</div>
                <div className="text-xs mt-0.5 opacity-75">Leads a serve team</div>
              </button>
            </div>
          </div>

          {/* Main Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                {leaderType === 'host_team' ? 'Team Information' : 'Circle Information'}
              </h2>
            </div>
            <div className="p-4 sm:p-6 space-y-4">

              {/* CCB Person Lookup */}
              <div className="col-span-full">
                <CCBPersonLookup
                  label="Fill from CCB"
                  placeholder="Search CCB by name or phone to auto-fill..."
                  onSelect={(person: CCBPerson) => {
                    setFormData(prev => ({
                      ...prev,
                      name: person.fullName,
                      phone: person.mobilePhone || person.phone || prev.phone,
                      email: person.email || prev.email,
                    }));
                  }}
                />
                <div className="relative mt-3 mb-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white dark:bg-gray-800 text-gray-400">or enter manually</span>
                  </div>
                </div>
              </div>

              {/* Circle Name — circle only */}
              {leaderType === 'circle' && (
                <div>
                  <label htmlFor="circleName" className={labelClass}>Circle Name</label>
                  <input
                    type="text"
                    name="circleName"
                    id="circleName"
                    value={formData.circleName}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="e.g. FMT | S3 | Casey and Ashley Bates (from CCB)"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The group name from CCB. If left blank, the primary leader name will be used.</p>
                </div>
              )}

              {/* Team Name — host team only */}
              {leaderType === 'host_team' && (
                <div>
                  <label htmlFor="teamName" className={labelClass}>Team Name</label>
                  <input
                    type="text"
                    name="teamName"
                    id="teamName"
                    value={formData.teamName}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="e.g. Fire Mound Usher Team"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The name of the team this person leads.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className={labelClass}>Leader Name *</label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Enter leader name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className={labelClass}>Email</label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Enter email address"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className={labelClass}>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label htmlFor="campus" className={labelClass}>Campus</label>
                  <select name="campus" id="campus" value={formData.campus} onChange={handleChange} className={inputClass}>
                    <option value="">Select Campus</option>
                    {campuses.map((campus) => (
                      <option key={campus.id} value={campus.value}>{campus.value}</option>
                    ))}
                  </select>
                </div>

                {/* ACPD Director — circle only */}
                {leaderType === 'circle' && (
                  <div>
                    <label htmlFor="acpd" className={labelClass}>Director</label>
                    <select name="acpd" id="acpd" value={formData.acpd} onChange={handleChange} className={inputClass}>
                      <option value="">Select Director</option>
                      {acpdDirectors.map((d) => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Host Team Director — host team only */}
                {leaderType === 'host_team' && (
                  <div>
                    <label htmlFor="hostTeamDirector" className={labelClass}>Director</label>
                    <select name="hostTeamDirector" id="hostTeamDirector" value={formData.hostTeamDirector} onChange={handleChange} className={inputClass}>
                      <option value="">Select Director</option>
                      {hostTeamDirectors.map((d) => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                    {hostTeamDirectors.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No directors found. Add them in Settings → Team Directors.</p>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="status" className={labelClass}>Status</label>
                  <select name="status" id="status" value={formData.status} onChange={handleChange} className={inputClass}>
                    <option value="">Select Status</option>
                    {statuses.map((status) => (
                      <option key={status.id} value={status.value}>
                        {status.value.charAt(0).toUpperCase() + status.value.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Meeting Details — circle only */}
          {leaderType === 'circle' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Meeting Details</h2>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="day" className={labelClass}>Meeting Day</label>
                    <select name="day" id="day" value={formData.day} onChange={handleChange} className={inputClass}>
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
                    <label htmlFor="time" className={labelClass}>Meeting Time</label>
                    <input
                      type="time"
                      name="time"
                      id="time"
                      value={formData.time}
                      onChange={handleChange}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="frequency" className={labelClass}>Frequency</label>
                    <select name="frequency" id="frequency" value={formData.frequency} onChange={handleChange} className={inputClass}>
                      <option value="">Select Frequency</option>
                      {frequencies.map((frequency) => (
                        <option key={frequency.id} value={frequency.value}>
                          {formatFrequencyLabel(frequency.value)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="meeting_start_date" className={labelClass}>Bi-weekly Start Date</label>
                    <input
                      type="date"
                      name="meeting_start_date"
                      id="meeting_start_date"
                      value={formData.meeting_start_date}
                      onChange={handleChange}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="circleType" className={labelClass}>Circle Type</label>
                  <select name="circleType" id="circleType" value={formData.circleType} onChange={handleChange} className={inputClass}>
                    <option value="">Select Circle Type</option>
                    {circleTypes.map((type) => (
                      <option key={type.id} value={type.value}>{type.value}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* CCB Links — circle only */}
          {leaderType === 'circle' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">CCB Links</h2>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <label htmlFor="ccbProfileLink" className={labelClass}>CCB Circle Link</label>
                  <input
                    type="url"
                    name="ccbProfileLink"
                    id="ccbProfileLink"
                    value={formData.ccbProfileLink}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="https://valleycreekchurch.ccbchurch.com/group_detail.php?group_id=..."
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Link to the circle/group page in CCB</p>
                </div>
                <div>
                  <label htmlFor="leaderCcbProfileLink" className={labelClass}>Leader CCB Profile Link</label>
                  <input
                    type="url"
                    name="leaderCcbProfileLink"
                    id="leaderCcbProfileLink"
                    value={formData.leaderCcbProfileLink}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="https://valleycreekchurch.ccbchurch.com/goto/individuals/..."
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Link to the primary leader&apos;s individual profile in CCB</p>
                </div>
              </div>
            </div>
          )}

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
                    {leaderType === 'host_team' ? 'Team Leader' : 'Circle Leader'} added successfully!
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
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-400">{error}</h3>
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
              className="btn-primary px-4 py-2 rounded-lg text-sm"
            >
              {isLoading ? 'Adding...' : `Add ${leaderType === 'host_team' ? 'Team Leader' : 'Circle Leader'}`}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
