/** @type {import('next').NextConfig} */
const nextConfig = {
  // ponytail: same-origin /api/* → FastAPI. Browser never learns the backend host.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
