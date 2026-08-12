'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useMacCompanion,
  COMPANION_BASE,
  COMPANION_VERSION,
  CompanionPreflightResult,
  CompanionVerifyCapability,
} from '../../hooks/useMacCompanion';
import CompanionGuideModal from '../companion/CompanionGuideModal';

const INSTALL_COMMAND = 'curl -fsSL https://vccradius.netlify.app/companion/install.sh | bash';
const TEST_PHONE_KEY = 'radius_autosend_test_phone';

type CheckState = 'pass' | 'fail' | 'warn' | 'unknown';

function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'pass') {
    return (
      <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (state === 'fail') {
    return (
      <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (state === 'warn') {
    return (
      <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

function CheckRow({ state, label, detail }: { state: CheckState; label: string; detail?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <CheckIcon state={state} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {detail && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{detail}</div>}
      </div>
    </li>
  );
}

type TestPhase = 'idle' | 'preflight' | 'sending' | 'verifying' | 'done';
interface TestResult {
  sent: boolean;
  service?: string | null;
  error?: string;
  delivery?: 'delivered' | 'failed' | 'unconfirmed' | 'skipped';
}

export default function AutoSendManager() {
  const companion = useMacCompanion();
  const { recheck, preflight, send, verify, verifyCapable } = companion;

  const [checking, setChecking] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [preflightRes, setPreflightRes] = useState<CompanionPreflightResult | null>(null);
  const [fda, setFda] = useState<CompanionVerifyCapability | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const [showGuide, setShowGuide] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);

  const [testPhone, setTestPhone] = useState('');
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const testCancelledRef = useRef(false);

  useEffect(() => {
    setTestPhone(localStorage.getItem(TEST_PHONE_KEY) || '');
    return () => {
      testCancelledRef.current = true;
    };
  }, []);

  const runChecks = useCallback(async () => {
    setChecking(true);
    await recheck();
    // Each of these fails fast when the server isn't running, so it's safe to
    // fire them unconditionally and let the UI gate on availability.
    const [ver, pre, cap] = await Promise.all([
      fetch(`${COMPANION_BASE}/version`)
        .then(r => r.json())
        .then(d => (typeof d.version === 'string' ? d.version : null))
        .catch(() => null),
      preflight(),
      verifyCapable(),
    ]);
    setInstalledVersion(ver);
    setPreflightRes(pre);
    setFda(cap);
    setLastChecked(new Date());
    setChecking(false);
  }, [recheck, preflight, verifyCapable]);

  // Full diagnostic sweep on mount — the page is the health check.
  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const handleCopyInstall = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleTestSend = async () => {
    const phone = testPhone.trim();
    if (!phone) return;
    localStorage.setItem(TEST_PHONE_KEY, phone);
    testCancelledRef.current = false;
    setTestResult(null);
    setTestPhase('preflight');

    const pre = await preflight();
    if (!pre.ok) {
      setTestResult({ sent: false, error: pre.error || 'Messages isn’t ready — open it and sign in to iMessage.' });
      setTestPhase('done');
      return;
    }

    setTestPhase('sending');
    const sinceMs = Date.now();
    const res = await send(phone, 'RADIUS Auto Send test — if you can read this, sending works. You can delete this message.');
    if (!res.success) {
      setTestResult({ sent: false, error: res.error || 'The companion couldn’t hand the message to Messages.' });
      setTestPhase('done');
      return;
    }

    const cap = await verifyCapable();
    if (!cap.capable) {
      setTestResult({ sent: true, service: res.service, delivery: 'skipped' });
      setTestPhase('done');
      return;
    }

    // Poll delivery receipts for up to a minute — same signal campaigns use.
    setTestResult({ sent: true, service: res.service });
    setTestPhase('verifying');
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !testCancelledRef.current) {
      await new Promise(r => setTimeout(r, 5000));
      const v = await verify([phone], sinceMs);
      if (!v.ok) break;
      const status = v.results?.[phone]?.status;
      if (status === 'delivered' || status === 'failed') {
        setTestResult({ sent: true, service: res.service, delivery: status });
        setTestPhase('done');
        return;
      }
    }
    if (!testCancelledRef.current) {
      setTestResult({ sent: true, service: res.service, delivery: 'unconfirmed' });
      setTestPhase('done');
    }
  };

  const testRunning = testPhase !== 'idle' && testPhase !== 'done';

  // ---- Derived check states ----
  const serverUp = companion.available === true;
  const serverState: CheckState = companion.available === null ? 'unknown' : serverUp ? 'pass' : 'fail';
  const versionState: CheckState = !serverUp ? 'unknown' : companion.needsUpdate ? 'fail' : 'pass';
  const messagesState: CheckState = !serverUp || !preflightRes ? 'unknown' : preflightRes.ok ? 'pass' : 'fail';
  const smsState: CheckState =
    !serverUp || !preflightRes || preflightRes.sms_available === undefined
      ? 'unknown'
      : preflightRes.sms_available
        ? 'pass'
        : 'warn';
  const fdaState: CheckState = !serverUp || !fda ? 'unknown' : fda.capable ? 'pass' : 'fail';

  const serverAllGood = serverUp && !companion.needsUpdate && preflightRes?.ok === true;
  const allGood = serverAllGood && fda?.capable === true;

  const statusLabel =
    companion.available === null
      ? 'Checking…'
      : companion.available
        ? companion.needsUpdate
          ? 'Running — update required'
          : 'Running — up to date'
        : 'Not running';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Auto Send</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 max-w-2xl">
            Auto Send texts people through the Messages app on your Mac, driven by a small helper
            (the Mac Companion) that runs in the background. Use this page to set it up and confirm
            everything works before a big send.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && !checking && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Checked {lastChecked.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={runChecks}
            disabled={checking}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Run checks'}
          </button>
        </div>
      </div>

      {/* Overall banner */}
      {!checking && companion.available !== null && (
        allGood ? (
          <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              <span className="font-semibold">Everything checks out.</span> Auto Send is ready — messages
              will send automatically and RADIUS will confirm which ones deliver.
            </p>
          </div>
        ) : serverAllGood ? (
          <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Sending works, but delivery tracking is off.</span> RADIUS
              can send messages but can’t confirm which ones actually go through. Fix it in the Delivery
              tracking card below.
            </p>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-900/20 px-4 py-3">
            <p className="text-sm text-rose-800 dark:text-rose-200">
              <span className="font-semibold">Auto Send isn’t ready yet.</span> One or more checks below
              failed — follow the setup guide to get going.
            </p>
          </div>
        )
      )}

      {/* Check cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Part 1: companion server */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">1 · Companion server</h3>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                serverState === 'pass'
                  ? companion.needsUpdate ? 'text-rose-500' : 'text-emerald-500'
                  : serverState === 'fail' ? 'text-rose-500' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  serverState === 'pass'
                    ? companion.needsUpdate ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'
                    : serverState === 'fail' ? 'bg-rose-400' : 'bg-gray-400'
                }`}
              />
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            The helper on your Mac that does the actual sending.
          </p>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            <CheckRow
              state={serverState}
              label="Server running on this Mac"
              detail={
                serverState === 'fail'
                  ? 'Nothing is answering on this Mac. Install it below, or restart your Mac if it was working before.'
                  : serverState === 'pass' ? 'Responding on localhost:5123.' : 'Checking…'
              }
            />
            <CheckRow
              state={versionState}
              label="Up to date"
              detail={
                versionState === 'pass'
                  ? `Version ${installedVersion ?? COMPANION_VERSION} — current.`
                  : versionState === 'fail'
                    ? `Version ${installedVersion ?? 'unknown'} installed, but ${COMPANION_VERSION} is required. Older versions could report messages as sent when nothing went out — Auto Send is paused until you update.`
                    : undefined
              }
            />
            <CheckRow
              state={messagesState}
              label="Messages app ready"
              detail={
                messagesState === 'pass'
                  ? 'Messages is running and signed in to iMessage.'
                  : messagesState === 'fail'
                    ? preflightRes?.error || 'Open the Messages app and make sure you’re signed in to iMessage.'
                    : undefined
              }
            />
            <CheckRow
              state={smsState}
              label="Text Message Forwarding"
              detail={
                smsState === 'pass'
                  ? 'On — non-iPhone (Android) numbers get a green text automatically.'
                  : smsState === 'warn'
                    ? 'Off — your Mac can only reach iMessage users. Turn it on: iPhone → Settings → Messages → Text Message Forwarding → enable this Mac.'
                    : undefined
              }
            />
          </ul>
        </div>

        {/* Part 2: delivery tracking */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">2 · Delivery tracking</h3>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                fdaState === 'pass' ? 'text-emerald-500' : fdaState === 'fail' ? 'text-rose-500' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${fdaState === 'pass' ? 'bg-emerald-400 animate-pulse' : fdaState === 'fail' ? 'bg-rose-400' : 'bg-gray-400'}`} />
              {fdaState === 'pass' ? 'On' : fdaState === 'fail' ? 'Off' : '—'}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            After a batch, RADIUS reads your Mac’s delivery receipts to flag any text that didn’t go
            through — including green-bubble numbers that fail silently.
          </p>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            <CheckRow
              state={fdaState}
              label="Full Disk Access granted"
              detail={
                fdaState === 'pass' ? (
                  'The companion can read delivery receipts. It only ever reports “delivered” or “not delivered” per number — never your message contents.'
                ) : fdaState === 'fail' ? (
                  <>
                    <span>
                      The companion can’t read delivery receipts yet, so RADIUS can’t confirm which
                      messages actually deliver. Takes about 30 seconds to fix.
                    </span>
                    <span className="block mt-1">
                      Already added Python to Full Disk Access? It only takes effect after the
                      companion restarts — the guide has the command.
                    </span>
                    <button
                      onClick={() => setShowGuide(true)}
                      className="mt-2 block text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      Show me how to turn it on
                    </button>
                  </>
                ) : serverState === 'fail' ? (
                  'Install and start the companion server first.'
                ) : undefined
              }
            />
          </ul>
        </div>
      </div>

      {/* Setup */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {serverUp && !companion.needsUpdate ? 'Reinstall or update' : companion.needsUpdate ? 'Update the companion' : 'Set up the companion'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              New to this? We’ll walk you through every step — opening Terminal, running the command,
              and granting permissions.
            </p>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="shrink-0 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Show me how
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 mb-2">
          Or, if you’re comfortable in Terminal, run this on your Mac:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg truncate">
            {INSTALL_COMMAND}
          </code>
          <button
            onClick={handleCopyInstall}
            className="shrink-0 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {copiedInstall ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Test send */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Send a test text</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
          Texts your own number through the full pipeline — RADIUS → companion → Messages → delivery
          receipt — so you know it works before sending to a real list.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="tel"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="Your mobile number"
            className="w-full sm:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleTestSend}
            disabled={!serverUp || companion.needsUpdate || !testPhone.trim() || testRunning}
            className="shrink-0 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testPhase === 'preflight' ? 'Checking Messages…'
              : testPhase === 'sending' ? 'Sending…'
              : testPhase === 'verifying' ? 'Confirming delivery…'
              : 'Send test text'}
          </button>
        </div>
        {!serverUp && companion.available !== null && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            The companion server needs to be running before you can send a test.
          </p>
        )}
        {serverUp && companion.needsUpdate && (
          <p className="text-xs text-rose-500 mt-2">Update the companion before sending a test.</p>
        )}

        {(testResult || testRunning) && (
          <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700 border-t border-gray-200 dark:border-gray-700">
            <CheckRow
              state={
                testResult?.sent ? 'pass'
                  : testResult && !testResult.sent ? 'fail'
                  : 'unknown'
              }
              label="Message handed to Messages"
              detail={
                testResult?.sent
                  ? `Sent via ${testResult.service || 'iMessage'}.`
                  : testResult?.error || 'Working…'
              }
            />
            <CheckRow
              state={
                testResult?.delivery === 'delivered' ? 'pass'
                  : testResult?.delivery === 'failed' ? 'fail'
                  : testResult?.delivery === 'unconfirmed' || testResult?.delivery === 'skipped' ? 'warn'
                  : 'unknown'
              }
              label="Delivery confirmed"
              detail={
                testPhase === 'verifying'
                  ? 'Watching for the delivery receipt — usually a few seconds…'
                  : testResult?.delivery === 'delivered' ? 'Delivered — check your phone, the text should be there.'
                  : testResult?.delivery === 'failed' ? 'The message didn’t deliver. Check the number and Text Message Forwarding, then try again.'
                  : testResult?.delivery === 'unconfirmed' ? 'No receipt after a minute. It may still have delivered — check your phone.'
                  : testResult?.delivery === 'skipped' ? 'Skipped — delivery tracking is off (see card 2 above).'
                  : undefined
              }
            />
          </ul>
        )}
      </div>

      <CompanionGuideModal
        isOpen={showGuide}
        onClose={() => {
          setShowGuide(false);
          runChecks();
        }}
        mode={serverUp && companion.needsUpdate ? 'update' : 'install'}
        statusLabel={statusLabel}
        onRecheck={runChecks}
        checking={checking || companion.available === null}
        pythonPath={fda?.pythonPath}
        deliveryTrackingOn={fda?.capable}
      />
    </div>
  );
}
