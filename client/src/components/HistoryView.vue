<script setup>
// Historique des rapports conservés sur le serveur.
import { computed, onBeforeUnmount, ref } from "vue";
import { LEVELS, AUDIENCES } from "@shared/options.js";
import { state, plural, openFromHistory, downloadFromHistory, deleteReport, backToCompose } from "../store.js";
import Icon from "./Icon.vue";

const search = ref("");
const level = ref("");
const audience = ref("");
const sort = ref("recent");
const confirmId = ref(null); // suppression en deux clics : « Confirmer » pendant 3 secondes
let confirmTimer = null;

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const total = computed(() => state.history.length);
const filtering = computed(() => Boolean(search.value || level.value || audience.value));
const items = computed(() => {
  const q = norm(search.value.trim());
  const list = state.history.filter((h) =>
    (!q || norm(h.title + " " + h.theme + " " + h.author).includes(q)) &&
    (!level.value || h.level === level.value) &&
    (!audience.value || h.audience === audience.value));
  if (sort.value === "old") list.reverse();
  if (sort.value === "title") list.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  return list;
});
const summary = computed(() => (total.value
  ? `${plural(total.value, "rapport")} conservé${total.value > 1 ? "s" : ""} sur le serveur. Rouvrez-les ou retéléchargez le PDF sans nouvelle génération.`
  : "Tous les rapports générés sont conservés ici, sur le serveur."));
const subLine = (h) => [h.theme, h.author && "par " + h.author, plural(h.sections, "partie")].filter(Boolean).join(" · ");

function onDelete(h) {
  if (confirmId.value !== h.id) {
    confirmId.value = h.id;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => { confirmId.value = null; }, 3000);
    return;
  }
  confirmId.value = null;
  deleteReport(h);
}
onBeforeUnmount(() => clearTimeout(confirmTimer));
</script>

<template>
  <section class="view" aria-labelledby="hHistory">
    <header class="view-head history-head">
      <div>
        <p class="eyebrow">Vos rapports</p>
        <h1 id="hHistory" tabindex="-1">Historique</h1>
        <p class="lede">{{ summary }}</p>
      </div>
    </header>

    <div class="card history-card">
      <div class="history-tools">
        <label class="search">
          <Icon name="search" />
          <span class="visually-hidden">Rechercher</span>
          <input v-model="search" type="search" placeholder="Rechercher par titre, thème ou auteur">
        </label>
        <select v-model="level" aria-label="Filtrer par niveau">
          <option value="">Tous les niveaux</option>
          <option v-for="(l, k) in LEVELS" :key="k" :value="k">{{ l.label }}</option>
        </select>
        <select v-model="audience" aria-label="Filtrer par public">
          <option value="">Tous les publics</option>
          <option v-for="(a, k) in AUDIENCES" :key="k" :value="k">{{ a.label }}</option>
        </select>
        <select v-model="sort" aria-label="Trier">
          <option value="recent">Plus récents</option>
          <option value="old">Plus anciens</option>
          <option value="title">Titre (A → Z)</option>
        </select>
      </div>

      <div v-if="items.length" class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr><th scope="col">Rapport</th><th scope="col">Date</th><th scope="col">Niveau</th><th scope="col">Public</th><th scope="col" class="num">Mots</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            <tr v-for="h in items" :key="h.id">
              <td class="c-title">
                <button type="button" class="h-title" @click="openFromHistory(h.id)"><strong>{{ h.title }}</strong><span>{{ subLine(h) }}</span></button>
              </td>
              <td class="h-date c-date">{{ fmtDate(h.createdAt) }}</td>
              <td class="c-level"><span class="tag" :class="h.level">{{ LEVELS[h.level]?.label || h.level }}</span></td>
              <td class="c-aud">{{ AUDIENCES[h.audience]?.label || "" }}</td>
              <td class="num c-words">{{ h.words ? h.words.toLocaleString("fr-FR") : "–" }}</td>
              <td class="c-actions">
                <div class="h-actions">
                  <button type="button" class="icon-btn" :title="'Ouvrir « ' + h.title + ' »'" :aria-label="'Ouvrir « ' + h.title + ' »'" @click="openFromHistory(h.id)"><Icon name="open" /></button>
                  <button type="button" class="icon-btn" :title="'Télécharger le PDF de « ' + h.title + ' »'" :aria-label="'Télécharger le PDF de « ' + h.title + ' »'" @click="downloadFromHistory(h.id)"><Icon name="download" /></button>
                  <button type="button" class="icon-btn danger" :class="{ confirm: confirmId === h.id }" :title="'Supprimer « ' + h.title + ' »'" :aria-label="'Supprimer « ' + h.title + ' »'" @click="onDelete(h)">
                    <template v-if="confirmId === h.id">Confirmer</template><Icon v-else name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="history-empty">
        <div class="empty-icon" aria-hidden="true"><Icon name="clock" :size="24" /></div>
        <p>{{ total && filtering ? "Aucun rapport ne correspond à ces filtres." : "Aucun rapport pour l'instant. Ceux que vous générez apparaîtront ici." }}</p>
        <button v-if="!(total && filtering)" class="btn btn-primary" type="button" @click="backToCompose">Créer un rapport</button>
      </div>
      <div v-if="state.historyMsg" class="notice error" role="alert">{{ state.historyMsg }}</div>
    </div>
  </section>
</template>
