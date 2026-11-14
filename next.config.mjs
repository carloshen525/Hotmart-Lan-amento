/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // React Flow recommends false for drag/drop smooth rendering
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'nodemailer', 'bcryptjs'],
  },
  async redirects() {
    return [
      { source: '/campaigns', destination: '/automations', permanent: false },
      { source: '/emails', destination: '/email', permanent: false },
      { source: '/calendar', destination: '/automations', permanent: false },
    ];
  },
};

export default nextConfig;
