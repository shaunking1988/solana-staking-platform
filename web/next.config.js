/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Skip database connections during build
  experimental: {
    instrumentationHook: true, // ⬅️ ADD THIS LINE
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

module.exports = nextConfig;