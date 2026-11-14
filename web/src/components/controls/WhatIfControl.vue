<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { useAppStore } from '../../stores/app.js'
import { xLevel } from '../../lib/whatif.js'
import { num } from '../../lib/format.js'

const app = useAppStore()
const MAX = 4
const PRESETS = [0.5, 1, 2, 3]
const obs = computed(() => app.manifest.gt.obs_warming)
const level = computed(() => xLevel(app.warming, obs.value))
const track = computed(() => {
  const r1 = obs.value / MAX * 100 * 1.05, r2 = obs.value * 2.5 / MAX * 100
  return `linear-gradient(90deg, #606c38 0%, #606c38 ${r1}%, #dda15e ${r1}%, #dda15e ${r2}%, #bc6c25 ${r2}%, #bc6c25 100%)`
})

// Animación de 0.9 s al pulsar un botón (respeta prefers-reduced-motion).
let raf = 0
function animateTo (x) {
  cancelAnimationFrame(raf)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { app.warming = x; return }
  const from = app.warming, t0 = performance.now()
  const step = now => {
    const f = Math.min(1, (now - t0) / 900), e = 1 - (1 - f) ** 3
    app.warming = from + (x - from) * e
    if (f < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
function onInput (e) { cancelAnimationFrame(raf); app.warming = +e.target.value }
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="ctlrow">
    <span>Si el planeta se calienta</span>
    <span class="xval">+{{ num(app.warming, 1) }} °C</span>
    <span>más que hoy</span>
    <span class="conf-badge" :style="{ background: level.c }">{{ level.t }}</span>
  </div>
  <div class="ctlrow">
    <input type="range" class="xs" min="0" :max="MAX" step="0.1" :value="app.warming" :style="{ background: track }"
           aria-label="Grados de calentamiento adicional" :aria-valuetext="`+${num(app.warming, 1)} °C`" @input="onInput">
    <button v-for="x in PRESETS" :key="x" type="button" class="preset" :aria-pressed="Math.abs(app.warming - x) < 0.05" @click="animateTo(x)">
      +{{ num(x, x % 1 ? 1 : 0) }} °C
    </button>
  </div>
  <div class="zones">
    <span><i style="background:#606c38"></i>Hasta +{{ num(obs, 1) }} °C: lo que ya observamos en {{ app.years[0] }}–{{ app.years[1] }}</span>
    <span><i style="background:#dda15e"></i>Extrapolación moderada</span>
    <span><i style="background:#bc6c25"></i>Especulativo</span>
  </div>
  <slot name="legend" />
  <div class="note">Cada zona se mueve según cómo respondió a cada décima de grado de calentamiento global entre {{ app.years[0] }} y {{ app.years[1] }} (<i>pattern scaling</i>). No es un modelo climático y no incluye puntos de quiebre.</div>
</template>

<style scoped>
.xval{font:700 26px var(--font-display);font-variant-numeric:tabular-nums;color:var(--brown);min-width:96px}
.conf-badge{display:inline-flex;align-items:center;font-size:13px;font-weight:700;border-radius:999px;padding:3px 10px;color:#fff}
.xs{-webkit-appearance:none;appearance:none;flex:1;min-width:180px;height:10px;border-radius:5px;outline:none;border:1px solid var(--line)}
.xs::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--deep);border:3px solid var(--bg);box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer}
.xs::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--deep);border:3px solid var(--bg);cursor:pointer}
.xs:focus-visible{outline:2px solid var(--brown);outline-offset:3px}
.preset{border:1px solid var(--line);background:var(--raised);border-radius:999px;padding:4px 11px;font-weight:700;font-size:13px;cursor:pointer;color:var(--ink)}
.preset[aria-pressed="true"]{background:var(--deep);color:var(--bg);border-color:var(--deep)}
.zones{display:flex;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.zones i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
@media (max-width:560px){ .zones{display:none} .xval{font-size:20px;min-width:70px} }
</style>
