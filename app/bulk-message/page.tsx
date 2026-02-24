'use client';

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, CircleLeader } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────
enum SendStatus { IDLE = 'IDLE', SENDING = 'SENDING', COMPLETED = 'COMPLETED' }
enum LogStatus { SUCCESS = 'SUCCESS', SKIPPED = 'SKIPPED' }

interface Recipient {
  id: number;
  name: string;
  firstName: string;
  phone: string;
  campus?: string;
  status?: string;
  circleType?: string;
  day?: string;
  acpd?: string;
  additionalLeaderName?: string;
  additionalLeaderPhone?: string;
}

interface SendLog {
  id: string;
  recipient: Recipient;
  timestamp: Date;
  status: LogStatus;
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────
const TEMPLATES_STORAGE_KEY = 'radius_bulk_msg_templates_v1';

const loadTemplates = (): MessageTemplate[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveTemplates = (templates: MessageTemplate[]) => {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
};

const resolveMessage = (template: string, recipient: Recipient): string => {
  return template
    .replace(/\{\{first_name\}\}/g, recipient.firstName)
    .replace(/\{\{name\}\}/g, recipient.name)
    .replace(/\{\{campus\}\}/g, recipient.campus || '')
    .replace(/\{\{day\}\}/g, recipient.day || '')
    .replace(/\{\{circle_type\}\}/g, recipient.circleType || '');
};

const openMessagesApp = (phone: string, message: string) => {
  const clean = phone.replace(/\s+/g, '');
  const encoded = encodeURIComponent(message);
  window.location.href = `sms:${clean}&body=${encoded}`;
};

const normalizePhone = (phone: string): string => {
  return phone.replace(/[^+\d]/g, '');
};

const toRecipient = (leader: CircleLeader): Recipient | null => {
  if (!leader.phone) return null;
  const clean = normalizePhone(leader.phone);
  if (clean.length < 7) return null;

  const fullName = leader.name || 'Friend';
  let firstName = fullName;
  if (fullName.includes('&')) {
    firstName = fullName.split('&')[0].trim();
  } else if (fullName.includes(' ')) {
    firstName = fullName.split(' ')[0];
  }

  return {
    id: leader.id,
    name: fullName,
    firstName,
    phone: clean,
    campus: leader.campus,
    status: leader.status,
    circleType: leader.circle_type,
    day: leader.day,
    acpd: leader.acpd,
    additionalLeaderName: leader.additional_leader_name || undefined,
    additionalLeaderPhone: leader.additional_leader_phone || undefined,
  };
};

// ─── Icon Components ──────────────────────────────────────────
const MessageIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const BackIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

// ─── Main Component ───────────────────────────────────────────
function BulkMessageContent() {
  const { user } = useAuth();

  // Data state
  const [leaders, setLeaders] = useState<CircleLeader[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [filterCampus, setFilterCampus] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>(['active']);
  const [filterCircleType, setFilterCircleType] = useState<string[]>([]);
  const [filterDay, setFilterDay] = useState<string[]>([]);
  const [filterAcpd, setFilterAcpd] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [includeCoLeaders, setIncludeCoLeaders] = useState(false);

  // Message state
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<MessageTemplate[]>(() => loadTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Sending state
  const [sendStatus, setSendStatus] = useState<SendStatus>(SendStatus.IDLE);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Persist templates
  useEffect(() => { saveTemplates(templates); }, [templates]);

  // ─── Load circle leaders ───────────────────────────────────
  const loadLeaders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('circle_leaders')
        .select('id, name, phone, email, campus, acpd, status, circle_type, day, time, frequency, additional_leader_name, additional_leader_phone')
        .order('name');

      if (error) throw error;
      setLeaders(data || []);
    } catch (err) {
      console.error('Failed to load circle leaders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadLeaders(); }, [loadLeaders]);

  // ─── Derive filter options from data ───────────────────────
  const filterOptions = useMemo(() => {
    const campuses = new Set<string>();
    const statuses = new Set<string>();
    const circleTypes = new Set<string>();
    const days = new Set<string>();
    const acpds = new Set<string>();

    leaders.forEach(l => {
      if (l.campus) campuses.add(l.campus);
      if (l.status) statuses.add(l.status);
      if (l.circle_type) circleTypes.add(l.circle_type);
      if (l.day) days.add(l.day);
      if (l.acpd) acpds.add(l.acpd);
    });

    return {
      campuses: Array.from(campuses).sort(),
      statuses: Array.from(statuses).sort(),
      circleTypes: Array.from(circleTypes).sort(),
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].filter(d => days.has(d)),
      acpds: Array.from(acpds).sort(),
    };
  }, [leaders]);

  // ─── Build recipient list ──────────────────────────────────
  const recipients = useMemo(() => {
    let filtered = leaders.filter(l => {
      if (filterCampus.length > 0 && (!l.campus || !filterCampus.includes(l.campus))) return false;
      if (filterStatus.length > 0 && (!l.status || !filterStatus.includes(l.status))) return false;
      if (filterCircleType.length > 0 && (!l.circle_type || !filterCircleType.includes(l.circle_type))) return false;
      if (filterDay.length > 0 && (!l.day || !filterDay.includes(l.day))) return false;
      if (filterAcpd.length > 0 && (!l.acpd || !filterAcpd.includes(l.acpd))) return false;
      return true;
    });

    // Convert to recipients (excluding those without phone numbers)
    let result: Recipient[] = [];
    const seenPhones = new Set<string>();

    for (const l of filtered) {
      const r = toRecipient(l);
      if (r && !seenPhones.has(r.phone)) {
        seenPhones.add(r.phone);
        result.push(r);
      }
      // Include co-leaders if toggled
      if (includeCoLeaders && l.additional_leader_phone) {
        const coPhone = normalizePhone(l.additional_leader_phone);
        if (coPhone.length >= 7 && !seenPhones.has(coPhone)) {
          seenPhones.add(coPhone);
          const coName = l.additional_leader_name || 'Co-Leader';
          let coFirst = coName;
          if (coName.includes(' ')) coFirst = coName.split(' ')[0];
          result.push({
            id: l.id * -1, // negative to differentiate
            name: coName,
            firstName: coFirst,
            phone: coPhone,
            campus: l.campus,
            status: l.status,
            circleType: l.circle_type,
            day: l.day,
            acpd: l.acpd,
          });
        }
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        (r.campus || '').toLowerCase().includes(q) ||
        (r.day || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [leaders, filterCampus, filterStatus, filterCircleType, filterDay, filterAcpd, searchQuery, includeCoLeaders]);

  // ─── Current / next recipient ──────────────────────────────
  const currentRecipient = recipients[currentIndex] || null;
  const nextRecipient = sendStatus === SendStatus.SENDING ? (recipients[currentIndex + 1] || null) : null;

  // ─── Preview ───────────────────────────────────────────────
  const visualPreview = useMemo(() => {
    if (!currentRecipient || !message.trim()) return message || 'Type a message to preview...';
    return resolveMessage(message, currentRecipient);
  }, [message, currentRecipient]);

  // ─── Template helpers ──────────────────────────────────────
  const insertPlaceholder = (tag: string) => {
    if (!messageRef.current) return;
    const start = messageRef.current.selectionStart;
    const end = messageRef.current.selectionEnd;
    const text = messageRef.current.value;
    setMessage(text.substring(0, start) + tag + text.substring(end));
    setTimeout(() => {
      messageRef.current?.focus();
      const cursor = start + tag.length;
      messageRef.current?.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const handleSaveTemplate = () => {
    if (!templateNameInput.trim() || !message.trim()) return;
    const newTemplate: MessageTemplate = {
      id: `t-${Date.now()}`,
      name: templateNameInput.trim(),
      content: message,
    };
    setTemplates(prev => [...prev, newTemplate]);
    setSelectedTemplateId(newTemplate.id);
    setTemplateNameInput('');
    setShowSaveTemplate(false);
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return;
    setTemplates(prev => prev.filter(t => t.id !== selectedTemplateId));
    setSelectedTemplateId('');
  };

  const handleUpdateTemplate = () => {
    if (!selectedTemplateId) return;
    setTemplates(prev => prev.map(t =>
      t.id === selectedTemplateId ? { ...t, content: message } : t
    ));
  };

  const isTemplateModified = useMemo(() => {
    const t = templates.find(x => x.id === selectedTemplateId);
    return t ? t.content !== message : false;
  }, [message, selectedTemplateId, templates]);

  // ─── Sending controls ─────────────────────────────────────
  const handleStartBatch = () => {
    if (recipients.length === 0 || !message.trim()) return;
    setSendStatus(SendStatus.SENDING);
    setCurrentIndex(0);
    setLogs([]);
  };

  const handleSendCurrent = async () => {
    if (!currentRecipient) return;
    const personalizedMessage = resolveMessage(message, currentRecipient);

    try {
      await navigator.clipboard.writeText(personalizedMessage);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);

      setTimeout(() => {
        openMessagesApp(currentRecipient.phone, personalizedMessage);
      }, 400);

      const newLog: SendLog = {
        id: Math.random().toString(36).substr(2, 9),
        recipient: currentRecipient,
        timestamp: new Date(),
        status: LogStatus.SUCCESS,
      };

      setLogs(prev => [newLog, ...prev]);
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (nextIdx >= recipients.length) {
        setSendStatus(SendStatus.COMPLETED);
      }
    } catch (err) {
      console.error('Send failed:', err);
      openMessagesApp(currentRecipient.phone, personalizedMessage);
    }
  };

  const handleSkip = () => {
    if (!currentRecipient) return;
    const newLog: SendLog = {
      id: Math.random().toString(36).substr(2, 9),
      recipient: currentRecipient,
      timestamp: new Date(),
      status: LogStatus.SKIPPED,
    };
    setLogs(prev => [newLog, ...prev]);
    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);
    if (nextIdx >= recipients.length) {
      setSendStatus(SendStatus.COMPLETED);
    }
  };

  const handleResend = async (log: SendLog) => {
    const personalizedMessage = resolveMessage(message, log.recipient);
    await navigator.clipboard.writeText(personalizedMessage);
    openMessagesApp(log.recipient.phone, personalizedMessage);
  };

  const handleAbort = () => {
    setSendStatus(SendStatus.IDLE);
  };

  const handleReset = () => {
    setSendStatus(SendStatus.IDLE);
    setCurrentIndex(0);
    setLogs([]);
  };

  // ─── Filter toggle helpers ─────────────────────────────────
  const toggleFilter = (arr: string[], setArr: (v: string[]) => void, value: string) => {
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);
  };

  const progress = recipients.length > 0 ? (currentIndex / recipients.length) * 100 : 0;

  // ─── Render ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 text-sm font-medium">Loading circle leaders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all">
                <BackIcon />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <MessageIcon />
                  Bulk Message
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Send personalized iMessages to circle leaders
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                <span className="text-blue-400 font-bold">{recipients.length}</span> recipients selected
              </div>
              {sendStatus !== SendStatus.IDLE && (
                <button
                  onClick={handleReset}
                  className="text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-all"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ════════════════════════════════════════════════
              LEFT COLUMN: Filters + Message
             ════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 space-y-6">

            {/* ── Filter Section ── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                  </svg>
                  Filter Recipients
                </h2>
                {(filterCampus.length > 0 || filterStatus.length > 1 || filterCircleType.length > 0 || filterDay.length > 0 || filterAcpd.length > 0) && (
                  <button
                    onClick={() => {
                      setFilterCampus([]);
                      setFilterStatus(['active']);
                      setFilterCircleType([]);
                      setFilterDay([]);
                      setFilterAcpd([]);
                    }}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase underline"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="space-y-5">
                {/* Status */}
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {filterOptions.statuses.map(s => (
                      <button
                        key={s}
                        onClick={() => toggleFilter(filterStatus, setFilterStatus, s)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          filterStatus.includes(s)
                            ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campus */}
                {filterOptions.campuses.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Campus</label>
                    <div className="flex flex-wrap gap-1.5">
                      {filterOptions.campuses.map(c => (
                        <button
                          key={c}
                          onClick={() => toggleFilter(filterCampus, setFilterCampus, c)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                            filterCampus.includes(c)
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Circle Type */}
                {filterOptions.circleTypes.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Circle Type</label>
                    <div className="flex flex-wrap gap-1.5">
                      {filterOptions.circleTypes.map(ct => (
                        <button
                          key={ct}
                          onClick={() => toggleFilter(filterCircleType, setFilterCircleType, ct)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                            filterCircleType.includes(ct)
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                          }`}
                        >
                          {ct}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meeting Day */}
                {filterOptions.days.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Meeting Day</label>
                    <div className="flex flex-wrap gap-1.5">
                      {filterOptions.days.map(d => (
                        <button
                          key={d}
                          onClick={() => toggleFilter(filterDay, setFilterDay, d)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                            filterDay.includes(d)
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ACPD */}
                {filterOptions.acpds.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">ACPD</label>
                    <div className="flex flex-wrap gap-1.5">
                      {filterOptions.acpds.map(a => (
                        <button
                          key={a}
                          onClick={() => toggleFilter(filterAcpd, setFilterAcpd, a)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                            filterAcpd.includes(a)
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search + Co-leaders toggle */}
                <div className="flex flex-col sm:flex-row gap-4 pt-2 border-t border-gray-800">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Search</label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name, phone, campus..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-600"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 hover:border-gray-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={includeCoLeaders}
                        onChange={(e) => setIncludeCoLeaders(e.target.checked)}
                        className="checkbox checkbox-sm checkbox-primary"
                      />
                      <span className="text-xs font-medium text-gray-400">Include co-leaders</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Recipient Preview Table ── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl shadow-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  Recipients ({recipients.length})
                </h2>
                <span className="text-[10px] text-gray-500 font-medium">
                  {leaders.filter(l => !l.phone).length} leaders without phone excluded
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {recipients.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-12">
                    No recipients match your filters, or none have phone numbers.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 sticky top-0">
                      <tr>
                        <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-2">#</th>
                        <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-2">Name</th>
                        <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-2">Phone</th>
                        <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-2 hidden sm:table-cell">Day</th>
                        <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-2 hidden md:table-cell">Campus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {recipients.map((r, idx) => (
                        <tr
                          key={`${r.id}-${r.phone}`}
                          className={`hover:bg-gray-800/40 transition-colors ${
                            sendStatus === SendStatus.SENDING && idx === currentIndex ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''
                          } ${sendStatus === SendStatus.SENDING && idx < currentIndex ? 'opacity-40' : ''}`}
                        >
                          <td className="px-4 py-2 text-gray-600 text-xs font-mono">{idx + 1}</td>
                          <td className="px-4 py-2">
                            <span className="text-white font-medium">{r.name}</span>
                            {r.id < 0 && (
                              <span className="ml-1.5 text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold uppercase">Co-Leader</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-400 font-mono text-xs">{r.phone}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs hidden sm:table-cell">{r.day || '—'}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs hidden md:table-cell">{r.campus || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* ── Message Composer ── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  Message Template
                </h2>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const t = templates.find(x => x.id === e.target.value);
                      if (t) { setMessage(t.content); setSelectedTemplateId(t.id); }
                      else { setSelectedTemplateId(''); }
                    }}
                    className="bg-gray-800 text-[11px] font-medium rounded-lg px-3 py-1.5 border border-gray-700 outline-none text-gray-300 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Saved Templates</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>

                  {selectedTemplateId && isTemplateModified && (
                    <button onClick={handleUpdateTemplate} className="px-2.5 py-1 text-[10px] font-bold text-green-400 uppercase bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg transition-all">
                      Update
                    </button>
                  )}
                  {selectedTemplateId && (
                    <button onClick={handleDeleteTemplate} className="px-2.5 py-1 text-[10px] font-bold text-rose-400 uppercase hover:bg-rose-500/10 border border-gray-700 rounded-lg transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Placeholder buttons */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mr-1">Insert:</span>
                {[
                  { label: 'First Name', tag: '{{first_name}}' },
                  { label: 'Full Name', tag: '{{name}}' },
                  { label: 'Campus', tag: '{{campus}}' },
                  { label: 'Day', tag: '{{day}}' },
                  { label: 'Circle Type', tag: '{{circle_type}}' },
                ].map(({ label, tag }) => (
                  <button
                    key={tag}
                    onClick={() => insertPlaceholder(tag)}
                    className="px-2.5 py-1 bg-gray-800 border border-gray-700 hover:border-blue-500/50 hover:bg-gray-750 rounded-md text-[10px] font-semibold text-gray-400 hover:text-blue-400 transition-all"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={messageRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hey {{first_name}}, just wanted to check in about your circle..."
                  className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm leading-relaxed transition-shadow resize-none placeholder:text-gray-600"
                />
                <div className="absolute bottom-3 right-3 text-[10px] font-medium text-gray-600 bg-gray-800/80 px-2 py-0.5 rounded">
                  {message.length} chars
                </div>
              </div>

              {/* Save template */}
              <div className="flex items-center gap-2 mt-3">
                {showSaveTemplate ? (
                  <>
                    <input
                      type="text"
                      value={templateNameInput}
                      onChange={(e) => setTemplateNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
                      placeholder="Template name..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-600"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTemplate}
                      disabled={!templateNameInput.trim()}
                      className="px-3 py-1.5 text-[10px] font-bold text-blue-400 uppercase bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-all disabled:opacity-30"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setShowSaveTemplate(false); setTemplateNameInput(''); }}
                      className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowSaveTemplate(true)}
                    disabled={!message.trim()}
                    className="px-3 py-1.5 text-[10px] font-bold text-blue-400 uppercase bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-all disabled:opacity-30"
                  >
                    Save as Template
                  </button>
                )}
              </div>
            </section>
          </div>

          {/* ════════════════════════════════════════════════
              RIGHT COLUMN: Preview + Send Controls + Log
             ════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 space-y-6">

            {/* ── iMessage Preview ── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Message Preview</h2>
              </div>

              <div className="bg-gray-950 p-8 min-h-[200px] flex flex-col justify-center relative">
                {currentRecipient ? (
                  <div className="flex flex-col items-end w-full">
                    <div className="relative max-w-[85%]">
                      <div className="bg-blue-600 text-white px-5 py-3 rounded-[20px] rounded-br-[6px] text-sm font-medium shadow-lg leading-relaxed whitespace-pre-wrap">
                        {visualPreview}
                      </div>
                    </div>
                    <div className="mt-3 pr-1 flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                        To: {currentRecipient.name}
                      </span>
                      <span className="text-[10px] text-gray-600 font-mono">{currentRecipient.phone}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-gray-700">
                    <MessageIcon />
                    <p className="text-[10px] font-bold uppercase tracking-widest">
                      {recipients.length === 0 ? 'No recipients' : 'Ready to send'}
                    </p>
                  </div>
                )}
              </div>

              {/* Send Controls */}
              {sendStatus === SendStatus.IDLE ? (
                <button
                  onClick={handleStartBatch}
                  disabled={recipients.length === 0 || !message.trim()}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold text-lg transition-all uppercase tracking-tight border-t border-blue-500/30 disabled:border-gray-700"
                >
                  {recipients.length === 0 ? 'No Recipients' : !message.trim() ? 'Write a Message First' : `Start Batch (${recipients.length})`}
                </button>
              ) : sendStatus === SendStatus.COMPLETED ? (
                <div className="border-t border-gray-800 p-6 text-center space-y-3">
                  <div className="text-green-400 text-lg font-bold">Batch Complete!</div>
                  <p className="text-gray-500 text-xs">
                    {logs.filter(l => l.status === LogStatus.SUCCESS).length} sent, {logs.filter(l => l.status === LogStatus.SKIPPED).length} skipped
                  </p>
                  <button
                    onClick={handleReset}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all uppercase text-sm"
                  >
                    Start New Batch
                  </button>
                </div>
              ) : (
                <div className="border-t border-gray-800">
                  {/* Active contact info */}
                  <div className="p-5 border-b border-gray-800/50 space-y-3">
                    <div>
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Now Sending To</span>
                      <h3 className="text-xl font-bold text-white mt-1 truncate">{currentRecipient?.name}</h3>
                      <div className="flex gap-2 items-center mt-1.5">
                        <span className="text-[10px] text-gray-500 font-mono bg-gray-800 px-2 py-0.5 rounded">{currentRecipient?.phone}</span>
                        {currentRecipient?.campus && (
                          <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-medium">{currentRecipient.campus}</span>
                        )}
                        {currentRecipient?.day && (
                          <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded font-medium">{currentRecipient.day}</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <button
                      onClick={handleSendCurrent}
                      className="w-full py-4 bg-white text-gray-900 font-bold rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all relative overflow-hidden shadow-lg"
                    >
                      <span className="text-sm uppercase tracking-tight">Open Messages</span>
                      {copyFeedback && (
                        <div className="absolute inset-0 bg-green-500 text-white flex items-center justify-center animate-pulse">
                          <span className="text-xs font-bold uppercase">Text Copied & Ready!</span>
                        </div>
                      )}
                    </button>

                    <button
                      onClick={handleSkip}
                      className="w-full py-3 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 font-bold rounded-xl transition-all uppercase tracking-widest text-[10px]"
                    >
                      Skip
                    </button>
                  </div>

                  {/* Progress */}
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Progress</p>
                      <p className="text-lg font-bold text-white">{currentIndex} / {recipients.length}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                      <button onClick={handleAbort} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 uppercase bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-all">
                        Abort
                      </button>
                    </div>
                  </div>

                  {/* Up Next */}
                  {nextRecipient && (
                    <div className="border-t border-gray-800/50 px-5 py-3 flex items-center justify-between bg-gray-900/50">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]"></div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-600 uppercase tracking-wider">Up Next</p>
                          <p className="text-xs font-medium text-gray-300">{nextRecipient.name}</p>
                        </div>
                      </div>
                      {nextRecipient.day && (
                        <span className="text-[9px] font-medium text-gray-600">{nextRecipient.day}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── Batch Log ── */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Batch Log</span>
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])} className="text-[10px] font-bold text-gray-500 hover:text-white uppercase transition-colors">
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-800/50">
                {logs.length === 0 ? (
                  <p className="py-10 text-center text-[10px] text-gray-700 font-bold uppercase tracking-widest">No history</p>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className={`px-5 py-3 flex justify-between items-center group transition-colors ${
                      log.status === LogStatus.SKIPPED ? 'opacity-40' : 'hover:bg-gray-800/40'
                    }`}>
                      <div>
                        <span className="text-xs font-medium text-gray-200">{log.recipient.name}</span>
                        <span className="text-[9px] text-gray-600 font-mono ml-2">{log.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {log.status === LogStatus.SUCCESS && (
                          <button
                            onClick={() => handleResend(log)}
                            className="px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-[9px] font-bold uppercase rounded border border-blue-500/20 transition-all opacity-0 group-hover:opacity-100"
                          >
                            Resend
                          </button>
                        )}
                        <span className={`font-bold text-[10px] uppercase ${
                          log.status === LogStatus.SKIPPED ? 'text-gray-500' : 'text-blue-400'
                        }`}>
                          {log.status === LogStatus.SKIPPED ? 'Skipped' : 'Sent'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Bottom safe area padding for mobile */}
      <div className="h-20 md:h-0" />
    </div>
  );
}

export default function BulkMessagePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }>
        <BulkMessageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
