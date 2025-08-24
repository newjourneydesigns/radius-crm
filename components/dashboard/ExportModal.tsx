'use client';

import { useState } from 'react';
import { CircleLeader } from '../../lib/supabase';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaders: CircleLeader[];
}

export default function ExportModal({ isOpen, onClose, leaders }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({
    phone: true,
    email: true,
    campus: true,
    meetingDay: true,
    meetingTime: true,
    status: true,
  });

  if (!isOpen) return null;

  const formatTime = (time: string | undefined) => {
    if (!time) return 'Not specified';
    
    // If already in AM/PM format, return as is
    if (time.includes('AM') || time.includes('PM')) {
      return time;
    }
    
    // Convert 24-hour format to 12-hour format
    const [hours, minutes] = time.split(':');
    const hour24 = parseInt(hours);
    
    if (hour24 === 0) {
      return `12:${minutes} AM`;
    } else if (hour24 < 12) {
      return `${hour24}:${minutes} AM`;
    } else if (hour24 === 12) {
      return `12:${minutes} PM`;
    } else {
      return `${hour24 - 12}:${minutes} PM`;
    }
  };

  const buildMeetingLine = (leader: CircleLeader) => {
    const parts: string[] = [];
    
    if (options.meetingDay && leader.day) parts.push(leader.day);
    if (options.meetingTime && leader.time) parts.push(formatTime(leader.time));
    // Keep frequency and circle type always included (not part of requested toggles)
    if (leader.frequency) parts.push(leader.frequency);
    if (leader.circle_type) parts.push(leader.circle_type);
    
    if (parts.length === 0) return '';
    return `Meeting: ${parts.join(' • ')}`;
  };

  const buildLeaderBlock = (leader: CircleLeader, index: number) => {
    const lines: string[] = [];
    lines.push(`${leader.name || 'No Name'}`);
    if (options.phone) lines.push(`Phone: ${leader.phone || 'Not provided'}`);
    if (options.email) lines.push(`Email: ${leader.email || 'Not provided'}`);
    if (options.campus) lines.push(`Campus: ${leader.campus || 'Not specified'}`);
    const meetingLine = buildMeetingLine(leader);
    if (meetingLine) lines.push(meetingLine);
    if (options.status) {
      const status = leader.status ? leader.status.charAt(0).toUpperCase() + leader.status.slice(1) : 'Not specified';
      const statusWithFollow = leader.follow_up_required ? `${status} (Follow-up Required)` : status;
      lines.push(`Status: ${statusWithFollow}`);
    }
    return lines.join('\n');
  };

  const exportText = `CIRCLE LEADERS EXPORT
Generated: ${new Date().toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}
Total Leaders: ${leaders.length}

${'='.repeat(80)}

${leaders.map((leader, index) => buildLeaderBlock(leader, index)).join('\n\n')}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `circle-leaders-export-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateCSV = () => {
    const headers: string[] = ['Name'];
    if (options.phone) headers.push('Phone');
    if (options.email) headers.push('Email');
    if (options.campus) headers.push('Campus');
    if (options.meetingDay) headers.push('Meeting Day');
    if (options.meetingTime) headers.push('Meeting Time');
    if (options.status) headers.push('Status');

    const csvData = leaders.map(leader => {
      const row: string[] = [leader.name];
      
      if (options.phone) row.push(leader.phone || '');
      if (options.email) row.push(leader.email || '');
      if (options.campus) row.push(leader.campus || '');
      if (options.meetingDay) row.push(leader.day || '');
      if (options.meetingTime) row.push(formatTime(leader.time));
      if (options.status) row.push(leader.status || '');
      
      return row.map(field => `"${field.replace(/"/g, '""')}"`).join(',');
    });

    return [headers.map(h => `"${h}"`).join(','), ...csvData].join('\n');
  };

  const handleDownloadCSV = () => {
    const csvContent = generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `circle-leaders-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleOption = (key: keyof typeof options) =>
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col mx-auto border border-gray-200/20 dark:border-gray-700/50 transform transition-all animate-in zoom-in-95 duration-200 my-4 sm:my-auto"
        style={{
          position: 'relative',
          zIndex: 100000
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Export Circle Leaders ({leaders.length} leaders)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This export includes all currently filtered circle leaders with their contact information and meeting details.
            </p>

            {/* Field Filters */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Include fields</h3>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={options.phone} onChange={() => toggleOption('phone')} className="rounded border-gray-300 dark:border-gray-600" />
                  <span>Phone</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={options.email} onChange={() => toggleOption('email')} className="rounded border-gray-300 dark:border-gray-600" />
                  <span>Email</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={options.campus} onChange={() => toggleOption('campus')} className="rounded border-gray-300 dark:border-gray-600" />
                  <span>Campus</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={options.meetingDay} onChange={() => toggleOption('meetingDay')} className="rounded border-gray-300 dark:border-gray-600" />
                  <span>Meeting Day</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={options.meetingTime} onChange={() => toggleOption('meetingTime')} className="rounded border-gray-300 dark:border-gray-600" />
                  <span>Meeting Time</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={options.status} onChange={() => toggleOption('status')} className="rounded border-gray-300 dark:border-gray-600" />
                  <span>Status</span>
                </label>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download as Text File
              </button>

              <button
                onClick={handleDownloadCSV}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download as CSV
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto p-6">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm">
              <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
                {exportText}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
