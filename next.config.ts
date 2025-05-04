import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images:{
    remotePatterns:[
      {
        protocol: "https",
        hostname: "gebhsjemjsrgnlonbhbv.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      }
    ]
  },
  typescript: {
    "ignoreBuildErrors": true
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
