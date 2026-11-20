// Tests de bout en bout du serveur en mode démo (aucun appel à l'API Anthropic).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { LEVELS } from "../shared/options.js";
import { createApp } from "../src/app.js";

let server, base, dataDir;
const meta = { summary: "Plusieurs fabricants annoncent une montée en cadence de la production de cellules sodium-ion pour le stockage stationnaire.", level: "standard", audience: "direction" };
const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

/** Suit le flux SSE d'une génération jusqu'à sa fin ; renvoie les états reçus. */
async function follow(id) {
  const res = await fetch(base + "/api/jobs/" + id + "/events");
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const snaps = [];
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!line.startsWith("data: ")) continue;
      const snap = JSON.parse(line.slice(6));
      snaps.push(snap);
      if (snap.status !== "running") { reader.cancel(); return snaps; }
    }
  }
  return snaps;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veille-test-"));
  // Interface compilée factice (le vrai dist/ est produit par « npm run build »).
  const publicDir = path.join(dataDir, "dist");
  fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(publicDir, "index.html"), '<script type="module" src="/assets/app.js"></script>');
  fs.writeFileSync(path.join(publicDir, "assets", "app.js"), "console.log(1)");
  server = createApp({ mock: true, mockOptions: { delayMs: 1 }, dataDir, publicDir });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test("GET /api/status indique le mode démo", async () => {
  const st = await (await fetch(base + "/api/status")).json();
  assert.deepEqual(st, { ready: true, mock: true, model: "démo" });
});

test("une génération se déroule sur le serveur et finit dans l'historique", async () => {
  const res = await post("/api/jobs", { meta });
  assert.equal(res.status, 202);
  const { id } = await res.json();
  const snaps = await follow(id);
  const last = snaps.at(-1);
  assert.equal(last.status, "done");
  assert.equal(last.steps.length, LEVELS.standard.sections + 2); // plan + parties + enregistrement
  assert.ok(last.steps.every((s) => s.state === "done"));
  assert.ok(snaps.length > 3, "l'avancement est diffusé en continu");
  assert.ok(last.usage.cacheRead > 0, "les parties relisent le préfixe en cache");

  const report = await (await fetch(base + "/api/reports/" + last.reportId)).json();
  assert.equal(report.report.sections.length, LEVELS.standard.sections);
  assert.ok(report.stats.words > 0);
  assert.equal((await (await fetch(base + "/api/jobs")).json())[0].id, id);
});

test("annulation puis reprise d'une génération", async () => {
  const { id } = await (await post("/api/jobs", { meta: { ...meta, level: "complet" } })).json();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await post("/api/jobs/" + id + "/cancel")).status, 200);
  const canceled = (await follow(id)).at(-1);
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.resumable, true);
  assert.equal((await post("/api/jobs/" + id + "/resume")).status, 202);
  assert.equal((await follow(id)).at(-1).status, "done");
});

test("entrées invalides et routes inconnues", async () => {
  assert.equal((await post("/api/jobs", { meta: { summary: "court" } })).status, 400);
  assert.equal((await fetch(base + "/api/jobs/inexistant123")).status, 404);
  assert.equal((await fetch(base + "/api/jobs/inexistant123/events")).status, 404);
  const bad = await fetch(base + "/api/jobs", { method: "POST", body: "{pas du json" });
  assert.equal(bad.status, 400);
  assert.equal((await post("/api/plan", { meta })).status, 404, "les anciens endpoints n'existent plus");
  assert.equal((await post("/api/generate", { prompt: "x" })).status, 404);
});

test("sert l'interface compilée, refuse de sortir de dist/", async () => {
  const home = await fetch(base + "/");
  assert.match(await home.text(), /<script type="module" src="\/assets\/app.js">/);
  assert.equal(home.headers.get("cache-control"), "no-cache");
  const js = await fetch(base + "/assets/app.js");
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.match(js.headers.get("cache-control"), /immutable/);
  assert.notEqual((await fetch(base + "/..%2Fpackage.json")).status, 200);
  assert.equal((await fetch(base + "/.env")).status, 403);
});
