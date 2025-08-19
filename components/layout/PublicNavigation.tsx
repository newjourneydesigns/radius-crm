'use client';

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../../contexts/AuthContext";

export default function PublicNavigation() {
  const { isAuthenticated } = useAuth();

  // Only show public navigation when user is NOT authenticated
  if (isAuthenticated()) {
    return null;
  }

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3">
              <Image
                src="/icon-32x32.png"
                alt="RADIUS Logo"
                width={32}
                height={32}
                className="rounded"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                RADIUS
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link 
              href="/search" 
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Find a Circle
            </Link>
            
            <Link 
              href="/login" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
