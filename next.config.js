/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/admin", permanent: false },
      { source: "/life-care", destination: "/no-clawback", permanent: true },
    ];
  },
};

module.exports = nextConfig;
