import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// /api istekleri yerel API'ye gider (server klasörü, varsayılan 127.0.0.1:8787).
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
});
