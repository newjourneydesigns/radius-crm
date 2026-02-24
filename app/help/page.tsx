'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';

const sections = [
  { id: 'overview',         title: 'Overview' },
  { id: 'dashboard',        title: 'Dashboard' },
  { id: 'progress',         title: 'Progress Page' },
  { id: 'calendar',         title: 'Calendar' },
  { id: 'prayer',           title: 'Prayer List' },
  { id: 'leaders',          title: 'Circle Leaders' },
  { id: 'circle-profiles',  title: 'Leader Profiles' },
  { id: 'circle-visits',    title: 'Circle Visits' },
  { id: 'todos',            title: 'To-Do Items' },
  { id: 'event-summaries',  title: 'Event Summaries' },
  { id: 'notes',            title: 'Notes & Templates' },
  { id: 'encourage',        title: 'Encourage Feature' },
  { id: 'filters',          title: 'Filtering & Search' },
  { id: 'contact',          title: 'Contact Features' },
  { id: 'ccb',              title: 'CCB Explorer' },
  { id: 'settings',         title: 'Settings' },
  { id: 'pwa',              title: 'Mobile App (PWA)' },
  { id: 'admin',            title: 'Admin Tools' },
];

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(s => s.title.toLowerCase().includes(q));
  }, [searchQuery]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">

          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <Link href="/dashboard" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">RADIUS Help Center</h1>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-5">Complete guide to using RADIUS Circle Leader Management System.</p>

            {/* Search */}
            <div className="relative max-w-lg">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search help topics…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 sticky top-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm uppercase tracking-wide">Contents</h3>
                {filteredSections.length === 0 ? (
                  <p className="text-sm text-gray-400 px-2 py-1">No topics match.</p>
                ) : (
                  <nav className="space-y-0.5">
                    {filteredSections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          activeSection === section.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                        }`}
                      >
                        <span>{section.title}</span>
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow divide-y divide-gray-200 dark:divide-gray-700">

                {/* ── Overview ── */}
                <section id="overview" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Overview</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">RADIUS is a comprehensive Circle Leader Management System designed to help pastoral staff track, manage, and communicate with circle leaders effectively.</p>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Key Features</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-5">
                    <li>Circle leader profile management with detailed contact information</li>
                    <li>Event summary tracking and real-time progress monitoring</li>
                    <li>To-Do items with due dates, repeating tasks, and calendar sync</li>
                    <li>Circle Visits — schedule and track in-home/group visits</li>
                    <li>Note-taking with templates for consistent communication</li>
                    <li>Encourage feature — log encouragements with scripture and method</li>
                    <li>Connection logging to track all interactions and engagement</li>
                    <li>Advanced filtering and search across all leaders</li>
                    <li>Direct contact integration (phone, text, email)</li>
                    <li>Calendar view of scheduled meetings and events</li>
                    <li>Progress page with aggregate stats and scorecard</li>
                    <li>CCB Explorer for browsing church database profiles</li>
                    <li>PWA — installable on iPhone, Android, and desktop</li>
                  </ul>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Getting Started</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">Start on the Dashboard for a campus-filtered view of your leaders. Use the top navigation to access Progress, Calendar, and more. Tap your avatar in the top-right to reach Settings, Profile, and admin tools.</p>
                  </div>
                </section>

                {/* ── Dashboard ── */}
                <section id="dashboard" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Dashboard</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The Dashboard is the default landing page after login. It offers a campus-filtered bird's-eye view of your circle leaders and their current status.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Campus Filter</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Select one or more campuses to narrow leaders shown. Click <strong>Show Filter</strong> to reveal the panel, toggle campuses, or hit <strong>Clear All</strong> to reset.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Dashboard Cards</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Leader name (links to full profile), campus, meeting day/time</li>
                    <li>Current status with color-coded badge and follow-up flag</li>
                    <li>Last note preview and event summary status</li>
                    <li>Quick action buttons: Contact, Log Connection, Add Note, Status toggle</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Summary Stats Bar</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The top of the dashboard shows aggregate counts: total leaders, event summaries received, leaders needing follow-up, and recent connections — all filtered by your campus selection.</p>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Tip</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">For deep filtering (status, circle type, meeting day, etc.) go to the <strong>Leaders</strong> page via the navigation.</p>
                  </div>
                </section>

                {/* ── Progress ── */}
                <section id="progress" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Progress Page</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The Progress page (nav bar → <strong>Progress</strong>) gives a high-level view of pastoral engagement across all leaders and campuses.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">What You'll See</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li><strong>Event Summary Progress:</strong> How many leaders have submitted event summaries vs the total active</li>
                    <li><strong>Connection Rates:</strong> Leaders contacted recently, broken down by campus</li>
                    <li><strong>Status Breakdown:</strong> Count of leaders in each status category</li>
                    <li><strong>Follow-Up Queue:</strong> Leaders flagged for follow-up attention</li>
                    <li><strong>Scorecard:</strong> Personal engagement scorecard with encouragement metrics</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Scorecard</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The scorecard tracks your personal pastoral activity: notes added, connections logged, encouragements sent, and circle visits completed. Use it to monitor your own engagement rhythm.</p>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <h4 className="font-semibold text-green-800 dark:text-green-200 mb-1">Pro Tip</h4>
                    <p className="text-green-700 dark:text-green-300 text-sm">Use the Progress page at the start of each week to identify leaders who haven't been contacted recently and prioritize your outreach.</p>
                  </div>
                </section>

                {/* ── Calendar ── */}
                <section id="calendar" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Calendar</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The Calendar page (nav bar → <strong>Calendar</strong>) shows a monthly/weekly/daily view of all scheduled events and tasks associated with your leaders.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">What Appears on the Calendar</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Circle leader meeting days (recurring, based on profile data)</li>
                    <li>To-Do items with due dates</li>
                    <li>Scheduled circle visits</li>
                    <li>Follow-up reminders tied to notes</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Navigation</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Use the arrows to move between months/weeks. Switch between month, week, and day views using the view selector. Click any event to see details or navigate to the associated leader profile.</p>
                </section>

                {/* ── Prayer List ── */}
                <section id="prayer" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Prayer List</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The Prayer page lets you track prayer points for your circle leaders and manage a personal general prayer list.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">General Prayer Points</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">At the top of the page is a collapsible Prayer Points section for general prayers not tied to any specific leader.</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Add a new prayer point using the text field and <strong>Add</strong> button</li>
                    <li>Mark prayers as answered by clicking the checkbox</li>
                    <li>Edit or delete any prayer inline</li>
                    <li>The badge shows total count of active prayer points</li>
                    <li>Collapse or expand the section using the arrow toggle</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Circle Leader Prayers</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">Below the general section is the Circle Leader Prayers area showing all your leaders with their associated prayer points.</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Each leader appears as a collapsible card with their name, campus, and ACPD</li>
                    <li>A count badge shows how many prayers each leader has</li>
                    <li>Expand a leader to see, add, edit, or delete their prayers</li>
                    <li>Mark individual prayers as answered</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Toolbar</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li><strong>Search:</strong> Filter prayers and leaders by name or content</li>
                    <li><strong>Campus &amp; ACPD filters:</strong> Narrow to specific campuses or ACPDs</li>
                    <li><strong>Sort:</strong> Toggle alphabetical order (A–Z / Z–A)</li>
                    <li><strong>Expand / Collapse All:</strong> Quickly open or close all leader cards</li>
                  </ul>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Tip</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">Use general Prayer Points for church-wide or personal prayers. Use Circle Leader Prayers to keep specific prayer needs tied to each leader for easy reference during your devotional time.</p>
                  </div>
                </section>

                {/* ── Circle Leaders ── */}
                <section id="leaders" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Circle Leaders</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The dedicated Circle Leaders page offers comprehensive filtering and management with detailed leader cards and extensive quick actions.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Leader Cards</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Name linking to full profile, campus, meeting day/time/type</li>
                    <li>Status badge (color-coded) and follow-up flag</li>
                    <li>Last note preview, event summary status</li>
                    <li>Quick-action buttons: Contact, Log Connection, Add Note, Status, Follow-Up, Event Summary toggle</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Advanced Filters</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li><strong>Status</strong> — filter by any status, or use the special "Follow-Up Required" filter</li>
                    <li><strong>Campus</strong> — single or multi-campus selection</li>
                    <li><strong>Circle Type</strong> — Men's, Women's, Young Adult, Couples, etc.</li>
                    <li><strong>Meeting Day</strong> — Mon–Sun</li>
                    <li><strong>Time of Day</strong> — AM or PM</li>
                    <li><strong>Connected</strong> — leaders with or without recent connections</li>
                    <li><strong>Event Summary</strong> — received vs not received</li>
                  </ul>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Active filters appear as removable chips above results. Click the ✕ on any chip to remove that filter individually, or click <strong>Clear All</strong>.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Pagination & Export</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Show 25 / 50 / 100 / All leaders per page</li>
                    <li>Pagination controls at the bottom of the list</li>
                    <li><strong>Export</strong> button (top-right) downloads current filtered results as CSV</li>
                  </ul>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <h4 className="font-semibold text-green-800 dark:text-green-200 mb-1">Pro Tip</h4>
                    <p className="text-green-700 dark:text-green-300 text-sm">Use <strong>Status → Follow-Up Required</strong> alongside a campus filter to see exactly who needs attention today.</p>
                  </div>
                </section>

                {/* ── Leader Profiles ── */}
                <section id="circle-profiles" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Leader Profiles</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Click any leader's name to open their full profile. This is the central hub for everything related to that leader.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Profile Information Panel</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Contact details — email, phone (tap to call/text/email)</li>
                    <li>Campus, circle type, meeting day and time</li>
                    <li>Current status and follow-up flag</li>
                    <li>CCB profile link (opens external church database)</li>
                    <li>Event summary received toggle</li>
                    <li>Encourage button — log an encouragement interaction</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Notes Tab</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Full note history with timestamps and author attribution</li>
                    <li>Pin important notes so they appear at the top</li>
                    <li>Add notes inline or via templates</li>
                    <li>Attach follow-up dates to any note</li>
                    <li>Save any note as a reusable template</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">To-Do Tab</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">View, add, and complete to-do items scoped to this specific leader. See <strong>To-Do Items</strong> section below for full details.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Circle Visits Tab</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Log and review scheduled visits to this leader's circle. See <strong>Circle Visits</strong> below.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Connection Log</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">A chronological record of all logged interactions with this leader — calls, texts, emails, and in-person connections.</p>
                </section>

                {/* ── Circle Visits ── */}
                <section id="circle-visits" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Circle Visits</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Circle Visits let you schedule and record visits to a leader's circle meeting — in-home, hosted, or otherwise. This helps track your pastoral presence in each group.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Scheduling a Visit</h3>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Open a leader's profile and select the <strong>Circle Visits</strong> tab.</li>
                    <li>Click <strong>Schedule Visit</strong>.</li>
                    <li>Choose a date and add any notes about the planned visit.</li>
                    <li>Save — the visit appears on your Calendar automatically.</li>
                  </ol>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Completing a Visit</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">After the visit, mark it as <strong>Completed</strong> and answer any visit questions (attendance, health of the group, topics discussed). This data feeds into your Progress scorecard.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Visit History</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">All past visits for a leader are listed chronologically with their status, date, and your notes — giving you a full pastoral visit record.</p>
                </section>

                {/* ── To-Do Items ── */}
                <section id="todos" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">To-Do Items</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">To-Do items help you stay on top of tasks related to your circle leaders. They can be one-off or repeating, and optionally synced to notes.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Creating a To-Do</h3>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Open a leader's profile (or use the global To-Do widget on the dashboard).</li>
                    <li>Click <strong>+ Add</strong> in the To-Do panel.</li>
                    <li>Enter a title, optional due date, and optional notes.</li>
                    <li>Choose a <strong>Repeat</strong> cadence if needed (daily, weekly, monthly, etc.).</li>
                    <li>Save — the to-do appears in the list and on the Calendar if a due date was set.</li>
                  </ol>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Completing & Managing</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Check the box to mark complete. Repeating tasks auto-reset for the next occurrence.</li>
                    <li>Edit by clicking the pencil icon; delete with the trash icon.</li>
                    <li>Completed tasks can be hidden or shown with the toggle at the top of the list.</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Note Sync</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">When a to-do is completed you can optionally auto-generate a note in the leader's profile, keeping your interaction history up to date without extra steps.</p>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Calendar Integration</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">Any to-do with a due date automatically shows up on the Calendar page so you can plan your week visually.</p>
                  </div>
                </section>

                {/* ── Event Summaries ── */}
                <section id="event-summaries" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Event Summaries</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Event Summaries track whether each active leader has submitted their circle report for the current period. Only active leaders are included (invited, pipeline, and archived leaders are excluded).</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Marking Received</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>From a leader card (dashboard or Leaders page): click the <strong>Event Summary</strong> toggle button.</li>
                    <li>From the leader's profile: toggle the Event Summary switch in the info panel.</li>
                    <li>From the dedicated <strong>Event Summaries</strong> panel on the dashboard.</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Filtering by Summary Status</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">On both the Dashboard and Leaders page, use the <strong>Event Summary</strong> filter drop-down to show only leaders who have or haven't submitted. The Progress page shows summary stats at a glance.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">4-State Tracking</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Event summary status has four states: <strong>Not Received</strong>, <strong>Received</strong>, <strong>Late</strong>, and <strong>Excused</strong>. Use the drop-down on the leader card or profile to set the correct state.</p>
                </section>

                {/* ── Notes & Templates ── */}
                <section id="notes" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Notes & Templates</h2>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Adding Notes</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>From Dashboard or Leaders page cards via the <strong>Add Note</strong> button</li>
                    <li>From a leader's profile → Notes tab → <strong>New Note</strong></li>
                    <li>Notes include timestamp and your name automatically</li>
                    <li>Attach a follow-up date or mark follow-up required</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Pinning Notes</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Pin any note so it stays at the top of the note list — great for keeping key context always visible. Click the pin icon on any note to toggle. Pinned notes are marked with a visual indicator.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Using Templates</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>When adding a note, click <strong>Use Template</strong> to pick from your saved templates</li>
                    <li>The template content pre-fills the note — edit as needed before saving</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Managing Templates</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Go to <strong>Settings → Note Templates</strong> to create, edit, or delete templates</li>
                    <li>When writing a note, click <strong>Save as Template</strong> to turn it into a reusable template</li>
                  </ul>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <h4 className="font-semibold text-green-800 dark:text-green-200 mb-1">Pro Tip</h4>
                    <p className="text-green-700 dark:text-green-300 text-sm">Create templates for common scenarios like "Initial Contact," "Monthly Check-In," or "Needs Encouragement" to speed up your workflow.</p>
                  </div>
                </section>

                {/* ── Encourage ── */}
                <section id="encourage" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Encourage Feature</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">The Encourage feature lets you log intentional encouragements to your circle leaders — tracking what you sent, how you sent it, and what scripture you used.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Logging an Encouragement</h3>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Open a leader's profile and click the <strong>Encourage</strong> button.</li>
                    <li>Choose the method: Text, Call, Email, or In-Person.</li>
                    <li>Optionally add a scripture reference and personal note.</li>
                    <li>Save — it's logged in the leader's connection history and counts toward your scorecard.</li>
                  </ol>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Encourage History</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">All encouragements appear in the leader's connection log with the method, scripture, and date. Your total encouragement count is visible on the Progress scorecard.</p>
                </section>

                {/* ── Filtering & Search ── */}
                <section id="filters" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Filtering & Search</h2>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Global Search (⌘K / Ctrl K)</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono">⌘K</kbd> (Mac) or <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono">Ctrl K</kbd> (Windows) anywhere in the app, or click the <strong>Search</strong> button in the top navigation. Search returns leaders by name, email, campus, and circle type.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Dashboard Filters</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li><strong>Campus</strong> — toggle campuses to narrow your view</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Leaders Page Filters</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li><strong>Status</strong> — any status or "Follow-Up Required"</li>
                    <li><strong>Campus, Circle Type, Meeting Day, Time of Day</strong></li>
                    <li><strong>Connected</strong> — recently contacted or not</li>
                    <li><strong>Event Summary</strong> — received or not</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Tips</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                    <li>Combine multiple filters for precise results</li>
                    <li>Filter state is preserved in the URL — bookmark filtered views</li>
                    <li>Active filter chips let you remove one filter at a time</li>
                  </ul>
                </section>

                {/* ── Contact Features ── */}
                <section id="contact" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Contact Features</h2>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Contact Modal</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">Tap <strong>Contact</strong> on any leader card or profile to open the contact modal:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li><strong>Call</strong> — opens your device's phone app with the number pre-filled</li>
                    <li><strong>Text</strong> — opens SMS with the leader's number</li>
                    <li><strong>Email</strong> — opens your email client addressed to the leader</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Log Connection</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-2">Track every interaction with the <strong>Log Connection</strong> button:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Choose a connection type: Call, Text, Email, In-Person</li>
                    <li>Add optional notes about the conversation</li>
                    <li>Automatically timestamped and attributed to your user account</li>
                    <li>Appears in the leader's connection log history</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Contact Info Handling</h3>
                  <p className="text-gray-600 dark:text-gray-400">Contact buttons only appear when a phone number or email is on file. Missing contact info is clearly indicated so you can update the leader's profile.</p>
                </section>

                {/* ── CCB Explorer ── */}
                <section id="ccb" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">CCB Explorer</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">CCB Explorer is an admin-only tool that lets you browse and search leader profiles directly from the church's CCB (Church Community Builder) database without leaving RADIUS.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Accessing CCB Explorer</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Click your avatar/name in the top-right → <strong>CCB Explorer</strong> (only visible to Admin users).</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">What You Can Do</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Search CCB by name, group, or leader ID</li>
                    <li>View CCB profile details alongside RADIUS data</li>
                    <li>Open the full CCB profile in a new tab via the external link button</li>
                    <li>Cross-reference CCB data when onboarding new leaders</li>
                  </ul>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">Admin Only</h4>
                    <p className="text-yellow-700 dark:text-yellow-300 text-sm">CCB Explorer is restricted to Administrator accounts. Contact your site admin if you need access.</p>
                  </div>
                </section>

                {/* ── Settings ── */}
                <section id="settings" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Settings</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Access Settings via your avatar → <strong>Settings</strong>.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Note Templates</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Create, edit, and delete note templates here. Templates are available when adding any note across the app.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Email Preferences</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Manage your daily summary email subscription — opt in to receive a daily digest of leaders needing follow-up, pending to-dos, and upcoming circle visits.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Profile Settings</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Update your display name and other account preferences via your avatar → <strong>Profile</strong>.</p>
                </section>

                {/* ── PWA ── */}
                <section id="pwa" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Mobile App (PWA)</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">RADIUS is a Progressive Web App (PWA) — you can install it on your phone or desktop and use it like a native app, including offline basic functionality.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Installing on iPhone (Safari)</h3>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Open <strong>myradiuscrm.com</strong> in Safari.</li>
                    <li>Tap the <strong>Share</strong> button (box with arrow).</li>
                    <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong> — the RADIUS icon appears on your home screen.</li>
                  </ol>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Installing on Android (Chrome)</h3>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Open <strong>myradiuscrm.com</strong> in Chrome.</li>
                    <li>Tap the <strong>⋮</strong> menu → <strong>Add to Home Screen</strong> (or an install banner may appear automatically).</li>
                    <li>Tap <strong>Add</strong>.</li>
                  </ol>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Installing on Desktop (Chrome/Edge)</h3>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>Open <strong>myradiuscrm.com</strong> in Chrome or Edge.</li>
                    <li>Click the install icon in the address bar (or via the browser menu).</li>
                    <li>Click <strong>Install</strong> — RADIUS opens as a standalone window.</li>
                  </ol>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Tip</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">Once installed, RADIUS launches full-screen without browser chrome, making it feel just like a native app.</p>
                  </div>
                </section>

                {/* ── Admin Tools ── */}
                <section id="admin" className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Admin Tools</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Admin accounts have access to additional tools for managing the system and its users.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Manage Users</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Access via your avatar → <strong>Manage Users</strong>. Here you can:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                    <li>View all RADIUS user accounts with their roles and last login</li>
                    <li>Create new users (email, password, name, role)</li>
                    <li>Edit existing user details and roles</li>
                    <li>Delete user accounts</li>
                  </ul>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Add Leader</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Access via your avatar → <strong>Add Leader</strong>. Fill in the leader's contact info, campus, circle type, meeting details, and initial status to create their profile.</p>

                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Scorecards & Evaluations</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Admins can view and configure the leader scorecard questions used in the Progress page to ensure they align with your pastoral goals.</p>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">Admin Only</h4>
                    <p className="text-yellow-700 dark:text-yellow-300 text-sm">Admin tools are only visible to users with the Admin role. Standard users will not see these menu items.</p>
                  </div>

                  <div className="mt-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Need More Help?</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">If you have questions not covered here, contact your system administrator or reach out via the email on your account profile.</p>
                  </div>
                </section>

              </div>
            </div>
          </div>
        </div>

        {/* Back to Top */}
        <div className="fixed bottom-6 right-6">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg transition-colors"
            aria-label="Back to top"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </div>
    </ProtectedRoute>
  );
}
