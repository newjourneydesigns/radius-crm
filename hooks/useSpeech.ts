"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechAPI {
  new (): {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((e: any) => void) | null;
    onend: (() => void) | null;
    onerror: ((e: any) => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  };
}

function getSpeechAPI(): SpeechAPI | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Web Speech API wrapper. `onFinal` fires once with the finished utterance;
 * `interim` streams the in-progress transcript for live UI feedback.
 */
export function useSpeech(onFinal: (transcript: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<InstanceType<SpeechAPI> | null>(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getSpeechAPI() !== null);
    return () => recRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const API = getSpeechAPI();
    if (!API || recRef.current) return;
    const rec = new API();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    finalRef.current = "";
    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText || finalRef.current);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
      const text = finalRef.current.trim();
      if (text) onFinalRef.current(text);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  return { supported, listening, interim, start, stop };
}
