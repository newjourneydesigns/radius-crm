'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

interface DictateAndSummarizeProps {
  text: string;
  onTextChange: (newText: string) => void;
  disabled?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function DictateAndSummarize({ text, onTextChange, disabled }: DictateAndSummarizeProps) {
  const {
    isListening,
    transcript,
    elapsedSeconds,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    reconnected,
  } = useSpeechRecognition();

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState('');
  const [preRecordingText, setPreRecordingText] = useState('');
  const [pendingSummary, setPendingSummary] = useState('');
  const [rawTextBeforeSummary, setRawTextBeforeSummary] = useState('');

  // When transcript updates during recording, append it to whatever text existed before recording started
  useEffect(() => {
    if (isListening && transcript) {
      const separator = preRecordingText.length > 0 ? '\n\n' : '';
      onTextChange(preRecordingText + separator + transcript);
    }
  }, [transcript, isListening, preRecordingText, onTextChange]);

  const handleToggleRecording = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      setSummarizeError('');
      // Remember the current text so we can append the transcript to it
      setPreRecordingText(text);
      resetTranscript();
      startListening();
    }
  }, [isListening, text, startListening, stopListening, resetTranscript]);

  const handleSummarize = useCallback(async () => {
    if (!text.trim() || isSummarizing) return;

    // Stop recording first if active
    if (isListening) {
      stopListening();
      // Give a moment for the final transcript to flush
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsSummarizing(true);
    setSummarizeError('');

    try {
      const payload = { text: text.trim() };
      console.log('[DictateAndSummarize] Sending to /api/ai-summarize:', payload);
      const response = await fetch('/api/ai-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setSummarizeError(data.error || 'Failed to summarize. Please try again.');
        return;
      }

      if (data.summary) {
        // Store summary for preview — don't replace textarea yet
        setRawTextBeforeSummary(text.trim());
        setPendingSummary(data.summary);
      }
    } catch (err) {
      setSummarizeError('Network error. Please check your connection and try again.');
      console.error('Summarize error:', err);
    } finally {
      setIsSummarizing(false);
    }
  }, [text, isSummarizing, isListening, stopListening, onTextChange]);

  const handleUseSummary = useCallback(() => {
    onTextChange(pendingSummary);
    setPendingSummary('');
    setRawTextBeforeSummary('');
  }, [pendingSummary, onTextChange]);

  const handleKeepBoth = useCallback(() => {
    const merged = rawTextBeforeSummary + '\n\n---\n' + pendingSummary + '\n---';
    onTextChange(merged);
    setPendingSummary('');
    setRawTextBeforeSummary('');
  }, [rawTextBeforeSummary, pendingSummary, onTextChange]);

  const handleDismissSummary = useCallback(() => {
    setPendingSummary('');
    setRawTextBeforeSummary('');
  }, []);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Dictate button — only show if browser supports it */}
        {isSupported && (
          <button
            type="button"
            onClick={handleToggleRecording}
            disabled={disabled || isSummarizing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all
              ${isListening
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/50'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isListening ? (
              <>
                {/* Pulsing red dot */}
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                </span>
                <span>{formatTime(elapsedSeconds)}</span>
                <span className="hidden sm:inline">— Tap to stop</span>
              </>
            ) : (
              <>
                {/* Microphone icon */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span className="hidden sm:inline">Dictate</span>
              </>
            )}
          </button>
        )}

        {/* Reconnected indicator */}
        {reconnected && (
          <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">
            reconnected
          </span>
        )}

        {/* AI Summarize button */}
        <button
          type="button"
          onClick={handleSummarize}
          disabled={disabled || !text.trim() || isSummarizing || isListening}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all
            bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 
            border border-violet-300 dark:border-violet-700
            hover:bg-violet-200 dark:hover:bg-violet-900/50
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSummarizing ? (
            <>
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-violet-400 border-t-transparent"></div>
              <span>Summarizing...</span>
            </>
          ) : (
            <>
              {/* Sparkle icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              <span className="hidden sm:inline">AI Summarize</span>
              <span className="sm:hidden">AI</span>
            </>
          )}
        </button>

        {/* Browser support note */}
        {!isSupported && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Voice dictation requires Chrome, Edge, or Safari
          </span>
        )}
      </div>

      {/* Error message */}
      {summarizeError && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 p-2.5 bg-red-50 dark:bg-red-900/20 rounded-md">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{summarizeError}</span>
        </div>
      )}

      {/* Recording status helper text */}
      {isListening && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Speak clearly — your words will appear in the text box. Tap the button or press Escape to stop.
        </p>
      )}

      {/* AI Summary Preview Card */}
      {pendingSummary && (
        <div className="border border-violet-300 dark:border-violet-700 rounded-lg overflow-hidden bg-violet-50 dark:bg-violet-900/20">
          {/* Preview header */}
          <div className="flex items-center justify-between px-3 py-2 bg-violet-100 dark:bg-violet-900/40 border-b border-violet-200 dark:border-violet-700">
            <div className="flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Summary Preview
            </div>
            <button
              type="button"
              onClick={handleDismissSummary}
              className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary content */}
          <div className="px-3 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {pendingSummary}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 px-3 py-2.5 border-t border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20">
            <button
              type="button"
              onClick={handleUseSummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md
                bg-violet-600 hover:bg-violet-700 text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Use Summary
            </button>
            <button
              type="button"
              onClick={handleKeepBoth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md
                bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 
                text-gray-700 dark:text-gray-200 transition-colors"
            >
              Keep Both
            </button>
            <button
              type="button"
              onClick={handleDismissSummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md
                text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
