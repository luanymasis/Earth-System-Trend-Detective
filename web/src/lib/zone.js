// Análisis de una zona (PLAN §5). Porta `boxOf`, `placeAnalysis` y `mean3` del prototipo.
// La serie regional es la media ponderada por cos(lat) de los valores absolutos de las celdas
// válidas dentro de la caja (±4° de latitud, ±4°/cos(lat) de longitud).
import { trendStats, median, levelOf } from './stats.js'
import { fitLine, timeToDetect } from './forecast.js'
import { sgn, num } from './format.js'

const D2R = Math.PI / 180

export function boxOf (zone) {
  const dl = 4, dlo = Math.min(30, 4 / Math.cos(zone.lat * D2R))
  return { la0: zone.lat - dl, la1: zone.lat + dl, dlo }
}

/**
 * Serie anual de la zona. v = variable cargada ({ values, valid, nyears }).
 * Años con celdas faltantes se promedian con las disponibles (pesos renormalizados).
 * Devuelve { y: Float64Array, k: nº de celdas } o null si no hay datos.
 */
export function zoneSeries (v, grid, zone) {
  const { nx, ny, res, lat0, lon0 } = grid
  const n = v.nyears, b = boxOf(zone)
  const sum = new Float64Array(n), wsum = new Float64Array(n)
  let k = 0
  for (let i = 0; i < ny; i++) {
    const la = lat0 - res * i
    if (la < b.la0 || la > b.la1) continue
    const w = Math.cos(la * D2R)
    for (let j = 0; j < nx; j++) {
      const lo = lon0 + res * j
      const d = ((lo - zone.lon + 540) % 360) - 180
      if (Math.abs(d) > b.dlo) continue
      const c = i * nx + j
      if (!v.valid[c]) continue
      k++
      const off = c * n
      for (let t = 0; t < n; t++) {
        const y = v.values[off + t]
        if (!Number.isNaN(y)) { sum[t] += w * y; wsum[t] += w }
      }
    }
  }
  if (!k) return null
  const y = new Float64Array(n)
  for (let t = 0; t < n; t++) {
    if (wsum[t] === 0) return null
    y[t] = sum[t] / wsum[t]
  }
  return { y, k }
}

/**
 * Estadísticos de la serie de una zona:
 * { y, n, k, r (trendStats), start, end, total, pct, level, sig, toe, mean, F (fitLine) }
 * start/end: valores de la recta de Sen (intercepto mediano) en el primer y último año.
 */
export function analyzeSeries (yIn, alpha = 0.05) {
  const y = Float64Array.from(yIn), n = y.length
  const r = trendStats(y, true)
  const icpt = median(Array.from(y, (val, t) => val - r.slope * t))
  const start = icpt, end = icpt + r.slope * (n - 1), total = end - start
  let mean = 0
  for (let t = 0; t < n; t++) mean += y[t]
  mean /= n
  return {
    y: Array.from(y), n, r, start, end, total,
    pct: start !== 0 ? total / Math.abs(start) * 100 : 0,
    level: levelOf(r.p), sig: r.p < alpha, toe: timeToDetect(r), mean,
    F: fitLine(y)
  }
}

// Memo por variable (WeakMap: se libera si la variable deja de existir) y zona.
const memo = new WeakMap()
export function zoneStats (v, grid, zone) {
  if (!v || !zone) return null
  if (!memo.has(v)) memo.set(v, new Map())
  const m = memo.get(v), key = `${zone.lat.toFixed(2)}|${zone.lon.toFixed(2)}`
  if (!m.has(key)) {
    const s = zoneSeries(v, grid, zone)
    m.set(key, s ? { ...analyzeSeries(s.y), k: s.k } : null)
  }
  return m.get(key)
}

/** Promedio centrado de 3 años (menos en los bordes) sobre una serie. */
export function mean3 (arr, t) {
  const i0 = Math.max(0, t - 1), i1 = Math.min(arr.length - 1, t + 1)
  let s = 0
  for (let i = i0; i <= i1; i++) s += arr[i]
  return s / (i1 - i0 + 1)
}

/** Diferencia en texto: "+12 %" (modo pct) o "+0,8 °C" (modo abs). */
export function diffText (meta, d, ref) {
  if (meta.mode === 'pct') {
    const p = ref !== 0 ? d / Math.abs(ref) * 100 : 0
    return `${sgn(p)}${num(p, Math.abs(p) < 10 ? 1 : 0)} %`
  }
  return `${sgn(d)}${num(d, meta.fdec)} °C`
}
/** Cambio total de la tendencia de la zona en texto. */
export const changeText = (meta, Z) => diffText(meta, Z.total, Z.start)
