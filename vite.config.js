import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloudflare Pages: SPA estática. base './' pra paths relativos (funciona em qualquer subpath).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false }
})
