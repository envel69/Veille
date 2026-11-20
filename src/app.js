// Serveur HTTP : API (connexion, statut, générations, historique) et interface Vue compilée (dist/).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DIR } from "./config.js";
import { LEVELS, AUDIENCES } from "../shared/options.js";
import { validateMeta, ValidationError } from "./prompts.js";
import { createClaude } from "./services/claude.js";
import { createMockClaude } from "./services/mock.js";
import { createReportsStore, NotFoundError } from "./services/reports-store.js";
import { createJobManager, JobsError } from "./jobs.js";
import { securityHeaders, createAuth, createRateLimiter, sameOrigin, clientIp } from "./security.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function readJson(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new ValidationError("Requête trop volumineuse.")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new ValidationError("Corps JSON invalide.")); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(obj));
}

/** Flux d'avancement d'une génération (Server-Sent Events). */
function streamJob(jobs, id, req, res) {
  jobs.get(id); // lève une erreur 404 si la génération n'existe pas
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no", Connection: "keep-alive" });
  const unsubscribe = jobs.subscribe(id, (snap) => res.write("data: " + JSON.stringify(snap) + "\n\n")); // envoie aussi l'état actuel
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
}

/* ---------- Historique : enregistrement direct (reprise d'un ancien historique navigateur) ---------- */
async function handleSaveReport(store, req, res) {
  const { report, meta, stats, createdAt } = await readJson(req, 5_000_000);
  if (!report || typeof report !== "object" || !Array.isArray(report.sections)) throw new ValidationError("Rapport invalide.");
  const m = validateMeta(meta);
  const saved = {
    ...m,
    levelLabel: LEVELS[m.level].label,
    audienceLabel: AUDIENCES[m.audience].label,
    dateISO: typeof meta.dateISO === "string" && !Number.isNaN(Date.parse(meta.dateISO)) ? meta.dateISO : new Date().toISOString()
  };
  sendJson(res, 201, await store.add({ report, meta: saved, stats, createdAt }));
}

function serveStatic(publicDir, req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname); }
  catch { return sendJson(res, 400, { error: "Chemin invalide" }); }
  const file = path.normalize(path.join(publicDir, rel));
  if (!file.startsWith(publicDir + path.sep) || path.basename(file).startsWith(".")) return sendJson(res, 403, { error: "Accès refusé" });
  fs.readFile(file, (err, data) => {
    if (err) {
      const missing = rel === "/index.html";
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(missing ? "Interface non compilée : lancez « npm run build »." : "Introuvable");
    }
    // Fichiers de assets/ : nom avec empreinte, mis en cache longtemps. index.html : toujours revalidé.
    const cache = rel.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": cache });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

/**
 * @param config  voir config.js ; en test, `claude` permet d'injecter un service simulé
 *                et `mockOptions` de régler le mode démo (délai, échecs simulés).
 */
export function createApp(config) {
  const publicDir = path.resolve(config.publicDir || PUBLIC_DIR);
  const store = createReportsStore(config.dataDir);
  const claude = config.claude || (config.mock ? createMockClaude(config.mockOptions) : createClaude(config));
  const jobs = createJobManager({ claude, store });
  const auth = createAuth({ password: config.password, sessionHours: config.sessionHours || 12, secureCookie: Boolean(config.https) });
  const loginLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });          // 5 essais ratés / 15 min
  const jobsLimiter = createRateLimiter({ max: config.jobsPerHour || 30, windowMs: 3600_000 });
  const ready = () => config.mock || Boolean(config.claude) || Boolean(config.apiKey);
  const ip = (req) => clientIp(req, config.trustProxy);

  // Routes accessibles sans être connecté.
  const publicRoutes = {
    "GET /api/session": (req, res) => sendJson(res, 200, { authRequired: auth.enabled, authenticated: auth.isAuthenticated(req) }),
    "POST /api/login": async (req, res) => {
      const key = ip(req);
      if (loginLimiter.blocked(key)) return sendJson(res, 429, { error: "Trop d'essais : réessayez dans 15 minutes.", code: "rate_limited" });
      const { password } = await readJson(req, 10_000);
      const cookie = auth.login(password);
      if (!cookie) {
        loginLimiter.hit(key);
        return sendJson(res, 401, { error: auth.enabled ? "Mot de passe incorrect." : "Connexion désactivée.", code: "bad_password" });
      }
      loginLimiter.reset(key);
      sendJson(res, 200, { authenticated: true }, { "Set-Cookie": cookie });
    },
    "POST /api/logout": (req, res) => sendJson(res, 200, { authenticated: false }, { "Set-Cookie": auth.logout(req) })
  };

  const routes = {
    "GET /api/status": (req, res) => sendJson(res, 200, { ready: ready(), mock: Boolean(config.mock), model: config.mock ? "démo" : config.model }),
    "GET /api/reports": async (req, res) => sendJson(res, 200, await store.list()),
    "POST /api/reports": (req, res) => handleSaveReport(store, req, res),
    "GET /api/jobs": (req, res) => sendJson(res, 200, jobs.list()),
    "POST /api/jobs": async (req, res) => {
      const { meta } = await readJson(req);
      const m = validateMeta(meta);
      if (!ready()) return sendJson(res, 500, { error: "Clé API absente : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez le serveur.", code: "no_key" });
      if (jobsLimiter.take(ip(req))) return sendJson(res, 429, { error: "Trop de générations lancées en une heure : patientez avant d'en lancer une autre.", code: "rate_limited" });
      sendJson(res, 202, jobs.start(m));
    }
  };
  const reportRoutes = {
    GET: async (id, req, res) => sendJson(res, 200, await store.get(id)),
    DELETE: async (id, req, res) => { await store.remove(id); res.writeHead(204); res.end(); }
  };
  const jobRoutes = {
    "GET ": (id, req, res) => sendJson(res, 200, jobs.get(id)),
    "GET /events": (id, req, res) => streamJob(jobs, id, req, res),
    "POST /cancel": (id, req, res) => sendJson(res, 200, jobs.cancel(id)),
    "POST /resume": (id, req, res) => sendJson(res, 202, jobs.resume(id))
  };

  return http.createServer(async (req, res) => {
    securityHeaders(res, { https: config.https });
    try {
      const url = new URL(req.url, "http://localhost");
      const isApi = url.pathname.startsWith("/api/");

      if (isApi) {
        // CSRF : toute requête qui modifie des données doit venir de cette origine.
        if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) return sendJson(res, 403, { error: "Origine refusée.", code: "csrf" });
        const pub = publicRoutes[req.method + " " + url.pathname];
        if (pub) return await pub(req, res);
        if (!auth.isAuthenticated(req)) return sendJson(res, 401, { error: "Connexion requise.", code: "auth_required" });
      }

      const route = routes[req.method + " " + url.pathname];
      if (route) return await route(req, res);
      const rm = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
      if (rm && reportRoutes[req.method]) return await reportRoutes[req.method](rm[1], req, res);
      const jm = url.pathname.match(/^\/api\/jobs\/([a-z0-9]{6,40})(\/events|\/cancel|\/resume)?$/);
      const jr = jm && jobRoutes[req.method + " " + (jm[2] || "")];
      if (jr) return await jr(jm[1], req, res);
      if (isApi) return sendJson(res, 404, { error: "Route inconnue" });
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Méthode non autorisée" });
      return serveStatic(publicDir, req, res, url.pathname);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof NotFoundError) return sendJson(res, 404, { error: e.message, code: "not_found" });
      if (e instanceof JobsError) return sendJson(res, e.status, { error: e.message, code: "job" });
      if (e instanceof ValidationError) return sendJson(res, 400, { error: e.message, code: "invalid" });
      console.error("[erreur serveur]", e); // le détail reste dans les journaux, pas dans la réponse
      return sendJson(res, 500, { error: "Erreur interne du serveur.", code: "server" });
    }
  });
}
