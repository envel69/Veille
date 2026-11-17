// Brouillon conservé dans le navigateur entre deux visites, et exemple affiché au premier lancement.

const KEY = "atelier-veille-brouillon-v1";

export const EXAMPLE = {
  theme: "Énergie et mobilité",
  summary:
    "Veille batteries sodium-ion, semaine 45\n\n" +
    "- Plusieurs fabricants asiatiques annoncent une montée en cadence de la production de cellules sodium-ion, d'abord pour le stockage stationnaire et les petits véhicules urbains.\n" +
    "- Argument principal : pas de lithium ni de cobalt, matières premières plus abondantes, meilleure tenue au froid.\n" +
    "- Limite : densité énergétique encore inférieure au LFP, donc autonomie plus faible.\n" +
    "- Des constructeurs testent des packs hybrides sodium + lithium.\n" +
    "- En Europe, quelques start-up visent une usine pilote, financement encore incertain.\n" +
    "- À suivre pour nous : coût au kWh, disponibilité des fournisseurs, intérêt pour nos projets de stockage sur site."
};

export function saveDraft(draft) {
  try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* stockage indisponible */ }
}

export function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    return d && d.summary ? d : null;
  } catch { return null; }
}
