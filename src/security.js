// Sécurité du serveur : en-têtes HTTP, connexion par mot de passe (cookie de session),
// protection CSRF (Origin + SameSite) et limitation du nombre de requêtes.
import crypto from "node:crypto";

const COOKIE = "veille_session";

/* ---------- En-têtes de sécurité, ajoutés à toutes les réponses ---------- */
// Pas de « default-src » : le PDF (document blob:) hérite de cette politique et le lecteur PDF
// du navigateur ne s'affiche plus avec default-src. Chaque type de ressource utile est donc listé.
const CSP = [
  "script-src 'self'",         // aucun script externe ni inline : seul le bundle du site s'exécute
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src blob:",             // aperçu du PDF généré dans le navigateur
  "object-src blob:",            // le document blob: hérite de cette politique : le lecteur PDF du navigateur en a besoin
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"       // le site ne peut pas être intégré dans une autre page (clickjacking)
].join("; ");

export function securityHeaders(res, { https = false } = {}) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (https) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

/** Adresse du client (X-Forwarded-For seulement si le serveur est derrière un proxy de confiance). */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || "?";
}

/* ---------- Limitation du nombre de requêtes (fenêtre glissante, en mémoire) ---------- */
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map(); // clé -> horodatages
  const prune = (key, now) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };
  const timer = setInterval(() => { const now = Date.now(); for (const k of hits.keys()) prune(k, now); }, windowMs);
  timer.unref?.();
  return {
    /** true si la limite est atteinte (sans compter un nouvel essai). */
    blocked(key) { return prune(key, Date.now()).length >= max; },
    hit(key) { const now = Date.now(); const list = prune(key, now); list.push(now); hits.set(key, list); },
    reset(key) { hits.delete(key); },
    /** Compte un essai ; renvoie true s'il dépasse la limite. */
    take(key) { if (this.blocked(key)) return true; this.hit(key); return false; }
  };
}

/* ---------- Connexion par mot de passe ---------- */
function sha256(s) { return crypto.createHash("sha256").update(String(s)).digest(); }

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * @param password      mot de passe d'accès (APP_PASSWORD) ; vide = connexion désactivée
 * @param secureCookie  ajoute l'attribut Secure au cookie (site servi en HTTPS)
 */
export function createAuth({ password, sessionHours = 12, secureCookie = false }) {
  const enabled = Boolean(password);
  const expected = sha256(password || "");
  const sessions = new Map(); // jeton -> expiration (ms)
  const ttl = sessionHours * 3600_000;

  const timer = setInterval(() => { const now = Date.now(); for (const [t, exp] of sessions) if (exp < now) sessions.delete(t); }, 600_000);
  timer.unref?.();

  function cookie(value, maxAgeS) {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}` + (secureCookie ? "; Secure" : "");
  }
  function token(req) { return parseCookies(req.headers.cookie)[COOKIE] || ""; }

  return {
    enabled,

    isAuthenticated(req) {
      if (!enabled) return true;
      const t = token(req);
      const exp = t && sessions.get(t);
      if (!exp) return false;
      if (exp < Date.now()) { sessions.delete(t); return false; }
      return true;
    },

    /** Vérifie le mot de passe en temps constant ; renvoie l'en-tête Set-Cookie ou null. */
    login(candidate) {
      if (!enabled) return null;
      if (typeof candidate !== "string" || !crypto.timingSafeEqual(sha256(candidate), expected)) return null;
      const t = crypto.randomBytes(32).toString("base64url");
      sessions.set(t, Date.now() + ttl);
      return cookie(t, Math.floor(ttl / 1000));
    },

    logout(req) {
      sessions.delete(token(req));
      return cookie("", 0);
    }
  };
}

/**
 * Protection CSRF : une requête qui modifie des données doit venir du site lui-même.
 * Les navigateurs envoient l'en-tête Origin sur ces requêtes ; on vérifie qu'il correspond à l'hôte.
 */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return !req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"] === "same-origin";
  try { return new URL(origin).host === req.headers.host; }
  catch { return false; }
}
