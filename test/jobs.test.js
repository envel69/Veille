// Gestionnaire de générations : reprise après échec, ordre de démarrage pour le cache.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJobManager } from "../src/jobs.js";
import { createMockClaude } from "../src/services/mock.js";

const meta = { summary: "Notes de veille suffisamment longues pour passer la validation du résumé.", level: "approfondi", audience: "direction", title: "", theme: "", author: "", dateLabel: "17 novembre 2026" };

function fakeStore() {
  const saved = [];
  return { saved, add: async (e) => { saved.push(e); return { id: "r" + saved.length }; } };
}

/** Attend qu'une génération quitte l'état « running ». */
function waitEnd(jobs, id) {
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = jobs.subscribe(id, (s) => { if (s.status !== "running") { queueMicrotask(() => unsubscribe()); resolve(s); } });
  });
}

/** Service simulé qui compte les appels par requête (plan, partie n). */
function countingClaude(opts) {
  const inner = createMockClaude({ delayMs: 1, ...opts });
  const calls = [];
  return {
    calls,
    generateJson: (req, o) => {
      calls.push(req.tail.startsWith("TÂCHE : conçois") ? "plan" : "partie " + req.tail.match(/rédige la partie (\d+)/)[1]);
      return inner.generateJson(req, o);
    }
  };
}

test("après un échec, la reprise ne refait ni le plan ni les parties terminées", async () => {
  const claude = countingClaude({ failOnce: [4] });
  const store = fakeStore();
  const jobs = createJobManager({ claude, store });

  const { id } = jobs.start(meta);
  const failed = await waitEnd(jobs, id);
  assert.equal(failed.status, "error");
  assert.match(failed.error.message, /partie 4/);
  assert.equal(failed.resumable, true);
  assert.equal(store.saved.length, 0);
  const doneBefore = failed.steps.filter((s) => s.state === "done").length;

  const callsBefore = claude.calls.length;
  jobs.resume(id);
  const done = await waitEnd(jobs, id);
  assert.equal(done.status, "done");
  const retried = claude.calls.slice(callsBefore);
  assert.ok(!retried.includes("plan"), "le plan n'est pas redemandé");
  assert.ok(retried.includes("partie 4"), "la partie en échec est refaite");
  assert.equal(retried.length, 7 - (doneBefore - 1), "seules les parties manquantes sont rédigées");
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].report.sections.length, 7);
});

test("la première partie démarre seule, les autres après sa première réponse (cache)", async () => {
  const order = [];
  const inner = createMockClaude({ delayMs: 2 });
  const claude = {
    generateJson: (req, o) => {
      const name = req.tail.startsWith("TÂCHE : conçois") ? "plan" : "partie " + req.tail.match(/rédige la partie (\d+)/)[1];
      order.push("début " + name);
      let first = true;
      return inner.generateJson(req, { ...o, onText: (t) => { if (first) { first = false; order.push("réponse " + name); } o.onText?.(t); } });
    }
  };
  const jobs = createJobManager({ claude, store: fakeStore() });
  const { id } = jobs.start({ ...meta, level: "standard" });
  const end = await waitEnd(jobs, id);
  assert.equal(end.status, "done");
  const firstAnswer = order.indexOf("réponse partie 1");
  assert.ok(order.indexOf("début partie 2") > firstAnswer, "la partie 2 attend la première réponse de la partie 1");
  assert.ok(order.indexOf("début partie 3") > firstAnswer);
  assert.ok(end.usage.cacheRead > 0 && end.usage.cacheWrite > 0);
});

test("pas plus de 3 générations simultanées", async () => {
  const jobs = createJobManager({ claude: createMockClaude({ delayMs: 20 }), store: fakeStore() });
  const ids = [jobs.start(meta).id, jobs.start(meta).id, jobs.start(meta).id];
  assert.throws(() => jobs.start(meta), /Déjà 3 générations/);
  ids.forEach((id) => jobs.cancel(id));
});
