// Compilation de l'interface Vue (client/) vers dist/, servi par le serveur Node.
// En production : code minifié, sans source maps ni commentaires, outils de développement Vue désactivés.
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("./shared", import.meta.url));

export default defineConfig({
  root: "client",
  plugins: [vue()],
  resolve: { alias: { "@shared": shared } },
  define: { __VUE_PROD_DEVTOOLS__: false, __VUE_OPTIONS_API__: false },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000" }, // l'API tourne avec « npm run dev:server »
    fs: { allow: [fileURLToPath(new URL("./", import.meta.url))] } // client/, shared/ et node_modules/
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,       // le code source lisible n'est pas publié
    assetsInlineLimit: 0,   // polices et images en fichiers (compatible avec la CSP)
    chunkSizeWarningLimit: 1000
  }
});
