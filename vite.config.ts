import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      ignored: [
        "**/.git/**",
        "**/.omx/**",
        "**/data/**",
        "**/dist/**",
        "**/node_modules/**",
        "**/plans/**",
        "**/reports/screenshots/**",
        "**/reports/design/*.png"
      ]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
