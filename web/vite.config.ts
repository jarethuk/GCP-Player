/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

/**
 * The shared components (../web-components) are linked in and built from
 * source: served from outside this folder in development, and resolved
 * against this app's React rather than the copy the library installs for its
 * own Storybook — two Reacts on one page breaks every hook.
 */
const sharedComponents = new URL('../web-components', import.meta.url).pathname

/**
 * A patron's Patreon feed, reached through this app's own origin.
 *
 * Patreon answers a feed request without an Access-Control-Allow-Origin
 * header (its errors carry one; its successes don't), so a browser can't read
 * the feed from anywhere else. In production vercel.json rewrites the same
 * path to Patreon; this is that rewrite for `vite` and `vite preview`.
 */
const patreonProxy: Record<string, ProxyOptions> = {
  '/patreon/rss': {
    target: 'https://www.patreon.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/patreon\/rss/, '/rss/glasscannon'),
  },
}

/**
 * 7360 and 7361 rather than Vite's 5173: every port below 7300 on this machine
 * is claimed by another project. The dashboard has 7350/7351 and the API 7331.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    port: 7360,
    strictPort: true,
    proxy: patreonProxy,
    fs: { allow: ['.', sharedComponents] },
  },
  preview: { port: 7360, strictPort: true, proxy: patreonProxy },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
