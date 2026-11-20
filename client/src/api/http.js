// Appels à l'API du serveur. Le cookie de session (HttpOnly) est envoyé automatiquement
// par le navigateur : il n'est jamais lisible par le JavaScript de la page.

let onUnauthorized = () => {};
/** Fonction appelée quand le serveur répond 401 (session expirée ou absente). */
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function request(method, path, body) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null;
  if (r.status !== 204) { try { j = await r.json(); } catch { /* corps vide */ } }
  if (!r.ok) {
    if (r.status === 401 && j?.code === "auth_required") onUnauthorized();
    const err = new Error(j?.error || "Erreur " + r.status);
    err.code = j?.code || "server";
    err.status = r.status;
    throw err;
  }
  return j;
}
