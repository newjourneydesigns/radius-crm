'use client';

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import GlobalSearch from './GlobalSearch';

export default function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const pathname = usePathname();
  const { signOut, isAuthenticated } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Leaders', href: '/leaders' },
    { name: 'Calendar', href: '/calendar' },
  ];

  const hamburgerMenu = [
    { name: 'Add Leader', href: '/add-leader' },
    { name: 'Settings', href: '/settings' },
    { name: 'Help', href: '/help' },
  ];

  const isActive = (href: string) => pathname === href;

  // PWA Install functionality
  useEffect(() => {
    const handleInstallAvailable = () => setShowInstallPrompt(true);
    const handleInstalled = () => setShowInstallPrompt(false);

    window.addEventListener('pwaInstallAvailable', handleInstallAvailable);
    window.addEventListener('pwaInstalled', handleInstalled);

    return () => {
      window.removeEventListener('pwaInstallAvailable', handleInstallAvailable);
      window.removeEventListener('pwaInstalled', handleInstalled);
    };
  }, []);

  const handleInstallClick = () => {
    if (typeof window !== 'undefined' && (window as any).installPWA) {
      (window as any).installPWA();
    }
  };

  // Don't render navigation if user is not authenticated
  if (!isAuthenticated()) {
    return null;
  }

  return (
    <nav className="md:hidden bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Logo section - moved to top */}
        <div className="flex justify-center items-center h-12 border-b border-gray-100 dark:border-gray-700">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <Image
              src="/icon-32x32.png"
              alt="RADIUS Logo"
              width={28}
              height={28}
              className="rounded"
            />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              RADIUS
            </span>
          </Link>
        </div>

        {/* Navigation section - now has full width */}
        <div className="flex justify-between items-center h-14">
          {/* Main navigation items with better spacing */}
          <div className="flex items-center space-x-3 flex-1">
            <GlobalSearch />
            
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive(item.href)
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
            
          {/* Hamburger menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {isOpen && (
          <div className="pb-3 space-y-1">
            {showInstallPrompt && (
              <button
                onClick={handleInstallClick}
                className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Install App</span>
                </div>
              </button>
            )}
            
            {hamburgerMenu.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive(item.href)
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                onClick={() => setIsOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <button
              onClick={() => {
                signOut();
                setIsOpen(false);
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
