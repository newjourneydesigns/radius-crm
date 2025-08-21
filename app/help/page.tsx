'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState<string>('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: '🏠' },
    { id: 'dashboard', title: 'Dashboard', icon: '📊' },
    { id: 'circle-profiles', title: 'Circle Leader Profiles', icon: '👤' },
    { id: 'event-summaries', title: 'Event Summaries', icon: '📋' },
    { id: 'notes', title: 'Notes & Templates', icon: '📝' },
    { id: 'filters', title: 'Filtering & Search', icon: '🔍' },
    { id: 'contact', title: 'Contact Features', icon: '📞' },
    { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: '⌨️' }
  ];

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            RADIUS Help Center
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Complete guide to using RADIUS Circle Leader Management System
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sticky top-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Contents</h3>
              <nav className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`w-full text-left flex items-center space-x-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      activeSection === section.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{section.icon}</span>
                    <span>{section.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              
              {/* Overview Section */}
              <section id="overview" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">🏠</span>Overview
                </h2>
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    RADIUS is a comprehensive Circle Leader Management System designed to help you track, manage, and communicate with circle leaders effectively.
                  </p>
                  
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Key Features</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400 mb-6">
                    <li>Circle leader profile management with detailed contact information</li>
                    <li>Event summary tracking and progress monitoring</li>
                    <li>Note-taking with templates for consistent communication</li>
                    <li>Advanced filtering and search capabilities</li>
                    <li>Direct contact integration (phone, text, email)</li>
                    <li>Status tracking and follow-up management</li>
                    <li>CCB integration for external profile links</li>
                  </ul>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Getting Started</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      Start by exploring the Dashboard to get an overview of all circle leaders, then use the filters to find specific groups or individuals you need to work with.
                    </p>
                  </div>
                </div>
              </section>

              {/* Dashboard Section */}
              <section id="dashboard" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">📊</span>Dashboard
                </h2>
                
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Dashboard Overview</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  The Dashboard is your central hub for managing all circle leaders. It provides a comprehensive view with powerful filtering and status tracking.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Status Cards</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Invited:</strong> Leaders who have been invited but haven't started yet</li>
                  <li><strong>Pipeline:</strong> Leaders in the onboarding process</li>
                  <li><strong>Active:</strong> Currently leading circles</li>
                  <li><strong>Follow-Up:</strong> Leaders requiring immediate attention</li>
                  <li><strong>Paused:</strong> Temporarily inactive leaders</li>
                  <li><strong>Off-Boarding:</strong> Leaders transitioning out</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Circle Leader Cards</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-2">Each leader card displays:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Name (clickable link to full profile)</li>
                  <li>Campus and meeting details</li>
                  <li>Current status with color coding</li>
                  <li>Last note preview</li>
                  <li>Action buttons (Contact, CCB, Quick Actions)</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Quick Actions</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li><strong>Add Note:</strong> Quickly add a note without opening the full profile</li>
                  <li><strong>Change Status:</strong> Update leader status directly from the card</li>
                  <li><strong>Contact:</strong> Access phone, text, and email options</li>
                  <li><strong>CCB Link:</strong> Open external CCB profile in new tab</li>
                </ul>
              </section>

              {/* Circle Profiles Section */}
              <section id="circle-profiles" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">👤</span>Circle Leader Profiles
                </h2>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Individual leader profiles provide detailed information and comprehensive management tools.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Profile Information</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Contact details (email, phone)</li>
                  <li>Campus and circle type</li>
                  <li>Meeting day and time</li>
                  <li>Current status</li>
                  <li>CCB profile integration</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Notes Section</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Complete note history with timestamps</li>
                  <li>Add new notes with rich text editing</li>
                  <li>Save notes as templates for reuse</li>
                  <li>Use existing note templates</li>
                  <li>Follow-up date and requirement tracking</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Quick Actions Panel</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li><strong>Contact buttons:</strong> Direct phone, text, and email actions</li>
                  <li><strong>Status updates:</strong> Change leader status with dropdown</li>
                  <li><strong>CCB link:</strong> Quick access to external profile</li>
                  <li><strong>Event summary toggle:</strong> Mark if event summary received</li>
                </ul>
              </section>

              {/* Event Summaries Section */}
              <section id="event-summaries" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">📋</span>Event Summaries
                </h2>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Track event summary submissions from circle leaders with a dedicated tracking interface.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Progress Tracking</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Visual progress bar showing completion percentage</li>
                  <li>Total count of submitted vs. pending summaries</li>
                  <li>Automatic filtering of inactive leaders (invited, pipeline, archived)</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Table Features</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Sortable columns:</strong> Name, Meeting Day (Sun-Sat order), Status</li>
                  <li><strong>Meeting Day column:</strong> Shows when each circle meets</li>
                  <li><strong>Status indicators:</strong> Color-coded status badges</li>
                  <li><strong>Contact buttons:</strong> Direct communication access</li>
                  <li><strong>Checkboxes:</strong> Mark summaries as received</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Mobile View</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-2">On mobile devices, information is organized in cards showing:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Circle Leader name (with profile link)</li>
                  <li>Meeting day information</li>
                  <li>CCB and Contact buttons</li>
                  <li>Event summary checkbox</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Reset Functionality</h4>
                <p className="text-gray-600 dark:text-gray-400">
                  Use the "Reset All Event Summaries" button to clear all checkboxes when starting a new tracking period.
                </p>
              </section>

              {/* Notes & Templates Section */}
              <section id="notes" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">📝</span>Notes & Templates
                </h2>
                
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Adding Notes</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Add notes from dashboard cards using "Add Note" button</li>
                  <li>Add detailed notes from individual leader profiles</li>
                  <li>Notes automatically include timestamp and your user information</li>
                  <li>Set follow-up requirements and dates</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Note Templates</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Create reusable templates in Settings → Note Templates</li>
                  <li>Use templates when adding notes via "Use Template" button</li>
                  <li>Save existing notes as templates for future use</li>
                  <li>Templates help ensure consistent communication</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Template Management</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Create:</strong> Add new templates with title and content</li>
                  <li><strong>Edit:</strong> Modify existing templates</li>
                  <li><strong>Delete:</strong> Remove templates you no longer need</li>
                  <li><strong>Save As Template:</strong> Convert any note into a reusable template</li>
                </ul>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">💡 Pro Tip</h4>
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    Create templates for common scenarios like "Initial Contact," "Follow-up Needed," or "Circle Update" to speed up your workflow.
                  </p>
                </div>
              </section>

              {/* Filters & Search Section */}
              <section id="filters" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">🔍</span>Filtering & Search
                </h2>
                
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Global Search</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Search bar in top navigation searches across all leaders</li>
                  <li>Searches names, email addresses, and other profile information</li>
                  <li>Results show matching leaders with direct links to profiles</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Dashboard Filters</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Status:</strong> Filter by current leader status</li>
                  <li><strong>Campus:</strong> Show leaders from specific campuses</li>
                  <li><strong>Circle Type:</strong> Filter by Men's, Women's, Young Adult, etc.</li>
                  <li><strong>Meeting Day:</strong> Show leaders who meet on specific days</li>
                  <li><strong>Time of Day:</strong> Filter by AM or PM meeting times</li>
                  <li><strong>Connected:</strong> Show leaders with or without recent contact</li>
                  <li><strong>Event Summary:</strong> Filter by event summary submission status</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Event Summaries Filters</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Similar filtering options focused on active leaders only</li>
                  <li>Automatically excludes invited, pipeline, and archived leaders</li>
                  <li>Reset filters button to clear all selections</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Filter Tips</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li>Combine multiple filters for precise results</li>
                  <li>Filters persist when navigating between Dashboard and Event Summaries</li>
                  <li>Use "Clear Filters" to reset to show all leaders</li>
                  <li>Status filter automatically updates counts in status cards</li>
                </ul>
              </section>

              {/* Contact Features Section */}
              <section id="contact" className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">📞</span>Contact Features
                </h2>
                
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Contact Modal</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Click any "Contact" button to open a modal with communication options:
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Call:</strong> Opens your device's phone app with the number pre-filled</li>
                  <li><strong>Text:</strong> Opens SMS app with the leader's number</li>
                  <li><strong>Email:</strong> Opens your email client with a new message</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Contact Information Display</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Contact buttons only appear when phone or email is available</li>
                  <li>Missing contact info is clearly indicated</li>
                  <li>Contact modal shows both phone and email when available</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">CCB Integration</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li>CCB links open external Church Community Builder profiles</li>
                  <li>Opens in new tab to preserve your RADIUS session</li>
                  <li>Available on dashboard cards, profiles, and event summaries</li>
                  <li>Clearly marked when CCB profile is not available</li>
                </ul>
              </section>

              {/* Keyboard Shortcuts Section */}
              <section id="shortcuts" className="p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">⌨️</span>Keyboard Shortcuts
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Navigation</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <span className="text-gray-600 dark:text-gray-400">Go to Dashboard</span>
                        <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono">Cmd+1</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <span className="text-gray-600 dark:text-gray-400">Go to Event Summaries</span>
                        <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono">Cmd+2</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <span className="text-gray-600 dark:text-gray-400">Global Search</span>
                        <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono">Cmd+K</kbd>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Actions</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <span className="text-gray-600 dark:text-gray-400">Add Note (on profile)</span>
                        <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono">Cmd+N</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <span className="text-gray-600 dark:text-gray-400">Save Note</span>
                        <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono">Cmd+S</kbd>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                        <span className="text-gray-600 dark:text-gray-400">Close Modal</span>
                        <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono">Esc</kbd>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">📚 Need More Help?</h4>
                  <p className="text-blue-700 dark:text-blue-300 text-sm mb-2">
                    If you need additional assistance or have questions not covered in this guide:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300 text-sm">
                    <li>Contact your system administrator</li>
                    <li>Check for software updates that may include new features</li>
                    <li>Explore the interface - most features have helpful tooltips</li>
                  </ul>
                </div>
              </section>

            </div>
          </div>
        </div>

        {/* Back to Top Button */}
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
    </div>
  );
}
