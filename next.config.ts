import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/aiassistant',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/aiassistant',
  },
};

export default nextConfig;
