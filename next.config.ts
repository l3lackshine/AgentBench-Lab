import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  poweredByHeader: false,
  serverExternalPackages: ['jszip']
};

export default nextConfig;
