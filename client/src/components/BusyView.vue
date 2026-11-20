<script setup>
// Écran 2 : suivi en direct d'une génération qui tourne sur le serveur.
import { computed } from "vue";
import { state, progress, plural, cancelCurrent, resumeCurrent, backToCompose } from "../store.js";

const job = computed(() => state.job);
const steps = computed(() => job.value?.steps || []);
const status = computed(() => (state.jobLost ? "error" : job.value?.status || "running"));
const running = computed(() => status.value === "running");
const pct = computed(() => progress(steps.value));
const words = computed(() => steps.value.reduce((a, s) => a + (s.words || 0), 0));

const title = computed(() =>
  status.value === "error" ? "La génération s'est interrompue"
    : status.value === "canceled" ? "Génération annulée"
    : job.value?.title || "Analyse de vos notes…");

const elapsed = computed(() => {
  const s = Math.floor(state.elapsedMs / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
});

const usage = computed(() => {
  const u = job.value?.usage;
  if (!u) return "";
  const read = u.input + u.cacheRead + u.cacheWrite;
  if (!read) return "";
  const cached = Math.round((u.cacheRead / read) * 100);
  return ` · ${read.toLocaleString("fr-FR")} jetons lus (${cached} % depuis le cache), ${u.output.toLocaleString("fr-FR")} écrits`;
});
</script>

<template>
  <section class="view" aria-labelledby="busyTitle">
    <div class="card busy">
      <p class="eyebrow">{{ running ? "Étape 2 sur 3 · Rédaction en cours" : "Étape 2 sur 3 · En pause" }}</p>
      <h1 id="busyTitle" tabindex="-1">{{ title }}</h1>
      <div class="progress">
        <div class="bar" aria-hidden="true"><i :style="{ width: pct + '%' }"></i></div>
        <span class="pct">{{ pct }} %</span>
      </div>
      <p class="busy-meta"><span>{{ elapsed }}</span> écoulées · <span>{{ words.toLocaleString("fr-FR") }}</span> mots rédigés<span>{{ usage }}</span></p>
      <ol class="steps" aria-live="polite">
        <li v-for="(s, i) in steps" :key="i" :class="s.state">
          <span class="dot" aria-hidden="true"></span>
          <span>{{ s.label }}</span>
          <span class="count">{{ s.words ? plural(s.words, "mot") : "" }}</span>
        </li>
      </ol>
      <div v-if="state.outputMsg" class="notice error" role="alert">{{ state.outputMsg }}</div>
      <div class="actions center">
        <button v-if="running" class="btn btn-ghost" type="button" @click="cancelCurrent">Annuler</button>
        <button v-if="!running && !state.jobLost" class="btn btn-primary" type="button" @click="resumeCurrent">Reprendre</button>
        <button v-if="!running" class="btn btn-ghost" type="button" @click="backToCompose">Modifier le résumé</button>
      </div>
      <p v-if="running" class="hint center">Vous pouvez fermer cet onglet : la rédaction continue sur le serveur et le rapport arrivera dans l'Historique.</p>
    </div>
  </section>
</template>
