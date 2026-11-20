<script setup>
// Écran de connexion (affiché quand APP_PASSWORD est défini sur le serveur).
import { onMounted, ref } from "vue";
import { signIn } from "../store.js";
import Icon from "./Icon.vue";

const password = ref("");
const error = ref("");
const busy = ref(false);
const input = ref(null);

onMounted(() => input.value?.focus());

async function submit() {
  if (!password.value) return;
  busy.value = true;
  error.value = "";
  try {
    await signIn(password.value);
  } catch (e) {
    error.value = e.message || "Connexion impossible.";
    password.value = "";
    input.value?.focus();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login">
    <form class="card login-card" @submit.prevent="submit">
      <span class="logo login-logo" aria-hidden="true"><Icon name="lock" :size="18" /></span>
      <h1>Atelier de veille</h1>
      <p class="hint">Accès réservé : saisissez le mot de passe de l'atelier.</p>
      <label class="field">
        <span>Mot de passe</span>
        <input ref="input" v-model="password" type="password" autocomplete="current-password" required>
      </label>
      <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="busy || !password">Se connecter</button>
      <div v-if="error" class="notice error" role="alert">{{ error }}</div>
    </form>
  </main>
</template>
