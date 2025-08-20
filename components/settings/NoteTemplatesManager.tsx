'use client';

import { useState } from 'react';
import { useNoteTemplates } from '../../hooks/useNoteTemplates';
import { NoteTemplate } from '../../lib/supabase';

export default function NoteTemplatesManager() {
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

  const showingForm = isCreating || editingTemplate;

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Loading templates...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Create New Button */}
      {!showingForm && (
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Your Templates</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {templates.length === 0 ? 'No templates created yet' : `${templates.length} template${templates.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + Create New Template
          </button>
        </div>
      )}

      {showingForm ? (
        /* Create/Edit Form */
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            {editingTemplate ? 'Edit Template' : 'Create New Template'}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="Enter template name..."
                maxLength={255}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template Content
              </label>
              <textarea
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                rows={6}
                placeholder="Enter template content..."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                This text will be inserted when you use this template
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting || !templateName.trim() || !templateContent.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Templates List */
        <div>
          {templates.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-gray-400 dark:text-gray-500 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No templates yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Create your first note template to save time when adding notes
              </p>
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Create Your First Template
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {templates.map((template) => (
                <div key={template.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-1">{template.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Created {new Date(template.created_at).toLocaleDateString()}
                        {template.updated_at !== template.created_at && (
                          <> • Updated {new Date(template.updated_at).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => handleEdit(template)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
                    <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans">
                      {template.content}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
