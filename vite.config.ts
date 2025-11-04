import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Custom Rollup plugin to generate version.json
const versionPlugin = () => {
  return {
    name: "version-plugin",
    writeBundle() {
      const version = {
        version: Date.now().toString(), // Use timestamp as version
      };
      const outputPath = path.resolve(__dirname, "dist", "version.json");
      fs.writeFileSync(outputPath, JSON.stringify(version, null, 2));
      console.log(`Generated version.json: ${version.version}`);
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionPlugin()], // Add the custom plugin here
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          ui: ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: "terser", // Garante que o terser seja usado para minificação
    terserOptions: {
      compress: {
        drop_console: true, // Isso removerá as declarações console.log
      },
    },
  },
});
