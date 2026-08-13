import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ada lockfile lain di direktori induk; kunci akar proyek ke folder ini.
  turbopack: { root: import.meta.dirname },
  // pdf-parse memuat worker pdf.js lewat path relatif terhadap berkasnya sendiri,
  // jadi biarkan dimuat dari node_modules alih-alih ikut di-bundle.
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
