import Link from 'next/link';

// Styled 404 for unknown routes (replaces Next's default not-found screen).

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-green-500 mb-2">404</p>
        <h1 className="text-2xl font-bold text-gray-100 mb-2">Page not found</h1>
        <p className="text-gray-400 mb-6">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
