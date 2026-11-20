<script setup>
// Écran 1 : rédaction des notes et réglages du rapport.
import { computed, ref } from "vue";
import { MIN_SUMMARY_WORDS, countWords } from "@shared/options.js";
import { state, generate, setExample, toast, plural } from "../store.js";
import Icon from "./Icon.vue";

const f = state.form;
const summaryEl = ref(null);
const dragging = ref(false);
let depth = 0;

const words = computed(() => countWords(f.summary));
const wordLabel = computed(() => (words.value < MIN_SUMMARY_WORDS ? `${plural(words.value, "mot")} · ${MIN_SUMMARY_WORDS} minimum` : plural(words.value, "mot")));

const AUDIENCE_OPTIONS = [
  { value: "direction", label: "Direction", hint: "Enjeux, décisions, impacts" },
  { value: "technique", label: "Équipe technique", hint: "Mécanismes et détails" },
  { value: "general", label: "Tous publics", hint: "Pédagogique, avec définitions" }
];
const LEVEL_OPTIONS = [
  { value: "standard", label: "Standard", hint: "5 parties" },
  { value: "approfondi", label: "Approfondi", hint: "7 parties" },
  { value: "complet", label: "Complet", hint: "9 parties" }
];

function onInput() { state.example = false; state.inputMsg = ""; }

function clearAll() {
  Object.assign(f, { title: "", theme: "", summary: "" });
  state.example = false;
  summaryEl.value?.focus();
}

function importFile(file) {
  if (!file) return;
  if (file.size > 500_000) { toast("Fichier trop volumineux (500 Ko maximum)."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    f.summary = String(reader.result || "");
    state.example = false;
    toast("Fichier importé : " + file.name);
    summaryEl.value?.focus();
  };
  reader.onerror = () => toast("Impossible de lire ce fichier.");
  reader.readAsText(file);
}

function onFile(e) { importFile(e.target.files[0]); e.target.value = ""; }

// Glisser-déposer un fichier texte sur l'éditeur
function onDragEnter(e) { if (e.dataTransfer?.types.includes("Files")) { depth++; dragging.value = true; } }
function onDragLeave() { if (--depth <= 0) { depth = 0; dragging.value = false; } }
function onDrop(e) { depth = 0; dragging.value = false; importFile(e.dataTransfer?.files[0]); }
</script>

<template>
  <section class="view" aria-labelledby="hCompose">
    <header class="view-head">
      <p class="eyebrow">Étape 1 sur 3</p>
      <h1 id="hCompose" tabindex="-1">Nouveau rapport de veille</h1>
      <p class="lede">Collez vos notes, réglez le public et le niveau de détail. Claude rédige un rapport complet avec sommaire cliquable, prêt en PDF.</p>
    </header>

    <form class="compose" novalidate @submit.prevent="generate" @input="onInput">
      <div class="card editor" :class="{ dragging }" @dragenter="onDragEnter" @dragleave="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <div class="editor-bar">
          <label for="fSummary" class="editor-title">Vos notes</label>
          <span v-if="state.example" class="chip chip-warn">Exemple</span>
          <div class="editor-tools">
            <label class="btn btn-ghost btn-small" for="fileInput"><Icon name="upload" :size="14" /> Importer</label>
            <input id="fileInput" type="file" accept=".txt,.md,text/plain,text/markdown" class="visually-hidden" @change="onFile">
            <button class="btn btn-ghost btn-small" type="button" @click="setExample">Exemple</button>
            <button class="btn btn-ghost btn-small" type="button" @click="clearAll">Vider</button>
          </div>
        </div>
        <textarea id="fSummary" ref="summaryEl" v-model="f.summary" maxlength="20000"
          placeholder="Faits marquants, annonces, chiffres, sources, impressions… Points en vrac ou paragraphes : tout fonctionne."
          @keydown.enter.ctrl.prevent="generate" @keydown.enter.meta.prevent="generate"></textarea>
        <div class="editor-foot">
          <span class="word-count" :class="{ ok: words >= MIN_SUMMARY_WORDS }">{{ wordLabel }}</span>
          <span class="hint">Glissez un fichier .txt ou .md ici</span>
        </div>
        <div class="drop-overlay" aria-hidden="true">Déposez le fichier pour l'importer</div>
      </div>

      <div class="card settings">
        <fieldset class="group">
          <legend>Pour qui ?</legend>
          <div class="options">
            <label v-for="o in AUDIENCE_OPTIONS" :key="o.value" class="option">
              <input v-model="f.audience" type="radio" name="audience" :value="o.value">
              <span class="option-body"><strong>{{ o.label }}</strong><span>{{ o.hint }}</span></span>
            </label>
          </div>
        </fieldset>

        <fieldset class="group">
          <legend>Niveau de détail</legend>
          <div class="options options-row">
            <label v-for="o in LEVEL_OPTIONS" :key="o.value" class="option">
              <input v-model="f.level" type="radio" name="level" :value="o.value">
              <span class="option-body"><strong>{{ o.label }}</strong><span>{{ o.hint }}</span></span>
            </label>
          </div>
        </fieldset>

        <details class="more">
          <summary>Titre, thème et auteurs <span class="hint">facultatif</span></summary>
          <div class="more-body">
            <label class="field"><span>Titre du rapport</span><input v-model="f.title" type="text" maxlength="300" placeholder="Sinon proposé par Claude"></label>
            <label class="field"><span>Thème</span><input v-model="f.theme" type="text" maxlength="300" placeholder="Ex. : énergie, concurrence"></label>
            <label class="field"><span>Auteur(s)</span><input v-model="f.author" type="text" maxlength="300" placeholder="Ex. : Jeje, Max, Vel"></label>
          </div>
        </details>

        <div class="submit">
          <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="state.starting">Générer le rapport</button>
          <p class="hint center"><kbd>Ctrl</kbd> + <kbd>Entrée</kbd> · 2 à 5 minutes, même onglet fermé</p>
        </div>
        <div v-if="state.inputMsg" class="notice error" role="alert">{{ state.inputMsg }}</div>
      </div>
    </form>
  </section>
</template>
