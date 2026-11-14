// Proyección estadística de la tendencia (PLAN §5). Porta `fitLine`, `predict`, `hindcast`
// y `timeToDetect` del prototipo. No es un modelo climático.
import { trendStats, median, Phi } from './stats.js'

const clampPhi = r => Math.max(0, Math.min(0.9, r))

/** Ajusta la recta de Sen con intercepto mediano. sig = tendencia con p < 0.05 (TFPW). */
export function fitLine (y) {
  const n = y.length, r = trendStats(Float64Array.from(y), true)
  const icpt = median(Array.from(y, (v, t) => v - r.slope * t))
  let mean = 0
  for (let t = 0; t < n; t++) mean += y[t]
  mean /= n
  return { n, slope: r.slope, icpt, sd: r.sdRes, phi: clampPhi(r.r1), sig: r.p < 0.05, mean, p: r.p }
}

/** Predicción para el índice de año t (0 = primer año) con rango del 80 %. */
export function predict (F, t) {
  const infl = (1 + F.phi) / (1 - F.phi), tbar = (F.n - 1) / 2, sxx = F.n * (F.n * F.n - 1) / 12
  let m, sd
  if (F.sig) {
    m = F.icpt + F.slope * t
    sd = Math.sqrt(F.sd * F.sd * (1 + infl / F.n) + (t - tbar) ** 2 * F.sd * F.sd / sxx * infl)
  } else {
    m = F.mean
    sd = Math.sqrt(F.sd * F.sd * (1 + infl / F.n))
  }
  return { m, sd, lo: m - 1.28 * sd, hi: m + 1.28 * sd }
}

/**
 * Rango físico de una variable, para recortar proyecciones y bandas
 * (la recta puede salirse: p. ej. más de 100 % de cobertura de nieve).
 */
export function physicalRange (meta) {
  if (meta.id === 'snow') return [0, 100]
  if (meta.id === 'ndvi') return [-1, 1]
  if (meta.mode === 'pct') return [0, Infinity] // lluvia, humedad, AOD: no negativos
  return [-Infinity, Infinity]
}
export function clampPrediction (p, meta) {
  const [a, b] = physicalRange(meta), c = x => Math.max(a, Math.min(b, x))
  return { ...p, m: c(p.m), lo: c(p.lo), hi: c(p.hi) }
}

/** Probabilidad de que el año t quede por encima de lo normal (media del período). */
export function probAbove (F, t) {
  const p = predict(F, t)
  return 1 - Phi((F.mean - p.m) / p.sd)
}

/** Prueba con el pasado: entrena con los primeros n−k años y predice los k últimos. */
export function hindcast (y, k = 5) {
  const F = fitLine(Array.from(y).slice(0, y.length - k))
  let inside = 0, eM = 0, eC = 0
  for (let t = y.length - k; t < y.length; t++) {
    const p = predict(F, t)
    if (y[t] >= p.lo && y[t] <= p.hi) inside++
    eM += Math.abs(y[t] - p.m)
    eC += Math.abs(y[t] - F.mean)
  }
  return { inside, k, gain: eC > 0 ? (1 - eM / eC) * 100 : 0, sig: F.sig }
}

/**
 * Años de datos necesarios para detectar la tendencia (Weatherhead et al. 1998):
 * n* = [3.3·σ/|ω| · √((1+φ)/(1−φ))]^(2/3), con ω = pendiente por año.
 * r = salida de trendStats.
 */
export function timeToDetect (r) {
  const w = Math.abs(r.slope)
  if (w < 1e-12) return Infinity
  const phi = clampPhi(r.r1)
  return Math.pow(3.3 * r.sdRes / w * Math.sqrt((1 + phi) / (1 - phi)), 2 / 3)
}
