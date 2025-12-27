import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      legacy({
        targets: ['defaults', 'not IE 11', 'Android >= 5'],
        // Explicitly polyfill common missing features for older WebViews
        polyfills: ['es.promise.finally', 'es/map', 'es/set'],
        modernPolyfills: ['es.promise.finally']
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      chunkSizeWarningLimit: 2000, // Increase limit
      target: 'es2015',
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React
            'vendor-react': ['react', 'react-dom'],
            // PDF libraries are huge, split them out
            'pdf-worker': ['pdfjs-dist'],
            'pdf-viewer': ['react-pdf'],
            // Supabase
            'vendor-supabase': ['@supabase/supabase-js'],
          }
        }
      },
    },
    optimizeDeps: {
      include: ['pdfjs-dist'], // Explicitly include pdfjs-dist
      esbuildOptions: {
        target: 'es2015',
      },
    }
  };
});
