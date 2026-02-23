'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  elapsedSeconds: number;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  reconnected: boolean;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reconnected, setReconnected] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldBeListeningRef = useRef(false);
  // Text accumulated from previous auto-restart sessions
  const previousSessionsTextRef = useRef('');
  // Final text from the CURRENT recognition session (rebuilt from event.results each time)
  const currentSessionFinalRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Check browser support
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
      if (recognitionRef.current) {
        shouldBeListeningRef.current = false;
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showReconnected = useCallback(() => {
    setReconnected(true);
    if (reconnectedTimerRef.current) clearTimeout(reconnectedTimerRef.current);
    reconnectedTimerRef.current = setTimeout(() => setReconnected(false), 2000);
  }, []);

  const createRecognition = useCallback(() => {
    if (!isSupported) return null;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Rebuild the FULL transcript for this session from event.results each time.
      // The Web Speech API gives us ALL results (final + interim) from session start
      // on every event, so we must NOT accumulate — just rebuild.
      let sessionFinal = '';
      let sessionInterim = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          sessionFinal += result[0].transcript;
        } else {
          sessionInterim += result[0].transcript;
        }
      }

      // Store this session's final text (for preserving across auto-restarts)
      currentSessionFinalRef.current = sessionFinal.trim();

      // Combine: previous sessions + this session's final + this session's interim
      const prev = previousSessionsTextRef.current;
      const currentFull = (sessionFinal + ' ' + sessionInterim).trim();
      const display = prev + (prev && currentFull ? ' ' : '') + currentFull;
      setTranscript(display.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are normal — don't treat as fatal
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      
      console.warn('Speech recognition error:', event.error);
      // For 'not-allowed' or 'service-not-available', stop completely
      if (event.error === 'not-allowed' || event.error === 'service-not-available') {
        shouldBeListeningRef.current = false;
        setIsListening(false);
        stopTimer();
      }
    };

    recognition.onend = () => {
      // Preserve this session's final text before restarting
      if (currentSessionFinalRef.current) {
        const prev = previousSessionsTextRef.current;
        previousSessionsTextRef.current = prev + (prev ? ' ' : '') + currentSessionFinalRef.current;
        currentSessionFinalRef.current = '';
      }

      // Auto-restart if we should still be listening (silence timeout, network blip, etc.)
      if (shouldBeListeningRef.current) {
        showReconnected();
        try {
          // Small delay to avoid rapid restart loops
          setTimeout(() => {
            if (shouldBeListeningRef.current) {
              const newRecognition = createRecognition();
              if (newRecognition) {
                recognitionRef.current = newRecognition;
                newRecognition.start();
              }
            }
          }, 300);
        } catch (err) {
          console.warn('Failed to restart speech recognition:', err);
          shouldBeListeningRef.current = false;
          setIsListening(false);
          stopTimer();
        }
      } else {
        setIsListening(false);
        stopTimer();
      }
    };

    return recognition;
  }, [isSupported, stopTimer, showReconnected]);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    // Reset state
    previousSessionsTextRef.current = '';
    currentSessionFinalRef.current = '';
    setTranscript('');
    shouldBeListeningRef.current = true;
    setIsListening(true);
    startTimer();

    const recognition = createRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (err) {
        console.warn('Failed to start speech recognition:', err);
        shouldBeListeningRef.current = false;
        setIsListening(false);
        stopTimer();
      }
    }
  }, [isSupported, createRecognition, startTimer, stopTimer]);

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    stopTimer();
  }, [stopTimer]);

  const resetTranscript = useCallback(() => {
    previousSessionsTextRef.current = '';
    currentSessionFinalRef.current = '';
    setTranscript('');
    setElapsedSeconds(0);
  }, []);

  return {
    isListening,
    transcript,
    elapsedSeconds,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    reconnected,
  };
}
