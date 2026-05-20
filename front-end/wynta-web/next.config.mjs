/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['wynta-react-common'],
  async rewrites() {
    return [
      {
        source: '/bonus/:path*',
        destination: 'http://localhost:3001/bonus/:path*',
      },
      {
        source: '/crm/:path*',
        destination: 'http://localhost:3002/crm/:path*',
      },
    ];
  },
};

export default nextConfig;
