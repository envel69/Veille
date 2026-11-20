// Options partagées entre l'interface et le serveur (qui construit les prompts).

export const LEVELS = {
  standard: { label: "Standard", sections: 5, words: "700 à 900" },
  approfondi: { label: "Approfondi", sections: 7, words: "900 à 1 100" },
  complet: { label: "Très complet", sections: 9, words: "1 100 à 1 400" }
};

export const AUDIENCES = {
  direction: {
    label: "Direction",
    brief: "un comité de direction : mets l'accent sur les enjeux, les décisions à prendre, les impacts économiques et organisationnels, avec un vocabulaire clair"
  },
  technique: {
    label: "Équipe technique",
    brief: "une équipe technique ou d'experts : détaille les mécanismes, les aspects techniques, les conditions de mise en œuvre, avec un vocabulaire précis"
  },
  general: {
    label: "Tous publics",
    brief: "un public large : sois pédagogique, explique les notions, donne des exemples concrets et des comparaisons"
  }
};

export const MIN_SUMMARY_WORDS = 15;
export const MAX_SUMMARY_CHARS = 20000;

export function countWords(text) {
  const m = String(text || "").trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}
