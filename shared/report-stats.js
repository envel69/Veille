// Statistiques d'un rapport, partagées entre le serveur et le navigateur.
import { countWords } from "./options.js";

/** Nombre de mots du rapport final. */
export function reportWords(R) {
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
