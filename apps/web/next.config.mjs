// Where /api/* requests are proxied to. In production (Vercel) this is unset,
// so it defaults to the Fly backend. For local dev against a local API, set
// API_ORIGIN=http://localhost:8080 in apps/web/.env.local.
const API_ORIGIN = process.env.API_ORIGIN ?? 'https://composed-prompts-api.fly.dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* through the Vercel domain to the Fly backend. This keeps the
  // browser talking to its OWN origin, so the session cookie is first-party and
  // SameSite=Lax works across every browser (no cross-site / third-party-cookie
  // problems between *.vercel.app and *.fly.dev).
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
  // Compile the shared workspace package as part of the Next.js build
  // so its TypeScript source + .js-extension imports resolve correctly.
  transpilePackages: ['@composed-prompts/shared'],
  webpack: (config) => {
    // Map .js imports in shared package source to the actual .ts files.
    // Required because NodeNext (used by apps/api) demands explicit .js
    // extensions on relative imports, but webpack needs help to find
    // the .ts source files behind those names.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.js', '.ts', '.tsx'],
      '.mjs': ['.mjs', '.mts'],
    };
    return config;
  },
};

export default nextConfig;
