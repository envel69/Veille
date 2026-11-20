// Plan de l'aperçu : liste ordonnée et numérotée des parties affichées.
// Sert à la fois au rendu du rapport (ReportPreview) et au sommaire latéral.

export const has = (a) => Array.isArray(a) && a.length > 0;

export function outline(R) {
  const parts = [];
  const add = (kind, title, data) => {
    const num = String(parts.length + 1).padStart(2, "0");
    parts.push({ id: "part-" + num, num, kind, title, data });
  };

  add("synthese", "Synthèse exécutive");
  (R.sections || []).forEach((s) => add("section", s.titre, s));
  if (has(R.acteurs)) add("acteurs", "Acteurs et parties prenantes");
  if (has(R.risques) || has(R.opportunites)) add("risques", "Risques et opportunités");
  if (has(R.scenarios)) add("scenarios", "Scénarios d'évolution");
  if (has(R.recommandations)) add("recommandations", "Recommandations");
  if (has(R.questions_ouvertes) || has(R.points_a_verifier)) add("questions", "Questions ouvertes et points à vérifier");
  if (has(R.glossaire)) add("glossaire", "Glossaire");
  if (has(R.conclusion)) add("conclusion", "Conclusion");
  add("annexe", "Annexe : résumé source");
  return parts;
}
