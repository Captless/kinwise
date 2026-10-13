import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: {
        name: "Kinwise Family Meds",
        short_name: "Kinwise",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1a5c3f",
        icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
