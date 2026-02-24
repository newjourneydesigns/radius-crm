'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import Link from 'next/link';

interface CSVRow {
  [key: string]: string;
}

interface FieldMapping {
  csvColumn: string;
  dbField: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const DB_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'campus', label: 'Campus', required: false },
  { key: 'acpd', label: 'ACPD/Director', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'day', label: 'Meeting Day', required: false },
  { key: 'time', label: 'Meeting Time', required: false },
  { key: 'frequency', label: 'Frequency', required: false },
  { key: 'circle_type', label: 'Circle Type', required: false },
  { key: 'ccb_profile_link', label: 'CCB Profile Link', required: false },
];

interface MassUpdateLeader {
  id: number;
  name: string;
  campus: string | null;
  acpd: string | null;
  status: string | null;
}

interface ReferenceData {
  directors: { id: number; name: string }[];
  campuses: { id: number; value: string }[];
}

export default function ImportPage() {
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<'csv' | 'mass-update'>('csv');

  // Mass Update state
  const [massUpdateField, setMassUpdateField] = useState<'campus' | 'acpd'>('campus');
  const [massUpdateValue, setMassUpdateValue] = useState('');
  const [massUpdateFilterField, setMassUpdateFilterField] = useState<'all' | 'campus' | 'acpd'>('all');
  const [massUpdateFilterValue, setMassUpdateFilterValue] = useState('');
  const [massUpdateLeaders, setMassUpdateLeaders] = useState<MassUpdateLeader[]>([]);
  const [massUpdateSelected, setMassUpdateSelected] = useState<Set<number>>(new Set());
  const [massUpdateLoading, setMassUpdateLoading] = useState(false);
  const [massUpdateSearching, setMassUpdateSearching] = useState(false);
  const [massUpdateResult, setMassUpdateResult] = useState<{ updated: number; error?: string } | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData>({ directors: [], campuses: [] });

  // Load reference data for dropdowns
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const res = await fetch('/api/reference-data');
        if (res.ok) {
          const data = await res.json();
          setReferenceData({
            directors: data.directors || [],
            campuses: data.campuses || [],
          });
        }
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    loadReferenceData();
  }, []);

  // Search/filter leaders for mass update  
  const searchLeadersForMassUpdate = useCallback(async () => {
    setMassUpdateSearching(true);
    setMassUpdateResult(null);
    setMassUpdateSelected(new Set());
    try {
      const res = await fetch('/api/circle-leaders');
      if (!res.ok) throw new Error('Failed to fetch circle leaders');
      const data = await res.json();
      let leaders: MassUpdateLeader[] = (data.circleLeaders || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        campus: l.campus || null,
        acpd: l.acpd || null,
        status: l.status || null,
      }));

      // Apply filter
      if (massUpdateFilterField === 'campus' && massUpdateFilterValue) {
        leaders = leaders.filter(l => l.campus === massUpdateFilterValue);
      } else if (massUpdateFilterField === 'acpd' && massUpdateFilterValue) {
        leaders = leaders.filter(l => l.acpd === massUpdateFilterValue);
      }

      // Sort by name
      leaders.sort((a, b) => a.name.localeCompare(b.name));
      setMassUpdateLeaders(leaders);
    } catch (err: any) {
      console.error('Error searching leaders:', err);
    } finally {
      setMassUpdateSearching(false);
    }
  }, [massUpdateFilterField, massUpdateFilterValue]);

  const toggleMassUpdateSelect = (id: number) => {
    setMassUpdateSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const massUpdateSelectAll = () => {
    setMassUpdateSelected(new Set(massUpdateLeaders.map(l => l.id)));
  };

  const massUpdateDeselectAll = () => {
    setMassUpdateSelected(new Set());
  };

  const handleMassUpdate = async () => {
    if (massUpdateSelected.size === 0 || !massUpdateValue) return;

    setMassUpdateLoading(true);
    setMassUpdateResult(null);
    try {
      const res = await fetch('/api/circle-leaders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderIds: Array.from(massUpdateSelected),
          field: massUpdateField,
          value: massUpdateValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      setMassUpdateResult({ updated: data.updated });

      // Refresh the list to show updated values
      await searchLeadersForMassUpdate();
    } catch (err: any) {
      setMassUpdateResult({ updated: 0, error: err.message });
    } finally {
      setMassUpdateLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      alert('CSV file must have at least a header row and one data row');
      return;
    }

    // Parse headers
    const headers = parseCSVLine(lines[0]);
    setCsvHeaders(headers);

    // Parse data rows
    const data: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length > 0) {
        const row: CSVRow = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }

    setCsvData(data);
    
    // Auto-map common fields
    const autoMappings: FieldMapping[] = [];
    DB_FIELDS.forEach(dbField => {
      let matchingHeader = '';
      
      // Special mapping logic for different fields
      switch (dbField.key) {
        case 'name':
          // Look for combined name field first, then check for separate first/last
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('name') && 
            !header.toLowerCase().includes('first') && 
            !header.toLowerCase().includes('last')
          ) || headers.find(header => 
            header.toLowerCase().includes('leader first') || 
            header.toLowerCase().includes('first')
          ) || '';
          break;
          
        case 'email':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('email') || 
            header.toLowerCase().includes('mail')
          ) || '';
          break;
          
        case 'phone':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('phone') || 
            header.toLowerCase().includes('mobile') ||
            header.toLowerCase().includes('cell')
          ) || '';
          break;
          
        case 'campus':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('campus') || 
            header.toLowerCase().includes('location')
          ) || '';
          break;
          
        case 'acpd':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('director') || 
            header.toLowerCase().includes('acpd')
          ) || '';
          break;
          
        case 'day':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('day') && 
            header.toLowerCase().includes('meeting')
          ) || headers.find(header => 
            header.toLowerCase().includes('day')
          ) || '';
          break;
          
        case 'time':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('time') ||
            header.toLowerCase().includes('meet time')
          ) || '';
          break;
          
        case 'frequency':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('frequency')
          ) || '';
          break;
          
        case 'circle_type':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('circle type') ||
            header.toLowerCase().includes('type')
          ) || '';
          break;
          
        case 'ccb_profile_link':
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes('ccb') ||
            header.toLowerCase().includes('link')
          ) || '';
          break;
          
        default:
          matchingHeader = headers.find(header => 
            header.toLowerCase().includes(dbField.key.toLowerCase())
          ) || '';
      }
      
      if (matchingHeader) {
        autoMappings.push({
          csvColumn: matchingHeader,
          dbField: dbField.key
        });
      }
    });
    
    setFieldMappings(autoMappings);
    setShowPreview(true);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const updateMapping = (csvColumn: string, dbField: string) => {
    setFieldMappings(prev => {
      const filtered = prev.filter(m => m.csvColumn !== csvColumn);
      if (dbField) {
        return [...filtered, { csvColumn, dbField }];
      }
      return filtered;
    });
  };

  const getMappedValue = (row: CSVRow, dbField: string): string => {
    const mapping = fieldMappings.find(m => m.dbField === dbField);
    if (!mapping) return '';
    
    let value = row[mapping.csvColumn] || '';
    
    // Special processing for certain fields
    if (dbField === 'name') {
      // Check if we have separate first and last name columns
      const firstNameHeaders = csvHeaders.filter(h => 
        h.toLowerCase().includes('first') || h.toLowerCase().includes('leader first')
      );
      const lastNameHeaders = csvHeaders.filter(h => 
        h.toLowerCase().includes('last') || h.toLowerCase().includes('leader last')
      );
      
      if (firstNameHeaders.length > 0 && lastNameHeaders.length > 0) {
        const firstName = row[firstNameHeaders[0]] || '';
        const lastName = row[lastNameHeaders[0]] || '';
        value = `${firstName} ${lastName}`.trim();
      } else if (mapping.csvColumn.toLowerCase().includes('first') && lastNameHeaders.length > 0) {
        // If the mapped column is first name, combine with last name
        const firstName = value;
        const lastName = row[lastNameHeaders[0]] || '';
        value = `${firstName} ${lastName}`.trim();
      }
    }
    
    // Clean up phone numbers
    if (dbField === 'phone') {
      value = value.replace(/[^\d]/g, '');
      if (value.length === 10) {
        value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6)}`;
      }
    }
    
    // Format time
    if (dbField === 'time') {
      // Convert "7:00 PM" format to "19:00" format
      if (value.includes('PM') && !value.startsWith('12')) {
        const [time] = value.split(' ');
        const [hours, minutes] = time.split(':');
        const hour24 = parseInt(hours) + 12;
        value = `${hour24}:${minutes}`;
      } else if (value.includes('AM') && value.startsWith('12')) {
        value = value.replace('12:', '00:').replace(' AM', '');
      } else {
        value = value.replace(' AM', '').replace(' PM', '');
      }
    }
    
    // Handle circle type mapping
    if (dbField === 'circle_type') {
      const typeMapping: { [key: string]: string } = {
        'mens': "Men's",
        'womens': "Women's", 
        'couples': "Couples",
        'young adults | mens': "Young Adult | Men's",
        'young adults | womens': "Young Adult | Women's",
        'young adult | mens': "Young Adult | Men's",
        'young adult | womens': "Young Adult | Women's",
        'coed': "Young Adult | Coed"
      };
      
      const lowercaseValue = value.toLowerCase();
      value = typeMapping[lowercaseValue] || value;
    }
    
    return value;
  };

  const handleImport = async () => {
    if (csvData.length === 0) return;
    
    setIsLoading(true);
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        try {
          // Build the circle leader object
          const circleLeader: any = {};
          
          DB_FIELDS.forEach(field => {
            const value = getMappedValue(row, field.key);
            if (value) {
              circleLeader[field.key] = value;
            }
          });
          
          // Validate required fields
          if (!circleLeader.name || circleLeader.name.trim().length === 0) {
            errors.push(`Row ${i + 1}: Name is required`);
            continue;
          }
          
          // Import the circle leader
          const response = await fetch('/api/circle-leaders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(circleLeader),
          });
          
          if (!response.ok) {
            const error = await response.text();
            errors.push(`Row ${i + 1}: ${error}`);
          } else {
            successCount++;
          }
          
        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      setImportResult({
        success: successCount,
        failed: errors.length,
        errors
      });
      
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetImport = () => {
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMappings([]);
    setImportResult(null);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Import &amp; Manage Circle Leaders
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Import from CSV or mass-update ACPD &amp; Campus assignments
                </p>
              </div>
              <div className="flex space-x-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium rounded-md transition-colors"
                >
                  ← Back to Dashboard
                </Link>
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('csv')}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'csv'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  CSV Import
                </span>
              </button>
              <button
                onClick={() => setActiveTab('mass-update')}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'mass-update'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Mass Update
                </span>
              </button>
            </nav>
          </div>

          {/* ===== MASS UPDATE TAB ===== */}
          {activeTab === 'mass-update' && (
            <div className="space-y-6">
              {/* Step 1: Configure update */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                    Mass Update ACPD or Campus
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Select circle leaders and assign them a new ACPD or Campus value in bulk.
                  </p>

                  {/* Filter controls */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* Filter by */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Filter Leaders By
                      </label>
                      <select
                        value={massUpdateFilterField}
                        onChange={(e) => {
                          setMassUpdateFilterField(e.target.value as 'all' | 'campus' | 'acpd');
                          setMassUpdateFilterValue('');
                        }}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="all">All Leaders</option>
                        <option value="campus">Current Campus</option>
                        <option value="acpd">Current ACPD</option>
                      </select>
                    </div>

                    {/* Filter value */}
                    {massUpdateFilterField !== 'all' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {massUpdateFilterField === 'campus' ? 'Campus' : 'ACPD'}
                        </label>
                        <select
                          value={massUpdateFilterValue}
                          onChange={(e) => setMassUpdateFilterValue(e.target.value)}
                          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="">-- Select --</option>
                          {massUpdateFilterField === 'campus'
                            ? referenceData.campuses.map((c) => (
                                <option key={c.id} value={c.value}>{c.value}</option>
                              ))
                            : referenceData.directors.map((d) => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                              ))}
                        </select>
                      </div>
                    )}

                    {/* Search button */}
                    <div className="flex items-end">
                      <button
                        onClick={searchLeadersForMassUpdate}
                        disabled={massUpdateSearching || (massUpdateFilterField !== 'all' && !massUpdateFilterValue)}
                        className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                      >
                        {massUpdateSearching ? 'Loading...' : 'Load Leaders'}
                      </button>
                    </div>
                  </div>

                  {/* Update target controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                        Field to Update
                      </label>
                      <select
                        value={massUpdateField}
                        onChange={(e) => {
                          setMassUpdateField(e.target.value as 'campus' | 'acpd');
                          setMassUpdateValue('');
                        }}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="campus">Campus</option>
                        <option value="acpd">ACPD / Director</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                        New Value
                      </label>
                      <select
                        value={massUpdateValue}
                        onChange={(e) => setMassUpdateValue(e.target.value)}
                        className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="">-- Select New Value --</option>
                        {massUpdateField === 'campus'
                          ? referenceData.campuses.map((c) => (
                              <option key={c.id} value={c.value}>{c.value}</option>
                            ))
                          : referenceData.directors.map((d) => (
                              <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Select leaders */}
              {massUpdateLeaders.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        Select Circle Leaders ({massUpdateLeaders.length} found)
                      </h3>
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {massUpdateSelected.size} selected
                        </span>
                        <button
                          onClick={massUpdateSelectAll}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Select All
                        </button>
                        <button
                          onClick={massUpdateDeselectAll}
                          className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left w-10">
                              <input
                                type="checkbox"
                                checked={massUpdateSelected.size === massUpdateLeaders.length && massUpdateLeaders.length > 0}
                                onChange={(e) => e.target.checked ? massUpdateSelectAll() : massUpdateDeselectAll()}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Campus
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              ACPD
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {massUpdateLeaders.map((leader) => (
                            <tr
                              key={leader.id}
                              onClick={() => toggleMassUpdateSelect(leader.id)}
                              className={`cursor-pointer transition-colors ${
                                massUpdateSelected.has(leader.id)
                                  ? 'bg-blue-50 dark:bg-blue-900/30'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={massUpdateSelected.has(leader.id)}
                                  onChange={() => toggleMassUpdateSelect(leader.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {leader.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {leader.campus || '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                {leader.acpd || '—'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  leader.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                                  leader.status === 'paused' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                                  leader.status === 'pipeline' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                                  leader.status === 'off-boarding' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                                  'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                                }`}>
                                  {leader.status || '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Apply button */}
                    <div className="mt-6 flex items-center justify-between">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {massUpdateSelected.size > 0 && massUpdateValue ? (
                          <span>
                            Will set <strong>{massUpdateField === 'campus' ? 'Campus' : 'ACPD'}</strong> to{' '}
                            <strong>&ldquo;{massUpdateValue}&rdquo;</strong> for{' '}
                            <strong>{massUpdateSelected.size}</strong> leader{massUpdateSelected.size !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span>Select leaders and a new value above to apply</span>
                        )}
                      </div>
                      <button
                        onClick={handleMassUpdate}
                        disabled={massUpdateLoading || massUpdateSelected.size === 0 || !massUpdateValue}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                      >
                        {massUpdateLoading ? 'Updating...' : `Update ${massUpdateSelected.size} Leader${massUpdateSelected.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>

                    {/* Result banner */}
                    {massUpdateResult && (
                      <div className={`mt-4 p-4 rounded-md ${
                        massUpdateResult.error
                          ? 'bg-red-50 dark:bg-red-900/20'
                          : 'bg-green-50 dark:bg-green-900/20'
                      }`}>
                        {massUpdateResult.error ? (
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <p className="text-sm text-red-800 dark:text-red-300">
                              Update failed: {massUpdateResult.error}
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-sm text-green-800 dark:text-green-300">
                              Successfully updated {massUpdateResult.updated} leader{massUpdateResult.updated !== 1 ? 's' : ''}!
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state after search */}
              {massUpdateLeaders.length === 0 && !massUpdateSearching && massUpdateFilterField !== 'all' && massUpdateFilterValue && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    No circle leaders found matching the selected filter. Try a different filter.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ===== CSV IMPORT TAB ===== */}
          {activeTab === 'csv' && !showPreview && !importResult && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Upload CSV File
                </h2>
                
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="mt-4">
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-white">
                          Choose CSV file to upload
                        </span>
                        <input
                          ref={fileInputRef}
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          accept=".csv"
                          className="sr-only"
                          onChange={handleFileUpload}
                        />
                        <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
                          CSV files only
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                    CSV Format Requirements:
                  </h3>
                  <ul className="text-sm text-blue-700 dark:text-blue-400 list-disc list-inside space-y-1">
                    <li>First row must contain column headers</li>
                    <li>At minimum, include a column for the leader's name</li>
                    <li>Common columns: Name, Email, Phone, Campus, Director/ACPD, etc.</li>
                    <li>Time format: "7:00 PM" or "19:00"</li>
                    <li>Phone format: Any format (will be normalized)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'csv' && showPreview && !importResult && (
            <div className="space-y-6">
              {/* Field Mapping */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Map CSV Columns to Database Fields
                  </h2>
                  
                  <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>Name Handling:</strong> If you have separate "First Name" and "Last Name" columns, 
                      map the "First Name" column to the "Name" field, and the system will automatically 
                      combine them. Or leave both unmapped and they'll be combined automatically if detected.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {csvHeaders.map(header => (
                      <div key={header} className="flex items-center space-x-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {header}
                          </label>
                        </div>
                        <div className="flex-1">
                          <select
                            value={fieldMappings.find(m => m.csvColumn === header)?.dbField || ''}
                            onChange={(e) => updateMapping(header, e.target.value)}
                            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="">-- Skip --</option>
                            {DB_FIELDS.map(field => (
                              <option key={field.key} value={field.key}>
                                {field.label} {field.required && '*'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Found {csvData.length} rows to import
                    </div>
                    <div className="space-x-3">
                      <button
                        onClick={resetImport}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium rounded-md transition-colors"
                      >
                        Start Over
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={isLoading || fieldMappings.length === 0}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                      >
                        {isLoading ? 'Importing...' : 'Import Circle Leaders'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Preview (First 5 Rows)
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {DB_FIELDS.filter(field => 
                            fieldMappings.some(m => m.dbField === field.key)
                          ).map(field => (
                            <th key={field.key} className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              {field.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {csvData.slice(0, 5).map((row, index) => (
                          <tr key={index}>
                            {DB_FIELDS.filter(field => 
                              fieldMappings.some(m => m.dbField === field.key)
                            ).map(field => (
                              <td key={field.key} className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {getMappedValue(row, field.key) || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'csv' && importResult && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Import Results
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-md">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <div>
                        <p className="text-green-800 dark:text-green-300 font-medium">
                          {importResult.success} Successfully Imported
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {importResult.failed > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                        <div>
                          <p className="text-red-800 dark:text-red-300 font-medium">
                            {importResult.failed} Failed
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {importResult.errors.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Errors:
                    </h3>
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md max-h-64 overflow-y-auto">
                      <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                        {importResult.errors.map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                
                <div className="flex space-x-3">
                  <button
                    onClick={resetImport}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium rounded-md transition-colors"
                  >
                    Import Another File
                  </button>
                  <Link
                    href="/dashboard"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    Go to Dashboard
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
