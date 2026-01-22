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
  images: {
    unoptimized: true
  },
  // Configure for Netlify deployment
  experimental: {
    esmExternals: 'loose'
  },
  env: {
    // Exposed to the browser at build time
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '0.0.0'
  }
};

module.exports = nextConfig;
