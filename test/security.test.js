// Sécurité : en-têtes HTTP, connexion par mot de passe, CSRF, limitation des essais.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

let server, base, dataDir;
const PASSWORD = "correct horse battery staple";
const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body || {}) });
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veille-sec-"));
  server = createApp({ mock: true, mockOptions: { delayMs: 1 }, dataDir, password: PASSWORD });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test("en-têtes de sécurité sur toutes les réponses", async () => {
  for (const p of ["/", "/api/session", "/api/inconnue"]) {
    const h = (await fetch(base + p)).headers;
    assert.match(h.get("content-security-policy"), /script-src 'self'/);
    assert.match(h.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(h.get("x-content-type-options"), "nosniff");
    assert.equal(h.get("x-frame-options"), "DENY");
    assert.equal(h.get("referrer-policy"), "no-referrer");
  }
});

test("sans connexion, l'API est fermée", async () => {
  assert.deepEqual(await (await fetch(base + "/api/session")).json(), { authRequired: true, authenticated: false });
  for (const p of ["/api/status", "/api/reports", "/api/jobs"]) assert.equal((await fetch(base + p)).status, 401, p);
  assert.equal((await post("/api/jobs", { meta: {} })).status, 401);
});

test("connexion : cookie HttpOnly, accès ouvert, puis déconnexion", async () => {
  assert.equal((await post("/api/login", { password: "faux" })).status, 401);
  const ok = await post("/api/login", { password: PASSWORD });
  assert.equal(ok.status, 200);
  const setCookie = ok.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = cookieOf(ok);

  const st = await fetch(base + "/api/status", { headers: { cookie } });
  assert.equal(st.status, 200);
  assert.equal((await st.json()).ready, true);
  assert.ok(!JSON.stringify(await (await fetch(base + "/api/status", { headers: { cookie } })).json()).includes("sk-ant"), "la clé API n'est jamais renvoyée");

  await post("/api/logout", {}, { cookie });
  assert.equal((await fetch(base + "/api/status", { headers: { cookie } })).status, 401, "le jeton est invalidé côté serveur");
  assert.equal((await fetch(base + "/api/status", { headers: { cookie: "veille_session=invente" } })).status, 401);
});

test("CSRF : requête d'une autre origine refusée", async () => {
  const cookie = cookieOf(await post("/api/login", { password: PASSWORD }));
  const res = await post("/api/jobs", { meta: {} }, { cookie, origin: "https://site-malveillant.example" });
  assert.equal(res.status, 403);
  assert.equal((await post("/api/login", { password: PASSWORD }, { origin: "https://site-malveillant.example" })).status, 403);
});

test("trop d'essais de mot de passe : blocage temporaire", async () => {
  // Les essais précédents ont réussi (compteur remis à zéro) ; 5 échecs puis blocage.
  for (let i = 0; i < 5; i++) assert.equal((await post("/api/login", { password: "x" + i })).status, 401);
  assert.equal((await post("/api/login", { password: PASSWORD })).status, 429, "même le bon mot de passe est refusé pendant le blocage");
});

