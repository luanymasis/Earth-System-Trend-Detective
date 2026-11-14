<script setup>
// Serie observada de la zona + proyección con banda del 80 % hasta el horizonte (porta `drawChart`).
import { computed } from 'vue'
import { useAppStore } from '../../../stores/app.js'
import { predict, clampPrediction } from '../../../lib/forecast.js'
import { num } from '../../../lib/format.js'

const props = defineProps({ stats: Object, meta: Object })
const app = useAppStore()
const W = 380, H = 190, L = 44, R = 10, T = 10, B = 22

function niceTicks (a, b, k) {
  const s0 = (b - a) / k, mag = 10 ** Math.floor(Math.log10(s0)), r = s0 / mag
  const st = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = []
  for (let x = Math.ceil(a / st) * st; x <= b + 1e-12; x += st) out.push(Math.abs(x) < st / 1e6 ? 0 : x)
  return out
}

const c = computed(() => {
  const y = props.stats.y, n = y.length, F = props.stats.F, y0 = app.years[0]
  const tEnd = Math.max(n - 1, app.horizon - y0)
  const band = []
  for (let t = n - 1; t <= tEnd; t++) band.push([t, clampPrediction(predict(F, t), props.meta)])
  const all = y.concat(band.flatMap(([, p]) => [p.lo, p.hi]))
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.1 || 1
  const v0 = lo - pad, v1 = hi + pad
  const X = t => L + t / tEnd * (W - L - R)
  const Y = v => T + (v1 - v) / (v1 - v0) * (H - T - B)
  const ticks = niceTicks(v0, v1, 4)
  const d = Math.max(0, Math.min(3, -Math.floor(Math.log10((ticks[1] - ticks[0]) || 1))))
  const xt = []
  for (let t = 0; t <= tEnd; t += tEnd > 30 ? 10 : 6) xt.push(t)
  return {
    yTicks: ticks.map(v => ({ y: Y(v), label: v.toFixed(d) })),
    xTicks: xt.map(t => ({ x: X(t), label: y0 + t })),
    future: { x: X(n - 1), w: X(tEnd) - X(n - 1) },
    bandPts: band.map(([t, p]) => `${X(t)},${Y(p.hi)}`).join(' ') + ' ' + band.slice().reverse().map(([t, p]) => `${X(t)},${Y(p.lo)}`).join(' '),
    projPts: band.map(([t, p]) => `${X(t)},${Y(p.m)}`).join(' '),
    obsPts: y.map((v, t) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join(' '),
    dots: y.map((v, t) => ({ x: X(t), y: Y(v), hl: t === app.yearA || t === app.yearB, title: `${y0 + t}: ${num(v, props.meta.fdec)} ${props.meta.units}` }))
  }
})
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img"
      :aria-label="`${meta.noun} por año en esta zona y proyección hasta ${app.horizon}`">
      <g v-for="(tk, i) in c.yTicks" :key="'y' + i">
        <line :x1="L" :x2="W - R" :y1="tk.y" :y2="tk.y" stroke="#e3dbba" />
        <text :x="L - 5" :y="tk.y + 3" text-anchor="end">{{ tk.label }}</text>
      </g>
      <text v-for="tk in c.xTicks" :key="'x' + tk.label" :x="tk.x" :y="H - 5" text-anchor="middle">{{ tk.label }}</text>
      <rect :x="c.future.x" :y="T" :width="c.future.w" :height="H - T - B" fill="#dda15e" opacity=".08" />
      <polygon :points="c.bandPts" fill="#dda15e" opacity=".35" />
      <polyline :points="c.projPts" fill="none" stroke="#bc6c25" stroke-width="2" stroke-dasharray="5 4" />
      <polyline :points="c.obsPts" fill="none" stroke="#606c38" stroke-width="1.8" />
      <circle v-for="(d, i) in c.dots" :key="i" :cx="d.x" :cy="d.y" :r="d.hl ? 4 : 2.2" :fill="d.hl ? '#bc6c25' : '#606c38'"><title>{{ d.title }}</title></circle>
    </svg>
    <div class="legend">
      <span><span style="color:#606c38">●</span> observado</span>
      <span><span style="color:#bc6c25">●</span> años comparados</span>
      <span><span style="color:#bc6c25">- -</span> proyección</span>
      <span><span style="color:#dda15e">■</span> rango probable (80 %)</span>
    </div>
  </div>
</template>

<style scoped>
svg{display:block;height:auto}
svg text{font-family:var(--font-body);fill:var(--muted);font-size:10.5px}
.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
</style>
