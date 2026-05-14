/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/life-care", destination: "/no-clawback", permanent: true }];
  },
};

module.exports = nextConfig;
