import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images:{
    remotePatterns:[
      {
        protocol: "https",
        hostname: "gebhsjemjsrgnlonbhbv.supabase.co",
        port: "",
        pathname: "/profile/**",
      }
    ]
  }
};

export default nextConfig;
