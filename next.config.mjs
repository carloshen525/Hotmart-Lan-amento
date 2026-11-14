/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // React Flow recommends false for drag/drop smooth rendering
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'nodemailer', 'bcryptjs'],
  },
};

export default nextConfig;
