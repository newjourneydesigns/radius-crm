'use client';

import { useState, useRef } from 'react';
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

export default function ImportPage() {
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
                  Import Circle Leaders
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Upload a CSV file to import multiple Circle Leaders at once
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

          {!showPreview && !importResult && (
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

          {showPreview && !importResult && (
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

          {importResult && (
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
