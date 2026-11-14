// Globo ortográfico con d3 + capa raster de datos (PLAN §6.3, §7.2).
// Porta `draw`, `renderLayer`, `project`, `unproject` y el bucle de animación del prototipo.
import * as d3 from 'd3'
import { feature, mesh } from 'topojson-client'
import land110Topo from 'world-atlas/land-110m.json'
import countries110Topo from 'world-atlas/countries-110m.json'
import { createField } from './field.js'
import { lut } from '../lib/colors.js'

const D2R = Math.PI / 180
const SCALE = 0.5 // resolución de la capa raster respecto a la pantalla
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Geometría: 110m siempre; 50m se carga bajo demanda al acercar (zoom ≥ 2).
const GEO = {
  land: [feature(land110Topo, land110Topo.objects.land), null],
  borders: [mesh(countries110Topo, countries110Topo.objects.countries, (a, b) => a !== b), null]
}
let geo50Promise = null
function loadGeo50 (onReady) {
  if (!geo50Promise) {
    geo50Promise = Promise.all([import('world-atlas/land-50m.json'), import('world-atlas/countries-50m.json')]).then(([l, c]) => {
      const lt = l.default, ct = c.default
      GEO.land[1] = feature(lt, lt.objects.land)
      GEO.borders[1] = mesh(ct, ct.objects.countries, (a, b) => a !== b)
    }).catch(() => { geo50Promise = null })
  }
  geo50Promise.then(onReady)
}
const graticule = d3.geoGraticule10()
const sphere = { type: 'Sphere' }

/** Caja de la zona: ±4° de latitud y ±4°/cos(lat) de longitud (PLAN §5). */
export function boxOf (z) {
  const dl = 4, dlo = Math.min(30, 4 / Math.cos(z.lat * D2R))
  return { la0: z.lat - dl, la1: z.lat + dl, lo0: z.lon - dlo, lo1: z.lon + dlo }
}
function boxRing (z) {
  const b = boxOf(z), r = []
  for (let lo = b.lo0; lo <= b.lo1; lo++) r.push([lo, b.la0])
  for (let la = b.la0; la <= b.la1; la++) r.push([b.lo1, la])
  for (let lo = b.lo1; lo >= b.lo0; lo--) r.push([lo, b.la1])
  for (let la = b.la1; la >= b.la0; la--) r.push([b.lo0, la])
  return { type: 'LineString', coordinates: r }
}
const shortName = name => name.split(',')[0].split(' (')[0]

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ getState: () => object|null, onFrame?: (dt:number) => void }} opts
 *   getState devuelve { v, meta, grid, mode, yearAf, yearB, horizon, warming, years, zone, otherZone } o null.
 */
export function createGlobe (canvas, { getState, onFrame }) {
  const ctx = canvas.getContext('2d')
  const off = document.createElement('canvas')
  const offx = off.getContext('2d')
  const reduce = reduceMotion()
  const view = { lon0: -78, lat0: 14, zoom: 1, cx: 0, cy: 0, R0: 0, W: 0, H: 0 }
  const IDLE_MS = 200
  let lastMove = 0, drewHi = false
  let spin = !reduce, fly = null, dirty = true, layerKey = '', raf = 0, last = performance.now(), field = null, fieldGrid = null

  const proj = () => d3.geoOrthographic().rotate([-view.lon0, -view.lat0]).scale(view.R0 * view.zoom)
    .translate([view.cx, view.cy]).clipAngle(90).precision(0.3)

  function project (la, lo) {
    const p0 = view.lat0 * D2R, s0 = Math.sin(p0), c0 = Math.cos(p0), p = la * D2R, dl = (lo - view.lon0) * D2R
    const R = view.R0 * view.zoom, cp = Math.cos(p), sp = Math.sin(p), cd = Math.cos(dl)
    return { x: view.cx + R * cp * Math.sin(dl), y: view.cy - R * (c0 * sp - s0 * cp * cd), vis: s0 * sp + c0 * cp * cd }
  }
  function unproject (sx, sy) {
    const R = view.R0 * view.zoom, x = sx - view.cx, y = view.cy - sy, rho = Math.hypot(x, y)
    if (rho > R) return null
    if (rho < 1e-6) return { lat: view.lat0, lon: view.lon0 }
    const c = Math.asin(rho / R), p0 = view.lat0 * D2R, sc = Math.sin(c), cc = Math.cos(c)
    const lat = Math.asin(cc * Math.sin(p0) + y * sc * Math.cos(p0) / rho) / D2R
    const lon = view.lon0 + Math.atan2(x * sc, rho * cc * Math.cos(p0) - y * sc * Math.sin(p0)) / D2R
    return { lat, lon: ((lon + 540) % 360) - 180 }
  }

  function resize (w, h) {
    const dpr = window.devicePixelRatio || 1
    view.W = w; view.H = h
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    off.width = Math.max(1, Math.ceil(w * SCALE)); off.height = Math.max(1, Math.ceil(h * SCALE))
    // Deja espacio para el selector de modo (arriba) y la barra de controles (abajo).
    const compact = w < 560
    view.cx = w / 2; view.cy = h / 2 - (compact ? 40 : 30)
    view.R0 = Math.max(60, Math.min(w * (compact ? 0.44 : 0.40), (h - (compact ? 200 : 150)) * 0.5))
    layerKey = ''; dirty = true
  }

  function bil (arr, fi, fj, nx, ny) {
    let i0 = Math.floor(fi), j0 = Math.floor(fj)
    const di = fi - i0, dj = fj - j0
    const i1 = Math.min(ny - 1, Math.max(0, i0 + 1)); i0 = Math.min(ny - 1, Math.max(0, i0))
    const ja = ((j0 % nx) + nx) % nx, jb = (ja + 1) % nx
    return (arr[i0 * nx + ja] * (1 - dj) + arr[i0 * nx + jb] * dj) * (1 - di) +
           (arr[i1 * nx + ja] * (1 - dj) + arr[i1 * nx + jb] * dj) * di
  }

  function renderLayer (s) {
    if (fieldGrid !== s.grid) { field = createField(s.grid); fieldGrid = s.grid }
    field.build(s)
    const lk = `${field.key}|${view.lon0.toFixed(3)}|${view.lat0.toFixed(3)}|${view.zoom.toFixed(4)}|${off.width}x${off.height}`
    if (lk === layerKey) return
    layerKey = lk
    const { nx, ny, res, lat0: glat0, lon0: glon0 } = s.grid
    const { BV, BA } = field
    const L = lut(s.meta.palette)
    const w = off.width, h = off.height, img = offx.createImageData(w, h), d = img.data
    const R = view.R0 * view.zoom, p0 = view.lat0 * D2R, sp0 = Math.sin(p0), cp0 = Math.cos(p0)
    const x0 = Math.max(0, Math.floor((view.cx - R) * SCALE)), x1 = Math.min(w, Math.ceil((view.cx + R) * SCALE))
    const y0 = Math.max(0, Math.floor((view.cy - R) * SCALE)), y1 = Math.min(h, Math.ceil((view.cy + R) * SCALE))
    const cmp = s.mode === 'compare'
    for (let py = y0; py < y1; py++) {
      const y = view.cy - (py + 0.5) / SCALE
      for (let px = x0; px < x1; px++) {
        const x = (px + 0.5) / SCALE - view.cx, rho = Math.sqrt(x * x + y * y)
        if (rho >= R) continue
        const sc = rho / R, cc = Math.sqrt(1 - sc * sc)
        const la = rho < 1e-6 ? view.lat0 : Math.asin(cc * sp0 + y * sc * cp0 / rho) / D2R
        const lo = view.lon0 + Math.atan2(x * sc, rho * cc * cp0 - y * sc * sp0) / D2R
        const fi = (glat0 - la) / res, fj = (lo - glon0) / res
        const a = bil(BA, fi, fj, nx, ny)
        if (a < 0.03) continue
        const val = bil(BV, fi, fj, nx, ny), av = Math.abs(val)
        // Comparar: transparente si |x| < 0.08, rampa hasta 0.48. Demás modos: 0.5 + 0.6|x|.
        const st = cmp ? Math.max(0, Math.min(1, (av - 0.08) / 0.4)) : Math.min(1, 0.5 + av * 0.6)
        if (st <= 0) continue
        const k = Math.max(0, Math.min(255, Math.round((val + 1) * 127.5))), o = (py * w + px) * 4
        d[o] = L[k * 3]; d[o + 1] = L[k * 3 + 1]; d[o + 2] = L[k * 3 + 2]
        d[o + 3] = Math.round(255 * a * st * 0.93)
      }
    }
    offx.putImageData(img, 0, 0)
  }

  function draw (s) {
    const { W, H, cx, cy } = view
    ctx.clearRect(0, 0, W, H)
    const R = view.R0 * view.zoom
    // 50m solo con la vista quieta: mientras se gira o se vuela basta con 110m y el giro va fluido.
    let hi = view.zoom >= 2 ? 1 : 0
    if (hi && !GEO.land[1]) { loadGeo50(() => { dirty = true }); hi = 0 }
    if (hi && performance.now() - lastMove < IDLE_MS) hi = 0
    drewHi = !!hi
    // Cada geometría se proyecta una sola vez por cuadro (Path2D) y se reutiliza para rellenar, recortar y trazar.
    // Recorte al viewport + remuestreo más grueso al acercar: lo que más cuesta con la geometría 50m.
    const pr = proj().clipExtent([[-10, -10], [W + 10, H + 10]]).precision(hi ? 0.8 : 0.4)
    const toPath = d3.geoPath(pr)
    const P = g => new Path2D(toPath(g) || '')
    const sphereP = P(sphere), landP = P(GEO.land[hi])

    const glow = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.1)
    glow.addColorStop(0, 'rgba(96,108,56,.22)'); glow.addColorStop(1, 'rgba(96,108,56,0)')
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, 6.283); ctx.fill()
    const oc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R)
    oc.addColorStop(0, '#b9cbc3'); oc.addColorStop(1, '#7f998f')
    ctx.fillStyle = oc; ctx.fill(sphereP)
    ctx.strokeStyle = 'rgba(40,54,24,.08)'; ctx.lineWidth = 0.8; ctx.stroke(P(graticule))
    ctx.fillStyle = '#f3eed6'; ctx.fill(landP)

    if (s) {
      const tl = performance.now()
      renderLayer(s)
      if (import.meta.env.DEV) { const st = (window.__globeStats ||= { n: 0, total: 0, max: 0 }); st.layer = (st.layer || 0) + performance.now() - tl }
      ctx.save()
      const clip = s.meta.clip || 'all'
      if (clip === 'ocean') { const both = new Path2D(); both.addPath(sphereP); both.addPath(landP); ctx.clip(both, 'evenodd') }
      else if (clip === 'land') ctx.clip(landP)
      else ctx.clip(sphereP)
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(off, 0, 0, off.width / SCALE, off.height / SCALE)
      ctx.restore()
    }

    ctx.strokeStyle = 'rgba(96,108,56,.4)'; ctx.lineWidth = 0.6; ctx.stroke(P(GEO.borders[hi]))
    ctx.strokeStyle = 'rgba(40,54,24,.65)'; ctx.lineWidth = 0.9; ctx.stroke(landP)
    const sh = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.2, cx, cy, R)
    sh.addColorStop(0, 'rgba(255,255,255,.14)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(40,54,24,.28)')
    ctx.fillStyle = sh; ctx.fill(sphereP)

    if (!s) return
    const mark = (z, col, label) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.setLineDash([6, 4]); ctx.stroke(P(boxRing(z))); ctx.setLineDash([])
      const q = project(z.lat, z.lon)
      if (q.vis <= 0) return
      const pulse = reduce ? 0 : (performance.now() / 900) % 1
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.globalAlpha = 1 - pulse
      ctx.beginPath(); ctx.arc(q.x, q.y, 6 + pulse * 16, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, 6.283); ctx.fill()
      if (label) {
        ctx.font = '700 12px Figtree, sans-serif'; ctx.textBaseline = 'middle'
        ctx.lineWidth = 3.5; ctx.strokeStyle = '#fefae0'; ctx.strokeText(label, q.x + 9, q.y)
        ctx.fillStyle = '#283618'; ctx.fillText(label, q.x + 9, q.y)
      }
    }
    if (s.otherZone) mark(s.otherZone, '#606c38', shortName(s.otherZone.name))
    if (s.zone) mark(s.zone, '#bc6c25', view.zoom >= 1.6 || s.otherZone ? shortName(s.zone.name) : null)
  }

  let lastKey = ''
  function loop (now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now
    if (onFrame) onFrame(dt)
    if (spin) { view.lon0 = ((view.lon0 - dt * 5 + 540) % 360) - 180; dirty = true; lastMove = now }
    if (fly) {
      const f = Math.min(1, (now - fly.t0) / fly.d), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2
      view.lon0 = fly.lo0 + fly.dlo * e; view.lat0 = fly.la0 + (fly.la1 - fly.la0) * e; view.zoom = fly.z0 + (fly.z1 - fly.z0) * e
      if (f >= 1) fly = null
      dirty = true; lastMove = now
    }
    // Al quedarse quieta la vista, redibuja una vez con la geometría detallada.
    if (!drewHi && view.zoom >= 2 && now - lastMove >= IDLE_MS) dirty = true
    const s = getState()
    if (s && (s.zone || s.otherZone) && !reduce) dirty = true
    // Redibuja si cambia algo del estado que afecte al dibujo.
    const key = s ? `${s.meta.id}|${s.mode}|${s.yearAf}|${s.yearB}|${s.horizon}|${s.warming}|${s.zone?.lat},${s.zone?.lon}|${s.otherZone?.lat},${s.otherZone?.lon}` : 'none'
    if (key !== lastKey) { lastKey = key; dirty = true }
    if (dirty) {
      const t0 = performance.now()
      draw(s); dirty = false
      if (import.meta.env.DEV) { const st = (window.__globeStats ||= { n: 0, total: 0, max: 0 }); const d = performance.now() - t0; st.n++; st.total += d; st.max = Math.max(st.max, d); st.last = d }
    }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const clampLat = la => Math.max(-80, Math.min(80, la))
  return {
    view, project, unproject, resize,
    get reduce () { return reduce },
    clampZoom: z => Math.max(0.8, Math.min(8, z)),
    stopMotion () { spin = false; fly = null },
    /** Rota la vista arrastrando dx, dy píxeles. */
    rotateBy (dx, dy) {
      const R = view.R0 * view.zoom
      view.lon0 = ((view.lon0 - dx / R / D2R + 540) % 360) - 180
      view.lat0 = clampLat(view.lat0 + dy / R / D2R)
      dirty = true; lastMove = performance.now()
    },
    setZoom (z) { view.zoom = Math.max(0.8, Math.min(8, z)); dirty = true; lastMove = performance.now() },
    flyTo (la, lo, zoom) {
      spin = false
      const dlo = ((lo - view.lon0 + 540) % 360) - 180
      fly = { t0: performance.now(), d: reduce ? 1 : 1100, lo0: view.lon0, dlo, la0: view.lat0, la1: Math.max(-75, Math.min(75, la)), z0: view.zoom, z1: Math.max(0.8, Math.min(8, zoom)) }
    },
    markDirty () { dirty = true },
    destroy () { cancelAnimationFrame(raf) }
  }
}
