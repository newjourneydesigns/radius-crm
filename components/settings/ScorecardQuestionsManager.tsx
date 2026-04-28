'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { EVALUATION_QUESTIONS } from '../../lib/evaluationQuestions';
import { ScorecardDimension } from '../../lib/supabase';

interface ScorecardQuestion {
  id: number;
  category: string;
  question_key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES: { key: ScorecardDimension; label: string; color: string; textClass: string; bgClass: string; borderClass: string }[] = [
  { key: 'reach', label: 'Reach', color: '#3b82f6', textClass: 'text-blue-400', bgClass: 'bg-blue-500/10', borderClass: 'border-blue-500/30' },
  { key: 'connect', label: 'Connect', color: '#22c55e', textClass: 'text-green-400', bgClass: 'bg-green-500/10', borderClass: 'border-green-500/30' },
  { key: 'disciple', label: 'Disciple', color: '#a855f7', textClass: 'text-purple-400', bgClass: 'bg-purple-500/10', borderClass: 'border-purple-500/30' },
  { key: 'develop', label: 'Develop', color: '#f97316', textClass: 'text-orange-400', bgClass: 'bg-orange-500/10', borderClass: 'border-orange-500/30' },
];

export default function ScorecardQuestionsManager() {
  const [questions, setQuestions] = useState<ScorecardQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ScorecardDimension>('reach');
  const [newQuestionLabel, setNewQuestionLabel] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<ScorecardQuestion | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasSeeded, setHasSeeded] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('scorecard_questions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (fetchError) {
        // Table might not exist yet
        if (fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
          setError('The scorecard_questions table has not been created yet. Please run the migration SQL in your Supabase SQL Editor.');
          setQuestions([]);
          return;
        }
        throw fetchError;
      }

      setQuestions(data || []);

      // If no questions exist, offer to seed defaults
      if (!data || data.length === 0) {
        setHasSeeded(false);
      } else {
        setHasSeeded(true);
      }
    } catch (err: any) {
      console.error('Error loading scorecard questions:', err);
      setError(err.message || 'Failed to load questions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const seedDefaults = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const allQuestions: any[] = [];
      for (const [category, catQuestions] of Object.entries(EVALUATION_QUESTIONS)) {
        catQuestions.forEach((q, index) => {
          allQuestions.push({
            category,
            question_key: q.key,
            label: q.label,
            sort_order: index,
            is_active: true,
          });
        });
      }

      const { data, error: insertError } = await supabase
        .from('scorecard_questions')
        .insert(allQuestions)
        .select();

      if (insertError) throw insertError;

      setQuestions(data || []);
      setHasSeeded(true);
      showSuccess('Default questions loaded successfully!');
    } catch (err: any) {
      console.error('Error seeding defaults:', err);
      setError(err.message || 'Failed to seed default questions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestionLabel.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      // Auto-generate key from label
      const key = newQuestionLabel
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 60);

      // Get next sort order
      const categoryQuestions = questions.filter(q => q.category === activeCategory);
      const maxOrder = categoryQuestions.length > 0
        ? Math.max(...categoryQuestions.map(q => q.sort_order))
        : -1;

      const { data, error: insertError } = await supabase
        .from('scorecard_questions')
        .insert({
          category: activeCategory,
          question_key: key + '_' + Date.now(), // Ensure uniqueness
          label: newQuestionLabel.trim(),
          sort_order: maxOrder + 1,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setQuestions(prev => [...prev, data]);
      setNewQuestionLabel('');
      showSuccess('Question added!');
    } catch (err: any) {
      console.error('Error adding question:', err);
      setError(err.message || 'Failed to add question');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditQuestion = async () => {
    if (!editingQuestion || !editLabel.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('scorecard_questions')
        .update({
          label: editLabel.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingQuestion.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? data : q));
      setEditingQuestion(null);
      setEditLabel('');
      showSuccess('Question updated!');
    } catch (err: any) {
      console.error('Error updating question:', err);
      setError(err.message || 'Failed to update question');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteQuestion = async (question: ScorecardQuestion) => {
    if (!window.confirm(`Delete this question?\n\n"${question.label}"\n\nThis cannot be undone. Existing answers using this question key will be preserved.`)) {
      return;
    }

    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('scorecard_questions')
        .delete()
        .eq('id', question.id);

      if (deleteError) throw deleteError;

      setQuestions(prev => prev.filter(q => q.id !== question.id));
      showSuccess('Question deleted');
    } catch (err: any) {
      console.error('Error deleting question:', err);
      setError(err.message || 'Failed to delete question');
    }
  };

  const handleMoveQuestion = async (question: ScorecardQuestion, direction: 'up' | 'down') => {
    const categoryQuestions = questions
      .filter(q => q.category === activeCategory)
      .sort((a, b) => a.sort_order - b.sort_order);

    const index = categoryQuestions.findIndex(q => q.id === question.id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categoryQuestions.length - 1) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const otherQuestion = categoryQuestions[swapIndex];

    // Swap sort orders
    try {
      await Promise.all([
        supabase
          .from('scorecard_questions')
          .update({ sort_order: otherQuestion.sort_order, updated_at: new Date().toISOString() })
          .eq('id', question.id),
        supabase
          .from('scorecard_questions')
          .update({ sort_order: question.sort_order, updated_at: new Date().toISOString() })
          .eq('id', otherQuestion.id),
      ]);

      setQuestions(prev => prev.map(q => {
        if (q.id === question.id) return { ...q, sort_order: otherQuestion.sort_order };
        if (q.id === otherQuestion.id) return { ...q, sort_order: question.sort_order };
        return q;
      }));
    } catch (err: any) {
      console.error('Error reordering questions:', err);
      setError('Failed to reorder questions');
    }
  };

  const activeCat = CATEGORIES.find(c => c.key === activeCategory)!;
  const filteredQuestions = questions
    .filter(q => q.category === activeCategory)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-400">Loading questions...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Error / Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-200 underline text-xs">dismiss</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
          {successMessage}
        </div>
      )}

      {/* Seed Defaults Button (only shown when no questions exist) */}
      {!hasSeeded && questions.length === 0 && (
        <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600 text-center">
          <p className="text-sm text-gray-300 mb-3">
            No scorecard questions found. Would you like to load the default questions?
          </p>
          <button
            onClick={seedDefaults}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Loading...' : 'Load Default Questions'}
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.key
                ? `${cat.bgClass} ${cat.textClass} border ${cat.borderClass}`
                : 'bg-gray-700/30 text-gray-400 hover:text-gray-300 hover:bg-gray-700/50 border border-transparent'
            }`}
          >
            {cat.label}
            <span className="ml-1.5 text-xs opacity-60">
              ({questions.filter(q => q.category === cat.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* Add New Question */}
      <div className="mb-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Add New Question to <span className={activeCat.textClass}>{activeCat.label}</span>
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g., Leader has personally invited someone in the last 30 days"
            value={newQuestionLabel}
            onChange={(e) => setNewQuestionLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={handleAddQuestion}
            disabled={!newQuestionLabel.trim() || isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
          >
            Add Question
          </button>
        </div>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-400 text-sm">No questions for {activeCat.label} yet.</p>
          <p className="text-gray-500 text-xs mt-1">Add one above or load the defaults.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQuestions.map((question, index) => (
            <div
              key={question.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                editingQuestion?.id === question.id
                  ? 'bg-blue-900/20 border-blue-500/40'
                  : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50'
              }`}
            >
              {/* Order indicator */}
              <span className="text-xs text-gray-600 w-6 text-center font-mono shrink-0">
                {index + 1}
              </span>

              {/* Reorder Buttons */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => handleMoveQuestion(question, 'up')}
                  disabled={index === 0}
                  className="p-0.5 text-gray-500 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleMoveQuestion(question, 'down')}
                  disabled={index === filteredQuestions.length - 1}
                  className="p-0.5 text-gray-500 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Question Label */}
              {editingQuestion?.id === question.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditQuestion();
                      if (e.key === 'Escape') { setEditingQuestion(null); setEditLabel(''); }
                    }}
                    autoFocus
                    className="flex-1 px-3 py-1.5 border border-blue-500/40 rounded-md bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleEditQuestion}
                    disabled={isSaving || !editLabel.trim()}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-md font-medium disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingQuestion(null); setEditLabel(''); }}
                    className="px-3 py-1.5 text-gray-400 hover:text-gray-200 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className="flex-1 text-sm text-gray-200 leading-snug">
                  {question.label}
                </span>
              )}

              {/* Action Buttons */}
              {editingQuestion?.id !== question.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingQuestion(question);
                      setEditLabel(question.label);
                    }}
                    className="p-1.5 rounded hover:bg-blue-500/20 transition-colors group"
                    title="Edit question"
                  >
                    <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(question)}
                    className="p-1.5 rounded hover:bg-red-500/20 transition-colors group"
                    title="Delete question"
                  >
                    <svg className="w-4 h-4 text-gray-500 group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info text */}
      <div className="mt-6 p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-400">How it works:</strong> These questions appear as yes/no observations 
          when evaluating a leader&apos;s scorecard. The number of &quot;yes&quot; answers determines the suggested score (1-5). 
          When a scorecard is saved, the questions and answers are recorded as a note on the leader&apos;s profile for historical reference.
          Editing or deleting a question here does not affect previously saved evaluations.
        </p>
      </div>
    </div>
  );
}
