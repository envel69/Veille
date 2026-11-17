// Atelier de veille : point d'entrée.
// Lancement : npm start (ou node src/server.js), puis ouvrir http://localhost:3000
// Aucune dépendance : Node.js 18 ou plus récent suffit.
import { loadEnvFile, readConfig } from "./config.js";
import { createApp } from "./app.js";

loadEnvFile();
const config = readConfig();

createApp(config).listen(config.port, config.host, () => {
  console.log("\n  Atelier de veille : http://localhost:" + config.port);
  if (config.mock) console.log("  Mode démo actif : réponses fictives, aucune clé API utilisée.");
  else if (!config.apiKey) console.log("  ⚠ Aucune clé API : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez.");
  else console.log("  Modèle : " + config.model);
  console.log("  Arrêt : Ctrl+C\n");
});
