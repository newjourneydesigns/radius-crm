/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove static export for now since we have dynamic routes with database dependencies
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  // Configure for Netlify deployment
  experimental: {
    esmExternals: 'loose'
  }
};

module.exports = nextConfig;
