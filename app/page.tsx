import { Suspense } from 'react'
import ProtectedRoute from '../components/ProtectedRoute'

function LoadingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      {/* Logo */}
      <div className="mb-8">
        <div className="w-20 h-20 mx-auto bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
          <span className="text-3xl font-bold text-white">R</span>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
        RADIUS
      </h1>

      {/* Tagline */}
      <p className="text-xl text-white/90 mb-12 max-w-md leading-relaxed">
        Shepherd the flock. Develop Leaders and teams. Advance the culture.
      </p>

      {/* Loading spinner */}
      <div className="flex items-center space-x-2 text-white/80">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/30 border-t-white"></div>
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <ProtectedRoute>
        <LoadingPage />
      </ProtectedRoute>
    </Suspense>
  )
}
