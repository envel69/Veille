<script setup>
// Écran 3 : rapport prêt (aperçu lisible, PDF, sommaire latéral).
import { computed, nextTick, ref, watch } from "vue";
import { countWords } from "@shared/options.js";
import { outline } from "../lib/outline.js";
import { state, downloadUrl, editCurrent } from "../store.js";
import ReportPreview from "./ReportPreview.vue";
import Icon from "./Icon.vue";

const cur = computed(() => state.current);
const tab = ref("read");
const readEl = ref(null);
const currentPart = ref("");
const parts = computed(() => (cur.value ? outline(cur.value.report) : []));

const metaLine = computed(() => {
  const m = cur.value.meta;
  return [m.dateLabel, m.levelLabel, m.audienceLabel, cur.value.sizeKo + " Ko"].filter(Boolean).join(" · ");
});
const ratio = computed(() => "×" + Math.max(1, Math.round(cur.value.words / Math.max(1, countWords(cur.value.meta.summary)))));

// Nouveau rapport affiché : retour en haut, onglet lecture.
watch(() => cur.value?.pdfUrl, async () => {
  tab.value = "read";
  await nextTick();
  if (readEl.value) readEl.value.scrollTop = 0;
  trackToc();
});

function goTo(p) {
  tab.value = "read";
  nextTick(() => {
    const h = readEl.value?.querySelector("#" + p.id);
    if (h) readEl.value.scrollTo({ top: h.offsetTop - 16 });
  });
}

// Met en évidence la partie visible dans le sommaire latéral.
function trackToc() {
  const wrap = readEl.value;
  if (!wrap) return;
  const top = wrap.scrollTop + 40;
  let current = parts.value[0]?.id || "";
  for (const h of wrap.querySelectorAll("h4[id]")) if (h.offsetTop <= top) current = h.id;
  currentPart.value = current;
}

function download() { if (cur.value) downloadUrl(cur.value.pdfUrl, cur.value.filename); }
function openPdf() { if (cur.value) window.open(cur.value.pdfUrl, "_blank", "noopener"); }
</script>

<template>
  <section v-if="cur" class="view" aria-labelledby="resTitle">
    <header class="result-head card">
      <div class="result-info">
        <p class="eyebrow">{{ cur.fromHistory ? "Rapport de l'historique" : "Étape 3 sur 3 · Rapport prêt" }}</p>
        <h1 id="resTitle" tabindex="-1">{{ cur.report.titre || "Rapport de veille" }}</h1>
        <p class="hint">{{ metaLine }}</p>
        <div class="stats">
          <div class="stat"><b>{{ cur.pages }}</b><span>pages</span></div>
          <div class="stat"><b>{{ cur.words.toLocaleString("fr-FR") }}</b><span>mots</span></div>
          <div class="stat"><b>{{ ratio }}</b><span>vs vos notes</span></div>
        </div>
      </div>
      <div class="result-actions">
        <button class="btn btn-primary btn-lg" type="button" @click="download"><Icon name="download" /> Télécharger le PDF</button>
        <div class="actions">
          <button class="btn btn-ghost" type="button" @click="openPdf">Ouvrir</button>
          <button class="btn btn-ghost" type="button" @click="editCurrent({ regenerate: true })">Régénérer</button>
          <button class="btn btn-ghost" type="button" @click="editCurrent()">Modifier</button>
        </div>
      </div>
    </header>

    <div class="result-body">
      <nav class="card toc" aria-labelledby="tocTitle">
        <p id="tocTitle" class="toc-title">Sommaire</p>
        <ol>
          <li v-for="p in parts" :key="p.id">
            <a :href="'#' + p.id" :class="{ current: currentPart === p.id }" @click.prevent="goTo(p)">
              <span class="n">{{ p.num }}</span><span>{{ p.title }}</span>
            </a>
          </li>
        </ol>
      </nav>
      <div class="card viewer">
        <div class="tabs" role="tablist" aria-label="Mode d'affichage">
          <button role="tab" :aria-selected="String(tab === 'read')" aria-controls="tabRead" type="button" @click="tab = 'read'">Lecture</button>
          <button role="tab" :aria-selected="String(tab === 'pdf')" aria-controls="tabPdf" type="button" @click="tab = 'pdf'">PDF</button>
        </div>
        <div v-show="tab === 'read'" id="tabRead" ref="readEl" role="tabpanel" class="doc-wrap" @scroll.passive="trackToc">
          <ReportPreview :report="cur.report" :meta="cur.meta" />
        </div>
        <div v-if="tab === 'pdf'" id="tabPdf" role="tabpanel" class="pdf-wrap">
          <iframe :src="cur.pdfUrl" title="Aperçu du PDF"></iframe>
        </div>
      </div>
    </div>
    <p class="foot">Rédigé par Claude à partir de vos notes et de connaissances générales, sans recherche web. Relisez la section « Points à vérifier » avant diffusion.</p>
  </section>
</template>
