// Tests de bout en bout du serveur en mode démo (aucun appel à l'API Anthropic).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../public/js/options.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createApp } from "../src/app.js";

let server, base, dataDir;
const meta = { summary: "Plusieurs fabricants annoncent une montée en cadence de la production de cellules sodium-ion pour le stockage stationnaire.", level: "standard", audience: "direction" };
const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veille-test-"));
  server = createApp({ mock: true, apiKey: "", model: "test", maxTokens: 100, dataDir });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test("GET /api/status indique le mode démo", async () => {
  const st = await (await fetch(base + "/api/status")).json();
  assert.deepEqual(st, { ready: true, mock: true, model: "démo" });
});

test("POST /api/plan renvoie un plan avec le nombre de parties du niveau", async () => {
  const plan = JSON.parse(await (await post("/api/plan", { meta })).text());
  assert.equal(plan.sections.length, LEVELS.standard.sections);
});

test("POST /api/section renvoie une partie rédigée", async () => {
  const plan = { titre: "T", sections: [{ titre: "A" }, { titre: "B" }] };
  const body = JSON.parse(await (await post("/api/section", { meta, plan, index: 1 })).text());
  assert.ok(Array.isArray(body.blocs));
});

test("les entrées invalides renvoient 400", async () => {
  assert.equal((await post("/api/plan", { meta: { summary: "court" } })).status, 400);
  assert.equal((await post("/api/section", { meta, plan: { sections: [] }, index: 0 })).status, 400);
  const bad = await fetch(base + "/api/plan", { method: "POST", body: "{pas du json" });
  assert.equal(bad.status, 400);
});

test("l'ancien endpoint à prompt libre n'existe plus", async () => {
  assert.equal((await post("/api/generate", { prompt: "x" })).status, 404);
});

test("sert l'interface et ses modules, refuse de sortir de public/", async () => {
  const html = await (await fetch(base + "/")).text();
  assert.match(html, /<script type="module" src="\/js\/app.js">/);
  const js = await fetch(base + "/js/app.js");
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.notEqual((await fetch(base + "/..%2Fpackage.json")).status, 200);
});
