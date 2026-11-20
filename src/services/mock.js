// Mode démo (MOCK=1 ou --mock) : imite le service Claude avec des réponses fictives,
// pour tester l'interface et la mise en page sans clé API ni coût.
import { GenerationError } from "./claude.js";

const P = "Paragraphe de démonstration. Ce texte remplace la rédaction de Claude lorsque le serveur tourne en mode démo, afin de vérifier la mise en page du PDF sans clé API. Il est volontairement assez long pour occuper plusieurs lignes dans le document final.";

export function mockPlan(sectionCount) {
  return {
    titre: "Rapport de démonstration",
    titre_court: "Démonstration",
    sous_titre: "Généré en mode démo, sans appel à l'API",
    mots_cles: ["démo", "veille", "PDF"],
    synthese: [P, P, P],
    points_cles: ["Point clé un.", "Point clé deux.", "Point clé trois."],
    sections: Array.from({ length: sectionCount }, (_, i) => ({ titre: "Partie de démonstration " + (i + 1), angle: "Angle.", elements: ["Élément A", "Élément B"] })),
    acteurs: [{ nom: "Acteur A", role: "Rôle de démonstration." }],
    risques: ["Risque A."],
    opportunites: ["Opportunité A."],
    scenarios: ["Tendanciel", "Favorable", "Défavorable"].map((nom) => ({ nom: "Scénario " + nom.toLowerCase(), description: P, signaux: ["Signal A", "Signal B"] })),
    recommandations: [{ action: "Action A", justification: "Justification.", priorite: "Haute", horizon: "Court terme" }],
    questions_ouvertes: ["Question A ?"],
    points_a_verifier: ["Fait A à vérifier."],
    glossaire: [{ terme: "Terme", definition: "Définition." }],
    conclusion: [P, P]
  };
}

export function mockSection() {
  return {
    introduction: "Introduction de démonstration.",
    blocs: ["Premier", "Deuxième", "Troisième"].map((n) => ({ sous_titre: n + " sous-titre", paragraphes: [P, P, P] })),
    exemple: P,
    implications: ["Implication A.", "Implication B.", "Implication C."],
    encadre: { titre: "En bref", points: ["Point A", "Point B", "Point C"] },
    a_retenir: "Phrase à retenir."
  };
}

/**
 * @param opts.delayMs   délai entre deux fragments (simule le streaming)
 * @param opts.failOnce  numéros de parties (1, 2…) qui échouent à leur première tentative
 */
export function createMockClaude({ delayMs = 15, failOnce = [] } = {}) {
  const pendingFailures = new Set(failOnce);
  let warm = false; // simule le cache : écrit à la première requête, relu ensuite

  async function generateJson(req, { signal, onText } = {}) {
    const isPlan = req.tail.startsWith("TÂCHE : conçois");
    const part = Number((req.tail.match(/rédige la partie (\d+)/) || [])[1]);
    const n = Number((req.tail.match(/exactement (\d+) sections/) || [])[1] || 4);
    const obj = isPlan ? mockPlan(n) : mockSection();
    const text = JSON.stringify(obj, null, 1);

    for (let i = 0; i < text.length; i += 120) {
      if (signal?.aborted) throw new GenerationError("aborted", "Annulé");
      await new Promise((r) => setTimeout(r, delayMs));
      onText?.(text.slice(0, i + 120));
      if (!isPlan && pendingFailures.has(part) && i > text.length / 2) {
        pendingFailures.delete(part);
        throw new GenerationError("api_error", "Erreur simulée sur la partie " + part + " (mode démo).");
      }
    }
    const prefix = 900 + req.cached.join("").length / 4;
    const usage = warm
      ? { input_tokens: 150, cache_read_input_tokens: Math.round(prefix), cache_creation_input_tokens: 0, output_tokens: Math.round(text.length / 4) }
      : { input_tokens: 150, cache_read_input_tokens: 0, cache_creation_input_tokens: Math.round(prefix), output_tokens: Math.round(text.length / 4) };
    warm = true;
    return { data: obj, usage };
  }

  return { generateJson };
}
