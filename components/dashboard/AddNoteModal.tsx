'use client';

import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { supabase, NoteTemplate } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import NoteTemplateModal from './NoteTemplateModal';

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  circleLeaderId?: number;
  circleLeaderName?: string;
  onNoteAdded?: () => void;
  clearFollowUp?: boolean; // New prop to indicate if this note should clear follow-up
}

interface CircleLeader {
  id: number;
  name: string;
}

export default function AddNoteModal({ 
  isOpen, 
  onClose, 
  circleLeaderId,
  circleLeaderName,
  onNoteAdded,
  clearFollowUp = false 
}: AddNoteModalProps) {
  const [content, setContent] = useState('');
  const [selectedLeaderId, setSelectedLeaderId] = useState<number | undefined>(circleLeaderId);
  const [circleLeaders, setCircleLeaders] = useState<CircleLeader[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(false);
  const [error, setError] = useState('');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const { user } = useAuth();

  // Load circle leaders when modal opens and no specific leader is provided
  useEffect(() => {
    if (isOpen && !circleLeaderId) {
      loadCircleLeaders();
    }
    if (circleLeaderId) {
      setSelectedLeaderId(circleLeaderId);
    }
  }, [isOpen, circleLeaderId]);

  const loadCircleLeaders = async () => {
    setIsLoadingLeaders(true);
    try {
      const { data, error } = await supabase
        .from('circle_leaders')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setCircleLeaders(data || []);
    } catch (err) {
      console.error('Error loading circle leaders:', err);
      setError('Failed to load circle leaders');
    } finally {
      setIsLoadingLeaders(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      setError('Note content is required');
      return;
    }

    const leaderIdToUse = selectedLeaderId || circleLeaderId;
    if (!leaderIdToUse) {
      setError('Circle leader must be selected');
      return;
    }

    if (!user?.id) {
      setError('User must be authenticated');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Start with adding the note
      const { error: insertError } = await supabase
        .from('notes')
        .insert({
          circle_leader_id: leaderIdToUse,
          content: content.trim(),
          created_at: new Date().toISOString()
        });

      if (insertError) {
        throw insertError;
      }

      // If clearFollowUp is true, also clear the follow-up status
      if (clearFollowUp) {
        const { error: clearError } = await supabase
          .from('circle_leaders')
          .update({ 
            follow_up_required: false,
            follow_up_date: null 
          })
          .eq('id', leaderIdToUse);

        if (clearError) {
          console.error('Error clearing follow-up:', clearError);
          // Don't throw here - note was already added successfully
        }
      }

      // Reset form
      setContent('');
      setSelectedLeaderId(undefined);
      onNoteAdded?.();
      onClose();
    } catch (err) {
      console.error('Error adding note:', err);
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setContent('');
      setSelectedLeaderId(undefined);
      setError('');
      onClose();
    }
  };

  const handleTemplateSelect = (template: NoteTemplate) => {
    setContent(template.content);
    setIsTemplateModalOpen(false);
  };

  const openTemplateSelector = () => {
    setIsTemplateModalOpen(true);
  };

  const getModalTitle = () => {
    if (clearFollowUp) {
      return circleLeaderName ? `Clear Follow-Up - ${circleLeaderName}` : 'Clear Follow-Up';
    }
    if (circleLeaderName) {
      return `Add Note for ${circleLeaderName}`;
    }
    const selectedLeader = circleLeaders.find(leader => leader.id === selectedLeaderId);
    if (selectedLeader) {
      return `Add Note for ${selectedLeader.name}`;
    }
    return 'Add Note';
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose} 
      title={getModalTitle()}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {clearFollowUp && (
          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-3 rounded-md text-sm">
            <p className="font-medium">Clear Follow-Up Status</p>
            <p>This note will clear the follow-up requirement for {circleLeaderName || 'this leader'}. Please explain the resolution or outcome.</p>
          </div>
        )}

        {/* Circle Leader Selector - only show if no specific leader is provided */}
        {!circleLeaderId && (
          <div>
            <label htmlFor="circle-leader" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Circle Leader
            </label>
            {isLoadingLeaders ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading circle leaders...</div>
            ) : (
              <select
                id="circle-leader"
                value={selectedLeaderId || ''}
                onChange={(e) => setSelectedLeaderId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                disabled={isSubmitting}
                required
              >
                <option value="">Select a Circle Leader</option>
                {circleLeaders.map(leader => (
                  <option key={leader.id} value={leader.id}>
                    {leader.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="note-content" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {clearFollowUp ? 'Resolution Note' : 'Note Content'} <span className="text-red-500">*</span>
            </label>
            {!clearFollowUp && (
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={openTemplateSelector}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  disabled={isSubmitting}
                >
                  Use Template
                </button>
                <span className="text-xs text-gray-400">|</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Manage templates in Settings
                </span>
              </div>
            )}
          </div>
          <textarea
            id="note-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={clearFollowUp 
              ? "Explain why the follow-up is being cleared (e.g., 'Contacted leader and resolved the issue', 'Follow-up completed successfully', etc.)" 
              : "Enter your note here..."
            }
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
            disabled={isSubmitting}
            required
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {content.length}/500 characters
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
            className={`px-4 py-2 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              clearFollowUp 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            disabled={isSubmitting || !content.trim() || (!circleLeaderId && !selectedLeaderId)}
          >
            {isSubmitting 
              ? (clearFollowUp ? 'Clearing Follow-Up...' : 'Adding Note...') 
              : (clearFollowUp ? 'Clear Follow-Up' : 'Add Note')
            }
          </button>
        </div>
      </form>

      <NoteTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onTemplateSelect={handleTemplateSelect}
        mode="select"
      />
    </Modal>
  );
}
