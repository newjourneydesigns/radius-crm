'use client';

import { useState, useEffect } from 'react';
import { supabase, ConnectionType } from '../../lib/supabase';

interface LogConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleLeaderId: number;
  circleLeaderName: string;
  onConnectionLogged?: () => void;
}

export default function LogConnectionModal({ 
  isOpen, 
  onClose, 
  circleLeaderId, 
  circleLeaderName, 
  onConnectionLogged 
}: LogConnectionModalProps) {
  const [connectionTypes, setConnectionTypes] = useState<ConnectionType[]>([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
    connectionTypeId: '',
    note: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Load connection types on mount
  useEffect(() => {
    const loadConnectionTypes = async () => {
      setIsLoading(true);
      try {
        // Load connection types from database
        const { data, error } = await supabase
          .from('connection_types')
          .select('*')
          .eq('active', true)
          .order('name');

        if (data && data.length > 0 && !error) {
          console.log('Loaded connection types from database:', data);
          setConnectionTypes(data);
        } else {
          console.log('No connection types found, using fallback');
          // Fallback to hardcoded types if database is empty
          const defaultTypes: ConnectionType[] = [
            { id: 1, name: 'In Person', active: true },
            { id: 2, name: 'Text', active: true },
            { id: 3, name: 'Phone', active: true },
            { id: 4, name: 'Email', active: true },
            { id: 5, name: 'Zoom', active: true },
            { id: 6, name: 'One-On-One', active: true },
            { id: 7, name: 'Circle Visit', active: true },
            { id: 8, name: 'Circle Leader Equipping', active: true },
            { id: 9, name: 'Other', active: true }
          ];
          setConnectionTypes(defaultTypes);
        }
      } catch (error) {
        console.error('Error loading connection types:', error);
        // Use fallback types on error
        const defaultTypes: ConnectionType[] = [
          { id: 1, name: 'In Person', active: true },
          { id: 2, name: 'Text', active: true },
          { id: 3, name: 'Phone', active: true },
          { id: 4, name: 'Email', active: true },
          { id: 5, name: 'Zoom', active: true },
          { id: 6, name: 'One-On-One', active: true },
          { id: 7, name: 'Circle Visit', active: true },
          { id: 8, name: 'Circle Leader Equipping', active: true },
          { id: 9, name: 'Other', active: true }
        ];
        setConnectionTypes(defaultTypes);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      loadConnectionTypes();
    }
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        date: new Date().toISOString().split('T')[0],
        connectionTypeId: '',
        note: ''
      });
      setError('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!formData.date || !formData.connectionTypeId) {
      setError('Please fill in all required fields.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // Find the connection type name
      const connectionType = connectionTypes.find(type => type.id.toString() === formData.connectionTypeId);
      const connectionTypeName = connectionType?.name || 'Unknown';

      console.log('🔍 Attempting to save connection to database...');

      // Save connection to database
      const { data: connectionData, error: connectionError } = await supabase
        .from('connections')
        .insert({
          circle_leader_id: circleLeaderId,
          date_of_connection: formData.date,
          connection_type_id: parseInt(formData.connectionTypeId),
          note: formData.note.trim() || null
        })
        .select('*')
        .single();

      console.log('🔍 Connection save result:', { connectionData, connectionError });

      if (connectionError) {
        console.error('Error saving connection:', connectionError);
        setError('Failed to save connection to database. Please try again.');
        return;
      }

      console.log('🔍 Connection saved successfully!');

      // Create a formatted note entry
      const noteContent = `Connection on ${new Date(formData.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })} via ${connectionTypeName}${formData.note.trim() ? `: ${formData.note.trim()}` : ''}`;

      // Add note to the notes table
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: circleLeaderId,
          content: noteContent,
          created_by: null // Use null instead of "System" to avoid UUID issues
        });

      if (noteError) {
        console.error('Error saving note:', noteError);
        // Don't fail the whole operation if note saving fails
      }

      // Update last_connection field on circle_leaders table (if the column exists)
      await supabase
        .from('circle_leaders')
        .update({
          last_connection: formData.date
        })
        .eq('id', circleLeaderId);

      // Success - close modal and refresh data
      console.log('🔍 Calling onConnectionLogged to trigger refresh...');
      onConnectionLogged?.();
      onClose();

    } catch (error) {
      console.error('Error saving connection:', error);
      setError('Failed to save connection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Log Connection
            </h3>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Log a connection with <strong>{circleLeaderName}</strong>
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {/* Date */}
            <div>
              <label htmlFor="connection-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="connection-date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Connection Type */}
            <div>
              <label htmlFor="connection-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Connection Type <span className="text-red-500">*</span>
              </label>
              {isLoading ? (
                <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  Loading connection types...
                </div>
              ) : (
                <select
                  id="connection-type"
                  value={formData.connectionTypeId}
                  onChange={(e) => setFormData(prev => ({ ...prev, connectionTypeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select connection type...</option>
                  {connectionTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Note */}
            <div>
              <label htmlFor="connection-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Note (optional)
              </label>
              <textarea
                id="connection-note"
                rows={3}
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Add any additional details about this connection..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end space-x-3 mt-6">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !formData.date || !formData.connectionTypeId}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </div>
              ) : (
                'Save Connection'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
