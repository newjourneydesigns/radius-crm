'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import { useNoteTemplates } from '../../hooks/useNoteTemplates';
import { NoteTemplate } from '../../lib/supabase';

interface NoteTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateSelect?: (template: NoteTemplate) => void;
  mode: 'select' | 'manage'; // 'select' for choosing a template, 'manage' for full CRUD
}

export default function NoteTemplateModal({ 
  isOpen, 
  onClose, 
  onTemplateSelect,
  mode 
}: NoteTemplateModalProps) {
  const { templates, isLoading, saveTemplate, updateTemplate, deleteTemplate } = useNoteTemplates();
  const [editingTemplate, setEditingTemplate] = useState<NoteTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateContent('');
    setError('');
  };

  const handleEdit = (template: NoteTemplate) => {
    setEditingTemplate(template);
    setIsCreating(false);
    setTemplateName(template.name);
    setTemplateContent(template.content);
    setError('');
  };

  const handleSave = async () => {
    if (!templateName.trim() || !templateContent.trim()) {
      setError('Both name and content are required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (editingTemplate) {
        // Update existing template
        await updateTemplate(editingTemplate.id, templateName, templateContent);
      } else {
        // Create new template
        await saveTemplate(templateName, templateContent);
      }
      
      // Reset form
      setIsCreating(false);
      setEditingTemplate(null);
      setTemplateName('');
      setTemplateContent('');
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (template: NoteTemplate) => {
    if (!window.confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      return;
    }

    try {
      await deleteTemplate(template.id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateContent('');
    setError('');
  };

  const handleTemplateSelect = (template: NoteTemplate) => {
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
    onClose();
  };

  const showingForm = isCreating || editingTemplate;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
        mode === 'select' ? 'Select Note Template' :
        showingForm ? (editingTemplate ? 'Edit Template' : 'Create Template') : 
        'Manage Note Templates'
      }
      size="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {showingForm ? (
          // Create/Edit Form
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter template name..."
                maxLength={255}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Content
              </label>
              <textarea
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={8}
                placeholder="Enter template content..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting || !templateName.trim() || !templateContent.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        ) : (
          // Templates List
          <div>
            {mode === 'manage' && (
              <div className="mb-4">
                <button
                  onClick={handleCreateNew}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  + Create New Template
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {mode === 'select' ? 'No templates available' : 'No templates created yet'}
                {mode === 'manage' && (
                  <div className="mt-2">
                    <button
                      onClick={handleCreateNew}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Create your first template
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {templates.map((template) => (
                  <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-gray-900">{template.name}</h3>
                      {mode === 'manage' && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(template)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(template)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                      {template.content}
                    </p>
                    {mode === 'select' && (
                      <button
                        onClick={() => handleTemplateSelect(template)}
                        className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                      >
                        Use Template
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
