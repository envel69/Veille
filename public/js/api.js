// Client de l'API locale : statut, plan et parties, lus en streaming.
import { countWords } from "./options.js";

export class ApiError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getStatus() {
  const r = await fetch("/api/status");
  if (!r.ok) throw new ApiError("server", "Statut indisponible");
  return r.json();
}

/** Extrait l'objet JSON d'une réponse (tolère des balises ``` autour). */
export function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ApiError("parse", "Réponse illisible");
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch { throw new ApiError("parse", "Réponse illisible"); }
}

async function streamOnce(path, body, { signal, onWords }) {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!resp.ok) {
    let j = {};
    try { j = await resp.json(); } catch { /* corps vide */ }
    throw new ApiError(j.code || (resp.status === 429 ? "rate_limited" : "server"), j.error || "Erreur " + resp.status);
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    if (onWords) onWords(countWords(text.replace(/<<<[^>]*>>>/g, "")));
  }
  const err = text.match(/<<<ERREUR:([\s\S]*?)>>>/);
  if (err) throw new ApiError("server", err[1]);
  if (text.includes("<<<TRONQUE>>>")) throw new ApiError("truncated", "Réponse tronquée");
  return parseJson(text);
}

/** POST + lecture du flux, avec une relance en cas de limite de débit ou de réponse illisible. */
export async function streamJson(path, body, opts) {
  let rateTries = 0, parseTries = 0;
  for (;;) {
    try {
      return await streamOnce(path, body, opts);
    } catch (e) {
      if (opts.signal?.aborted) throw new ApiError("aborted");
      if (e.code === "rate_limited" && rateTries < 1) { rateTries++; await wait(12000); continue; }
      if ((e.code === "parse" || e.code === "truncated") && parseTries < 1) { parseTries++; continue; }
      throw e;
    }
  }
}
