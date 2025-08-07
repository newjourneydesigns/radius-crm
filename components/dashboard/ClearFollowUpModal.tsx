'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ClearFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleLeaderId: number;
  circleLeaderName: string;
  onFollowUpCleared?: () => void;
}

export default function ClearFollowUpModal({ 
  isOpen, 
  onClose, 
  circleLeaderId,
  circleLeaderName,
  onFollowUpCleared 
}: ClearFollowUpModalProps) {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!note.trim()) {
      setError('Please add a note explaining why the follow-up is being cleared');
      return;
    }

    if (!user?.id) {
      setError('User must be authenticated');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Start a transaction-like operation
      // First, clear the follow-up status
      const { error: clearError } = await supabase
        .from('circle_leaders')
        .update({ 
          follow_up_required: false,
          follow_up_date: null 
        })
        .eq('id', circleLeaderId);

      if (clearError) {
        throw clearError;
      }

      // Then add the note
      const { error: noteError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: circleLeaderId,
          content: note.trim(),
          created_at: new Date().toISOString()
        });

      if (noteError) {
        throw noteError;
      }

      // Reset form and close
      setNote('');
      onFollowUpCleared?.();
      onClose();
    } catch (err) {
      console.error('Error clearing follow-up:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear follow-up');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setNote('');
      setError('');
      onClose();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose} 
      title={`Clear Follow-Up for ${circleLeaderName}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-3 rounded-md text-sm">
          <p className="font-medium">Clear Follow-Up Status</p>
          <p>This will remove the follow-up requirement and date for {circleLeaderName}. Please add a note explaining the resolution or outcome.</p>
        </div>

        <div>
          <label htmlFor="clear-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Resolution Note <span className="text-red-500">*</span>
          </label>
          <textarea
            id="clear-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why the follow-up is being cleared (e.g., 'Contacted leader and resolved the issue', 'Follow-up completed successfully', etc.)"
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
            disabled={isSubmitting}
            required
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {note.length}/500 characters
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || !note.trim()}
          >
            {isSubmitting ? 'Clearing Follow-Up...' : 'Clear Follow-Up'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
