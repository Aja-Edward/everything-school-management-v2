import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      {
        name: 'suppress-node-externals',
        enforce: 'pre',
        onLog(_level, log) {
          if (log.message.includes('has been externalized for browser compatibility')) {
            return false
          }
        },
      },
      react(),
    ],
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'canvas': path.resolve(__dirname, 'src/canvas-stub.js'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
            target: env.VITE_BACKEND_URL || 'http://localhost:8000',
            changeOrigin: true,
            secure: false,
            cookieDomainRewrite: '',
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                // Dynamically forward whatever subdomain the browser sent
                const host = req.headers.host;
                if (host) {
                  proxyReq.setHeader('X-Forwarded-Host', host);
                  proxyReq.setHeader('Host', host);
                }
                if (req.headers.cookie) {
                  proxyReq.setHeader('Cookie', req.headers.cookie);
                }
                if (req.headers.authorization) {
                  proxyReq.setHeader('Authorization', req.headers.authorization);
                }
              });
            },
          },
        '/media': {
          target: env.VITE_BACKEND_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        onwarn(warning, warn) {
          // Suppress unresolvable optional deps from node_modules (e.g. canvas, canvg)
          if (warning.code === 'UNRESOLVED_IMPORT' && warning.id?.includes('node_modules')) {
            return
          }
          warn(warning)
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
  }
})