// vite.config.js
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three/examples/jsm/loaders/STLLoader.js')) {
              return 'three-stl-loader';
            }
            return 'vendor';
          }
        },
      },
      chunkSizeWarningLimit: 1000, // Set this according to your needs (in kB)
    },
  },
});
