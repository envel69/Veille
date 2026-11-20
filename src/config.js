// Configuration : variables d'environnement, avec lecture facultative d'un fichier .env.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = path.join(ROOT, "dist"); // interface Vue compilée (npm run build)

/** Charge .env sans écraser les variables déjà définies dans l'environnement. */
export function loadEnvFile(file = path.join(ROOT, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function readConfig(env = process.env, argv = process.argv) {
  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1", // 0.0.0.0 dans Docker
    apiKey: env.ANTHROPIC_API_KEY || "",
    model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    maxTokens: Number(env.MAX_TOKENS || 16000),
    mock: env.MOCK === "1" || argv.includes("--mock"), // mode démo : réponses fictives, sans clé
    mockOptions: { delayMs: Number(env.MOCK_DELAY_MS || 15) }, // lenteur simulée du mode démo
    dataDir: path.resolve(ROOT, env.DATA_DIR || "data"), // historique des rapports
    publicDir: PUBLIC_DIR,
    // Sécurité
    password: env.APP_PASSWORD || "",              // mot de passe d'accès à l'interface et à l'API
    sessionHours: Number(env.SESSION_HOURS || 12), // durée d'une connexion
    https: env.HTTPS === "1",                      // site servi en HTTPS : cookie Secure + HSTS
    trustProxy: env.TRUST_PROXY === "1",           // derrière un proxy inverse (lit X-Forwarded-For)
    jobsPerHour: Number(env.JOBS_PER_HOUR || 30)   // générations lancées par heure et par adresse IP
  };
}
