// Atelier de veille : point d'entrée.
// Lancement : npm run build (une fois, pour compiler l'interface Vue), puis npm start,
// et ouvrir http://localhost:3000
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile, readConfig } from "./config.js";
import { createApp } from "./app.js";

loadEnvFile();
const config = readConfig();

// Accessible depuis le réseau (Docker, serveur) : un mot de passe est obligatoire.
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
if (!config.password && !LOOPBACK.has(config.host)) {
  console.error("\n  ✖ APP_PASSWORD manquant : le serveur écoute sur " + config.host + " (accessible depuis le réseau).");
  console.error("    Ajoutez APP_PASSWORD=<mot de passe long> dans le fichier .env, puis relancez.\n");
  process.exit(1);
}

createApp(config).listen(config.port, config.host, () => {
  console.log("\n  Atelier de veille : http://localhost:" + config.port);
  if (!fs.existsSync(path.join(config.publicDir, "index.html"))) console.log("  ⚠ Interface non compilée : lancez « npm run build ».");
  if (config.mock) console.log("  Mode démo actif : réponses fictives, aucune clé API utilisée.");
  else if (!config.apiKey) console.log("  ⚠ Aucune clé API : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez.");
  else console.log("  Modèle : " + config.model);
  console.log(config.password ? "  Accès protégé par mot de passe (APP_PASSWORD)." : "  ⚠ Aucun mot de passe (APP_PASSWORD) : accès libre depuis cette machine.");
  console.log("  Arrêt : Ctrl+C\n");
});
