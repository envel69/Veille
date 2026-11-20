<script setup>
// Coque de l'application : connexion, en-tête, écrans et notifications.
import { computed, nextTick, onMounted, watch } from "vue";
import { state, checkSession, initForm, jobRunning, showView, goHistory, signOut, setTabTitle } from "./store.js";
import Icon from "./components/Icon.vue";
import LoginView from "./components/LoginView.vue";
import ComposeView from "./components/ComposeView.vue";
import BusyView from "./components/BusyView.vue";
import ResultView from "./components/ResultView.vue";
import HistoryView from "./components/HistoryView.vue";

const FOCUS = { compose: "hCompose", busy: "busyTitle", result: "resTitle", history: "hHistory" };

// Onglet actif de l'en-tête : « Historique » pour l'historique et les rapports rouverts depuis celui-ci.
const inHistory = computed(() => state.view === "history" || (state.view === "result" && state.current?.fromHistory));

watch(() => state.focusTick, async () => {
  await nextTick();
  document.getElementById(FOCUS[state.view])?.focus({ preventScroll: true });
});

function goNew() {
  if (jobRunning()) showView("busy");
  else showView("compose");
}

initForm();
onMounted(() => {
  checkSession();
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !jobRunning()) setTabTitle(""); });
});
</script>

<template>
  <template v-if="state.auth.checked && state.auth.required && !state.auth.authenticated">
    <LoginView />
  </template>

  <div v-else-if="state.auth.checked" class="app">
    <header class="topbar">
      <div class="topbar-in">
        <a class="brand" href="#" @click.prevent="goNew">
          <span class="logo" aria-hidden="true"><Icon name="logo" /></span>
          <span>Atelier de veille</span>
        </a>
        <nav class="nav" aria-label="Navigation principale">
          <button class="nav-link" type="button" :aria-current="inHistory ? null : 'page'" @click="goNew">
            <Icon name="plus" /> Nouveau rapport
          </button>
          <button class="nav-link" type="button" :aria-current="inHistory ? 'page' : null" @click="goHistory">
            <Icon name="clock" /> Historique <span class="count-badge">{{ state.history.length || "" }}</span>
          </button>
        </nav>
        <span class="pill" :class="state.server.tone" :title="state.server.title">{{ state.server.label }}</span>
        <button v-if="state.auth.required" class="icon-btn" type="button" title="Se déconnecter" aria-label="Se déconnecter" @click="signOut">
          <Icon name="logout" />
        </button>
      </div>
    </header>

    <main class="main">
      <ComposeView v-show="state.view === 'compose'" />
      <BusyView v-if="state.view === 'busy'" />
      <ResultView v-show="state.view === 'result'" />
      <HistoryView v-show="state.view === 'history'" />
    </main>
  </div>

  <div v-if="state.toast" class="toast" role="status" aria-live="polite">{{ state.toast }}</div>
</template>
