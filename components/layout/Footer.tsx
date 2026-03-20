'use client';

import { useEffect, useState } from 'react';

export default function Footer() {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';

  return (
    <footer className="border-t border-gray-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: Attribution */}
          <p className="text-xs text-gray-600 order-2 sm:order-1">
            © {currentYear}{' '}
            <a
              href="https://newjourneydesigns.co"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              NewJourneyDesigns.co
            </a>
            {' '}· v{version}
          </p>

          {/* Center: Mission (hidden on small screens) */}
          <p className="hidden md:block text-xs text-gray-700 text-center order-1 sm:order-2">
            Shepherd the Flock · Develop Leaders · Advance the Culture
          </p>

          {/* Right: Legal links */}
          <nav className="flex items-center gap-4 order-3 text-xs text-gray-600">
            <a href="/privacy-policy" className="hover:text-gray-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-gray-400 transition-colors">Terms</a>
            <a
              href="https://forms.gle/sPGuywb28E2sn8gF7"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              Report a Bug
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
