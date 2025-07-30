import Link from "next/link";
import "../styles/globals.css";
import MobileNavigation from "../components/layout/MobileNavigation";

export default function RootLayout({ 
  children 
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
        {/* Mobile Navigation */}
        <MobileNavigation />
        
        {/* Desktop Navigation */}
        <header className="hidden md:block bg-white dark:bg-gray-800 shadow border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <Link href="/dashboard" className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                RADIUS
              </Link>
              <nav className="flex space-x-1">
                <Link 
                  href="/dashboard" 
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/add-leader" 
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Add Leader
                </Link>
                <Link 
                  href="/settings" 
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Settings
                </Link>
                <Link 
                  href="/login" 
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Login
                </Link>
                <Link 
                  href="/logout" 
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Logout
                </Link>
              </nav>
            </div>
          </div>
        </header>
        
        {/* Main Content with mobile padding */}
        <main className="pb-16 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
