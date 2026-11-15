<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useAppStore } from '../stores/app.js'
import { createGlobe } from '../globe/renderer.js'
import { attachInteraction } from '../globe/interaction.js'
import { layerAt } from '../globe/field.js'
import { km } from '../lib/names.js'
import { fmtA, fmtLL } from '../lib/format.js'
import { TYPES } from '../lib/colors.js'
import PlaybackControl from './PlaybackControl.vue'
import EventList from './EventList.vue'

const app = useAppStore()
const stage = ref(null)
const canvas = ref(null)
const tip = ref({ show: false, x: 0, y: 0, title: '', type: null, body: '', hint: false })
const tipEl = ref(null)
let globe = null, detach = null, ro = null

/** Estado que necesita el renderer en cada cuadro (objeto plano, sin reactividad). */
function globeState () {
  if (!app.manifest || !app.meta) return null
  return {
    meta: app.meta,
    layers: app.layers,
    yearF: app.yearF,
    base: app.baseWin,
    events: app.visibleEvents,
    eventType: app.eventType,
    ev: app.ev
  }
}

const nearest = (p, maxKm) => {
  let best = null, bd = Infinity
  for (const e of app.visibleEvents) { const d = km(e, p); if (d < bd) { bd = d; best = e } }
  return bd < maxKm ? best : null
}

function onHover (x, y, p) {
  if (!p) { tip.value.show = false; return }
  const ev = nearest(p, 250), t = Math.round(app.yearF)
  const L = layerAt(app.layers, p.lat, p.lon)
  const d = L ? L.anomaly(p.lat, p.lon, t, app.baseWin, !!app.meta.rel) : NaN
  tip.value = {
    show: true, x, y,
    title: ev ? ev.place : fmtLL(p.lat, p.lon),
    type: ev ? `${TYPES[ev.type].l} ${ev.year}` : null,
    typeClass: ev?.type,
    body: Number.isNaN(d) ? '' : `${app.meta.short} en ${app.dates[t]}: ${fmtA(app.meta, d)} vs antes del evento`,
    hint: !!ev
  }
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
    onSelect: p => {
      const e = nearest(p, 500)
      if (e) {
        app.selectEvent(e.id)
        globe.markDirty()
      }
    },
    onHover,
    onLeave: () => { tip.value.show = false }
  })
  if (app.flyTarget) globe.flyTo(app.flyTarget.lat, app.flyTarget.lon, app.flyTarget.zoom)
})
onBeforeUnmount(() => { detach?.(); ro?.disconnect(); globe?.destroy() })

watch(() => app.flyTarget, t => { if (t && globe) globe.flyTo(t.lat, t.lon, t.zoom) })
</script>

<template>
  <div class="stage" ref="stage">
    <canvas ref="canvas" class="globe"
            aria-label="Globo terráqueo. Arrastra para girar, rueda para acercar, toca un evento para analizarlo."></canvas>
    <span class="caption">Arrastra para girar · toca un evento para analizarlo</span>
    <EventList v-if="app.manifest" />
    <div class="zoom">
      <button type="button" aria-label="Acercar" @click="zoomBy(1.6)">+</button>
      <button type="button" aria-label="Alejar" @click="zoomBy(1 / 1.6)">−</button>
    </div>
    <PlaybackControl v-if="app.manifest" />
    <div v-if="app.loadError || app.dataWarning" class="data-warning" role="status" aria-live="polite">
      <span aria-hidden="true">⚠</span>
      {{ app.loadError || app.dataWarning }}
      <button type="button" aria-label="Cerrar aviso" @click="app.loadError ? (app.loadError = null) : app.clearDataWarning()">×</button>
    </div>
    <div v-else-if="!app.manifest" class="data-warning loading" role="status" aria-live="polite">
      Cargando datos…
    </div>
    <div ref="tipEl" class="tip" role="tooltip" v-show="tip.show" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
      <b>{{ tip.title }}</b>
      <template v-if="tip.type"> · <span :class="['tag', tip.typeClass]">{{ tip.type }}</span></template>
      <template v-if="tip.body"><br>{{ tip.body }}</template>
      <template v-if="tip.hint"><br><span class="tipsub">Toca para analizar</span></template>
    </div>
  </div>
</template>

<style scoped>
.stage{position:relative;min-height:0;overflow:hidden;background:radial-gradient(70% 70% at 45% 45%, #fffbe8, #efe8c9)}
.globe{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none;display:block}
.globe.drag{cursor:grabbing}
.caption{position:absolute;left:16px;top:18px;font-size:12px;color:var(--muted);max-width:180px;pointer-events:none;text-shadow:0 0 3px #fefae0,0 0 6px #fefae0}
.zoom{position:absolute;right:14px;top:14px;display:flex;flex-direction:column;gap:6px}
.zoom button{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--surface);font:600 18px var(--font-body);cursor:pointer;color:var(--ink)}
.zoom button:hover{border-color:var(--accent)}
.data-warning{position:absolute;left:16px;bottom:16px;display:flex;align-items:center;gap:7px;max-width:min(360px,calc(100% - 32px));padding:8px 10px;background:var(--surface);border:1px solid #d8b36a;border-radius:9px;color:var(--ink);font-size:12px;box-shadow:0 4px 14px rgba(40,54,24,.14);z-index:5}
.data-warning span{color:#a76b16;font-size:15px}
.data-warning button{margin-left:auto;border:0;background:transparent;color:var(--muted);font-size:17px;line-height:1;cursor:pointer;padding:0 2px}
.data-warning.loading{color:var(--muted);border-color:var(--line)}
.tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:13px;z-index:4;max-width:250px;box-shadow:0 4px 14px rgba(40,54,24,.12)}
.tip .tag{font-size:9.5px}
.tipsub{color:var(--muted)}
@media (max-width:980px){ .stage{height:66vh} .caption{display:none} }
</style>
