'use client';

import { useState, useRef, useEffect } from 'react';

interface BulkStatusUpdateProps {
  totalLeaders: number;
  onBulkUpdateStatus: (status: string) => void;
}

export default function BulkStatusUpdate({ totalLeaders, onBulkUpdateStatus }: BulkStatusUpdateProps) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const statusOptions = [
    { value: 'invited', label: 'Invited', color: 'text-blue-700' },
    { value: 'pipeline', label: 'Pipeline', color: 'text-indigo-700' },
    { value: 'follow-up', label: 'Follow Up', color: 'text-orange-700' },
    { value: 'active', label: 'Active', color: 'text-green-700' },
    { value: 'paused', label: 'Paused', color: 'text-yellow-700' },
    { value: 'off-boarding', label: 'Off-boarding', color: 'text-red-700' }
  ];

  const handleStatusSelect = (status: string, label: string) => {
    setSelectedStatus(status);
    setShowDropdown(false);
    
    const confirmUpdate = confirm(
      `This will change the status to "${label}" for all ${totalLeaders} currently visible Circle Leaders. Are you sure?`
    );
    
    if (confirmUpdate) {
      onBulkUpdateStatus(status);
    }
  };

  if (totalLeaders === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Bulk Actions</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Update status for all {totalLeaders} visible Circle Leaders
          </p>
        </div>
        
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Change Status
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-700 ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
              <div className="py-1" role="menu">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleStatusSelect(option.value, option.label)}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    role="menuitem"
                  >
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-3 ${
                      option.value === 'active' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : option.value === 'invited'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                        : option.value === 'pipeline'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400'
                        : option.value === 'follow-up'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
                        : option.value === 'paused'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
