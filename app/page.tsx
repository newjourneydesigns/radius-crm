import ProtectedRoute from '../components/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-full p-6 shadow-xl">
              <svg 
                className="h-20 w-20 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="2" 
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
          
          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            <span className="text-white/90">RADIUS</span>
          </h1>
          
          {/* Tagline */}
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Shepherd the flock. Develop Leaders and teams. Advance the culture.
          </p>
          
          {/* Loading indicator */}
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
