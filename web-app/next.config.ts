import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Profiles live at /@handle. A folder can't start with "@" (that's a parallel route), so they're served from /profiles/[handle].
  async rewrites() {
    return [{ source: "/@:handle", destination: "/profiles/:handle" }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
