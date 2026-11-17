// Appel à l'API Anthropic en streaming, relayé au navigateur en texte brut.
// Conventions de fin de flux : "<<<TRONQUE>>>" si la limite de jetons est atteinte,
// "<<<ERREUR:message>>>" si une erreur survient en cours de route.

export class UpstreamError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

/** Ouvre la requête vers l'API ; lève UpstreamError si elle échoue avant le streaming. */
export async function openStream({ apiKey, model, maxTokens }, prompt, signal) {
  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, stream: true, messages: [{ role: "user", content: prompt }] })
    });
  } catch (e) {
    throw new UpstreamError("Impossible de joindre l'API Anthropic (" + e.message + "). Vérifiez votre connexion internet.", 502, "network");
  }
  if (!upstream.ok) {
    let detail = "";
    try { const j = await upstream.json(); detail = (j.error && j.error.message) || ""; } catch { /* corps vide */ }
    const s = upstream.status;
    const msg =
      s === 401 ? "Clé API refusée : vérifiez ANTHROPIC_API_KEY dans le fichier .env." :
      s === 429 ? "Limite de requêtes de l'API atteinte : patientez une minute puis relancez." :
      s === 404 ? "Modèle introuvable (" + model + ") : changez ANTHROPIC_MODEL dans le fichier .env." :
      "Erreur de l'API Anthropic (" + s + ") " + detail;
    throw new UpstreamError(msg, s === 429 ? 429 : 502, s === 429 ? "rate_limited" : "api_error");
  }
  return upstream;
}

/** Lit les événements SSE de l'API et écrit le texte au fil de l'eau dans `res`. */
export async function pipeText(upstream, res, signal) {
  const decoder = new TextDecoder();
  let buffer = "", stopReason = null;
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        let data;
        try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
        if (data.type === "content_block_delta" && data.delta?.type === "text_delta") res.write(data.delta.text);
        else if (data.type === "message_delta" && data.delta?.stop_reason) stopReason = data.delta.stop_reason;
        else if (data.type === "error") res.write("\n<<<ERREUR:" + (data.error?.message || "erreur") + ">>>");
      }
    }
    if (stopReason === "max_tokens") res.write("\n<<<TRONQUE>>>");
  } catch (e) {
    if (!signal.aborted) res.write("\n<<<ERREUR:" + e.message + ">>>");
  }
  res.end();
}
