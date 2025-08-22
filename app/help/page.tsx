'use client';

import { useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState<string>('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: '🏠' },
    { id: 'dashboard', title: 'Dashboard', icon: '📊' },
    { id: 'leaders', title: 'Circle Leaders Page', icon: '👥' },
    { id: 'circle-profiles', title: 'Circle Leader Profiles', icon: '👤' },
    { id: 'notes', title: 'Notes & Templates', icon: '📝' },
    { id: 'filters', title: 'Filtering & Search', icon: '🔍' },
    { id: 'contact', title: 'Contact Features', icon: '📞' }
  ];

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
              <Link 
                href="/dashboard" 
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                RADIUS Help Center
              </h1>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Complete guide to using RADIUS Circle Leader Management System
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sticky top-4">
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              
              {/* Overview Section */}
              <section id="overview" className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
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
                    <li>Connection logging to track interactions and engagement</li>
                    <li>Advanced filtering and search capabilities</li>
                    <li>Direct contact integration (phone, text, email)</li>
                    <li>Status tracking and follow-up management</li>
                    <li>CCB integration for external profile links</li>
                    <li>Mobile-responsive design with navigation optimized for all devices</li>
                  </ul>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Getting Started</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm">
                      Start by exploring the Dashboard for a simplified campus-filtered view, or visit the Leaders page for comprehensive filtering options. Use the global search in the navigation to quickly find specific leaders.
                    </p>
                  </div>
                </div>
              </section>

              {/* Dashboard Section */}
              <section id="dashboard" className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">📊</span>Dashboard
                </h2>
                
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Dashboard Overview</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  The Dashboard provides a streamlined view of circle leaders with simplified campus-based filtering for quick access to essential information.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Navigation Structure</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Search:</strong> Global search functionality accessible from the navigation bar</li>
                  <li><strong>Dashboard:</strong> Main dashboard view with simplified campus filtering</li>
                  <li><strong>Summaries:</strong> Quick access to event summaries tracking</li>
                  <li><strong>Leaders:</strong> Dedicated page for comprehensive leader management with full filtering</li>
                  <li><strong>Settings/Help/Logout:</strong> Available in the hamburger menu for desktop, or main navigation on mobile</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Campus Filter</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  The dashboard features a clean campus filter that allows you to view leaders from specific campuses. 
                  You can select or deselect campuses to customize your view, with options to show/hide the filter panel and clear all selections easily.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Dashboard Display</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  The dashboard provides a simplified view focused on campus-based filtering. For detailed circle leader management, 
                  including individual leader cards and comprehensive quick actions, use the dedicated Leaders page.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Mobile Experience</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  The dashboard is optimized for mobile devices with touch-friendly interfaces, responsive design, 
                  and a navigation structure that prioritizes frequently used functions.
                </p>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Navigation Tip</h4>
                  <p className="text-blue-700 dark:text-blue-300 text-sm">
                    For comprehensive leader management including detailed circle leader cards, quick actions, contact features, 
                    and advanced filtering options (status, meeting day, circle type, etc.), click "Leaders" in the navigation.
                  </p>
                </div>
              </section>

              {/* Circle Leaders Page Section */}
              <section id="leaders" className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">👥</span>Circle Leaders Page
                </h2>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  The dedicated Circle Leaders page provides comprehensive filtering and management capabilities with detailed circle leader cards and extensive quick actions.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Circle Leader Cards</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-2">Each leader card displays comprehensive information:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Name with direct link to full profile</li>
                  <li>Campus and meeting details (day, time, type)</li>
                  <li>Current status with color-coded indicators</li>
                  <li>Follow-up indicators when attention is needed</li>
                  <li>Last note preview for quick context</li>
                  <li>Event summary tracking status</li>
                  <li>Action buttons for immediate management tasks</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Quick Actions</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Contact:</strong> Direct access to phone, text, and email options</li>
                  <li><strong>Log Connection:</strong> Record interactions and communications</li>
                  <li><strong>Add Note:</strong> Quickly add notes without opening the full profile</li>
                  <li><strong>Status Changes:</strong> Update leader status directly from the card</li>
                  <li><strong>Toggle Follow-Up:</strong> Mark or clear follow-up requirements</li>
                  <li><strong>Event Summary Toggle:</strong> Mark event summaries as received</li>
                  <li><strong>Clear Follow-Up:</strong> Remove follow-up flags when issues are resolved</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Advanced Filtering</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Status:</strong> Filter by current leader status, including a special "follow-up" filter</li>
                  <li><strong>Campus:</strong> Show leaders from specific campuses</li>
                  <li><strong>Circle Type:</strong> Filter by Men's, Women's, Young Adult, etc.</li>
                  <li><strong>Meeting Day:</strong> Show leaders who meet on specific days</li>
                  <li><strong>Time of Day:</strong> Filter by AM or PM meeting times</li>
                  <li><strong>Connected:</strong> Show leaders with or without recent connections</li>
                  <li><strong>Event Summary:</strong> Filter by event summary submission status</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Active Filter Tags</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Applied filters are displayed as removable tags above the results, making it easy to see what filters are active 
                  and remove specific filters without clearing everything.
                </p>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Pagination & Export</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Choose to display 25, 50, 100, or all leaders per page</li>
                  <li>Pagination controls for easy navigation through large datasets</li>
                  <li>Export functionality to download filtered results</li>
                </ul>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">🎯 Pro Tip</h4>
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    Use the "follow-up" status filter to quickly find leaders who need immediate attention. This filter works differently from other status filters and can be combined with them. The Leaders page is where all detailed leader management happens.
                  </p>
                </div>
              </section>

              {/* Circle Profiles Section */}
              <section id="circle-profiles" className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
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
                  <li>Current status with follow-up indicators</li>
                  <li>CCB profile integration</li>
                  <li>Event summary tracking status</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Notes Section</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Complete note history with timestamps and user attribution</li>
                  <li>Add new notes with rich text editing</li>
                  <li>Save notes as templates for reuse</li>
                  <li>Use existing note templates</li>
                  <li>Follow-up date and requirement tracking</li>
                  <li>Connection logging with detailed tracking</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Quick Actions Panel</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li><strong>Contact buttons:</strong> Direct phone, text, and email actions</li>
                  <li><strong>Status updates:</strong> Change leader status with dropdown</li>
                  <li><strong>CCB link:</strong> Quick access to external profile</li>
                  <li><strong>Event summary toggle:</strong> Mark if event summary received</li>
                  <li><strong>Follow-up toggle:</strong> Mark or clear follow-up requirements</li>
                  <li><strong>Connection logging:</strong> Record interactions and communications</li>
                </ul>
              </section>

              {/* Notes & Templates Section */}
              <section id="notes" className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">📝</span>Notes & Templates
                </h2>
                
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Adding Notes</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Add notes from dashboard cards using "Add Note" button</li>
                  <li>Add detailed notes from individual leader profiles</li>
                  <li>Notes automatically include timestamp and your user information</li>
                  <li>Set follow-up requirements and dates</li>
                  <li>Connect notes to logged interactions and communications</li>
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
              <section id="filters" className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="mr-3">🔍</span>Filtering & Search
                </h2>
                
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Global Search</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Search bar in top navigation searches across all leaders</li>
                  <li>Searches names, email addresses, and other profile information</li>
                  <li>Results show matching leaders with direct links to profiles</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Dashboard Filters (Simplified)</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Campus:</strong> Show leaders from specific campuses only</li>
                  <li>Simple show/hide toggle for the filter panel</li>
                  <li>"Clear All" button to reset campus selections</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Leaders Page Filters (Full Featured)</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li><strong>Status:</strong> Filter by current leader status, including special "follow-up" option</li>
                  <li><strong>Campus:</strong> Show leaders from specific campuses</li>
                  <li><strong>Circle Type:</strong> Filter by Men's, Women's, Young Adult, etc.</li>
                  <li><strong>Meeting Day:</strong> Show leaders who meet on specific days</li>
                  <li><strong>Time of Day:</strong> Filter by AM or PM meeting times</li>
                  <li><strong>Connected:</strong> Show leaders with or without recent connections</li>
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
                  <li>Filters persist in URL parameters when navigating</li>
                  <li>Use "Clear All" buttons to reset filter selections</li>
                  <li>Active filters are shown as removable tags</li>
                </ul>
              </section>

              {/* Contact Features Section */}
              <section id="contact" className="p-6 sm:p-8">
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

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Connection Logging</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Track your interactions with circle leaders using the "Log Connection" feature:
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-4">
                  <li>Record the type of communication (call, text, email, in-person)</li>
                  <li>Add notes about the interaction</li>
                  <li>Automatic timestamping and user attribution</li>
                  <li>Helps track engagement and follow-up needs</li>
                </ul>

                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Contact Information Display</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mb-6">
                  <li>Contact buttons only appear when phone or email is available</li>
                  <li>Missing contact info is clearly indicated</li>
                  <li>Contact modal shows both phone and email when available</li>
                </ul>

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
    </ProtectedRoute>
  );
}
