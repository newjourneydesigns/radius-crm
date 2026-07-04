'use client';

import { useEffect, useState } from 'react';
import changelog from '../../public/changelog.json';

// Show the newest changelog entry that carries a version tag. Reading
// changelog[0] directly blanked out the footer whenever the latest entries had
// no `version` field (most don't), so walk to the first tagged release instead.
const APP_VERSION =
  (changelog as Array<{ version?: string }>).find((e) => e.version)?.version ?? '';

export default function Footer() {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="border-t border-gray-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="hidden sm:block text-xs text-gray-600 italic text-center mb-4">
          &ldquo;For the good of others and the glory of God.&rdquo;
        </p>
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
            {APP_VERSION ? <>{' '}· v{APP_VERSION}</> : null}
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
              href="https://vccradius.netlify.app/f/circles-toolkit-bug-report-copy-7o4vfp"
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
