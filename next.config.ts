import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['macmini.local', '192.168.10.13', '192.168.10.11'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons',
      },
    ],
  },
};

export default nextConfig;
