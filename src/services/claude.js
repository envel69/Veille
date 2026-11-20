// Appels à Claude via le SDK officiel (@anthropic-ai/sdk), en streaming.
// - cache de prompts : le préfixe commun (consignes + notes + plan) est marqué « ephemeral »
// - refus : stop_reason "refusal" géré, avec repli serveur automatique (fallbacks: "default")
// - le SDK relance seul les erreurs passagères (429, 5xx, réseau)
import Anthropic from "@anthropic-ai/sdk";

/** Erreur de génération avec un code exploitable par l'interface. */
export class GenerationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Modèles qui acceptent le repli serveur `fallbacks: "default"`.
const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Extrait l'objet JSON d'une réponse (tolère des balises ``` autour). */
export function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new GenerationError("parse", "Réponse illisible");
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch { throw new GenerationError("parse", "Réponse illisible"); }
}

/** Corps de requête Messages : system, blocs mis en cache, puis la partie variable. */
export function buildParams({ model, maxTokens }, req) {
  const cached = req.cached.map((text) => ({ type: "text", text, cache_control: { type: "ephemeral" } }));
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: req.system }],
    messages: [{ role: "user", content: [...cached, { type: "text", text: req.tail }] }]
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = [FALLBACK_BETA];
    params.fallbacks = "default";
  }
  return params;
}

function translateApiError(e, model) {
  if (e instanceof Anthropic.AuthenticationError) return new GenerationError("auth", "Clé API refusée : vérifiez ANTHROPIC_API_KEY dans le fichier .env.");
  if (e instanceof Anthropic.NotFoundError) return new GenerationError("model", "Modèle introuvable (" + model + ") : changez ANTHROPIC_MODEL dans le fichier .env.");
  if (e instanceof Anthropic.RateLimitError) return new GenerationError("rate_limited", "Limite de requêtes de l'API atteinte : patientez une minute puis relancez.");
  if (e instanceof Anthropic.BadRequestError) return new GenerationError("api_error", "Requête refusée par l'API : " + e.message);
  if (e instanceof Anthropic.APIConnectionError) return new GenerationError("network", "Impossible de joindre l'API Anthropic. Vérifiez la connexion internet.");
  if (e instanceof Anthropic.APIError) return new GenerationError("api_error", "Erreur de l'API Anthropic (" + (e.status || "?") + ").");
  return e;
}

export function createClaude(config) {
  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 3 });

  /**
   * Envoie une requête et renvoie { data, usage }.
   * onText(texteCumulé) est appelé à chaque fragment reçu ; le premier appel signale
   * que la réponse a commencé (le cache devient alors lisible par les requêtes suivantes).
   */
  async function generateJson(req, { signal, onText } = {}) {
    let text = "";
    let message;
    try {
      const stream = client.beta.messages.stream(buildParams(config, req), { signal });
      stream.on("text", (delta) => { text += delta; onText?.(text); });
      message = await stream.finalMessage();
    } catch (e) {
      if (signal?.aborted) throw new GenerationError("aborted", "Annulé");
      throw translateApiError(e, config.model);
    }
    if (message.stop_reason === "refusal") {
      throw new GenerationError("refusal", "Claude a décliné cette demande" + (message.stop_details?.category ? " (catégorie : " + message.stop_details.category + ")" : "") + ". Reformulez vos notes puis relancez.");
    }
    if (message.stop_reason === "max_tokens") throw new GenerationError("truncated", "Réponse tronquée (limite MAX_TOKENS atteinte).");
    const answer = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { data: parseJson(answer), usage: message.usage };
  }

  return { generateJson };
}
