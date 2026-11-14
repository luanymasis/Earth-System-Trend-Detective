<script setup>
// H1: marcador de posición. El globo (d3.geoOrthographic + capa raster) llega en H2.
import { computed } from 'vue'
import { useAppStore } from '../stores/app.js'
const app = useAppStore()

const summary = computed(() => {
  const v = app.variable
  if (!v || !app.manifest) return null
  let valid = 0, sig = 0
  for (let c = 0; c < v.ncell; c++) { if (v.valid[c]) valid++; if (v.stats.sig_trend[c]) sig++ }
  const [y0, y1] = app.manifest.years
  return { valid, sig, y0, y1, n: v.nyears }
})
</script>

<template>
  <div class="stage">
    <div class="status" role="status">
      <template v-if="app.loadError">
        <h2>No se pudieron cargar los datos</h2>
        <p class="empty">{{ app.loadError }}</p>
      </template>
      <template v-else-if="app.loading || !summary">
        <p class="empty">Cargando datos…</p>
      </template>
      <template v-else>
        <span class="k">{{ app.meta.short }}</span>
        <h2>{{ app.meta.q }}</h2>
        <p class="empty">{{ summary.n }} años ({{ summary.y0 }}–{{ summary.y1 }}) · {{ summary.valid.toLocaleString('es') }} celdas con datos ·
          cambio confiable en {{ summary.sig.toLocaleString('es') }} celdas</p>
        <p class="empty">El globo interactivo llega en el siguiente hito.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.stage{position:relative;min-height:0;background:radial-gradient(70% 70% at 45% 45%, #fffbe8, #efe8c9);display:grid;place-items:center;padding:16px}
.status{max-width:420px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 20px;box-shadow:0 4px 18px rgba(40,54,24,.1)}
.status h2{font-size:20px;margin:2px 0 8px}
.status p{margin:4px 0}
@media (max-width:960px){ .stage{height:64vh} }
</style>
