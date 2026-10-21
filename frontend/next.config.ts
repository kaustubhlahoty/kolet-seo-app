import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundles the Higgsfield CLI binary into the generate-images function —
  // it's invoked as a subprocess, not statically imported, so Next's
  // automatic file tracing doesn't pick it up on its own.
  outputFileTracingIncludes: {
    "/api/articles/[id]/generate-images": ["./vendor/higgsfield/**"],
  },
};

export default nextConfig;
