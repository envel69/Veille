// Aperçu HTML du rapport, affiché sous les boutons de téléchargement.

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const has = (a) => Array.isArray(a) && a.length > 0;
const list = (items) => (has(items) ? "<ul>" + items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul>" : "");
const paras = (items) => (items || []).map((p) => "<p>" + esc(p) + "</p>").join("");

export function renderPreview(R, m) {
  let k = 0;
  const h4 = (title) => {
    const n = String(++k).padStart(2, "0");
    return '<h4 id="part-' + n + '" data-num="' + n + '"><span class="num">' + n + "</span>" + esc(title) + "</h4>";
  };
  const out = [];

  out.push('<div class="cover"><p class="eyebrow">Rapport de veille · ' + esc(m.dateLabel) + "</p>");
  out.push('<h3 class="title">' + esc(R.titre) + "</h3>");
  if (R.sous_titre) out.push('<p class="subtitle">' + esc(R.sous_titre) + "</p>");
  if (has(R.mots_cles)) out.push('<div class="kw">' + R.mots_cles.map((x) => "<span>" + esc(x) + "</span>").join("") + "</div>");
  out.push("</div>");

  out.push(h4("Synthèse exécutive"), paras(R.synthese));
  if (has(R.points_cles)) out.push('<div class="box"><strong>Points clés</strong>' + list(R.points_cles) + "</div>");

  (R.sections || []).forEach((s) => {
    out.push(h4(s.titre));
    if (s.introduction) out.push('<p class="intro">' + esc(s.introduction) + "</p>");
    (s.blocs || []).forEach((b) => {
      if (b.sous_titre) out.push("<h5>" + esc(b.sous_titre) + "</h5>");
      out.push(paras(b.paragraphes));
    });
    if (s.exemple) out.push('<div class="box"><strong>Exemple concret</strong><p>' + esc(s.exemple) + "</p></div>");
    if (has(s.implications)) out.push("<h5>Implications concrètes</h5>" + list(s.implications));
    if (has(s.encadre?.points)) out.push('<div class="box"><strong>' + esc(s.encadre.titre || "En bref") + "</strong>" + list(s.encadre.points) + "</div>");
    if (s.a_retenir) out.push('<p class="keep">' + esc(s.a_retenir) + "</p>");
  });

  if (has(R.acteurs)) {
    out.push(h4("Acteurs et parties prenantes"), "<table><thead><tr><th>Acteur</th><th>Rôle et enjeu</th></tr></thead><tbody>");
    R.acteurs.forEach((a) => out.push("<tr><td><strong>" + esc(a.nom) + "</strong></td><td>" + esc(a.role) + "</td></tr>"));
    out.push("</tbody></table>");
  }
  if (has(R.risques) || has(R.opportunites)) {
    out.push(h4("Risques et opportunités"));
    if (has(R.risques)) out.push("<h5>Risques</h5>" + list(R.risques));
    if (has(R.opportunites)) out.push("<h5>Opportunités</h5>" + list(R.opportunites));
  }
  if (has(R.scenarios)) {
    out.push(h4("Scénarios d'évolution"));
    R.scenarios.forEach((s) => {
      out.push("<h5>" + esc(s.nom) + "</h5>", "<p>" + esc(s.description) + "</p>");
      if (has(s.signaux)) out.push('<p class="muted">Signaux à surveiller : ' + esc(s.signaux.join(" ; ")) + "</p>");
    });
  }
  if (has(R.recommandations)) {
    out.push(h4("Recommandations"), "<table><thead><tr><th>Action</th><th>Priorité</th><th>Horizon</th></tr></thead><tbody>");
    R.recommandations.forEach((r) => {
      const p = String(r.priorite || "").toLowerCase();
      out.push("<tr><td><strong>" + esc(r.action) + '</strong><br><span class="muted">' + esc(r.justification) + '</span></td><td><span class="prio ' + esc(p) + '">' + esc(r.priorite) + "</span></td><td>" + esc(r.horizon) + "</td></tr>");
    });
    out.push("</tbody></table>");
  }
  if (has(R.questions_ouvertes) || has(R.points_a_verifier)) {
    out.push(h4("Questions ouvertes et points à vérifier"));
    if (has(R.questions_ouvertes)) out.push("<h5>Questions ouvertes</h5>" + list(R.questions_ouvertes));
    if (has(R.points_a_verifier)) out.push('<div class="box warn"><strong>Points à vérifier avant diffusion</strong>' + list(R.points_a_verifier) + "</div>");
  }
  if (has(R.glossaire)) {
    out.push(h4("Glossaire"), "<table><tbody>");
    R.glossaire.forEach((g) => out.push("<tr><td><strong>" + esc(g.terme) + "</strong></td><td>" + esc(g.definition) + "</td></tr>"));
    out.push("</tbody></table>");
  }
  if (has(R.conclusion)) out.push(h4("Conclusion"), paras(R.conclusion));
  out.push(h4("Annexe : résumé source"), '<div class="src">' + esc(m.summary) + "</div>");
  return out.join("");
}
