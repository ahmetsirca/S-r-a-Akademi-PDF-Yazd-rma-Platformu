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
        // Aggressive targets for older mobile devices/WebViews
        targets: ['defaults', 'not IE 11', 'Android >= 5', 'iOS >= 10', 'Chrome >= 60'],
        // Explicitly polyfill common missing features for older WebViews
        polyfills: ['es.promise.finally', 'es/map', 'es/set', 'es.global-this', 'es.object.from-entries'],
        modernPolyfills: ['es.promise.finally', 'es.global-this'],
        renderLegacyChunks: true,
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
      // Relax chunk size warning
      chunkSizeWarningLimit: 2000,
      // STRICTLY enforce ES2015 to avoid esnext syntax like optional chaining crashing old WebViews
      target: 'es2015',
      minify: 'esbuild', // Faster and usually sufficient, but respects target
      cssTarget: 'chrome61', // Prevent modern CSS cracking valid old browsers
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // PDF libraries are huge, split them out
            'pdf-worker': ['pdfjs-dist'],
            'pdf-viewer': ['react-pdf'],
            // Supabase
            'vendor-supabase': ['@supabase/supabase-js'],
            // Icons/UI
            'vendor-ui': ['lucide-react', 'framer-motion']
          }
        }
      },
    },
    optimizeDeps: {
      include: ['pdfjs-dist'],
      esbuildOptions: {
        // Ensure dev server also serves compatible code
        target: 'es2015',
      },
    }
  };
});
