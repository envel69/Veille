<script setup>
// Aperçu du rapport (mode lecture). Le texte est inséré par Vue, donc toujours échappé :
// aucun HTML venant du rapport n'est interprété.
import { computed } from "vue";
import { outline, has } from "../lib/outline.js";

const props = defineProps({ report: { type: Object, required: true }, meta: { type: Object, required: true } });
const R = computed(() => props.report);
const parts = computed(() => outline(props.report));
const prio = (p) => String(p || "").toLowerCase().replace(/[^a-z]/g, "");
</script>

<template>
  <article class="doc">
    <div class="cover">
      <p class="eyebrow">Rapport de veille · {{ meta.dateLabel }}</p>
      <h3 class="title">{{ R.titre }}</h3>
      <p v-if="R.sous_titre" class="subtitle">{{ R.sous_titre }}</p>
      <div v-if="has(R.mots_cles)" class="kw"><span v-for="(k, i) in R.mots_cles" :key="i">{{ k }}</span></div>
    </div>

    <template v-for="p in parts" :key="p.id">
      <h4 :id="p.id" :data-num="p.num"><span class="num">{{ p.num }}</span>{{ p.title }}</h4>

      <template v-if="p.kind === 'synthese'">
        <p v-for="(t, i) in R.synthese || []" :key="i">{{ t }}</p>
        <div v-if="has(R.points_cles)" class="box"><strong>Points clés</strong><ul><li v-for="(x, i) in R.points_cles" :key="i">{{ x }}</li></ul></div>
      </template>

      <template v-else-if="p.kind === 'section'">
        <p v-if="p.data.introduction" class="intro">{{ p.data.introduction }}</p>
        <template v-for="(b, i) in p.data.blocs || []" :key="i">
          <h5 v-if="b.sous_titre">{{ b.sous_titre }}</h5>
          <p v-for="(t, j) in b.paragraphes || []" :key="j">{{ t }}</p>
        </template>
        <div v-if="p.data.exemple" class="box"><strong>Exemple concret</strong><p>{{ p.data.exemple }}</p></div>
        <template v-if="has(p.data.implications)">
          <h5>Implications concrètes</h5>
          <ul><li v-for="(x, i) in p.data.implications" :key="i">{{ x }}</li></ul>
        </template>
        <div v-if="has(p.data.encadre?.points)" class="box">
          <strong>{{ p.data.encadre.titre || "En bref" }}</strong>
          <ul><li v-for="(x, i) in p.data.encadre.points" :key="i">{{ x }}</li></ul>
        </div>
        <p v-if="p.data.a_retenir" class="keep">{{ p.data.a_retenir }}</p>
      </template>

      <table v-else-if="p.kind === 'acteurs'">
        <thead><tr><th>Acteur</th><th>Rôle et enjeu</th></tr></thead>
        <tbody><tr v-for="(a, i) in R.acteurs" :key="i"><td><strong>{{ a.nom }}</strong></td><td>{{ a.role }}</td></tr></tbody>
      </table>

      <template v-else-if="p.kind === 'risques'">
        <template v-if="has(R.risques)"><h5>Risques</h5><ul><li v-for="(x, i) in R.risques" :key="i">{{ x }}</li></ul></template>
        <template v-if="has(R.opportunites)"><h5>Opportunités</h5><ul><li v-for="(x, i) in R.opportunites" :key="i">{{ x }}</li></ul></template>
      </template>

      <template v-else-if="p.kind === 'scenarios'">
        <template v-for="(s, i) in R.scenarios" :key="i">
          <h5>{{ s.nom }}</h5>
          <p>{{ s.description }}</p>
          <p v-if="has(s.signaux)" class="muted">Signaux à surveiller : {{ s.signaux.join(" ; ") }}</p>
        </template>
      </template>

      <table v-else-if="p.kind === 'recommandations'">
        <thead><tr><th>Action</th><th>Priorité</th><th>Horizon</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in R.recommandations" :key="i">
            <td><strong>{{ r.action }}</strong><br><span class="muted">{{ r.justification }}</span></td>
            <td><span class="prio" :class="prio(r.priorite)">{{ r.priorite }}</span></td>
            <td>{{ r.horizon }}</td>
          </tr>
        </tbody>
      </table>

      <template v-else-if="p.kind === 'questions'">
        <template v-if="has(R.questions_ouvertes)"><h5>Questions ouvertes</h5><ul><li v-for="(x, i) in R.questions_ouvertes" :key="i">{{ x }}</li></ul></template>
        <div v-if="has(R.points_a_verifier)" class="box warn"><strong>Points à vérifier avant diffusion</strong><ul><li v-for="(x, i) in R.points_a_verifier" :key="i">{{ x }}</li></ul></div>
      </template>

      <table v-else-if="p.kind === 'glossaire'">
        <tbody><tr v-for="(g, i) in R.glossaire" :key="i"><td><strong>{{ g.terme }}</strong></td><td>{{ g.definition }}</td></tr></tbody>
      </table>

      <template v-else-if="p.kind === 'conclusion'"><p v-for="(t, i) in R.conclusion" :key="i">{{ t }}</p></template>

      <div v-else-if="p.kind === 'annexe'" class="src">{{ meta.summary }}</div>
    </template>
  </article>
</template>
