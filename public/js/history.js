// Historique des rapports, stocké sur le serveur (dossier data/, volume Docker).
// On garde le contenu (JSON), pas le PDF : il est reconstruit à la demande, sans nouvel appel à Claude.

async function request(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    let j = {};
    try { j = await r.json(); } catch { /* corps vide */ }
    const err = new Error(j.error || "Erreur " + r.status);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

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
