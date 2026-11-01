import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  server: {
    port: 5173, strictPort: true ,
    host: '0.0.0.0',
    allowedHosts: [
      'sb-1cy4nquixftu.vercel.run'
    ]
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
});
