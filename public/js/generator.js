// Orchestration de la génération : un plan, puis chaque partie rédigée l'une après l'autre.
import { LEVELS } from "./options.js";
import { streamJson, ApiError } from "./api.js";

/**
 * @param meta   métadonnées du rapport (summary, title, theme, audience, level, dateLabel)
 * @param hooks  { signal, onPlanWords(n), onPlan(plan), onSectionStart(i), onSectionWords(i, n), onSectionDone(i) }
 * @returns      le rapport complet (plan + parties développées)
 */
export async function generateReport(meta, hooks) {
  const { signal } = hooks;
  const n = LEVELS[meta.level].sections;

  const plan = await streamJson("/api/plan", { meta }, { signal, onWords: hooks.onPlanWords });
  if (!Array.isArray(plan.sections) || !plan.sections.length) throw new ApiError("parse", "Plan vide");
  if (meta.title) plan.titre = meta.title;
  plan.sections = plan.sections.slice(0, n);
  hooks.onPlan(plan);

  // Le serveur n'a besoin que du squelette du plan pour rédiger une partie.
  const outline = { titre: plan.titre, sections: plan.sections.map(({ titre, angle, elements }) => ({ titre, angle, elements })) };
  // Les parties sont indépendantes une fois le plan connu : on en rédige plusieurs à la fois.
  const developed = new Array(plan.sections.length);
  let next = 0, failed = false;
  async function worker() {
    while (!failed && next < plan.sections.length) {
      const i = next++;
      hooks.onSectionStart(i);
      let body;
      try {
        body = await streamJson("/api/section", { meta, plan: outline, index: i }, { signal, onWords: (w) => hooks.onSectionWords(i, w) });
      } catch (e) {
        failed = true; // les autres workers s'arrêtent après leur partie en cours
        throw e;
      }
      developed[i] = { titre: plan.sections[i].titre, ...body };
      hooks.onSectionDone(i);
    }
  }
  const workers = Array.from({ length: Math.min(SECTION_CONCURRENCY, plan.sections.length) }, worker);
  await Promise.all(workers);
  return { ...plan, sections: developed };
}

export const SECTION_CONCURRENCY = 3;

/** Nombre de mots du rapport final (pour les statistiques affichées). */
export function reportWords(R, countWords) {
  let t = [].concat(R.synthese || [], R.points_cles || [], R.risques || [], R.opportunites || [], R.questions_ouvertes || [], R.points_a_verifier || [], R.conclusion || []);
  (R.sections || []).forEach((s) => {
    t.push(s.introduction || "", s.a_retenir || "");
    (s.blocs || []).forEach((b) => { t.push(b.sous_titre || ""); t = t.concat(b.paragraphes || []); });
    if (s.encadre) t = t.concat(s.encadre.points || []);
    t = t.concat(s.exemple || "", s.implications || []);
  });
  (R.acteurs || []).forEach((a) => t.push(a.nom, a.role));
  (R.recommandations || []).forEach((r) => t.push(r.action, r.justification));
  (R.glossaire || []).forEach((g) => t.push(g.terme, g.definition));
  (R.scenarios || []).forEach((s) => { t.push(s.nom, s.description); t = t.concat(s.signaux || []); });
  return countWords(t.join(" "));
}
