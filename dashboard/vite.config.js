import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev: forward Deal Engine calls to the AI Agents API (`npm start` at
// the repo root, port 3000) so no CORS setup is needed.
const AGENTS_API = process.env.AGENTS_API_PROXY || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/deal-engine': AGENTS_API,
      '/health': AGENTS_API,
    },
  },
})
