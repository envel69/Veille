// Générations côté serveur : un « job » par rapport.
// - continue même si l'onglet est fermé ; le rapport terminé est enregistré dans l'historique
// - l'avancement est diffusé aux pages abonnées (SSE)
// - en cas d'échec, « reprendre » garde le plan et les parties terminées
// - cache : la 1re partie part seule ; les suivantes démarrent dès qu'elle commence à répondre,
//   moment où le préfixe commun (consignes + notes + plan) devient lisible dans le cache
import crypto from "node:crypto";
import { LEVELS, AUDIENCES, countWords } from "../shared/options.js";
import { reportWords } from "../shared/report-stats.js";
import { planRequest, sectionRequest, validatePlan } from "./prompts.js";
import { GenerationError } from "./services/claude.js";

const SECTION_CONCURRENCY = 3;
const MAX_RUNNING = 3;          // générations simultanées au maximum
const KEEP_FINISHED_MS = 60 * 60 * 1000; // un job terminé reste consultable une heure
const PARSE_RETRIES = 1;        // une relance si la réponse n'est pas du JSON valide

export class JobsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function emptyUsage() { return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }; }
function addUsage(total, u) {
  if (!u) return;
  total.input += u.input_tokens || 0;
  total.cacheRead += u.cache_read_input_tokens || 0;
  total.cacheWrite += u.cache_creation_input_tokens || 0;
  total.output += u.output_tokens || 0;
}

export function createJobManager({ claude, store }) {
  const jobs = new Map();

  /* ---------- Vue publique d'un job (ce que reçoit le navigateur) ---------- */
  function snapshot(job) {
    return {
      id: job.id,
      status: job.status, // running | done | error | canceled
      title: job.plan?.titre || job.meta.title || "",
      level: job.meta.level,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      steps: job.steps.map(({ label, state, words }) => ({ label, state, words })),
      usage: job.usage,
      reportId: job.reportId,
      error: job.error,
      resumable: job.status === "error" || job.status === "canceled"
    };
  }

  function emit(job) {
    const snap = snapshot(job);
    for (const fn of job.listeners) fn(snap);
  }
  // Limite les envois pendant le streaming (au plus ~5 par seconde).
  function emitSoon(job) {
    if (job.emitTimer) return;
    job.emitTimer = setTimeout(() => { job.emitTimer = null; emit(job); }, 200);
  }

  function setStep(job, i, patch, now = false) {
    Object.assign(job.steps[i], patch);
    now ? emit(job) : emitSoon(job);
  }

  /** Appel à Claude avec une relance si la réponse est illisible ou tronquée. */
  async function ask(job, req, stepIndex, onFirstText) {
    for (let attempt = 0; ; attempt++) {
      let started = false;
      try {
        const { data, usage } = await claude.generateJson(req, {
          signal: job.controller.signal,
          onText: (text) => {
            if (!started) { started = true; onFirstText?.(); }
            setStep(job, stepIndex, { words: countWords(text) });
          }
        });
        addUsage(job.usage, usage);
        return data;
      } catch (e) {
        if (job.controller.signal.aborted) throw new GenerationError("aborted", "Annulé");
        if ((e.code === "parse" || e.code === "truncated") && attempt < PARSE_RETRIES) continue;
        throw e;
      }
    }
  }

  /* ---------- Déroulé d'une génération (reprend là où elle s'était arrêtée) ---------- */
  async function run(job) {
    job.status = "running";
    job.error = null;
    job.finishedAt = null;
    job.controller = new AbortController();
    emit(job);

    try {
      // 1. Plan (sauf s'il a déjà été obtenu lors d'une tentative précédente)
      if (!job.plan) {
        setStep(job, 0, { state: "active", words: 0 }, true);
        const raw = await ask(job, planRequest(job.meta), 0);
        if (!Array.isArray(raw.sections) || !raw.sections.length) throw new GenerationError("parse", "Plan vide");
        if (job.meta.title) raw.titre = job.meta.title;
        raw.sections = raw.sections.slice(0, LEVELS[job.meta.level].sections);
        job.plan = raw;
        job.outline = validatePlan(raw, 0);
        // Étapes définitives : plan, une par partie, mise en forme
        job.steps = [
          { label: "Plan du rapport", state: "done", words: job.steps[0].words },
          ...raw.sections.map((s) => ({ label: s.titre || "Partie", state: "", words: 0 })),
          { label: "Enregistrement dans l'historique", state: "", words: 0 }
        ];
        job.sections = new Array(raw.sections.length).fill(null);
        emit(job);
      }

      // 2. Parties manquantes, en parallèle, la première seule le temps d'écrire le cache
      const todo = job.sections.map((s, i) => (s ? null : i)).filter((i) => i !== null);
      todo.forEach((i) => setStep(job, i + 1, { state: "", words: 0 }));
      await runSections(job, todo);

      // 3. Assemblage et enregistrement
      const last = job.steps.length - 1;
      setStep(job, last, { state: "active" }, true);
      const report = { ...job.plan, sections: job.sections.map((body, i) => ({ titre: job.plan.sections[i].titre, ...body })) };
      const saved = await store.add({
        report,
        meta: {
          ...job.meta,
          levelLabel: LEVELS[job.meta.level].label,
          audienceLabel: AUDIENCES[job.meta.audience].label,
          dateISO: job.createdAt
        },
        stats: { words: reportWords(report), pages: 0 }
      });
      job.reportId = saved.id;
      setStep(job, last, { state: "done" });
      job.status = "done";
    } catch (e) {
      job.steps.forEach((s) => {
        if (s.state === "active") s.state = e.code === "aborted" ? "" : "fail";
        if (s.state !== "done") s.words = 0; // texte partiel abandonné : il sera réécrit à la reprise
      });
      job.status = e.code === "aborted" ? "canceled" : "error";
      job.error = e.code === "aborted" ? null : { code: e.code || "server", message: e.message || "Erreur inconnue" };
    } finally {
      job.finishedAt = new Date().toISOString();
      job.controller = null;
      clearTimeout(job.emitTimer);
      job.emitTimer = null;
      emit(job);
      scheduleCleanup(job);
    }
  }

  async function runSections(job, todo) {
    if (!todo.length) return;
    const queue = [...todo];
    let failure = null;
    let releaseWarm;
    const warm = new Promise((r) => { releaseWarm = r; });

    async function worker(isFirst) {
      if (!isFirst) await warm; // attend que la 1re réponse ait commencé (cache lisible)
      while (!failure && queue.length) {
        const i = queue.shift();
        setStep(job, i + 1, { state: "active", words: 0 }, true);
        try {
          job.sections[i] = await ask(job, sectionRequest(job.meta, job.outline, i), i + 1, releaseWarm);
          setStep(job, i + 1, { state: "done" }, true);
        } catch (e) {
          failure = failure || e;
          releaseWarm(); // débloque les autres pour qu'ils s'arrêtent proprement
          if (e.code !== "aborted") setStep(job, i + 1, { state: "fail" }, true);
          job.controller?.abort(); // stoppe les parties encore en cours
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(SECTION_CONCURRENCY, todo.length) }, (_, k) => worker(k === 0)));
    if (failure) throw failure;
  }

  function scheduleCleanup(job) {
    clearTimeout(job.cleanupTimer);
    job.cleanupTimer = setTimeout(() => { if (job.status !== "running") jobs.delete(job.id); }, KEEP_FINISHED_MS);
    job.cleanupTimer.unref?.();
  }

  function get(id) {
    const job = jobs.get(id);
    if (!job) throw new JobsError(404, "Génération introuvable (terminée depuis plus d'une heure ou serveur redémarré).");
    return job;
  }

  return {
    /** Démarre une génération à partir de métadonnées déjà validées. */
    start(meta) {
      const running = [...jobs.values()].filter((j) => j.status === "running").length;
      if (running >= MAX_RUNNING) throw new JobsError(429, `Déjà ${running} générations en cours : attendez qu'une se termine.`);
      const job = {
        id: Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
        meta,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        steps: [{ label: "Analyse des notes et plan du rapport", state: "", words: 0 }],
        plan: null, outline: null, sections: null,
        usage: emptyUsage(),
        listeners: new Set(),
        status: "running"
      };
      jobs.set(job.id, job);
      run(job);
      return snapshot(job);
    },

    list() {
      return [...jobs.values()].map(snapshot).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    get(id) { return snapshot(get(id)); },

    cancel(id) {
      const job = get(id);
      if (job.status !== "running") throw new JobsError(409, "Cette génération n'est pas en cours.");
      job.controller?.abort();
      return snapshot(job);
    },

    /** Reprend une génération échouée ou annulée, sans refaire ce qui est terminé. */
    resume(id) {
      const job = get(id);
      if (job.status === "running") throw new JobsError(409, "Cette génération est déjà en cours.");
      if (job.status === "done") throw new JobsError(409, "Cette génération est déjà terminée.");
      job.startedAt = new Date().toISOString();
      run(job);
      return snapshot(job);
    },

    /** Abonnement à l'avancement ; renvoie la fonction de désabonnement. */
    subscribe(id, fn) {
      const job = get(id);
      job.listeners.add(fn);
      fn(snapshot(job));
      return () => job.listeners.delete(fn);
    }
  };
}
