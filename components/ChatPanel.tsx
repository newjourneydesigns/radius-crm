"use client";

import { useEffect, useRef, useState } from "react";
import MicButton from "./MicButton";
import { useSpeech } from "@/hooks/useSpeech";
import { ChatMessage } from "@/lib/types";

function renderText(text: string) {
  // Minimal emphasis: **bold** only, one line break per \n.
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith("**") ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={j}>{part}</span>
        )
      )}
    </span>
  ));
}

export default function ChatPanel({
  messages,
  thinking,
  onSend,
  allowPhoto,
  placeholder,
  micSize = "lg",
  listHeightClass = "flex-1 min-h-0",
  suggestions = [],
  suggestionMode = "send",
}: {
  messages: ChatMessage[];
  thinking: boolean;
  onSend: (text: string, source: "user_text" | "user_voice", image?: string) => void;
  allowPhoto?: boolean;
  placeholder: string;
  micSize?: "lg" | "md";
  /** Cap the transcript height (game screen keeps the scoreboard visible). */
  listHeightClass?: string;
  /** Tappable answers to the scorekeeper's last question. */
  suggestions?: (string | { label: string; value: string })[];
  /** "send" fires the answer immediately; "compose" builds a list in the input. */
  suggestionMode?: "send" | "compose";
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech((transcript) => onSend(transcript, "user_voice"));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, thinking]);

  const submit = () => {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    onSend(text, "user_text");
  };

  const chips = suggestions.map((s) =>
    typeof s === "string" ? { label: s, value: s } : s
  );

  const tapSuggestion = (value: string) => {
    if (thinking) return;
    if (suggestionMode === "compose") {
      setDraft((d) => {
        const parts = d.split(",").map((x) => x.trim()).filter(Boolean);
        const incoming = value
          .split(",")
          .map((x) => x.trim())
          .filter(
            (x) => x && !parts.some((p) => p.toLowerCase() === x.toLowerCase())
          );
        return [...parts, ...incoming].join(", ");
      });
      inputRef.current?.focus();
    } else {
      onSend(value, "user_text");
    }
  };

  const onPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () =>
      onSend("Here's a photo of our game — check the scores.", "user_text", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className={`${listHeightClass} space-y-3 overflow-y-auto py-4`}
        aria-live="polite"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
              m.role === "user"
                ? "ml-auto rounded-br-sm bg-felt-3 text-ink"
                : "mr-auto rounded-bl-sm bg-card text-card-ink shadow-cardstock"
            }`}
          >
            {renderText(m.text)}
          </div>
        ))}
        {thinking && (
          <div className="mr-auto rounded-2xl rounded-bl-sm bg-card px-4 py-2.5 text-card-dim shadow-cardstock">
            <span className="inline-block animate-pulse">thinking…</span>
          </div>
        )}
        {speech.listening && (
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-dashed border-gold/60 px-4 py-2.5 text-ink-dim">
            {speech.interim || "listening…"}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t felt-line bg-felt/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        {chips.length > 0 && !thinking && !speech.listening && (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Quick answers">
            {chips.map((s) => (
              <button
                key={s.label}
                type="button"
                data-testid="suggestion-chip"
                onClick={() => tapSuggestion(s.value)}
                className="rounded-full border border-gold/40 bg-felt-2 px-4 py-2 text-sm text-gold active:bg-felt-3"
              >
                {suggestionMode === "compose" ? `+ ${s.label}` : s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <MicButton
            listening={speech.listening}
            supported={speech.supported}
            onStart={speech.start}
            onStop={speech.stop}
            size={micSize}
          />
          <div className="flex flex-1 items-center gap-2 rounded-full bg-felt-2 px-4 py-2.5 ring-1 ring-inset ring-ink/10 focus-within:ring-gold/60">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={placeholder}
              aria-label="Message the scorekeeper"
              enterKeyHint="send"
              autoComplete="off"
              autoCapitalize="sentences"
              className="w-full min-w-0 bg-transparent text-[16px] text-ink placeholder:text-ink-dim/70 focus:outline-none"
            />
            {allowPhoto && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPhoto(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  aria-label="Photograph the game"
                  title="Photograph the board or scoreboard"
                  onClick={() => fileRef.current?.click()}
                  className="-m-2 p-2 text-ink-dim hover:text-gold"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                    <path d="M3 8a2 2 0 0 1 2-2h1.5l1.2-1.8A2 2 0 0 1 9.4 3h5.2a2 2 0 0 1 1.7 1.2L17.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
                    <circle cx="12" cy="12.5" r="3.5" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || thinking}
              aria-label="Send"
              className="-m-2 p-2 font-display text-sm font-bold uppercase tracking-wide text-gold disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
