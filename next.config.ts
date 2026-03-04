import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    }
  },
  images: { remotePatterns: [
    { protocol: "https", hostname: "covers.openlibrary.org" },
    { protocol: "https", hostname: "suoieaawuz7vdxzk.public.blob.vercel-storage.com" }, // Vercel Blob Storage for user-uploaded images
  ]}
};

export default nextConfig;
