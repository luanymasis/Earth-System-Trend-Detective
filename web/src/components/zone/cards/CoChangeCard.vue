<script setup>
// "Cambia junto con" (PLAN §5): las otras variables con cambio confiable (nivel ≥ 3) en la zona.
import { computed } from 'vue'
import { useAppStore } from '../../../stores/app.js'
import { zoneStats, changeText } from '../../../lib/zone.js'
import ArrowBox from '../ArrowBox.vue'

const app = useAppStore()
const others = computed(() => app.variables.filter(m => m.id !== app.variableId))
const pending = computed(() => others.value.some(m => !app.vars[m.id]))
const rows = computed(() => others.value
  .map(m => ({ m, Z: app.vars[m.id] ? zoneStats(app.vars[m.id], app.manifest.grid, app.zone) : null }))
  .filter(o => o.Z && o.Z.level >= 3))
</script>

<template>
  <div class="card">
    <h3>Cambia junto con <span class="tag">Exclusivo</span></h3>
    <template v-if="rows.length">
      <div class="co">
        <button v-for="{ m, Z } in rows" :key="m.id" type="button" class="corow" @click="app.setVariable(m.id)"
          :aria-label="`Ver ${m.short}: ${Z.r.slope > 0 ? m.up : m.down}, ${changeText(m, Z)}`">
          <ArrowBox :palette="m.palette" :stats="Z" />
          <span>{{ m.short }}: {{ Z.r.slope > 0 ? m.up : m.down }}</span>
          <span class="v">{{ changeText(m, Z) }}</span>
        </button>
      </div>
      <p class="small foot">Cambian al mismo tiempo en esta zona. Es una asociación, no prueba que una cause a la otra.</p>
    </template>
    <p v-else-if="pending" class="small">Revisando las demás variables…</p>
    <p v-else class="small">Ninguna otra variable cambia de forma confiable en esta zona.</p>
  </div>
</template>

<style scoped>
.co{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.corow{display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:center;font-size:14px;background:none;border:0;padding:2px 0;text-align:left;cursor:pointer;border-radius:6px}
.corow:hover span:nth-child(2){text-decoration:underline}
.corow .v{font-weight:700;font-variant-numeric:tabular-nums}
.foot{margin-top:8px}
</style>
