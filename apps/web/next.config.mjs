/** @type {import('next').NextConfig} */
const nextConfig = {
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
