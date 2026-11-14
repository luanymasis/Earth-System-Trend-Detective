<script setup>
import { computed } from 'vue'
import { useAppStore } from '../../stores/app.js'
import { simulate } from '../../lib/sim.js'
import { ICON } from '../../lib/eventText.js'
import { dirCol } from '../../lib/colors.js'
import { fmtA, YRS } from '../../lib/format.js'

const app = useAppStore()
const S = computed(() => app.sim)
const defo = computed(() => S.value.act === 'deforestacion')
const H = 20
const verb = (v, x) => v.id === 'lst' ? (x > 0 ? 'subiría' : 'bajaría') : (x > 0 ? 'aumentaría' : 'bajaría')
const cards = computed(() => {
  const E = app.emp
  if (!E) return []
  return simulate(S.value, E, app.variables, H).rows.map(r => {
    const tone = r.weak ? 'none' : defo.value ? (!S.value.regen ? 'bad' : r.when !== null ? 'wait' : 'bad') : 'good'
    const sub = r.weak ? 'Relación débil: poco confiable'
      : defo.value ? (!S.value.regen ? 'No volvería a la normalidad' : r.when !== null ? `Volvería a la normalidad en ${YRS(r.when)}` : `Más de ${H} años para recuperarse`)
        : (r.when !== null ? `Efecto casi completo en ${YRS(r.when)}` : `Sigue cambiando después de ${H} años`)
    return {
      v: r.v, tone, sub,
      main: `${r.v.id === 'tree' ? '' : verb(r.v, r.peak) + ' '}${fmtA(r.v, r.peak).replace(/^[+−]/, '')}`,
      col: r.weak ? 'var(--muted)' : dirCol(r.v.palette, r.peak)
    }
  })
})
</script>

<template>
  <div>
    <div class="k">Simular escenario</div>
    <h2 class="rname">¿Qué pasaría si…?</h2>
  </div>
  <div class="card">
    <div class="simrow">
      <span class="seg" role="group" aria-label="Acción">
        <button type="button" :aria-pressed="defo" @click="app.sim.act = 'deforestacion'">Talar bosque</button>
        <button type="button" :aria-pressed="!defo" @click="app.sim.act = 'reforestacion'">Reforestar</button>
      </span>
    </div>
    <div class="simrow">
      <span>{{ defo ? 'Se pierde' : 'Se gana' }}</span><b class="big2">{{ S.M }}</b><span>puntos de cobertura arbórea</span>
    </div>
    <div class="simrow">
      <input type="range" min="5" max="40" step="1" :value="S.M" aria-label="Puntos de cobertura arbórea" @input="app.sim.M = +$event.target.value">
    </div>
    <div v-if="defo" class="simrow">
      <span>Después:</span>
      <span class="seg" role="group" aria-label="Qué pasa después">
        <button type="button" :aria-pressed="S.regen" @click="app.sim.regen = true">Se deja regenerar</button>
        <button type="button" :aria-pressed="!S.regen" @click="app.sim.regen = false">Se usa para cultivos o ganado</button>
      </span>
    </div>
  </div>
  <p v-if="!app.emp" class="empty" role="status">Cargando los eventos para aprender de ellos…</p>
  <template v-else>
    <div class="vgrid">
      <div v-for="c in cards" :key="c.v.id" :class="['vcard', c.tone]">
        <div class="vt"><span v-html="ICON[c.v.id]"></span>{{ c.v.short }}</div>
        <div class="vm" :style="{ color: c.col }">{{ c.main }}</div>
        <div class="vs">{{ c.sub }}</div>
      </div>
    </div>
    <p class="small">Estimación ilustrativa aprendida de {{ app.emp.n }} eventos reales</p>
  </template>
</template>

<style scoped>
.rname{font-size:19px;line-height:1.2}
.simrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px;margin:6px 0}
.big2{font:700 26px var(--font-display);font-variant-numeric:tabular-nums}
input[type=range]{flex:1;min-width:160px;accent-color:var(--accent)}
</style>
