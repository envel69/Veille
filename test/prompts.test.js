import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../public/js/options.js";
import { validateMeta, validatePlan, planPrompt, sectionPrompt, ValidationError } from "../src/prompts.js";

const SUMMARY = "Plusieurs fabricants annoncent une montée en cadence de la production de cellules sodium-ion pour le stockage stationnaire et les petits véhicules.";

test("validateMeta refuse un résumé trop court", () => {
  assert.throws(() => validateMeta({ summary: "trop court" }), ValidationError);
});

test("validateMeta remplace les valeurs inconnues par les valeurs par défaut", () => {
  const m = validateMeta({ summary: SUMMARY, audience: "pirate", level: "x" });
  assert.equal(m.audience, "direction");
  assert.equal(m.level, "approfondi");
});

test("planPrompt demande le bon nombre de sections selon le niveau", () => {
  const m = validateMeta({ summary: SUMMARY, level: "complet" });
  assert.ok(planPrompt(m).includes("exactement " + LEVELS.complet.sections + " sections"));
  assert.ok(planPrompt(m).includes(SUMMARY));
});

test("validatePlan vérifie l'index et nettoie le plan", () => {
  const plan = { titre: "T", sections: [{ titre: "A", angle: "x", elements: ["e1"] }, { titre: "B" }] };
  assert.throws(() => validatePlan(plan, 2), ValidationError);
  assert.throws(() => validatePlan({ sections: [] }, 0), ValidationError);
  const p = validatePlan(plan, 1);
  assert.deepEqual(p.sections[1], { titre: "B", angle: "", elements: [] });
  const m = validateMeta({ summary: SUMMARY });
  assert.match(sectionPrompt(m, p, 1), /PARTIE À RÉDIGER : 2\. B/);
});
