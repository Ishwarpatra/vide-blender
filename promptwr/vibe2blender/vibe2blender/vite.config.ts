import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { wasp } from 'wasp/client/vite'

export default defineConfig({
  plugins: [tailwindcss(), wasp()],
  server: {
    open: true,
  },
  ssr: {
    noExternal: ['react-router-dom', 'react-router', '@wasp.sh/lib-vite-ssr'],
  },
})
