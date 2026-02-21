'use client';

import { useEffect, useState } from 'react';

export default function Footer() {
  const [version, setVersion] = useState(process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0');
  const [currentYear, setCurrentYear] = useState(2025); // Default to avoid hydration mismatch

  useEffect(() => {
    // Get version from environment variable (set by build process)
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
    setVersion(appVersion);
    
    // Set current year on client side only
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="bg-gray-900 border-t border-gray-700/60 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center space-y-4">
          {/* Mission Statement */}
          <div className="text-sm font-medium text-gray-300">
            Shepherd the Flock | Develop Leaders and Teams | Advance the Culture
          </div>

          {/* Legal Links */}
          <div className="text-sm text-gray-500 flex flex-col sm:flex-row justify-center gap-2 sm:gap-6 mb-2">
            <a href="/privacy-policy" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
            <span className="hidden sm:inline text-gray-700">|</span>
            <a href="/terms" className="hover:text-gray-300 transition-colors">Terms of Service</a>
            <span className="hidden sm:inline text-gray-700">|</span>
            <a href="https://forms.gle/sPGuywb28E2sn8gF7" target="_blank" rel="noopener noreferrer" className="hover:text-red-400 transition-colors">Report A Bug</a>
          </div>

          {/* Attribution */}
          <div className="text-sm text-gray-500">
            Created to bless His church by{' '}
            <a 
              href="https://newjourneydesigns.co" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              NewJourneyDesigns.co
            </a>{' '}
            © {currentYear}
          </div>

          {/* Version */}
          <div className="text-xs text-gray-600">
            Version {version}
          </div>
        </div>
      </div>
    </footer>
  );
}
