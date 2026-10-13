/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 7350 and 7351 rather than Vite's 5173: every port below 7300 on this machine
 * is claimed by another project, and quietly stealing one from a running
 * service is worse than picking an odd number. The API sits on 7331.
 */
/**
 * The shared components (../web-components), linked in and built from source
 * as the web app does: served from outside this folder in development, and
 * resolved against this app's React rather than the library's own copy.
 */
const sharedComponents = new URL('../web-components', import.meta.url).pathname

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 7350, strictPort: true, fs: { allow: ['.', sharedComponents] } },
  preview: { port: 7350, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
