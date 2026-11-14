<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app.js'
import { gradCSS, TYPES } from '../lib/colors.js'
import { num } from '../lib/format.js'

const app = useAppStore()
const meta = computed(() => app.meta)
// Extremos de la leyenda (scaleOf del prototipo; el valor viene del manifest).
const lo = computed(() => meta.value.rel ? `−${num(meta.value.scale, 0)} %` : `−${num(meta.value.scale, meta.value.id === 'sm' ? 2 : 1)}`)
const hi = computed(() => meta.value.rel ? `+${num(meta.value.scale, 0)} %` : `+${num(meta.value.scale, meta.value.id === 'sm' ? 2 : 1)} ${meta.value.unitsCh}`)
const yearIdx = computed(() => Math.round(app.yearF))
</script>

<template>
  <div class="ctl">
    <div class="ctlrow">
      <button class="btn brown" type="button" @click="app.togglePlay()">{{ app.playing ? '❚❚ Pausa' : '▶ Reproducir' }}</button>
      <input type="range" :min="0" :max="app.nyears - 1" :value="yearIdx" aria-label="Año"
             @input="app.setYear(+$event.target.value)">
      <b>{{ app.years[0] + yearIdx }}</b>
    </div>
    <div class="legend" :aria-label="`Escala de color: de ${lo} a ${hi} respecto a antes del evento`">
      <span>{{ lo }}</span><span class="g" :style="{ background: gradCSS(meta.palette) }"></span><span>{{ hi }}</span>
      <span v-for="(t, k) in TYPES" :key="k"><span class="sw" :style="{ background: t.c }"></span>{{ t.l }}</span>
      <span v-if="meta.layer === 'tiles'" class="note">Detalle disponible en las zonas de evento</span>
    </div>
  </div>
</template>

<style scoped>
.ctl{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(780px,calc(100% - 28px));background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 14px;box-shadow:0 4px 18px rgba(40,54,24,.1);display:flex;flex-direction:column;gap:8px}
.ctlrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px}
.ctlrow b{font-weight:700;font-variant-numeric:tabular-nums}
input[type=range]{flex:1;min-width:160px;accent-color:var(--accent)}
.legend{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.legend .g{flex:1;min-width:140px;max-width:280px;height:10px;border-radius:5px;border:1px solid var(--line)}
.legend .sw{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:-1px;margin-right:4px}
.note{font-style:italic}
</style>
