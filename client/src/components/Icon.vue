<script setup>
// Icônes de l'interface (SVG en ligne, 16 × 16).
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 16 } });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'logo'"><path d="M4 2h5l3 3v9H4z" /><path d="M6 8h4M6 11h4" /></template>
    <path v-else-if="name === 'plus'" d="M8 3v10M3 8h10" />
    <template v-else-if="name === 'clock'"><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></template>
    <path v-else-if="name === 'upload'" d="M8 10V2M5 5l3-3 3 3M3 10v3h10v-3" />
    <path v-else-if="name === 'download'" d="M8 2v8M5 7l3 3 3-3M3 13h10" />
    <template v-else-if="name === 'open'"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></template>
    <path v-else-if="name === 'delete'" d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
    <template v-else-if="name === 'search'"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></template>
    <template v-else-if="name === 'lock'"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></template>
    <path v-else-if="name === 'logout'" d="M6 3H3v10h3M10 5l3 3-3 3M13 8H6" />
  </svg>
</template>
