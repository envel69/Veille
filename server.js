// Atelier de veille — serveur local
// Lancement : node server.js   puis ouvrir http://localhost:3000
// Aucune dépendance : Node.js 18 ou plus récent suffit.

const http = require("http");
const fs = require("fs");
const path = require("path");

/* ---------- Configuration (.env facultatif) ---------- */
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1"; // 0.0.0.0 dans Docker
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 8000);
const MOCK = process.env.MOCK === "1"; // mode démo sans clé, réponses fictives

const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };

/* ---------- Utilitaires ---------- */
function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("Requête trop volumineuse")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/* ---------- Appel à Claude en streaming ----------
   Le navigateur reçoit le texte au fil de l'eau (text/plain).
   Si la réponse est coupée par la limite de jetons, la dernière ligne vaut
   <<<TRONQUE>>> ; en cas d'erreur en cours de route : <<<ERREUR:message>>>. */
async function handleGenerate(req, res) {
  let prompt;
  try { prompt = JSON.parse(await readBody(req)).prompt; } catch { return json(res, 400, { error: "Corps JSON invalide" }); }
  if (!prompt || typeof prompt !== "string") return json(res, 400, { error: "Champ « prompt » manquant" });

  if (MOCK) return mockAnswer(prompt, res);
  if (!API_KEY) return json(res, 500, { error: "Clé API absente : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez le serveur." });

  const controller = new AbortController();
  req.on("close", () => { if (!res.writableEnded) controller.abort(); });

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, stream: true, messages: [{ role: "user", content: prompt }] })
    });
  } catch (e) {
    return json(res, 502, { error: "Impossible de joindre l'API Anthropic (" + e.message + "). Vérifiez votre connexion internet." });
  }
  if (!upstream.ok) {
    let detail = "";
    try { const j = await upstream.json(); detail = (j.error && j.error.message) || ""; } catch {}
    const status = upstream.status;
    const msg =
      status === 401 ? "Clé API refusée : vérifiez ANTHROPIC_API_KEY dans le fichier .env." :
      status === 429 ? "Limite de requêtes de l'API atteinte : patientez une minute puis relancez." :
      status === 404 ? "Modèle introuvable (" + MODEL + ") : changez ANTHROPIC_MODEL dans le fichier .env." :
      "Erreur de l'API Anthropic (" + status + ") " + detail;
    return json(res, status === 429 ? 429 : 502, { error: msg, code: status === 429 ? "rate_limited" : "api_error" });
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  const decoder = new TextDecoder();
  let buffer = "", stopReason = null;
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        let data; try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
        if (data.type === "content_block_delta" && data.delta && data.delta.type === "text_delta") res.write(data.delta.text);
        else if (data.type === "message_delta" && data.delta && data.delta.stop_reason) stopReason = data.delta.stop_reason;
        else if (data.type === "error") res.write("\n<<<ERREUR:" + ((data.error && data.error.message) || "erreur") + ">>>");
      }
    }
    if (stopReason === "max_tokens") res.write("\n<<<TRONQUE>>>");
  } catch (e) {
    if (!controller.signal.aborted) res.write("\n<<<ERREUR:" + e.message + ">>>");
  }
  res.end();
}

/* ---------- Mode démo (MOCK=1) ---------- */
function mockAnswer(prompt, res) {
  const P = "Paragraphe de démonstration. Ce texte remplace la rédaction de Claude lorsque le serveur tourne en mode démo, afin de vérifier la mise en page du PDF sans clé API. Il est volontairement assez long pour occuper plusieurs lignes dans le document final.";
  const isPlan = prompt.includes('"sections"');
  const n = Number((prompt.match(/exactement (\d+) sections/) || [])[1] || 4);
  const obj = isPlan ? {
    titre: "Rapport de démonstration", titre_court: "Démonstration", sous_titre: "Généré en mode démo, sans appel à l'API",
    mots_cles: ["démo", "veille", "PDF"], synthese: [P, P, P], points_cles: ["Point clé un.", "Point clé deux.", "Point clé trois."],
    sections: Array.from({ length: n }, (_, i) => ({ titre: "Partie de démonstration " + (i + 1), angle: "Angle.", elements: ["Élément A", "Élément B"] })),
    acteurs: [{ nom: "Acteur A", role: "Rôle de démonstration." }], risques: ["Risque A."], opportunites: ["Opportunité A."],
    recommandations: [{ action: "Action A", justification: "Justification.", priorite: "Haute", horizon: "Court terme" }],
    questions_ouvertes: ["Question A ?"], points_a_verifier: ["Fait A à vérifier."], glossaire: [{ terme: "Terme", definition: "Définition." }], conclusion: [P, P]
  } : {
    introduction: "Introduction de démonstration.",
    blocs: [{ sous_titre: "Premier sous-titre", paragraphes: [P, P] }, { sous_titre: "Deuxième sous-titre", paragraphes: [P, P] }],
    encadre: { titre: "En bref", points: ["Point A", "Point B", "Point C"] }, a_retenir: "Phrase à retenir."
  };
  const text = JSON.stringify(obj, null, 1);
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  let i = 0;
  const t = setInterval(() => {
    res.write(text.slice(i, i + 120)); i += 120;
    if (i >= text.length) { clearInterval(t); res.end(); }
  }, 15);
}

/* ---------- Serveur HTTP ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, { ready: MOCK || Boolean(API_KEY), mock: MOCK, model: MOCK ? "démo" : MODEL });
    }
    if (req.method === "POST" && url.pathname === "/api/generate") return handleGenerate(req, res);
    if (req.method !== "GET") return json(res, 405, { error: "Méthode non autorisée" });

    let file = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "Accès refusé" });
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Introuvable"); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log("\n  Atelier de veille : http://localhost:" + PORT);
  if (MOCK) console.log("  Mode démo actif (MOCK=1) : réponses fictives, aucune clé API utilisée.");
  else if (!API_KEY) console.log("  ⚠ Aucune clé API : ajoutez ANTHROPIC_API_KEY dans le fichier .env puis relancez.");
  else console.log("  Modèle : " + MODEL);
  console.log("  Arrêt : Ctrl+C\n");
});
