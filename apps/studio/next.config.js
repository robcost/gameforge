//@ts-check

// Workaround for Next.js 16 + Nx: ensure NODE_ENV is 'production'
// during builds. Without this, Nx may leave NODE_ENV as 'test' or
// unset, causing /_global-error prerender failures.
// See: https://github.com/vercel/next.js/issues/87719
if (
  process.env.NODE_ENV !== 'development' &&
  process.env.NODE_ENV !== 'production'
) {
  process.env.NODE_ENV = 'production';
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
