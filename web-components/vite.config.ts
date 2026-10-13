import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** For Storybook only: the apps build this package from source with their own config. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
