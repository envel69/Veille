// Construction des prompts côté serveur : le navigateur n'envoie que des données,
// jamais de prompt libre (sinon n'importe qui pourrait utiliser la clé API).
import { LEVELS, AUDIENCES, MIN_SUMMARY_WORDS, MAX_SUMMARY_CHARS, countWords } from "../public/js/options.js";

export class ValidationError extends Error {}

const MAX_SECTIONS = Math.max(...Object.values(LEVELS).map((l) => l.sections));
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valide et normalise les métadonnées envoyées par le navigateur. */
export function validateMeta(raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  const meta = {
    summary: str(m.summary, MAX_SUMMARY_CHARS),
    title: str(m.title, 200),
    theme: str(m.theme, 200),
    audience: AUDIENCES[m.audience] ? m.audience : "direction",
    level: LEVELS[m.level] ? m.level : "approfondi",
    dateLabel: str(m.dateLabel, 60) || new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  };
  if (countWords(meta.summary) < MIN_SUMMARY_WORDS) {
    throw new ValidationError(`Le résumé est trop court (${MIN_SUMMARY_WORDS} mots minimum).`);
  }
  return meta;
}

/** Valide le plan renvoyé par le navigateur pour la rédaction d'une partie. */
export function validatePlan(raw, index) {
  const sections = raw && Array.isArray(raw.sections) ? raw.sections.slice(0, MAX_SECTIONS) : [];
  if (!sections.length) throw new ValidationError("Plan invalide.");
  if (!Number.isInteger(index) || index < 0 || index >= sections.length) throw new ValidationError("Numéro de partie invalide.");
  return {
    titre: str(raw.titre, 200) || "Rapport de veille",
    sections: sections.map((s) => ({
      titre: str(s && s.titre, 200),
      angle: str(s && s.angle, 600),
      elements: (s && Array.isArray(s.elements) ? s.elements : []).slice(0, 8).map((e) => str(e, 300))
    }))
  };
}

const RULES =
  "Règles d'exactitude : tu peux expliquer le contexte, les mécanismes, les enjeux et les implications à partir de connaissances générales solides. " +
  "N'invente aucun chiffre, date, nom d'entreprise, nom de source, citation ou événement précis qui ne figure pas dans le résumé. " +
  "Quand une donnée chiffrée ou un fait précis serait utile, formule-le prudemment dans le texte et signale-le comme élément à vérifier. " +
  "Écris en français soigné, en texte brut : pas de Markdown, pas d'astérisques, pas de titres numérotés dans les paragraphes, pas d'emoji. " +
  "Réponds uniquement avec un objet JSON valide, sans texte avant ni après.";

export function planPrompt(m) {
  const n = LEVELS[m.level].sections;
  return (
    "Tu es analyste de veille senior. À partir du résumé de veille ci-dessous, conçois un rapport de veille professionnel, très développé et structuré : chaque point du résumé doit devenir un véritable sujet d'analyse, avec son contexte, ses causes, ses mécanismes et ses conséquences.\n\n" +
    "Destinataires : " + AUDIENCES[m.audience].brief + ".\n" +
    (m.theme ? "Thème : " + m.theme + ".\n" : "") +
    (m.title ? "Titre imposé : « " + m.title + " » (utilise-le tel quel pour le champ titre).\n" : "") +
    "Date du rapport : " + m.dateLabel + ".\n\n" +
    "RÉSUMÉ DE VEILLE :\n<<<\n" + m.summary + "\n>>>\n\n" +
    RULES + "\n\n" +
    "Format JSON attendu :\n" +
    "{\n" +
    '  "titre": "titre du rapport, 4 à 12 mots",\n' +
    '  "titre_court": "3 à 6 mots",\n' +
    '  "sous_titre": "une phrase qui situe le rapport",\n' +
    '  "mots_cles": ["5 à 8 mots-clés"],\n' +
    '  "synthese": ["4 paragraphes de 110 à 150 mots : ce qui se passe, pourquoi c\'est important, ce que cela change, ce qu\'il faut faire"],\n' +
    '  "points_cles": ["6 à 8 phrases denses et informatives"],\n' +
    '  "sections": [{"titre": "titre de partie", "angle": "2 phrases sur ce que la partie doit couvrir", "elements": ["5 à 7 éléments précis à développer"]}],\n' +
    '  "acteurs": [{"nom": "acteur ou catégorie d\'acteurs", "role": "rôle, intérêts et marge de manœuvre, 2 à 3 phrases"}],\n' +
    '  "risques": ["5 à 7 risques, deux à trois phrases chacun : nature, probabilité, impact"],\n' +
    '  "opportunites": ["5 à 7 opportunités, deux à trois phrases chacune : nature, conditions, bénéfice"],\n' +
    '  "scenarios": [{"nom": "nom du scénario", "description": "4 à 6 phrases : hypothèses, déroulé, conséquences", "signaux": ["2 à 4 signaux à surveiller"]}],\n' +
    '  "recommandations": [{"action": "action concrète", "justification": "2 à 3 phrases : pourquoi, comment, avec qui", "priorite": "Haute|Moyenne|Basse", "horizon": "Court terme|Moyen terme|Long terme"}],\n' +
    '  "questions_ouvertes": ["5 à 8 questions"],\n' +
    '  "points_a_verifier": ["chaque fait, chiffre ou affirmation du résumé ou du rapport à confirmer, avec la source à consulter"],\n' +
    '  "glossaire": [{"terme": "terme", "definition": "définition en 2 phrases"}],\n' +
    '  "conclusion": ["3 paragraphes de 100 à 140 mots"]\n' +
    "}\n\n" +
    "Contraintes : exactement " + n + " sections, qui couvrent ensemble le contexte et l'origine du sujet, l'analyse détaillée de chaque point du résumé, les mécanismes ou fonctionnements en jeu, le cadre économique, réglementaire ou technique, les enjeux et impacts pour les parties prenantes, la comparaison avec les alternatives. Pas de section « synthèse », « scénarios », « recommandations » ou « conclusion » (déjà prévues ailleurs). 5 à 8 acteurs (uniquement ceux cités dans le résumé, ou des catégories génériques). Exactement 3 scénarios (tendanciel, favorable, défavorable). 5 à 8 recommandations. 8 à 14 termes de glossaire."
  );
}

export function sectionPrompt(m, plan, i) {
  const sec = plan.sections[i];
  const outline = plan.sections.map((s, k) => (k + 1) + ". " + s.titre).join("\n");
  return (
    "Tu es analyste de veille senior. Tu rédiges une partie d'un rapport de veille intitulé « " + plan.titre + " ».\n" +
    "Destinataires : " + AUDIENCES[m.audience].brief + ".\n\n" +
    "RÉSUMÉ DE VEILLE D'ORIGINE :\n<<<\n" + m.summary + "\n>>>\n\n" +
    "PLAN DU RAPPORT :\n" + outline + "\n\n" +
    "PARTIE À RÉDIGER : " + (i + 1) + ". " + sec.titre + "\n" +
    "Angle : " + sec.angle + "\n" +
    "Éléments à développer :\n- " + sec.elements.join("\n- ") + "\n\n" +
    "Rédige cette partie de façon très approfondie, entre " + LEVELS[m.level].words + " mots au total, sans répéter le contenu attendu dans les autres parties du plan. " +
    "Traite chaque élément à développer : explique les causes et les mécanismes, illustre, compare, mets en perspective et tire des implications concrètes pour les destinataires.\n\n" +
    RULES + "\n\n" +
    "Format JSON attendu :\n" +
    "{\n" +
    '  "introduction": "2 à 3 phrases qui annoncent la partie",\n' +
    '  "blocs": [{"sous_titre": "sous-titre", "paragraphes": ["paragraphes de 100 à 160 mots"]}],\n' +
    '  "exemple": "un exemple concret ou un cas d\'usage de 70 à 110 mots, présenté comme illustratif s\'il ne vient pas du résumé",\n' +
    '  "implications": ["3 à 5 implications concrètes pour les destinataires, une à deux phrases chacune"],\n' +
    '  "encadre": {"titre": "titre court de l\'encadré", "points": ["3 à 5 points synthétiques"]},\n' +
    '  "a_retenir": "une phrase de conclusion de la partie"\n' +
    "}\n" +
    "Contraintes : 3 à 5 blocs, 2 à 4 paragraphes par bloc."
  );
}
