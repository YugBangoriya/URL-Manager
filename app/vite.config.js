import { defineConfig } from 'vite'

export default defineConfig({
  // Build output goes to dist/ — Vercel reads this automatically
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
