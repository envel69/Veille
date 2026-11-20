import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../shared/options.js";
import { validateMeta, validatePlan, planRequest, sectionRequest, ValidationError } from "../src/prompts.js";
import { buildParams, parseJson } from "../src/services/claude.js";

const SUMMARY = "Plusieurs fabricants annoncent une montée en cadence de la production de cellules sodium-ion pour le stockage stationnaire et les petits véhicules.";
const plan = validatePlan({ titre: "T", sections: [{ titre: "A", angle: "x", elements: ["e1"] }, { titre: "B" }] }, 0);

test("validateMeta refuse un résumé trop court", () => {
  assert.throws(() => validateMeta({ summary: "trop court" }), ValidationError);
});

test("validateMeta remplace les valeurs inconnues par les valeurs par défaut", () => {
  const m = validateMeta({ summary: SUMMARY, audience: "pirate", level: "x", author: "  Max " });
  assert.equal(m.audience, "direction");
  assert.equal(m.level, "approfondi");
  assert.equal(m.author, "Max");
});

test("la requête de plan demande le bon nombre de sections et contient les notes", () => {
  const m = validateMeta({ summary: SUMMARY, level: "complet" });
  const r = planRequest(m);
  assert.ok(r.tail.includes("exactement " + LEVELS.complet.sections + " sections"));
  assert.ok(r.cached[0].includes(SUMMARY));
});

test("toutes les parties partagent le même préfixe (cache), seule la fin change", () => {
  const m = validateMeta({ summary: SUMMARY });
  const a = sectionRequest(m, plan, 0), b = sectionRequest(m, plan, 1);
  assert.equal(a.system, b.system);
  assert.deepEqual(a.cached, b.cached);
  assert.notEqual(a.tail, b.tail);
  assert.match(b.tail, /rédige la partie 2 du plan, « B »/);
  // Le préfixe du plan est le début de celui des parties (system + notes).
  assert.equal(planRequest(m).cached[0], a.cached[0]);
});

test("validatePlan vérifie l'index et nettoie le plan", () => {
  assert.throws(() => validatePlan({ sections: [{ titre: "A" }] }, 2), ValidationError);
  assert.throws(() => validatePlan({ sections: [] }, 0), ValidationError);
  assert.deepEqual(plan.sections[1], { titre: "B", angle: "", elements: [] });
});

test("buildParams : blocs en cache, partie variable à la fin, repli serveur selon le modèle", () => {
  const req = sectionRequest(validateMeta({ summary: SUMMARY }), plan, 0);
  const p = buildParams({ model: "claude-sonnet-5-5", maxTokens: 16000 }, req);
  const content = p.messages[0].content;
  assert.equal(content.length, 3);
  assert.deepEqual(content.slice(0, 2).map((b) => b.cache_control), [{ type: "ephemeral" }, { type: "ephemeral" }]);
  assert.equal(content[2].cache_control, undefined);
  assert.equal(content[2].text, req.tail);
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  const old = buildParams({ model: "claude-haiku-4-5", maxTokens: 1000 }, req);
  assert.equal(old.fallbacks, undefined, "pas de repli sur un modèle qui ne le prend pas en charge");
});

test("parseJson tolère les balises de code et refuse le texte sans JSON", () => {
  assert.deepEqual(parseJson("```json\n{\"a\": 1}\n```"), { a: 1 });
  assert.throws(() => parseJson("désolé"), /illisible/);
});
