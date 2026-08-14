import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/itinero/',
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    proxy: {
      // Optional: same-origin /api → flights API (manual search + chat routes)
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
  plugins: [
    {
      name: 'redirect-spa-base',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || ''
          const path = url.split('?')[0]
          if (path === '/plus' || path.startsWith('/plus/')) {
            res.statusCode = 302
            res.setHeader('Location', `/itinero${url}`)
            res.end()
            return
          }
          next()
        })
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
