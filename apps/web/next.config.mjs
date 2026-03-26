/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@wford26/design-tokens", "@wford26/shared-types", "@wford26/ui"],
};

export default nextConfig;
