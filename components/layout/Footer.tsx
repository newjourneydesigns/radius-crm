'use client';

import { useEffect, useState } from 'react';

export default function Footer() {
  const [version, setVersion] = useState('1.0.0');
  const [currentYear, setCurrentYear] = useState(2025); // Default to avoid hydration mismatch

  useEffect(() => {
    // Get version from environment variable (set by build process)
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
    setVersion(appVersion);
    
    // Set current year on client side only
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 mt-16" style={{
      background: '#f9fafb', // Force solid light background
    }}>
      <style jsx>{`
        footer {
          background: #f9fafb !important;
        }
        @media (prefers-color-scheme: dark) {
          footer {
            background: #111827 !important;
          }
        }
        .dark footer {
          background: #111827 !important;
        }
      `}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center space-y-4">
          {/* Mission Statement */}
          <div className="text-lg font-medium text-gray-900 dark:text-white">
            Shepherd the Flock | Develop Leaders and Teams | Advance the Culture
          </div>

          {/* Legal Links */}
          <div className="text-sm text-gray-600 dark:text-gray-400 flex flex-col sm:flex-row justify-center gap-2 sm:gap-6 mb-2">
            <a href="/privacy-policy" className="underline hover:text-blue-600 dark:hover:text-blue-400">Privacy Policy</a>
            <span className="hidden sm:inline">|</span>
            <a href="/terms" className="underline hover:text-blue-600 dark:hover:text-blue-400">Terms of Service</a>
            <span className="hidden sm:inline">|</span>
            <a href="https://forms.gle/sPGuywb28E2sn8gF7" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-600 dark:hover:text-red-400">Report A Bug</a>
          </div>

          {/* Attribution */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Created to bless His church by{' '}
            <a 
              href="https://newjourneydesigns.co" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
            >
              NewJourneyDesigns.co
            </a>{' '}
            © {currentYear}
          </div>

          {/* Version */}
          <div className="text-xs text-gray-500 dark:text-gray-500">
            Version {version}
          </div>
        </div>
      </div>
    </footer>
  );
}
