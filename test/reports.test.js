// Historique côté serveur : enregistrement, liste, lecture, suppression (dossier temporaire).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

let server, base, dataDir;
const meta = { summary: "Plusieurs fabricants annoncent une montée en cadence de la production de cellules sodium-ion pour le stockage stationnaire.", level: "complet", audience: "technique", theme: "Énergie", author: "Max", dateLabel: "17 novembre 2026" };
const report = { titre: "Batteries sodium-ion", sections: [{ titre: "A" }, { titre: "B" }] };
const json = (method, p, body) => fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "veille-test-"));
  server = createApp({ mock: true, dataDir });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test("un rapport enregistré apparaît dans la liste, du plus récent au plus ancien", async () => {
  const r1 = await json("POST", "/api/reports", { report, meta, stats: { words: 4200, pages: 27 }, createdAt: "2026-11-01T10:00:00Z" });
  assert.equal(r1.status, 201);
  const a = await r1.json();
  assert.deepEqual({ title: a.title, level: a.level, author: a.author, sections: a.sections, words: a.words }, { title: "Batteries sodium-ion", level: "complet", author: "Max", sections: 2, words: 4200 });

  await json("POST", "/api/reports", { report: { ...report, titre: "Plus récent" }, meta });
  const list = await (await fetch(base + "/api/reports")).json();
  assert.deepEqual(list.map((x) => x.title), ["Plus récent", "Batteries sodium-ion"]);
  assert.equal(list[0].report, undefined, "la liste ne renvoie pas le contenu complet");
});

test("lecture complète puis suppression d'un rapport", async () => {
  const { id } = await (await json("POST", "/api/reports", { report, meta })).json();
  const full = await (await fetch(base + "/api/reports/" + id)).json();
  assert.equal(full.report.titre, "Batteries sodium-ion");
  assert.equal(full.meta.levelLabel, "Très complet");
  assert.equal((await json("DELETE", "/api/reports/" + id)).status, 204);
  assert.equal((await fetch(base + "/api/reports/" + id)).status, 404);
  assert.equal((await json("DELETE", "/api/reports/" + id)).status, 404);
});

test("entrées invalides et identifiants suspects refusés", async () => {
  assert.equal((await json("POST", "/api/reports", { report: { titre: "x" }, meta })).status, 400);
  assert.equal((await json("POST", "/api/reports", { report, meta: { summary: "court" } })).status, 400);
  assert.equal((await fetch(base + "/api/reports/..%2F..%2Fpackage")).status, 404);
});
