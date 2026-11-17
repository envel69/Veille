// Interface : rédaction → génération → résultat, et historique (accessible depuis l'en-tête).
import { LEVELS, AUDIENCES, MIN_SUMMARY_WORDS, countWords } from "./options.js";
import { getStatus } from "./api.js";
import { generateReport, reportWords } from "./generator.js";
import { renderPreview } from "./preview.js";
import { buildReportPdf } from "./pdf-builder.js";
import { EXAMPLE, loadDraft, saveDraft } from "./draft.js";
import { listReports, getReport, saveReport, removeReport, metaFromEntry, migrateLocalHistory } from "./history.js";

const $ = (id) => document.getElementById(id);
const el = new Proxy({}, { get: (cache, id) => cache[id] || (cache[id] = $(id)) });

const state = {
  view: "compose",
  serverReady: false,
  controller: null,
  pdfUrl: null,
  current: null, // { entryId, filename, report, meta }
  steps: [],
  timer: null,
  startedAt: 0,
  history: [] // résumés renvoyés par le serveur
};

/* ---------- Outils d'interface ---------- */
let toastTimer = null;
function toast(text) {
  el.toast.textContent = text;
  el.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 3200);
}
function showMsg(node, text) { node.textContent = text; node.classList.remove("hidden"); }
function hideMsg(node) { node.classList.add("hidden"); node.textContent = ""; }

const VIEWS = { compose: "viewCompose", busy: "viewBusy", result: "viewResult", history: "viewHistory" };
const FOCUS = { compose: "hCompose", busy: "busyTitle", result: "resTitle", history: "hHistory" };
function showView(name, { focus = true } = {}) {
  state.view = name;
  Object.entries(VIEWS).forEach(([k, id]) => el[id].classList.toggle("hidden", k !== name));
  // Onglet actif de l'en-tête : « Historique » pour l'historique et les rapports rouverts depuis celui-ci.
  const inHistory = name === "history" || (name === "result" && state.current?.fromHistory);
  const [on, off] = inHistory ? [el.navHistory, el.navNew] : [el.navNew, el.navHistory];
  on.setAttribute("aria-current", "page");
  off.removeAttribute("aria-current");
  window.scrollTo({ top: 0 });
  if (focus) el[FOCUS[name]].focus({ preventScroll: true });
}

function plural(n, word) { return n.toLocaleString("fr-FR") + " " + word + (n > 1 ? "s" : ""); }
function fmtTime(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------- Écran 1 : formulaire ---------- */
const radio = (name) => el.form.querySelector(`input[name="${name}"]:checked`)?.value;
function setRadio(name, value) {
  const input = el.form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function updateCount() {
  const n = countWords(el.fSummary.value);
  el.wordCount.textContent = n < MIN_SUMMARY_WORDS ? `${plural(n, "mot")} · ${MIN_SUMMARY_WORDS} minimum` : plural(n, "mot");
  el.wordCount.classList.toggle("ok", n >= MIN_SUMMARY_WORDS);
}
function setExample(on) { el.exampleChip.classList.toggle("hidden", !on); }
function persist() {
  saveDraft({ title: el.fTitle.value, theme: el.fTheme.value, author: el.fAuthor.value, audience: radio("audience"), level: radio("level"), summary: el.fSummary.value });
}
function fillForm(d) {
  el.fTitle.value = d.title || "";
  el.fTheme.value = d.theme || "";
  el.fAuthor.value = d.author || "";
  if (AUDIENCES[d.audience]) setRadio("audience", d.audience);
  if (LEVELS[d.level]) setRadio("level", d.level);
  el.fSummary.value = d.summary || "";
  updateCount();
}

function importFile(file) {
  if (!file) return;
  if (file.size > 500_000) { toast("Fichier trop volumineux (500 Ko maximum)."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    el.fSummary.value = String(reader.result || "");
    setExample(false); updateCount(); persist();
    toast("Fichier importé : " + file.name);
    el.fSummary.focus();
  };
  reader.onerror = () => toast("Impossible de lire ce fichier.");
  reader.readAsText(file);
}

function initForm() {
  const draft = loadDraft();
  if (draft) { fillForm(draft); setExample(false); }
  else { fillForm(EXAMPLE); setExample(true); }

  el.form.addEventListener("input", () => { setExample(false); updateCount(); persist(); hideMsg(el.inputMsg); });
  el.form.addEventListener("change", persist);
  el.form.addEventListener("submit", (e) => { e.preventDefault(); generate(); });
  el.fSummary.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
  });
  el.clearBtn.addEventListener("click", () => {
    el.fTitle.value = ""; el.fTheme.value = ""; el.fSummary.value = "";
    setExample(false); updateCount(); persist(); el.fSummary.focus();
  });
  el.exampleBtn.addEventListener("click", () => {
    el.fTheme.value = EXAMPLE.theme; el.fSummary.value = EXAMPLE.summary;
    setExample(true); updateCount(); persist();
  });
  el.fileInput.addEventListener("change", () => { importFile(el.fileInput.files[0]); el.fileInput.value = ""; });

  // Glisser-déposer un fichier texte sur l'éditeur
  let depth = 0;
  const zone = el.dropZone;
  zone.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { depth++; zone.classList.add("dragging"); } });
  zone.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; zone.classList.remove("dragging"); } });
  zone.addEventListener("dragover", (e) => e.preventDefault());
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); depth = 0; zone.classList.remove("dragging");
    importFile(e.dataTransfer?.files[0]);
  });
}

/* ---------- Écran 2 : progression ---------- */
function renderSteps() {
  const { steps } = state;
  el.stepsList.replaceChildren(...steps.map((s) => {
    const li = document.createElement("li");
    li.className = s.state;
    const dot = document.createElement("span"); dot.className = "dot"; dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span"); label.textContent = s.label;
    const count = document.createElement("span"); count.className = "count";
    count.textContent = s.words ? plural(s.words, "mot") : "";
    li.append(dot, label, count);
    return li;
  }));
  // Progression : une étape en cours compte pour moitié.
  const score = steps.reduce((a, s) => a + (s.state === "done" ? 1 : s.state === "active" ? 0.5 : 0), 0);
  const pct = Math.min(100, Math.round((score / Math.max(1, steps.length)) * 100));
  el.barFill.style.width = pct + "%";
  el.pct.textContent = pct + " %";
  el.busyWords.textContent = steps.reduce((a, s) => a + (s.words || 0), 0).toLocaleString("fr-FR");
}
function setStep(i, patch) { if (state.steps[i]) { Object.assign(state.steps[i], patch); renderSteps(); } }

function setBusyMode(mode) { // "running" | "error"
  el.cancelBtn.classList.toggle("hidden", mode !== "running");
  el.retryBtn.classList.toggle("hidden", mode !== "error");
  el.backBtn.classList.toggle("hidden", mode !== "error");
}
function startTimer() {
  state.startedAt = Date.now();
  el.elapsed.textContent = "0:00";
  clearInterval(state.timer);
  state.timer = setInterval(() => { el.elapsed.textContent = fmtTime(Date.now() - state.startedAt); }, 1000);
}
function stopTimer() { clearInterval(state.timer); state.timer = null; }

/* ---------- Génération ---------- */
function collectMeta() {
  const now = new Date();
  const level = radio("level") || "approfondi";
  const audience = radio("audience") || "direction";
  return {
    title: el.fTitle.value.trim(), theme: el.fTheme.value.trim(), author: el.fAuthor.value.trim(),
    audience, audienceLabel: AUDIENCES[audience].label,
    level, levelLabel: LEVELS[level].label,
    summary: el.fSummary.value.trim(),
    date: now,
    dateLabel: now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  };
}

function errorMessage(e) {
  switch (e?.code) {
    case "rate_limited": return "Trop de demandes en peu de temps. Patientez une minute puis relancez.";
    case "parse":
    case "truncated": return "Claude a renvoyé une réponse incomplète pour une étape. Relancez la génération.";
    case "server": case "api_error": case "invalid": case "no_key": case "network": return e.message;
    default: return "La génération a échoué (" + (e?.message || "erreur inconnue") + "). Relancez la génération.";
  }
}

async function generate() {
  hideMsg(el.inputMsg);
  const m = collectMeta();
  if (countWords(m.summary) < MIN_SUMMARY_WORDS) {
    showMsg(el.inputMsg, `Vos notes sont trop courtes : écrivez au moins ${MIN_SUMMARY_WORDS} mots pour que le rapport ait de la matière.`);
    showView("compose");
    el.fSummary.focus();
    return;
  }
  if (!state.serverReady) { showMsg(el.inputMsg, "Le serveur n'est pas prêt : vérifiez qu'il tourne et que ANTHROPIC_API_KEY est renseignée dans .env."); showView("compose"); return; }
  if (!window.jspdf?.jsPDF) { showMsg(el.inputMsg, "La bibliothèque PDF ne s'est pas chargée. Rechargez la page."); showView("compose"); return; }

  state.controller = new AbortController();
  const n = LEVELS[m.level].sections;
  state.steps = [{ label: "Analyse des notes et plan du rapport", state: "active" }];
  for (let i = 0; i < n; i++) state.steps.push({ label: "Partie " + (i + 1), state: "" });
  state.steps.push({ label: "Mise en page du PDF et enregistrement", state: "" });
  el.busyTitle.textContent = m.title || "Analyse de vos notes…";
  hideMsg(el.outputMsg);
  setBusyMode("running");
  renderSteps();
  showView("busy");
  startTimer();

  try {
    const report = await generateReport(m, {
      signal: state.controller.signal,
      onPlanWords: (w) => setStep(0, { words: w }),
      onPlan: (plan) => {
        el.busyTitle.textContent = plan.titre || "Rédaction du rapport";
        setStep(0, { state: "done", label: "Plan du rapport" });
        state.steps.splice(1 + plan.sections.length, n - plan.sections.length); // plan plus court que prévu
        plan.sections.forEach((s, i) => { state.steps[i + 1].label = s.titre; });
        renderSteps();
      },
      onSectionStart: (i) => setStep(i + 1, { state: "active" }),
      onSectionWords: (i, w) => { if (state.steps[i + 1]?.state === "active") setStep(i + 1, { words: w }); },
      onSectionDone: (i) => setStep(i + 1, { state: "done" })
    });
    const last = state.steps.length - 1;
    setStep(last, { state: "active" });
    await new Promise((r) => setTimeout(r, 30)); // laisse l'interface se rafraîchir
    const result = openResult(report, m, null, { show: false });
    let saved = null;
    try {
      saved = await saveReport(report, m, result.stats);
      state.current.entryId = saved.id;
    } catch { /* l'enregistrement a échoué : le rapport reste téléchargeable */ }
    setStep(last, { state: "done" });
    stopTimer();
    showView("result");
    toast(saved ? "Rapport prêt et enregistré dans l'historique." : "Rapport prêt, mais l'enregistrement dans l'historique a échoué.");
    refreshHistory();
  } catch (e) {
    stopTimer();
    if (e?.code === "aborted") {
      showView(state.current ? "result" : "compose");
      toast("Génération annulée.");
      return;
    }
    state.controller?.abort(); // stoppe les parties encore en cours de rédaction
    state.steps.forEach((s) => { if (s.state === "active") s.state = "fail"; });
    renderSteps();
    el.busyTitle.textContent = "La génération s'est interrompue";
    showMsg(el.outputMsg, errorMessage(e));
    setBusyMode("error");
  } finally {
    state.controller = null;
  }
}

/* ---------- Écran 3 : résultat ---------- */
function slug(s) {
  return String(s || "rapport").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "rapport";
}

function makePdf(report, m) {
  const doc = buildReportPdf(report, m, window.jspdf.jsPDF);
  const blob = doc.output("blob");
  const filename = "rapport-veille-" + slug(report.titre_court || report.titre) + "-" + m.date.toLocaleDateString("sv-SE") + ".pdf";
  return { doc, blob, filename };
}

function openResult(report, m, entryId, { show = true } = {}) {
  const { doc, blob, filename } = makePdf(report, m);
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.pdfUrl = URL.createObjectURL(blob);
  state.current = { entryId, filename, report, meta: m, fromHistory: Boolean(entryId) };

  const words = reportWords(report, countWords);
  const pages = doc.getNumberOfPages();
  el.resTitle.textContent = report.titre || "Rapport de veille";
  el.resMeta.textContent = [m.dateLabel, m.levelLabel, m.audienceLabel, Math.max(1, Math.round(blob.size / 1024)) + " Ko"].filter(Boolean).join(" · ");
  el.stPages.textContent = pages;
  el.stWords.textContent = words.toLocaleString("fr-FR");
  el.stRatio.textContent = "×" + Math.max(1, Math.round(words / Math.max(1, countWords(m.summary))));
  el.resEyebrow.textContent = entryId ? "Rapport de l'historique" : "Étape 3 sur 3 · Rapport prêt";
  el.previewDoc.innerHTML = renderPreview(report, m);
  buildToc();
  selectTab("read");
  el.pdfFrame.removeAttribute("src");
  if (show) showView("result");
  el.tabRead.scrollTop = 0;
  trackToc();
  return { stats: { words, pages } };
}

function buildToc() {
  const heads = [...el.previewDoc.querySelectorAll("h4[id]")];
  el.tocList.replaceChildren(...heads.map((h) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#" + h.id;
    const n = document.createElement("span"); n.className = "n"; n.textContent = h.dataset.num;
    const t = document.createElement("span"); t.textContent = h.textContent.replace(h.dataset.num, "").trim();
    a.append(n, t);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      selectTab("read");
      el.tabRead.scrollTo({ top: h.offsetTop - 16 });
    });
    li.append(a);
    return li;
  }));
}

// Met en évidence la partie visible dans le sommaire latéral.
function trackToc() {
  const heads = [...el.previewDoc.querySelectorAll("h4[id]")];
  const top = el.tabRead.scrollTop + 40;
  let current = heads[0]?.id;
  for (const h of heads) if (h.offsetTop <= top) current = h.id;
  el.tocList.querySelectorAll("a").forEach((a) => a.classList.toggle("current", a.getAttribute("href") === "#" + current));
}

function selectTab(name) {
  const pdf = name === "pdf";
  el.tabReadBtn.setAttribute("aria-selected", String(!pdf));
  el.tabPdfBtn.setAttribute("aria-selected", String(pdf));
  el.tabRead.classList.toggle("hidden", pdf);
  el.tabPdf.classList.toggle("hidden", !pdf);
  if (pdf && state.pdfUrl && el.pdfFrame.getAttribute("src") !== state.pdfUrl) el.pdfFrame.src = state.pdfUrl;
}

function downloadBlob(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Téléchargé : " + filename);
}

/* ---------- Historique ---------- */
async function refreshHistory() {
  try {
    state.history = await listReports();
    hideMsg(el.historyMsg);
  } catch {
    showMsg(el.historyMsg, "Impossible de charger l'historique : le serveur ne répond pas.");
  }
  el.historyCount.textContent = state.history.length || "";
  renderHistory();
}

function filteredHistory() {
  const q = norm(el.historySearch.value.trim());
  const level = el.historyLevel.value, audience = el.historyAudience.value, sort = el.historySort.value;
  const items = state.history.filter((h) =>
    (!q || norm(h.title + " " + h.theme + " " + h.author).includes(q)) &&
    (!level || h.level === level) &&
    (!audience || h.audience === audience));
  if (sort === "old") items.reverse();
  if (sort === "title") items.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  return items;
}

const ICONS = {
  open: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 13h10"/></svg>',
  delete: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>'
};

function iconButton(kind, label, onClick, extraClass = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn " + extraClass;
  b.innerHTML = ICONS[kind];
  b.title = label;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

function renderHistory() {
  const items = filteredHistory();
  const total = state.history.length;
  el.historySummary.textContent = total
    ? `${plural(total, "rapport")} conservé${total > 1 ? "s" : ""} sur le serveur. Rouvrez-les ou retéléchargez le PDF sans nouvelle génération.`
    : "Tous les rapports générés sont conservés ici, sur le serveur.";
  const filtering = el.historySearch.value || el.historyLevel.value || el.historyAudience.value;
  el.historyEmpty.classList.toggle("hidden", items.length > 0);
  el.historyEmptyText.textContent = total && filtering ? "Aucun rapport ne correspond à ces filtres." : "Aucun rapport pour l'instant. Ceux que vous générez apparaîtront ici.";
  el.historyNewBtn.classList.toggle("hidden", Boolean(total && filtering));
  el.historyRows.closest("table").classList.toggle("hidden", items.length === 0);

  el.historyRows.replaceChildren(...items.map((h) => {
    const tr = document.createElement("tr");

    const tdTitle = document.createElement("td"); tdTitle.className = "c-title";
    const open = document.createElement("button"); open.type = "button"; open.className = "h-title";
    const t = document.createElement("strong"); t.textContent = h.title;
    const sub = document.createElement("span");
    sub.textContent = [h.theme, h.author && "par " + h.author, plural(h.sections, "partie")].filter(Boolean).join(" · ");
    open.append(t, sub);
    open.addEventListener("click", () => openFromHistory(h.id));
    tdTitle.append(open);

    const tdDate = document.createElement("td"); tdDate.className = "h-date c-date"; tdDate.textContent = fmtDate(h.createdAt);
    const tdLevel = document.createElement("td"); tdLevel.className = "c-level";
    const tag = document.createElement("span"); tag.className = "tag " + h.level; tag.textContent = LEVELS[h.level]?.label || h.level;
    tdLevel.append(tag);
    const tdAud = document.createElement("td"); tdAud.className = "c-aud"; tdAud.textContent = AUDIENCES[h.audience]?.label || "";
    const tdWords = document.createElement("td"); tdWords.className = "num c-words"; tdWords.textContent = h.words ? h.words.toLocaleString("fr-FR") : "–";

    const tdAct = document.createElement("td"); tdAct.className = "c-actions";
    const actions = document.createElement("div"); actions.className = "h-actions";
    const del = iconButton("delete", "Supprimer « " + h.title + " »", () => confirmDelete(del, h), "danger");
    actions.append(
      iconButton("open", "Ouvrir « " + h.title + " »", () => openFromHistory(h.id)),
      iconButton("download", "Télécharger le PDF de « " + h.title + " »", () => downloadFromHistory(h.id)),
      del
    );
    tdAct.append(actions);

    tr.append(tdTitle, tdDate, tdLevel, tdAud, tdWords, tdAct);
    return tr;
  }));
}

// Suppression en deux clics : le bouton devient « Confirmer » pendant 3 secondes.
function confirmDelete(btn, h) {
  if (!btn.classList.contains("confirm")) {
    btn.classList.add("confirm");
    btn.textContent = "Confirmer";
    setTimeout(() => { if (btn.isConnected && btn.classList.contains("confirm")) { btn.classList.remove("confirm"); btn.innerHTML = ICONS.delete; } }, 3000);
    return;
  }
  removeReport(h.id)
    .then(() => {
      if (state.current?.entryId === h.id) state.current.entryId = null;
      toast("Rapport supprimé de l'historique.");
      refreshHistory();
    })
    .catch(() => toast("La suppression a échoué."));
}

async function loadEntry(id) {
  if (!window.jspdf?.jsPDF) { toast("La bibliothèque PDF ne s'est pas chargée. Rechargez la page."); return null; }
  try { return await getReport(id); }
  catch { toast("Ce rapport est introuvable."); refreshHistory(); return null; }
}

async function openFromHistory(id) {
  if (state.controller) { toast("Une génération est en cours."); return; }
  const entry = await loadEntry(id);
  if (entry) openResult(entry.report, metaFromEntry(entry), entry.id);
}

async function downloadFromHistory(id) {
  const entry = await loadEntry(id);
  if (!entry) return;
  const { blob, filename } = makePdf(entry.report, metaFromEntry(entry));
  const url = URL.createObjectURL(blob);
  downloadBlob(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function goHistory() {
  showView("history");
  refreshHistory();
}

/* ---------- Démarrage ---------- */
async function checkServer() {
  try {
    const st = await getStatus();
    state.serverReady = Boolean(st.ready);
    el.modelInfo.textContent = st.mock ? "Mode démo" : st.ready ? st.model : "Clé API manquante";
    el.modelInfo.title = st.mock ? "Mode démo : texte fictif, aucune clé utilisée" : "";
    el.modelInfo.classList.toggle("ok", st.ready);
    el.modelInfo.classList.toggle("warn", !st.ready);
    if (!st.ready) showMsg(el.inputMsg, "Aucune clé API configurée : ajoutez ANTHROPIC_API_KEY dans le fichier .env, puis relancez le serveur.");
  } catch {
    el.modelInfo.textContent = "Serveur injoignable";
    el.modelInfo.classList.add("warn");
    showMsg(el.inputMsg, "Le serveur local ne répond pas. Lancez « npm start » ou « docker compose up -d », puis rechargez la page.");
  }
}

function backToCompose() {
  showView("compose");
  el.fSummary.focus();
}

initForm();

el.navNew.addEventListener("click", () => {
  if (state.controller) { showView("busy"); return; }
  backToCompose();
});
el.navHistory.addEventListener("click", goHistory);
el.brandLink.addEventListener("click", (e) => { e.preventDefault(); el.navNew.click(); });
el.historyNewBtn.addEventListener("click", backToCompose);
["input", "change"].forEach((ev) => [el.historySearch, el.historyLevel, el.historyAudience, el.historySort].forEach((n) => n.addEventListener(ev, renderHistory)));
el.cancelBtn.addEventListener("click", () => state.controller?.abort());
el.retryBtn.addEventListener("click", generate);
el.backBtn.addEventListener("click", backToCompose);
el.dlBtn.addEventListener("click", () => { if (state.pdfUrl) downloadBlob(state.pdfUrl, state.current.filename); });
el.openBtn.addEventListener("click", () => { if (state.pdfUrl) window.open(state.pdfUrl, "_blank", "noopener"); });
el.regenBtn.addEventListener("click", () => {
  if (state.current) { fillForm(state.current.meta); persist(); }
  generate();
});
el.editBtn.addEventListener("click", () => {
  if (state.current) { fillForm(state.current.meta); setExample(false); persist(); }
  backToCompose();
});
el.tabReadBtn.addEventListener("click", () => selectTab("read"));
el.tabPdfBtn.addEventListener("click", () => selectTab("pdf"));
el.tabRead.addEventListener("scroll", trackToc, { passive: true });
window.addEventListener("beforeunload", (e) => { if (state.controller) { e.preventDefault(); e.returnValue = ""; } });

showView("compose", { focus: false });
checkServer();
migrateLocalHistory()
  .then((moved) => { if (moved) toast(plural(moved, "rapport") + " de ce navigateur ajouté" + (moved > 1 ? "s" : "") + " à l'historique."); })
  .finally(refreshHistory);
