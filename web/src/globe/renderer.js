// Globo ortográfico con d3 + capa raster de datos.
// Porta `draw`, `renderLayer`, `project`, `unproject` y el bucle de animación del prototipo de Pulso Verde:
// capa de diferencias respecto a la línea base del evento, cajas del evento y de la comparación, y marcadores.
import * as d3 from 'd3'
import { feature, mesh } from 'topojson-client'
import land110Topo from 'world-atlas/land-110m.json'
import countries110Topo from 'world-atlas/countries-110m.json'
import { lut, TYPES } from '../lib/colors.js'

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

/** Contorno de una caja lat/lon (pasos de 0.5° para que se curve en el globo). */
function boxRing (b) {
  const r = []
  for (let lo = b.lo0; lo <= b.lo1; lo += 0.5) r.push([lo, b.la0])
  for (let la = b.la0; la <= b.la1; la += 0.5) r.push([b.lo1, la])
  for (let lo = b.lo1; lo >= b.lo0; lo -= 0.5) r.push([lo, b.la1])
  for (let la = b.la1; la >= b.la0; la -= 0.5) r.push([b.lo0, la])
  r.push([b.lo0, b.la0])
  return { type: 'LineString', coordinates: r }
}
const shortName = name => name.split(',')[0].split(' (')[0]

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ getState: () => object|null, onFrame?: (dt:number) => void }} opts
 *   getState devuelve { meta, layers, yearF, base, events, ev, zoomLabels } o null.
 */
export function createGlobe (canvas, { getState, onFrame }) {
  const ctx = canvas.getContext('2d')
  const off = document.createElement('canvas')
  const offx = off.getContext('2d')
  const reduce = reduceMotion()
  const view = { lon0: -78, lat0: 14, zoom: 1, cx: 0, cy: 0, R0: 0, W: 0, H: 0 }
  const IDLE_MS = 200
  let lastMove = 0, drewHi = false
  let spin = false, fly = null, dirty = true, layerKey = '', raf = 0, last = performance.now()

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
    // Deja espacio para la barra de reproducción (abajo).
    const compact = w < 560
    view.cx = w / 2; view.cy = h / 2 - 40
    view.R0 = Math.max(60, Math.min(w * (compact ? 0.44 : 0.40), (h - 170) * 0.5))
    layerKey = ''; dirty = true
  }

  function renderLayer (s) {
    const fs = { id: s.meta.id, tf: s.yearF, base: s.base, scale: s.meta.scale, rel: !!s.meta.rel }
    for (const L of s.layers) L.build(fs)
    const lk = `${s.layers.map(L => L.key).join(';')}|${s.layers.length}|${view.lon0.toFixed(3)}|${view.lat0.toFixed(3)}|${view.zoom.toFixed(4)}|${off.width}x${off.height}`
    if (lk === layerKey) return
    layerKey = lk
    const L = lut(s.meta.palette), layers = s.layers, nl = layers.length
    const w = off.width, h = off.height, img = offx.createImageData(w, h), d = img.data
    if (nl) {
      const R = view.R0 * view.zoom, p0 = view.lat0 * D2R, sp0 = Math.sin(p0), cp0 = Math.cos(p0)
      const x0 = Math.max(0, Math.floor((view.cx - R) * SCALE)), x1 = Math.min(w, Math.ceil((view.cx + R) * SCALE))
      const y0 = Math.max(0, Math.floor((view.cy - R) * SCALE)), y1 = Math.min(h, Math.ceil((view.cy + R) * SCALE))
      for (let py = y0; py < y1; py++) {
        const y = view.cy - (py + 0.5) / SCALE
        for (let px = x0; px < x1; px++) {
          const x = (px + 0.5) / SCALE - view.cx, rho = Math.sqrt(x * x + y * y)
          if (rho >= R) continue
          const sc = rho / R, cc = Math.sqrt(1 - sc * sc)
          const la = rho < 1e-6 ? view.lat0 : Math.asin(cc * sp0 + y * sc * cp0 / rho) / D2R
          let lo = view.lon0 + Math.atan2(x * sc, rho * cc * cp0 - y * sc * sp0) / D2R
          lo = ((lo + 540) % 360) - 180
          let layer = null
          for (let k = 0; k < nl; k++) if (layers[k].contains(la, lo)) { layer = layers[k]; break }
          if (!layer) continue
          const { fi, fj } = layer.frac(la, lo), f = layer.fieldAt(fi, fj)
          if (f.a < 0.03) continue
          const k = Math.max(0, Math.min(255, Math.round(f.t * 255))), o = (py * w + px) * 4
          d[o] = L[k * 3]; d[o + 1] = L[k * 3 + 1]; d[o + 2] = L[k * 3 + 2]
          d[o + 3] = Math.round(240 * Math.min(1, f.a))
        }
      }
    }
    offx.putImageData(img, 0, 0)
  }

  const label = (t, x, y, col, align = 'center') => {
    ctx.font = '700 12px Figtree, sans-serif'; ctx.textAlign = align; ctx.textBaseline = 'middle'
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#fefae0'; ctx.strokeText(t, x, y)
    ctx.fillStyle = col; ctx.fillText(t, x, y); ctx.textAlign = 'left'
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
      ctx.clip(landP)
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
    const ev = s.ev
    if (ev) {
      ctx.strokeStyle = TYPES[ev.type].c; ctx.lineWidth = 2.6; ctx.stroke(P(boxRing(ev.box)))
      if (ev.ctrl) {
        ctx.strokeStyle = '#3f7a35'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.stroke(P(boxRing(ev.ctrl.box))); ctx.setLineDash([])
        const q = project(ev.ctrl.box.la1, ev.ctrl.lon)
        if (q.vis > 0) label('Comparación: ' + ev.ctrl.name.split(' (')[0], q.x, q.y - 9, '#2f6430')
      }
    }
    for (const e of s.events) {
      const q = project(e.lat, e.lon)
      if (q.vis < 0.1) continue
      ctx.fillStyle = TYPES[e.type].c; ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(q.x, q.y, e === ev ? 7 : 5.5, 0, 6.283); ctx.fill(); ctx.stroke()
      if (e === ev || view.zoom >= 1.5) label(`${shortName(e.place)} · ${e.year}`, q.x + 10, q.y, '#283618', 'left')
    }
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
    // Redibuja si cambia algo del estado que afecte al dibujo.
    const key = s ? `${s.meta.id}|${s.yearF}|${s.base}|${s.ev?.id}|${s.layers.length}` : 'none'
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
