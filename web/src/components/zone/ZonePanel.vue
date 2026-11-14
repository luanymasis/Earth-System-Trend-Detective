<script setup>
// Panel "Esta zona" (PLAN §7.5).
import { computed } from 'vue'
import { useAppStore } from '../../stores/app.js'
import { zoneStats, mean3, diffText } from '../../lib/zone.js'
import { LEVELS, LEVEL_COLORS, chanceText } from '../../lib/stats.js'
import { sgn, num, fmtLL } from '../../lib/format.js'
import ZoneChart from './cards/ZoneChart.vue'
import ForecastCard from './cards/ForecastCard.vue'
import EmergenceCard from './cards/EmergenceCard.vue'
import CoChangeCard from './cards/CoChangeCard.vue'

const app = useAppStore()
const meta = computed(() => app.meta)
const y0 = computed(() => app.years[0])
const Z = computed(() => (app.variable && app.zone ? zoneStats(app.variable, app.manifest.grid, app.zone) : null))

const headline = computed(() => {
  const z = Z.value, m = meta.value
  const dir = z.r.slope > 0 ? m.up : m.down
  if (z.level >= 3) return { strong: dir, pre: 'Aquí ', post: ` que en ${y0.value}.` }
  if (z.level === 2) return { pre: `Posiblemente ${dir}, pero aún no es seguro.` }
  return { pre: `No hay un cambio claro en ${m.noun}.` }
})

// "A vs B" con promedios de 3 años sobre la serie de la zona
const compare = computed(() => {
  const y = Z.value.y, a = mean3(y, app.yearA), b = mean3(y, app.yearB)
  return diffText(meta.value, a - b, b)
})

const noData = computed(() => {
  const id = meta.value?.id
  if (id === 'snow') return 'Aquí no nieva. Prueba con el hemisferio norte, sobre los 30°.'
  if (id === 'sst') return 'Está lejos del mar.'
  return 'Prueba con otra variable.'
})
</script>

<template>
  <div v-if="!app.zone" class="empty">Toca cualquier zona del globo para ver qué está cambiando ahí.</div>
  <template v-else-if="meta">
    <div class="zone">
      <span class="k">{{ meta.short }}</span>
      <h2>{{ app.zone.name }}</h2>
      <p class="empty coords">{{ fmtLL(app.zone.lat, app.zone.lon) }}</p>
    </div>

    <p v-if="!app.variable" class="empty">Cargando…</p>
    <template v-else-if="!Z">
      <p class="headline">No hay datos de {{ meta.noun }} en esta zona.</p>
      <p class="empty">{{ noData }}</p>
    </template>
    <template v-else>
      <p class="headline">{{ headline.pre }}<b v-if="headline.strong">{{ headline.strong }}</b>{{ headline.post }}</p>
      <div><span class="pill"><i :style="{ background: LEVEL_COLORS[Z.level] }"></i>Confianza: {{ LEVELS[Z.level] }}</span></div>

      <div class="stats">
        <div class="st">
          <div class="l">{{ y0 + app.yearA }} vs {{ y0 + app.yearB }}</div>
          <div class="v">{{ compare }}</div>
          <div class="s">promedios de 3 años</div>
        </div>
        <div class="st">
          <div class="l">Por década</div>
          <div class="v">{{ sgn(Z.r.slope) }}{{ num(Z.r.slope * 10, meta.fdec + 1) }}</div>
          <div class="s">{{ meta.units }}</div>
        </div>
        <div class="st">
          <div class="l">¿Casualidad?</div>
          <div class="v small">{{ chanceText(Z.r.p) }}</div>
          <div class="s">prob. de verlo por azar</div>
        </div>
      </div>

      <button class="linkbtn" type="button" :aria-expanded="app.showChart" @click="app.showChart = !app.showChart">
        {{ app.showChart ? '▾ Ocultar gráfico' : '▸ Ver gráfico con proyección' }}
      </button>
      <ZoneChart v-if="app.showChart" :stats="Z" :meta="meta" />

      <ForecastCard :stats="Z" :meta="meta" />
      <EmergenceCard v-if="Z.level <= 2" :stats="Z" />
      <!-- Contraste cercano: H5 (necesita discover.json) -->
    </template>
    <CoChangeCard v-if="app.variable" />
  </template>
</template>

<style scoped>
.zone h2{font-size:21px;line-height:1.2;margin-top:2px}
.coords{margin:2px 0 0}
.headline{font-size:17px;line-height:1.35;margin:0}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;border-radius:999px;padding:3px 10px;border:1px solid var(--line);background:var(--raised)}
.pill i{width:8px;height:8px;border-radius:50%}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.st{background:var(--raised);border-radius:10px;padding:8px 10px}
.st .l{font-size:11px;color:var(--muted);font-weight:600}
.st .v{font:700 18px var(--font-display);font-variant-numeric:tabular-nums;line-height:1.3}
.st .v.small{font-size:15px}
.st .s{font-size:11px;color:var(--muted)}
</style>
