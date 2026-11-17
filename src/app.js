// Serveur HTTP : API (statut, génération, historique) et fichiers statiques de public/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DIR } from "./config.js";
import { LEVELS, AUDIENCES } from "../public/js/options.js";
import { validateMeta, validatePlan, planPrompt, sectionPrompt, ValidationError } from "./prompts.js";
import { openStream, pipeText, UpstreamError } from "./services/anthropic.js";
import { mockPlan, mockSection, streamMock } from "./services/mock.js";
import { createReportsStore, NotFoundError } from "./services/reports-store.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
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

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/** Relaie la réponse de Claude (ou la réponse fictive) vers le navigateur. */
async function relay(config, req, res, prompt, mockObj) {
  if (config.mock) return streamMock(mockObj(), res);
  if (!config.apiKey) return sendJson(res, 500, { error: "Clé API absente : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez le serveur.", code: "no_key" });

  const controller = new AbortController();
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  const upstream = await openStream(config, prompt, controller.signal);
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  await pipeText(upstream, res, controller.signal);
}

async function handlePlan(config, req, res) {
  const { meta } = await readJson(req);
  const m = validateMeta(meta);
  return relay(config, req, res, planPrompt(m), () => mockPlan(LEVELS[m.level].sections));
}

async function handleSection(config, req, res) {
  const { meta, plan, index } = await readJson(req);
  const m = validateMeta(meta);
  const p = validatePlan(plan, index);
  return relay(config, req, res, sectionPrompt(m, p, index), mockSection);
}

/* ---------- Historique ---------- */
async function handleSaveReport(store, req, res) {
  const { report, meta, stats, createdAt } = await readJson(req, 5_000_000);
  if (!report || typeof report !== "object" || !Array.isArray(report.sections)) throw new ValidationError("Rapport invalide.");
  const m = validateMeta(meta);
  const saved = {
    ...m,
    author: typeof meta.author === "string" ? meta.author.trim().slice(0, 200) : "",
    levelLabel: LEVELS[m.level].label,
    audienceLabel: AUDIENCES[m.audience].label,
    dateISO: typeof meta.dateISO === "string" && !Number.isNaN(Date.parse(meta.dateISO)) ? meta.dateISO : new Date().toISOString()
  };
  sendJson(res, 201, await store.add({ report, meta: saved, stats, createdAt }));
}

function serveStatic(res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname); }
  catch { return sendJson(res, 400, { error: "Chemin invalide" }); }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: "Accès refusé" });
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Introuvable"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

export function createApp(config) {
  const store = createReportsStore(config.dataDir);
  const routes = {
    "GET /api/status": (req, res) => sendJson(res, 200, { ready: config.mock || Boolean(config.apiKey), mock: config.mock, model: config.mock ? "démo" : config.model }),
    "POST /api/plan": (req, res) => handlePlan(config, req, res),
    "POST /api/section": (req, res) => handleSection(config, req, res),
    "GET /api/reports": async (req, res) => sendJson(res, 200, await store.list()),
    "POST /api/reports": (req, res) => handleSaveReport(store, req, res)
  };
  const reportRoutes = {
    GET: async (id, res) => sendJson(res, 200, await store.get(id)),
    DELETE: async (id, res) => { await store.remove(id); res.writeHead(204); res.end(); }
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const route = routes[req.method + " " + url.pathname];
      if (route) return await route(req, res);
      const rm = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
      if (rm && reportRoutes[req.method]) return await reportRoutes[req.method](rm[1], res);
      if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Route inconnue" });
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Méthode non autorisée" });
      return serveStatic(res, url.pathname);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof NotFoundError) return sendJson(res, 404, { error: e.message, code: "not_found" });
      if (e instanceof ValidationError) return sendJson(res, 400, { error: e.message, code: "invalid" });
      if (e instanceof UpstreamError) return sendJson(res, e.status, { error: e.message, code: e.code });
      return sendJson(res, 500, { error: e.message });
    }
  });
}
