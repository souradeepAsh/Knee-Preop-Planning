// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Split node_modules into a separate chunk
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000, // Set this according to your needs (in kB)
    },
  },
});
