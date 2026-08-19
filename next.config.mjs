const supabaseHostname = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.56.1"],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      ...(supabaseHostname
        ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
};

export default nextConfig;
