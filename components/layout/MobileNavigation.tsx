'use client';

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";

export default function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Filter navigation items based on authentication state
  const getNavigationItems = () => {
    const baseItems = [
      { name: 'Dashboard', href: '/dashboard', requiresAuth: true },
      { name: 'Add Circle Leader', href: '/add-leader', requiresAuth: true },
      { name: 'Users', href: '/users', requiresAuth: true },
      { name: 'Tools', href: '/func', requiresAuth: true },
      { name: 'Settings', href: '/settings', requiresAuth: true },
    ];

    const authItems = isAuthenticated() 
      ? [{ name: 'Logout', href: '/logout', requiresAuth: true }]
      : [{ name: 'Login', href: '/login', requiresAuth: false }];

    const filteredBaseItems = isAuthenticated() 
      ? baseItems 
      : baseItems.filter(item => !item.requiresAuth);

    return [...filteredBaseItems, ...authItems];
  };

  const navigation = getNavigationItems();
  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile Navigation Header */}
      <header className="md:hidden bg-white dark:bg-gray-800 shadow border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="px-4 py-3">
          <div className="flex justify-between items-center">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <Image 
                src="/icon-32x32.png" 
                alt="RADIUS Logo" 
                width={24} 
                height={24}
                className="rounded"
              />
              <span className="text-xl font-bold text-white">
                RADIUS
              </span>
            </Link>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-label="Toggle navigation menu"
            >
              <svg 
                className="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="px-2 py-3 space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                      : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
