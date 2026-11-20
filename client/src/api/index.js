// Client de l'API : session, statut, générations (avec suivi en direct SSE) et historique.
import { request } from "./http.js";

/* ---------- Session ---------- */
export const getSession = () => request("GET", "/api/session");
export const login = (password) => request("POST", "/api/login", { password });
export const logout = () => request("POST", "/api/logout");

/* ---------- Statut du serveur (clé configurée, mode démo, modèle utilisé) ---------- */
export const getStatus = () => request("GET", "/api/status");

/* ---------- Générations côté serveur ---------- */
export const startJob = (meta) => request("POST", "/api/jobs", { meta });
export const listJobs = () => request("GET", "/api/jobs");
export const cancelJob = (id) => request("POST", "/api/jobs/" + encodeURIComponent(id) + "/cancel");
export const resumeJob = (id) => request("POST", "/api/jobs/" + encodeURIComponent(id) + "/resume");

/**
 * Suit une génération : onSnapshot(état) à chaque changement.
 * Le navigateur se reconnecte seul si la connexion coupe ; onLost() est appelé si la
 * génération n'existe plus côté serveur (serveur redémarré). Renvoie une fonction d'arrêt.
 */
export function watchJob(id, onSnapshot, onLost) {
  const es = new EventSource("/api/jobs/" + encodeURIComponent(id) + "/events");
  let closed = false;
  const close = () => { closed = true; es.close(); };
  es.onmessage = (e) => {
    const snap = JSON.parse(e.data);
    onSnapshot(snap);
    if (snap.status !== "running") close();
  };
  es.onerror = async () => {
    if (closed) return;
    // Erreur passagère, génération disparue ou session expirée ? On demande au serveur.
    try { await request("GET", "/api/jobs/" + encodeURIComponent(id)); }
    catch (e) {
      if (e.status === 404) { close(); onLost?.(); }
      if (e.status === 401) close();
    }
  };
  return close;
}

/* ---------- Historique (stocké sur le serveur) ---------- */
// On garde le contenu (JSON), pas le PDF : il est reconstruit à la demande, sans nouvel appel à Claude.

/** Liste résumée (sans le contenu), du plus récent au plus ancien. */
export const listReports = () => request("GET", "/api/reports");

/** Rapport complet : { id, createdAt, title, meta, stats, report }. */
export const getReport = (id) => request("GET", "/api/reports/" + encodeURIComponent(id));

export const removeReport = (id) => request("DELETE", "/api/reports/" + encodeURIComponent(id));

/** Enregistre un rapport ; renvoie son résumé (avec id). */
export function saveReport(report, meta, stats, createdAt) {
  const { date, ...rest } = meta;
  const m = { ...rest, dateISO: (date instanceof Date ? date : new Date()).toISOString() };
  return request("POST", "/api/reports", { report, meta: m, stats, createdAt });
}

/** Recrée l'objet meta attendu par le générateur de PDF. */
export function metaFromEntry(entry) {
  return { ...entry.meta, date: new Date(entry.meta.dateISO || entry.createdAt) };
}

/** Transfère vers le serveur l'ancien historique gardé dans le navigateur (versions précédentes). */
const OLD_KEY = "atelier-veille-historique-v1";
export async function migrateLocalHistory() {
  let old;
  try { old = JSON.parse(localStorage.getItem(OLD_KEY) || "null"); } catch { return 0; }
  if (!Array.isArray(old) || !old.length) return 0;
  let moved = 0;
  for (const e of [...old].reverse()) { // du plus ancien au plus récent
    try { await saveReport(e.report, metaFromEntry(e), {}, e.createdAt); moved++; }
    catch { /* entrée invalide : ignorée */ }
  }
  try { localStorage.removeItem(OLD_KEY); } catch { /* stockage indisponible */ }
  return moved;
}
