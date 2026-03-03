'use client';

// =============================================================
// RadiusAssistant — Floating AI Chat Widget
// =============================================================
// A floating chat bubble (bottom-right) that expands into a
// slide-out chat drawer. Also supports a full-page mode via
// the /assistant route.
//
// Uses inline styles extensively to escape the global CSS
// !important overrides on buttons, backgrounds, etc.
// =============================================================

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useRadiusAssistant, ChatMessage } from '../../hooks/useRadiusAssistant';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useAuth } from '../../contexts/AuthContext';

// ---- Inline style constants (escape global CSS !important) ----

const COLORS = {
  bg: '#0b2545',
  bgLight: '#0e3060',
  bgCard: 'rgba(14, 48, 96, 0.95)',
  border: 'rgba(141, 169, 196, 0.3)',
  borderLight: 'rgba(141, 169, 196, 0.15)',
  text: '#eef4ed',
  textMuted: '#8da9c4',
  accent: '#3b82f6',
  accentHover: '#2563eb',
  userBubble: '#1d4ed8',
  assistantBubble: 'rgba(14, 48, 96, 0.9)',
  error: '#ef4444',
  success: '#22c55e',
};

// ---- Component ----

interface RadiusAssistantProps {
  fullPage?: boolean; // If true, renders as full-page instead of floating
}

export default function RadiusAssistant({ fullPage = false }: RadiusAssistantProps) {
  const { user } = useAuth();
  const router = useRouter();
  const {
    messages,
    isLoading,
    sendMessage,
    startNewConversation,
    isReady,
  } = useRadiusAssistant();

  const {
    isListening,
    transcript,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const [isOpen, setIsOpen] = useState(fullPage);
  const [inputText, setInputText] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Mobile detection
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Toggle body class to hide mobile tab bar when chat is open
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.classList.add('ai-chat-open');
    } else {
      document.body.classList.remove('ai-chat-open');
    }
    return () => document.body.classList.remove('ai-chat-open');
  }, [isMobile, isOpen]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle voice transcript → input field
  useEffect(() => {
    if (transcript) {
      setInputText(transcript);
    }
  }, [transcript]);

  // Handle send
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    resetTranscript();
    if (isListening) stopListening();
    await sendMessage(text);
  }, [inputText, isLoading, sendMessage, resetTranscript, isListening, stopListening]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Toggle voice
  const handleVoiceToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  }, [isListening, startListening, stopListening, resetTranscript]);

  // Expand to full page
  const handleExpand = useCallback(() => {
    setIsOpen(false);
    router.push('/assistant');
  }, [router]);

  // Close drawer
  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (isListening) stopListening();
  }, [isListening, stopListening]);

  // Don't render for non-authenticated users
  if (!user || !isReady) return null;

  // ---- Inject styles into head (portal) to override globals ----
  const styleContent = `
    .radius-assistant-container * {
      box-sizing: border-box;
    }
    .radius-assistant-container button {
      background-color: transparent !important;
      border: none !important;
      border-radius: 8px !important;
      color: ${COLORS.text} !important;
      font-weight: 500 !important;
      letter-spacing: normal !important;
      transform: none !important;
      filter: none !important;
      transition: all 0.15s ease !important;
    }
    .radius-assistant-container button:hover {
      transform: none !important;
      filter: none !important;
    }
    .radius-assistant-container textarea {
      background-color: ${COLORS.bgLight} !important;
      color: ${COLORS.text} !important;
      border: 1px solid ${COLORS.border} !important;
      border-radius: 12px !important;
    }
    .radius-assistant-container textarea:focus {
      outline: none !important;
      border-color: ${COLORS.accent} !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3) !important;
    }
    .radius-assistant-container textarea::placeholder {
      color: ${COLORS.textMuted} !important;
    }
    .radius-chat-trigger {
      background: linear-gradient(135deg, #1d4ed8, #3b82f6) !important;
      border: 2px solid rgba(255,255,255,0.15) !important;
      border-radius: 50% !important;
      box-shadow: 0 4px 20px rgba(29, 78, 216, 0.5), 0 0 40px rgba(59, 130, 246, 0.2) !important;
      color: white !important;
      transform: none !important;
      filter: none !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .radius-chat-trigger:hover {
      transform: scale(1.08) !important;
      filter: none !important;
      box-shadow: 0 6px 28px rgba(29, 78, 216, 0.6), 0 0 50px rgba(59, 130, 246, 0.3) !important;
    }
    .radius-send-btn {
      background-color: ${COLORS.accent} !important;
      border-radius: 50% !important;
      color: white !important;
    }
    .radius-send-btn:hover {
      background-color: ${COLORS.accentHover} !important;
    }
    .radius-send-btn:disabled {
      background-color: rgba(59, 130, 246, 0.3) !important;
      cursor: not-allowed !important;
    }
    .radius-voice-btn {
      background-color: transparent !important;
      border-radius: 50% !important;
    }
    .radius-voice-btn:hover {
      background-color: rgba(141, 169, 196, 0.15) !important;
    }
    .radius-voice-btn.recording {
      background-color: rgba(239, 68, 68, 0.15) !important;
      animation: radius-pulse 1.5s ease-in-out infinite !important;
    }
    .radius-header-btn {
      background-color: rgba(141, 169, 196, 0.1) !important;
      border-radius: 8px !important;
      padding: 6px !important;
    }
    .radius-header-btn:hover {
      background-color: rgba(141, 169, 196, 0.2) !important;
    }
    .radius-new-chat-btn {
      background-color: rgba(59, 130, 246, 0.1) !important;
      border: 1px solid rgba(59, 130, 246, 0.3) !important;
      border-radius: 8px !important;
      color: ${COLORS.accent} !important;
      padding: 4px 12px !important;
      font-size: 12px !important;
    }
    .radius-new-chat-btn:hover {
      background-color: rgba(59, 130, 246, 0.2) !important;
    }
    @keyframes radius-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
    }
    @keyframes radius-typing-dot {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    .radius-typing-dot {
      animation: radius-typing-dot 1.4s ease-in-out infinite;
    }
    .radius-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .radius-typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes radius-slide-in-mobile {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes radius-slide-in-desktop {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;

  // ---- Chat drawer content ----
  const chatContent = (
    <div
      className="radius-assistant-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: fullPage ? (isMobile ? '100%' : 'calc(100vh - 140px)') : '100%',
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? 'max(14px, env(safe-area-inset-top)) 16px 14px 16px' : '14px 16px',
          borderBottom: `1px solid ${COLORS.borderLight}`,
          backgroundColor: COLORS.bgCard,
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Image
            src="/icon-32x32.png"
            alt="Radius"
            width={28}
            height={28}
            style={{ borderRadius: '6px' }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', lineHeight: '1.2' }}>Radius</div>
            <div style={{ fontSize: '11px', color: COLORS.textMuted, lineHeight: '1.2' }}>
              AI Assistant
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {messages.length > 0 && (
            <button
              className="radius-new-chat-btn"
              onClick={startNewConversation}
              title="New conversation"
            >
              New Chat
            </button>
          )}
          {!fullPage && (
            <>
              <button className="radius-header-btn" onClick={handleExpand} title="Open full page">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button className="radius-header-btn" onClick={handleClose} title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && !isLoading && (
          <WelcomeMessage userName={user.name?.split(' ')[0] || 'there'} />
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: isMobile ? '12px 16px max(12px, env(safe-area-inset-bottom))' : '12px 16px',
          borderTop: `1px solid ${COLORS.borderLight}`,
          backgroundColor: COLORS.bgCard,
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          {/* Voice button */}
          {voiceSupported && (
            <button
              className={`radius-voice-btn ${isListening ? 'recording' : ''}`}
              onClick={handleVoiceToggle}
              title={isListening ? 'Stop listening' : 'Voice input'}
              style={{ padding: '8px', flexShrink: 0 }}
            >
              {isListening ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="#ef4444" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening...' : 'Ask Radius anything...'}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              padding: '10px 14px',
              fontSize: '14px',
              lineHeight: '1.4',
              minHeight: '40px',
              maxHeight: '120px',
              overflow: 'auto',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />

          {/* Send button */}
          <button
            className="radius-send-btn"
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            title="Send message"
            style={{ padding: '8px', flexShrink: 0, width: '36px', height: '36px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {isListening && (
          <div
            style={{
              fontSize: '11px',
              color: COLORS.error,
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: COLORS.error,
                display: 'inline-block',
                animation: 'radius-pulse 1.5s ease-in-out infinite',
              }}
            />
            Listening... speak now
          </div>
        )}
      </div>
    </div>
  );

  // ---- Full page mode ----
  if (fullPage) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styleContent }} />
        <div
          style={isMobile ? {
            width: '100%',
            height: '100dvh',
            overflow: 'hidden',
          } : {
            maxWidth: '800px',
            margin: '0 auto',
            height: 'calc(100vh - 140px)',
            borderRadius: '16px',
            overflow: 'hidden',
            border: `1px solid ${COLORS.border}`,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          {chatContent}
        </div>
      </>
    );
  }

  // ---- Floating mode (portal to body) ----
  if (!mounted) return null;

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: styleContent }} />

      {/* Floating trigger button */}
      {!isOpen && (
        <button
          className="radius-chat-trigger"
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: isMobile ? 'calc(70px + env(safe-area-inset-bottom, 0px) + 8px)' : '80px',
            right: '16px',
            zIndex: 9998,
            width: '56px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '0',
          }}
          title="Chat with Radius"
          aria-label="Open Radius AI Assistant"
        >
          <Image
            src="/icon-32x32.png"
            alt="Radius"
            width={30}
            height={30}
            style={{ borderRadius: '4px', pointerEvents: 'none' }}
          />
        </button>
      )}

      {/* Chat drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: isMobile ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',
              zIndex: isMobile ? 10001 : 9998,
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Drawer */}
          <div
            ref={drawerRef}
            className="radius-assistant-container"
            style={isMobile ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100dvh',
              zIndex: 10002,
              borderRadius: 0,
              overflow: 'hidden',
              animation: 'radius-slide-in-mobile 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            } : {
              position: 'fixed',
              bottom: 0,
              right: 0,
              width: '100%',
              maxWidth: '420px',
              height: '85vh',
              maxHeight: '700px',
              zIndex: 9999,
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '0',
              borderBottomLeftRadius: '0',
              borderBottomRightRadius: '0',
              overflow: 'hidden',
              boxShadow: '-4px 0 32px rgba(0, 0, 0, 0.4)',
              border: `1px solid ${COLORS.border}`,
              borderRight: 'none',
              borderBottom: 'none',
              animation: 'radius-slide-in-desktop 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {chatContent}
          </div>


        </>
      )}
    </>,
    document.body
  );
}

// ---- Sub-components ----

function WelcomeMessage({ userName }: { userName: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(29, 78, 216, 0.4)',
        }}
      >
        <Image src="/icon-32x32.png" alt="Radius" width={36} height={36} style={{ borderRadius: '6px' }} />
      </div>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>
          Hey {userName}! I&apos;m Radius.
        </div>
        <div style={{ fontSize: '13px', color: COLORS.textMuted, lineHeight: '1.5' }}>
          I can help you manage your circles. Try asking me things like:
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          width: '100%',
          maxWidth: '320px',
        }}
      >
        {[
          '"Remind me tomorrow to call John Smith"',
          '"When does John Smith\'s circle meet?"',
          '"Add a note that John\'s mom is in the hospital"',
          '"Show me my upcoming todos"',
          '"Schedule a visit to John\'s circle next Tuesday"',
        ].map((example, i) => (
          <div
            key={i}
            style={{
              fontSize: '12px',
              color: COLORS.accent,
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: `1px solid rgba(59, 130, 246, 0.15)`,
              borderRadius: '8px',
              padding: '8px 12px',
              textAlign: 'left',
            }}
          >
            {example}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          backgroundColor: isUser ? COLORS.userBubble : COLORS.assistantBubble,
          border: isUser ? 'none' : `1px solid ${COLORS.borderLight}`,
          fontSize: '14px',
          lineHeight: '1.5',
          color: COLORS.text,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {/* Tool action badge */}
        {message.toolAction && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: COLORS.success,
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '4px',
              padding: '2px 8px',
              marginBottom: '6px',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {getActionLabel(message.toolAction)}
          </div>
        )}

        <MarkdownLite text={message.content} />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '16px 16px 16px 4px',
          backgroundColor: COLORS.assistantBubble,
          border: `1px solid ${COLORS.borderLight}`,
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="radius-typing-dot"
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: COLORS.textMuted,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Lightweight markdown renderer ----

function MarkdownLite({ text }: { text: string }) {
  // Simple markdown: **bold**, *italic*, `code`, bullet points, line breaks
  const lines = text.split('\n');

  return (
    <div>
      {lines.map((line, i) => {
        if (!line.trim()) {
          return <div key={i} style={{ height: '8px' }} />;
        }

        // Bullet points
        if (line.match(/^[\s]*[-•]\s/)) {
          const content = line.replace(/^[\s]*[-•]\s/, '');
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
              <span style={{ color: COLORS.textMuted }}>•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(content) }} />
            </div>
          );
        }

        // Numbered lists
        if (line.match(/^[\s]*\d+\.\s/)) {
          const match = line.match(/^[\s]*(\d+)\.\s(.*)/);
          if (match) {
            return (
              <div key={i} style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
                <span style={{ color: COLORS.textMuted, minWidth: '16px' }}>{match[1]}.</span>
                <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(match[2]) }} />
              </div>
            );
          }
        }

        return <div key={i} dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />;
      })}
    </div>
  );
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, `<code style="background:rgba(141,169,196,0.15);padding:1px 5px;border-radius:3px;font-size:12px;">$1</code>`);
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'created_todo':
      return 'Todo created';
    case 'completed_todo':
      return 'Todo completed';
    case 'added_note':
      return 'Note added';
    case 'scheduled_visit':
      return 'Visit scheduled';
    default:
      return 'Action taken';
  }
}
