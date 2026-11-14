<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useAppStore } from '../stores/app.js'
import { createGlobe } from '../globe/renderer.js'
import { attachInteraction } from '../globe/interaction.js'
import { cellValue, cellMeans } from '../globe/field.js'
import { cellOf } from '../lib/loader.js'
import { nameAt } from '../lib/names.js'
import { sgn, num, cap } from '../lib/format.js'
import ModeSwitch from './ModeSwitch.vue'
import ControlBar from './ControlBar.vue'

const app = useAppStore()
const stage = ref(null)
const canvas = ref(null)
const tip = ref({ show: false, x: 0, y: 0, html: '' })
const tipEl = ref(null)
let globe = null, detach = null, ro = null

/** Estado que necesita el renderer en cada cuadro (objeto plano, sin reactividad). */
function globeState () {
  const v = app.variable
  if (!v || !app.manifest || app.yearAf == null) return null
  return {
    v, meta: v.meta, grid: app.manifest.grid, years: app.manifest.years,
    mode: app.mode, yearAf: app.yearAf, yearB: app.yearB, horizon: app.horizon, warming: app.warming,
    zone: app.zone, otherZone: app.otherZone
  }
}

function tooltipText (p) {
  const s = globeState()
  if (!s) return ''
  const meta = s.meta, c = cellOf(s.grid, p.lat, p.lon)
  if (!s.v.valid[c]) return 'Sin datos de esta variable aquí'
  const r = cellValue(s, c)
  if (!r) return 'Sin datos de esta variable aquí'
  const y0 = s.years[0], base = Math.abs(cellMeans(s.v)[c])
  const pct = x => `${sgn(x)}${num(x / base * 100, 0)} %`
  if (s.mode === 'compare') {
    return `${y0 + app.yearA} vs ${y0 + app.yearB}: ${meta.mode === 'pct' ? pct(r.x) : `${sgn(r.x)}${num(r.x, 2)} °C`}`
  }
  if (!r.w) return s.mode === 'whatif' ? 'Sin respuesta confiable al calentamiento' : 'Sin cambio confiable'
  if (s.mode === 'whatif') return `Con +${num(s.warming, 1)} °C: ${meta.mode === 'pct' ? pct(r.x) : `${sgn(r.x)}${num(r.x, 1)} °C`}`
  if (s.mode === 'trend') return `${cap(r.x > 0 ? meta.up : meta.down)} · ${sgn(r.x)}${num(r.x, meta.fdec + 1)} ${meta.units}/década`
  return `${s.horizon}: ${sgn(r.x)}${num(r.x, meta.fdec + 1)} ${meta.units} vs. lo normal`
}

function onHover (x, y, p) {
  if (!p) { tip.value.show = false; return }
  tip.value = { show: true, x, y, html: tooltipText(p) }
  requestAnimationFrame(() => {
    const el = tipEl.value, st = stage.value
    if (!el || !st || !tip.value.show) return
    tip.value.x = Math.min(x + 14, st.clientWidth - el.offsetWidth - 4)
    tip.value.y = Math.min(y + 14, st.clientHeight - el.offsetHeight - 4)
  })
}

function zoomBy (f) {
  if (!globe) return
  globe.stopMotion()
  globe.flyTo(globe.view.lat0, globe.view.lon0, globe.clampZoom(globe.view.zoom * f))
}

onMounted(() => {
  globe = createGlobe(canvas.value, { getState: globeState, onFrame: dt => app.stepPlay(dt) })
  Object.assign(globe.view, { lon0: app.view.lon0, lat0: app.view.lat0, zoom: app.view.zoom })
  const fit = () => { const r = stage.value.getBoundingClientRect(); globe.resize(r.width, r.height) }
  fit()
  ro = new ResizeObserver(fit); ro.observe(stage.value)
  detach = attachInteraction(canvas.value, globe, {
    onSelect: p => app.selectZone({ lat: p.lat, lon: p.lon, name: nameAt(p.lat, p.lon, true) }, { zoom: 1.8 }),
    onHover,
    onLeave: () => { tip.value.show = false }
  })
})
onBeforeUnmount(() => { detach?.(); ro?.disconnect(); globe?.destroy() })

watch(() => app.flyTarget, t => {
  if (!t || !globe) return
  globe.flyTo(t.lat, t.lon, t.atLeast ? Math.max(globe.view.zoom, t.zoom) : t.zoom)
})
</script>

<template>
  <div class="stage" ref="stage">
    <canvas ref="canvas" class="globe"
            aria-label="Globo terráqueo. Arrastra para girar, rueda para acercar, toca una zona para ver sus detalles."></canvas>
    <span class="caption">Arrastra para girar · toca una zona</span>
    <ModeSwitch />
    <div class="zoom">
      <button type="button" aria-label="Acercar" @click="zoomBy(1.6)">+</button>
      <button type="button" aria-label="Alejar" @click="zoomBy(1 / 1.6)">−</button>
    </div>
    <ControlBar v-if="app.variable" />
    <div v-if="app.loadError || !app.variable" class="status" role="status">
      <template v-if="app.loadError">
        <h2>No se pudieron cargar los datos</h2>
        <p class="empty">{{ app.loadError }}</p>
      </template>
      <p v-else class="empty">Cargando datos…</p>
    </div>
    <div ref="tipEl" class="tip" role="tooltip" v-show="tip.show" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
      {{ tip.html }}<br><span class="tipsub">Toca para ver la zona</span>
    </div>
  </div>
</template>

<style scoped>
.stage{position:relative;min-height:0;overflow:hidden;background:radial-gradient(70% 70% at 45% 45%, #fffbe8, #efe8c9)}
.globe{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none;display:block}
.globe.drag{cursor:grabbing}
.caption{position:absolute;left:16px;top:18px;font-size:12px;color:var(--muted);pointer-events:none;text-shadow:0 0 3px #fefae0,0 0 6px #fefae0}
.zoom{position:absolute;right:14px;top:14px;display:flex;flex-direction:column;gap:6px}
.zoom button{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--surface);font:600 18px var(--font-body);cursor:pointer;color:var(--ink)}
.zoom button:hover{border-color:var(--accent)}
.status{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:420px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 20px;box-shadow:0 4px 18px rgba(40,54,24,.1)}
.status h2{font-size:20px;margin:2px 0 8px}
.tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:13px;z-index:4;max-width:240px;box-shadow:0 4px 14px rgba(40,54,24,.12)}
.tipsub{color:var(--muted)}
@media (max-width:960px){ .stage{height:64vh} .caption{display:none} }
</style>
