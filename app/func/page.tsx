'use client';

import Link from 'next/link';

export default function FuncPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Functional Tools
          </h1>
          
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                <Link 
                  href="/func/event-notes" 
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  CCB Event Notes for Group
                </Link>
              </h2>
              <p className="text-gray-600">
                Fetch and display event notes from the CCB API for a specific group within a date range.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
