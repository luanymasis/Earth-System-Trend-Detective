<script setup>
// Tarjeta "Proyección" (PLAN §7.5.6): valor en el horizonte, probabilidad para el próximo año
// y prueba con el pasado (hindcast 2020–2024).
import { computed } from 'vue'
import { useAppStore } from '../../../stores/app.js'
import { predict, probAbove, hindcast, clampPrediction } from '../../../lib/forecast.js'
import { num } from '../../../lib/format.js'

const props = defineProps({ stats: Object, meta: Object })
const app = useAppStore()
const y0 = computed(() => app.years[0])
const y1 = computed(() => app.years[1])

const F = computed(() => props.stats.F)
const pr = computed(() => clampPrediction(predict(F.value, app.horizon - y0.value), props.meta))
const fmtV = x => `${num(x, props.meta.fdec)} ${props.meta.units}`
const range = computed(() => `${num(pr.value.lo, props.meta.fdec)}–${num(pr.value.hi, props.meta.fdec)} ${props.meta.units}`)

const likely = computed(() => {
  const pa = probAbove(F.value, props.stats.n)
  const up = pa >= 0.5, p = up ? pa : 1 - pa
  return { word: (up ? props.meta.high : props.meta.low).toLowerCase(), txt: p > 0.99 ? 'más de 99' : String(Math.round(p * 100)) }
})
const hc = computed(() => hindcast(props.stats.y))
</script>

<template>
  <div class="card">
    <h3>Proyección <span class="tag">Exclusivo</span></h3>
    <template v-if="F.sig">
      <p>Si la tendencia continúa, en <b>{{ app.horizon }}</b> estaría en <span class="big">{{ fmtV(pr.m) }}</span></p>
      <p class="small">Rango probable (80 %): {{ range }} · hoy el promedio es {{ fmtV(F.mean) }}</p>
    </template>
    <template v-else>
      <p>Sin tendencia confiable, lo más probable en <b>{{ app.horizon }}</b> es un valor cercano a lo normal: <span class="big">{{ fmtV(pr.m) }}</span></p>
      <p class="small">Rango probable (80 %): {{ range }}</p>
    </template>
    <p v-if="F.sig" class="small">Probabilidad de que {{ y1 + 1 }} sea un año con {{ likely.word }} que lo normal: <b>{{ likely.txt }} %</b></p>
    <p v-else class="small">{{ y1 + 1 }} tiene la misma probabilidad de quedar por encima o por debajo de lo normal.</p>
    <span class="check">✓ Probado con el pasado: {{ hc.inside }} de {{ hc.k }} años ({{ y1 - hc.k + 1 }}–{{ y1 }}) cayeron dentro del rango<template v-if="hc.gain > 5"> · {{ Math.round(hc.gain) }} % más preciso que suponer “año normal”</template></span>
    <p class="small note">Proyección estadística de la tendencia observada, no un modelo climático.</p>
  </div>
</template>

<style scoped>
.note{margin:8px 0 0}
</style>
