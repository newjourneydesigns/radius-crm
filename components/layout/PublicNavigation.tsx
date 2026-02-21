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
    <nav className="bg-gray-900 border-b border-gray-700/60 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2.5">
              <Image
                src="/icon-32x32.png"
                alt="RADIUS Logo"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-lg font-bold text-white tracking-tight">
                RADIUS
              </span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <Link 
              href="/search" 
              className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-700/60"
            >
              Find a Circle
            </Link>
            
            <Link 
              href="/login" 
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors shadow-md shadow-blue-900/30"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
