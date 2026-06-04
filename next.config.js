/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove static export for now since we have dynamic routes with database dependencies
  trailingSlash: true,
  // Netlify runs `next build` which includes ESLint by default.
  // This repo currently has a number of lint violations that are non-fatal at runtime,
  // so we skip lint during CI builds to avoid blocking deploys.
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  images: {
    unoptimized: true
  },
  env: {
    // Exposed to the browser at build time
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '0.0.0'
  },
  // The leader-facing app moved from /circle-summary to /circle-leader-toolkit.
  // These 308 redirects keep already-installed home-screen PWAs, magic-link
  // sign-in emails, push deep links, and old bookmarks working at the new path.
  // Icon assets were intentionally left at their original /circle-summary-icon-*
  // filenames, so they are not redirected.
  async redirects() {
    return [
      { source: '/circle-summary', destination: '/circle-leader-toolkit', permanent: true },
      { source: '/circle-summary/:path*', destination: '/circle-leader-toolkit/:path*', permanent: true },
      { source: '/api/circle-summary/:path*', destination: '/api/circle-leader-toolkit/:path*', permanent: true },
      { source: '/api/admin/circle-summary-inbox', destination: '/api/admin/circle-leader-toolkit-inbox', permanent: true },
      { source: '/api/admin/circle-summary-messages', destination: '/api/admin/circle-leader-toolkit-messages', permanent: true },
      { source: '/manifest-circle-summary.json', destination: '/manifest-circle-leader-toolkit.json', permanent: true }
    ];
  }
};

module.exports = nextConfig;
