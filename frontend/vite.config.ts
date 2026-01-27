import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/', // base path
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        // Use backend service name in Docker, localhost outside Docker
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: '',
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Forward cookies from browser
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie);
            }
            // Forward authorization header if present
            if (req.headers.authorization) {
              proxyReq.setHeader('Authorization', req.headers.authorization);
            }
          });
        },
      },
      '/media': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist', // ✅ ensures Vercel finds your built files
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
})
