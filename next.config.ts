import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lekce se čtou ze souborů; tohle je pojistka, kdyby některá stránka přestala být statická.
  outputFileTracingIncludes: {
    "/**": ["./data/lessons/**"],
  },
  /* config options here */
};

export default nextConfig;
