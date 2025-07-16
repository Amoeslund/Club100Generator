/** @type {import('next').NextConfig} */
import createBundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.BUNDLE_ANALYZE === 'true',
});

const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',
  
  // Disable compression in development to fix SSE streaming
  compress: process.env.NODE_ENV === 'production',
  
  // Configure for Docker deployment
  compiler: {
    // Remove console.logs in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Configure images domain if using external images
  images: {
    unoptimized: false,
    remotePatterns: [
      // Add your domains here for external images
      // Example:
      // {
      //   protocol: 'https',
      //   hostname: 'example.com',
      // },
    ],
  },
  
  // Ensure static file generation
  trailingSlash: false,
  
  // Configure for production optimization
  poweredByHeader: false,
  reactStrictMode: true,

  
  async rewrites() {
    return [
      
      {
        source: '/api/:path*',
        destination: 'http://localhost:5001/api/:path*',
      }
    ];
  },
};

export default withBundleAnalyzer(nextConfig); 