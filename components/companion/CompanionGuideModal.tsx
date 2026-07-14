'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';

const INSTALL_COMMAND = 'curl -fsSL https://vccradius.netlify.app/companion/install.sh | bash';

interface CompanionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'update' when a companion is running but out of date; 'install' otherwise. */
  mode: 'install' | 'update';
  /** Live status string from the hook, e.g. "Running — up to date". */
  statusLabel?: string;
  /** Re-ping the companion so the user sees the result without leaving the guide. */
  onRecheck?: () => void;
  checking?: boolean;
  /** The python binary to add to Full Disk Access, for delivery tracking. */
  pythonPath?: string;
  /** Whether delivery tracking (Full Disk Access) is already granted. */
  deliveryTrackingOn?: boolean;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
        <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 text-[11px] font-semibold font-mono rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">
      {children}
    </kbd>
  );
}

function SubStep({ letter, children }: { letter: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[11px] font-bold flex items-center justify-center mt-0.5">
        {letter}
      </span>
      <div className="min-w-0 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{children}</div>
    </li>
  );
}

function CogIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function CompanionGuideModal({
  isOpen,
  onClose,
  mode,
  statusLabel,
  onRecheck,
  checking = false,
  pythonPath,
  deliveryTrackingOn,
}: CompanionGuideModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the command is visible for manual copy.
    }
  };

  const copyPath = async () => {
    if (!pythonPath) return;
    try {
      await navigator.clipboard.writeText(pythonPath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      // Clipboard blocked — the path is visible for manual copy.
    }
  };

  const isUpdate = mode === 'update';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isUpdate ? 'Update the Mac Companion' : 'Set up the Mac Companion'}
      size="lg"
    >
      <div className="space-y-5">
        {isUpdate ? (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Your companion is out of date.</span> The version on your
              Mac is missing an important fix — older versions could report messages as “sent” when
              they never actually went out. Run the update below before using Auto Send again. It takes
              about a minute and replaces the old version automatically.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            The Mac Companion is a small helper that runs in the background and lets RADIUS send
            iMessages through your Mac’s Messages app. You only have to set it up once. Follow these
            steps — no technical experience needed.
          </p>
        )}

        <ol className="space-y-4">
          <Step n={1} title="Open the Terminal app on your Mac">
            Press <Key>⌘ Command</Key> + <Key>Space</Key> to open Spotlight search. Type{' '}
            <span className="font-semibold">Terminal</span> and press <Key>Return</Key>. A small window
            with a text prompt will open. Terminal is a built-in Mac app — it’s already on your computer.
          </Step>

          <Step n={2} title="Copy the command">
            Click the <span className="font-semibold">Copy</span> button below.
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 min-w-0 text-xs font-mono text-emerald-700 dark:text-emerald-400 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg overflow-x-auto whitespace-nowrap">
                {INSTALL_COMMAND}
              </code>
              <button
                onClick={copy}
                className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </Step>

          <Step n={3} title="Paste it into Terminal and press Return">
            Click inside the Terminal window, press <Key>⌘ Command</Key> + <Key>V</Key> to paste, then
            press <Key>Return</Key>. You’ll see some text as it downloads and sets up — this takes a few
            seconds. When it finishes it will say{' '}
            <span className="font-semibold">“Done! Auto Send is ready in RADIUS.”</span>
          </Step>

          <Step n={4} title="Allow access to Messages if asked">
            The first time it runs, macOS may pop up a box asking if Terminal can control Messages. Click{' '}
            <span className="font-semibold">OK</span> (or <span className="font-semibold">Allow</span>).
            This is what lets RADIUS send from your Messages app. If you don’t see a popup, that’s fine —
            just continue.
          </Step>

          <Step n={5} title="Open Messages and make sure you’re signed in">
            Auto Send sends through the Messages app, so it needs to be open and signed in to iMessage.
            Open <span className="font-semibold">Messages</span>, then check{' '}
            <span className="font-semibold">Messages → Settings → iMessage</span> shows your account
            signed in and turned on.
          </Step>

          <Step n={6} title="Turn on delivery tracking (Full Disk Access)">
            {deliveryTrackingOn ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Delivery tracking is on — RADIUS will flag any text that doesn’t go through.
              </span>
            ) : (
              <>
                <p>
                  This lets RADIUS tell you which texts actually delivered — including ones to
                  non-iPhone numbers that quietly fail. It takes about 30 seconds:
                </p>

                <a
                  href="x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
                  className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  <CogIcon />
                  Open Full Disk Access settings
                </a>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Opens System Settings to the exact screen. If nothing happens, open it by hand:{' '}
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    System Settings → Privacy &amp; Security → Full Disk Access
                  </span>
                  .
                </p>

                <ol className="mt-3 space-y-2.5">
                  <SubStep letter="a">
                    Click the <span className="font-semibold">+</span> button, then confirm with your
                    Mac password or Touch ID if asked.
                  </SubStep>
                  <SubStep letter="b">
                    Press <Key>⌘ Command</Key> + <Key>⇧ Shift</Key> + <Key>G</Key>, paste this path,
                    and press <Key>Return</Key>:
                    {pythonPath && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <code className="flex-1 min-w-0 text-xs font-mono text-emerald-700 dark:text-emerald-400 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg overflow-x-auto whitespace-nowrap">
                          {pythonPath}
                        </code>
                        <button
                          onClick={copyPath}
                          className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                        >
                          {copiedPath ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </SubStep>
                  <SubStep letter="c">
                    <span className="font-mono text-xs">python</span> now shows up in the list — flip
                    its switch <span className="font-semibold">on</span>.
                  </SubStep>
                </ol>

                <p className="mt-2.5 text-xs text-gray-500 dark:text-gray-400">
                  🔒 This only ever reads delivery receipts — never the contents of your messages.
                </p>
              </>
            )}
          </Step>

          <Step n={7} title="Come back here and check the connection">
            Click <span className="font-semibold">Check again</span> below. When it shows{' '}
            <span className="font-semibold">“Running — up to date,”</span> you’re all set and can close
            this window.
          </Step>
        </ol>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Connection status
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {statusLabel || 'Not checked yet'}
            </p>
          </div>
          {onRecheck && (
            <button
              onClick={onRecheck}
              disabled={checking}
              className="flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Check again'}
            </button>
          )}
        </div>

        <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
            To reach non-iPhone (Android) numbers
          </p>
          <p className="text-sm text-blue-800/90 dark:text-blue-200/80 mt-0.5 leading-relaxed">
            Turn on <span className="font-semibold">Text Message Forwarding</span> on your iPhone
            (Settings → Messages → Text Message Forwarding → enable your Mac). RADIUS then sends iMessage
            to Apple users and automatically a green text message to everyone else — so every recipient
            gets it. Without this, your Mac can only send to iMessage users.
          </p>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Still not connecting? Restart your Mac, open the Messages app, then click “Check again.” The
          companion starts automatically every time you log in — you won’t need to repeat these steps.
        </p>
      </div>
    </Modal>
  );
}
