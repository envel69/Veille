// État partagé de l'interface et actions : connexion, rédaction → génération → résultat, historique.
import { reactive, watch } from "vue";
import { LEVELS, AUDIENCES, MIN_SUMMARY_WORDS, countWords } from "@shared/options.js";
import { reportWords } from "@shared/report-stats.js";
import { buildReportPdf } from "@shared/pdf-builder.js";
import * as api from "./api/index.js";
import { setUnauthorizedHandler } from "./api/http.js";
import { EXAMPLE, loadDraft, saveDraft } from "./lib/draft.js";

export const state = reactive({
  auth: { checked: false, required: false, authenticated: false },
  view: "compose",       // compose | busy | result | history
  focusTick: 0,          // incrémenté pour placer le focus sur le titre de l'écran affiché
  server: { ready: false, label: "Connexion…", tone: "", title: "" },
  form: { title: "", theme: "", author: "", audience: "direction", level: "approfondi", summary: "" },
  example: false,
  inputMsg: "",
  outputMsg: "",
  historyMsg: "",
  starting: false,
  job: null,             // dernier état connu de la génération suivie
  jobLost: false,
  elapsedMs: 0,
  current: null,         // { entryId, filename, report, meta, fromHistory, pdfUrl, pages, sizeKo, words }
  history: [],
  toast: ""
});

/* ---------- Outils ---------- */
export const plural = (n, word) => n.toLocaleString("fr-FR") + " " + word + (n > 1 ? "s" : "");

let toastTimer = null;
export function toast(text) {
  state.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ""; }, 3200);
}

export function showView(name, { focus = true } = {}) {
  state.view = name;
  window.scrollTo({ top: 0 });
  if (focus) state.focusTick++;
}

const BASE_TITLE = "Atelier de veille";
export function setTabTitle(text) { document.title = text ? text + " · " + BASE_TITLE : BASE_TITLE; }

/* ---------- Connexion ---------- */
let unwatch = null;
let timer = null;

setUnauthorizedHandler(() => {
  unwatch?.(); unwatch = null;
  stopTimer();
  state.auth.authenticated = false;
});

export async function checkSession() {
  try {
    const s = await api.getSession();
    state.auth.required = s.authRequired;
    state.auth.authenticated = s.authenticated;
  } catch {
    state.server = { ready: false, label: "Serveur injoignable", tone: "warn", title: "" };
    state.inputMsg = "Le serveur ne répond pas. Lancez « npm start » ou « docker compose up -d », puis rechargez la page.";
  }
  state.auth.checked = true;
  if (state.auth.authenticated) boot();
}

export async function signIn(password) {
  await api.login(password);
  state.auth.authenticated = true;
  boot();
}

export async function signOut() {
  try { await api.logout(); } catch { /* déjà déconnecté */ }
  unwatch?.(); unwatch = null;
  stopTimer();
  if (state.current?.pdfUrl) URL.revokeObjectURL(state.current.pdfUrl);
  Object.assign(state, { job: null, current: null, history: [], view: "compose" });
  state.auth.authenticated = false;
}

function boot() {
  checkServer();
  reattachRunningJob();
  api.migrateLocalHistory()
    .then((moved) => { if (moved) toast(plural(moved, "rapport") + " de ce navigateur ajouté" + (moved > 1 ? "s" : "") + " à l'historique."); })
    .catch(() => {})
    .finally(refreshHistory);
}

async function checkServer() {
  try {
    const st = await api.getStatus();
    state.server = {
      ready: Boolean(st.ready),
      label: st.mock ? "Mode démo" : st.ready ? st.model : "Clé API manquante",
      tone: st.ready ? "ok" : "warn",
      title: st.mock ? "Mode démo : texte fictif, aucune clé utilisée" : ""
    };
    if (!st.ready) state.inputMsg = "Aucune clé API configurée : ajoutez ANTHROPIC_API_KEY dans le fichier .env, puis relancez le serveur.";
  } catch (e) {
    if (e.status === 401) return;
    state.server = { ready: false, label: "Serveur injoignable", tone: "warn", title: "" };
    state.inputMsg = "Le serveur ne répond pas. Lancez « npm start » ou « docker compose up -d », puis rechargez la page.";
  }
}

/* ---------- Formulaire (brouillon conservé dans le navigateur) ---------- */
export function fillForm(d) {
  Object.assign(state.form, {
    title: d.title || "", theme: d.theme || "", author: d.author || "",
    audience: AUDIENCES[d.audience] ? d.audience : state.form.audience,
    level: LEVELS[d.level] ? d.level : state.form.level,
    summary: d.summary || ""
  });
}

export function initForm() {
  const draft = loadDraft();
  if (draft) { fillForm(draft); state.example = false; }
  else { fillForm(EXAMPLE); state.example = true; }
  watch(() => ({ ...state.form }), (f) => saveDraft(f));
}

export function setExample() {
  state.form.theme = EXAMPLE.theme;
  state.form.summary = EXAMPLE.summary;
  state.example = true; // remis à false dès que l'utilisateur tape (événement input du formulaire)
}

/* ---------- Suivi d'une génération (elle tourne sur le serveur) ---------- */
export const jobRunning = () => state.job?.status === "running";

function startTimer(startedAt) {
  const t0 = Date.parse(startedAt) || Date.now();
  const tick = () => { state.elapsedMs = Date.now() - t0; };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}
function stopTimer() { clearInterval(timer); timer = null; }

/** Progression : une étape en cours compte pour moitié. */
export function progress(steps) {
  const score = steps.reduce((a, s) => a + (s.state === "done" ? 1 : s.state === "active" ? 0.5 : 0), 0);
  return Math.min(100, Math.round((score / Math.max(1, steps.length)) * 100));
}

export function errorMessage(err) {
  switch (err?.code) {
    case "rate_limited": return "Trop de demandes en peu de temps. Patientez une minute puis cliquez sur « Reprendre ».";
    case "parse":
    case "truncated": return "Claude a renvoyé une réponse incomplète pour une étape. Cliquez sur « Reprendre » : les parties déjà rédigées sont conservées.";
    default: return (err?.message || "La génération a échoué.") + " Les parties déjà rédigées sont conservées : « Reprendre » ne refait que le reste.";
  }
}

async function onJobSnapshot(snap) {
  state.job = snap;
  if (snap.status === "running") {
    state.outputMsg = "";
    if (!timer) startTimer(snap.startedAt);
    setTabTitle(progress(snap.steps) + " %");
    return;
  }

  stopTimer();
  unwatch = null;
  if (snap.status === "done") {
    setTabTitle(document.hidden ? "✓ Rapport prêt" : "");
    refreshHistory();
    const entry = await loadEntry(snap.reportId);
    if (!entry) return;
    // N'affiche le résultat que si l'utilisateur suit encore cette génération.
    if (state.view === "busy") {
      await openResult(entry, { fromHistory: false });
      toast("Rapport prêt et enregistré dans l'historique.");
    } else {
      toast("Rapport prêt : « " + entry.title + " » est dans l'historique.");
    }
    state.job = null;
    return;
  }
  setTabTitle(snap.status === "error" ? "Erreur" : "");
  state.outputMsg = snap.status === "error" ? errorMessage(snap.error) : "";
}

function follow(snap, { show = true } = {}) {
  unwatch?.();
  stopTimer();
  state.job = snap;
  state.jobLost = false;
  if (show) showView("busy");
  unwatch = api.watchJob(snap.id, onJobSnapshot, () => {
    stopTimer();
    state.jobLost = true;
    state.outputMsg = "Cette génération n'existe plus sur le serveur (il a sans doute redémarré). Relancez-la depuis « Modifier le résumé ».";
  });
}

function collectMeta() {
  const f = state.form;
  return {
    title: f.title.trim(), theme: f.theme.trim(), author: f.author.trim(),
    audience: f.audience, level: f.level,
    summary: f.summary.trim(),
    dateLabel: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  };
}

export async function generate() {
  state.inputMsg = "";
  if (jobRunning()) { showView("busy"); toast("Une génération est déjà en cours."); return; }
  const m = collectMeta();
  if (countWords(m.summary) < MIN_SUMMARY_WORDS) {
    state.inputMsg = `Vos notes sont trop courtes : écrivez au moins ${MIN_SUMMARY_WORDS} mots pour que le rapport ait de la matière.`;
    showView("compose");
    return;
  }
  if (!state.server.ready) {
    state.inputMsg = "Le serveur n'est pas prêt : vérifiez qu'il tourne et que ANTHROPIC_API_KEY est renseignée dans .env.";
    showView("compose");
    return;
  }
  state.starting = true;
  try {
    const snap = await api.startJob(m);
    state.outputMsg = "";
    follow(snap);
  } catch (e) {
    state.inputMsg = e.message;
    showView("compose");
  } finally {
    state.starting = false;
  }
}

export async function resumeCurrent() {
  if (!state.job) return;
  try { follow(await api.resumeJob(state.job.id), { show: false }); }
  catch (e) { state.outputMsg = e.message; }
}

export async function cancelCurrent() {
  if (!jobRunning()) return;
  try { await api.cancelJob(state.job.id); }
  catch (e) { toast(e.message); }
}

/** Au chargement : rattache la page à une génération encore en cours (onglet rouvert, rechargement). */
async function reattachRunningJob() {
  try {
    const running = (await api.listJobs()).find((j) => j.status === "running");
    if (running) { follow(running); toast("Génération en cours retrouvée."); }
  } catch { /* serveur injoignable : déjà signalé par checkServer */ }
}

/* ---------- Résultat : PDF construit dans le navigateur ---------- */
let jsPdfLoader = null;
const loadJsPdf = () => (jsPdfLoader ||= import("jspdf").then((m) => m.jsPDF));

function slug(s) {
  return String(s || "rapport").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "rapport";
}

async function makePdf(report, m) {
  const doc = buildReportPdf(report, m, await loadJsPdf());
  const blob = doc.output("blob");
  const filename = "rapport-veille-" + slug(report.titre_court || report.titre) + "-" + m.date.toLocaleDateString("sv-SE") + ".pdf";
  return { doc, blob, filename };
}

export async function openResult(entry, { fromHistory = true } = {}) {
  const meta = api.metaFromEntry(entry);
  const { doc, blob, filename } = await makePdf(entry.report, meta);
  if (state.current?.pdfUrl) URL.revokeObjectURL(state.current.pdfUrl);
  state.current = {
    entryId: entry.id, filename, report: entry.report, meta, fromHistory,
    pdfUrl: URL.createObjectURL(blob),
    pages: doc.getNumberOfPages(),
    sizeKo: Math.max(1, Math.round(blob.size / 1024)),
    words: reportWords(entry.report)
  };
  showView("result");
}

export function downloadUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Téléchargé : " + filename);
}

/* ---------- Historique ---------- */
export async function refreshHistory() {
  try {
    state.history = await api.listReports();
    state.historyMsg = "";
  } catch (e) {
    if (e.status !== 401) state.historyMsg = "Impossible de charger l'historique : le serveur ne répond pas.";
  }
}

async function loadEntry(id) {
  try { return await api.getReport(id); }
  catch { toast("Ce rapport est introuvable."); refreshHistory(); return null; }
}

export async function openFromHistory(id) {
  const entry = await loadEntry(id);
  if (entry) {
    try { await openResult(entry); }
    catch { toast("Impossible de construire le PDF. Rechargez la page."); }
  }
}

export async function downloadFromHistory(id) {
  const entry = await loadEntry(id);
  if (!entry) return;
  const { blob, filename } = await makePdf(entry.report, api.metaFromEntry(entry));
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function deleteReport(h) {
  try {
    await api.removeReport(h.id);
    if (state.current?.entryId === h.id) state.current.entryId = null;
    toast("Rapport supprimé de l'historique.");
    refreshHistory();
  } catch {
    toast("La suppression a échoué.");
  }
}

export function goHistory() {
  showView("history");
  refreshHistory();
}

export function backToCompose() {
  showView("compose");
}

export function editCurrent({ regenerate = false } = {}) {
  if (state.current) { fillForm(state.current.meta); state.example = false; }
  if (regenerate) generate(); else backToCompose();
}
