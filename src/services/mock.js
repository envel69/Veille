// Mode démo (MOCK=1 ou --mock) : réponses fictives, pour tester la mise en page sans clé API.

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

/** Envoie l'objet en petits morceaux pour simuler le streaming. */
export function streamMock(obj, res, delayMs = 15) {
  const text = JSON.stringify(obj, null, 1);
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  let i = 0;
  const t = setInterval(() => {
    res.write(text.slice(i, i + 120));
    i += 120;
    if (i >= text.length) { clearInterval(t); res.end(); }
  }, delayMs);
  res.on("close", () => clearInterval(t));
}
