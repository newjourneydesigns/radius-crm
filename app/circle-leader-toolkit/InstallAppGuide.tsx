'use client';

import type { ReactNode } from 'react';
import { useInstallEnv, promptInstall, type InstallEnv } from '../../lib/circle-leader-toolkit/installEnv';

// Platform-aware "Add to Home Screen" instructions, shared by onboarding and
// notification settings. It shows only the path that applies to the current
// device — and, crucially, catches the "you're in an in-app browser, open in
// Safari first" case that silently breaks most first-time iPhone installs.
//
// The parent supplies the surrounding heading/context; this renders just the
// actionable steps (plus a one-tap Install button on Android/desktop when the
// browser offers a native prompt).

// ── Inline glyphs ─────────────────────────────────────────────────────────
function ShareGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  // iOS share icon: a box with an up-arrow.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8 7 4-4 4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

function AddBoxGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  // "Add to Home Screen" row icon: a rounded square with a plus.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6M9 12h6" />
    </svg>
  );
}

function DotsGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  // Android Chrome overflow menu (⋮).
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function CompassGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

// ── Step list ─────────────────────────────────────────────────────────────
type StepItem = { text: ReactNode };

function Steps({ label, steps }: { label: string; steps: StepItem[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#1f7320]">{label}</p>
      <ol className="mt-2.5 space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#34B233] text-[11px] font-extrabold italic text-white">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-neutral-700">{step.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Inline chip that renders an icon + label together inside a step sentence, so
// "tap Share" points at the actual glyph the user is hunting for.
function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 align-middle text-[13px] font-semibold text-neutral-800 ring-1 ring-neutral-200">
      <span className="text-[#1f7320]">{icon}</span>
      {children}
    </span>
  );
}

const IOS_SAFARI_STEPS: StepItem[] = [
  { text: <>Tap <Chip icon={<ShareGlyph className="h-3.5 w-3.5" />}>Share</Chip> at the bottom of Safari.</> },
  { text: <>Scroll down and tap <Chip icon={<AddBoxGlyph className="h-3.5 w-3.5" />}>Add to Home Screen</Chip>.</> },
  { text: <>If you see an <strong className="font-bold text-neutral-900">Open as Web App</strong> switch, leave it <strong className="font-bold text-neutral-900">on</strong> — that&apos;s what turns on notifications.</> },
  { text: <>Tap <strong className="font-bold text-neutral-900">Add</strong>, then open <strong className="font-bold text-neutral-900">Circles</strong> from your new icon.</> },
];

export default function InstallAppGuide({
  className = '',
  env: envOverride,
}: {
  className?: string;
  /** Force a specific environment (used by the preview harness/tests). Defaults to live detection. */
  env?: InstallEnv;
}) {
  const detected = useInstallEnv();
  const env = envOverride ?? detected;

  // Already installed — reassure and stop.
  if (env.isStandalone) {
    return (
      <div className={`flex items-start gap-2 rounded-2xl border border-[#34B233]/30 bg-[#34B233]/10 p-3 ${className}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#1f7320" strokeWidth={2.2} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        <p className="text-sm font-semibold text-neutral-800">You&apos;re using the installed app — you&apos;re all set.</p>
      </div>
    );
  }

  const shell = `rounded-2xl border border-[#34B233]/25 bg-[#34B233]/[0.06] p-4 space-y-3.5 ${className}`;

  // iOS, but not in Safari (in-app browser or Chrome/Firefox iOS): the only
  // reliable path is to reopen the link in Safari first.
  if (env.needsSafari) {
    return (
      <div className={shell}>
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="mt-0.5 shrink-0 text-amber-700"><CompassGlyph /></span>
          <div>
            <p className="text-sm font-bold text-amber-900">Open in Safari first</p>
            <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
              You&apos;re viewing this inside another app. Tap the <strong className="font-bold">•••</strong> or browser
              icon and choose <strong className="font-bold">Open in Safari</strong> — then you can add Circles to your Home Screen.
            </p>
          </div>
        </div>
        <Steps label="Once you're in Safari" steps={IOS_SAFARI_STEPS} />
      </div>
    );
  }

  // iOS Safari: the canonical Share → Add to Home Screen flow.
  if (env.isIOS) {
    return (
      <div className={shell}>
        <Steps label="On your iPhone or iPad" steps={IOS_SAFARI_STEPS} />
      </div>
    );
  }

  // Android / desktop: offer the real one-tap install when the browser gives us
  // a native prompt, with the manual menu path as a fallback.
  const manualSteps: StepItem[] = env.isAndroid
    ? [
        { text: <>Tap the <Chip icon={<DotsGlyph className="h-3.5 w-3.5" />}>menu</Chip> at the top-right of Chrome.</> },
        { text: <>Tap <strong className="font-bold text-neutral-900">Install app</strong> (or <strong className="font-bold text-neutral-900">Add to Home screen</strong>).</> },
        { text: <>Tap <strong className="font-bold text-neutral-900">Install</strong>, then open <strong className="font-bold text-neutral-900">Circles</strong> from your Home Screen.</> },
      ]
    : [
        { text: <>Click the <strong className="font-bold text-neutral-900">install icon</strong> (a monitor with a down-arrow) at the right of the address bar.</> },
        { text: <>Choose <strong className="font-bold text-neutral-900">Install</strong> — Circles opens in its own window and pins to your dock or taskbar.</> },
      ];

  return (
    <div className={shell}>
      {env.canPrompt && (
        <button
          type="button"
          onClick={() => promptInstall()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#34B233] px-5 text-sm font-extrabold text-white shadow-sm ring-1 ring-[#2ca52b]/20 transition-colors hover:bg-[#2fa62e]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Install the Circles app
        </button>
      )}
      <Steps
        label={env.canPrompt ? 'Or install it by hand' : env.isAndroid ? 'On Android' : 'On this computer'}
        steps={manualSteps}
      />
    </div>
  );
}
