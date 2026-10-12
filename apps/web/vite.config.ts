import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Kinwise Family Meds",
        short_name: "Kinwise",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1a5c3f",
        icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      workbox: { runtimeCaching: [{ urlPattern: /^https:\/\/.*\/api\/today.*/, handler: "NetworkFirst", options: { cacheName: "today-cache" } }] },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
