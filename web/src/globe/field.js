// Campo normalizado por celda (x ∈ [-1, 1], positivo = aumenta) y suavizado 3×3.
// Porta `cellVal`, `scaleFor` y `buildField` del prototipo (PLAN §7.2, §7.4).

const cellMeanCache = new WeakMap()

/** Media 2001–2024 de cada celda (ignora años faltantes). Se usa para el % del tooltip. */
export function cellMeans (v) {
  if (!cellMeanCache.has(v)) {
    const { ncell, nyears, values, valid } = v
    const m = new Float32Array(ncell).fill(NaN)
    for (let c = 0; c < ncell; c++) {
      if (!valid[c]) continue
      let s = 0, k = 0
      for (let t = 0; t < nyears; t++) { const y = values[c * nyears + t]; if (!Number.isNaN(y)) { s += y; k++ } }
      if (k) m[c] = s / k
    }
    cellMeanCache.set(v, m)
  }
  return cellMeanCache.get(v)
}

/** Promedio centrado de 3 años (o menos en los bordes); ignora faltantes. */
function mean3 (values, off, t, nyears) {
  const i0 = Math.max(0, t - 1), i1 = Math.min(nyears - 1, t + 1)
  let s = 0, k = 0
  for (let i = i0; i <= i1; i++) { const y = values[off + i]; if (!Number.isNaN(y)) { s += y; k++ } }
  return k ? s / k : NaN
}

/** Escala de color (en unidades de la variable) para el modo activo. */
export function scaleFor (s) {
  const { meta, mode } = s
  if (mode === 'whatif') return meta.vmax * 2.5
  if (mode === 'compare') return meta.vmax * 2
  if (mode === 'trend') return meta.vmax
  return meta.vmax / 10 * (s.horizon - (s.years[0] + s.years[1]) / 2)
}

/**
 * Valor de una celda para el modo activo, en unidades de la variable.
 * Devuelve null si la celda no tiene datos; { x, w } con w = 0 si no es significativo.
 * s = { v, meta, mode, yearAf, yearB, horizon, warming, years }
 */
export function cellValue (s, c) {
  const v = s.v
  if (!v.valid[c]) return null
  if (s.mode === 'compare') {
    const n = v.nyears, off = c * n
    const t0 = Math.floor(s.yearAf), f = s.yearAf - t0
    const a = f > 0 && t0 + 1 < n
      ? mean3(v.values, off, t0, n) * (1 - f) + mean3(v.values, off, t0 + 1, n) * f
      : mean3(v.values, off, t0, n)
    const x = a - mean3(v.values, off, s.yearB, n)
    return Number.isNaN(x) ? null : { x, w: 1 }
  }
  const st = v.stats
  if (s.mode === 'whatif') return st.sig_sens[c] ? { x: st.sens_b[c] * s.warming, w: 1 } : { x: 0, w: 0 }
  if (!st.sig_trend[c]) return { x: 0, w: 0 }
  const sen = st.sen_per_decade[c]
  if (s.mode === 'trend') return { x: sen, w: 1 }
  return { x: sen / 10 * (s.horizon - (s.years[0] + s.years[1]) / 2), w: 1 }
}

export const fieldKeyOf = s => `${s.meta.id}|${s.mode}|${s.yearAf.toFixed(3)}|${s.yearB}|${s.horizon}|${s.warming.toFixed(3)}`

/**
 * Construye el campo suavizado. Devuelve { BV, BA }: valor normalizado y visibilidad por celda.
 * Los buffers se reutilizan entre llamadas.
 */
export function createField (grid) {
  const { nx, ny } = grid, nc = nx * ny
  const FV = new Float32Array(nc), FA = new Float32Array(nc), BV = new Float32Array(nc), BA = new Float32Array(nc)
  let key = ''
  return {
    BV, BA,
    get key () { return key },
    build (s) {
      const k = fieldKeyOf(s)
      if (k === key) return false
      key = k
      const scale = scaleFor(s)
      for (let c = 0; c < nc; c++) {
        const r = cellValue(s, c)
        if (!r) { FV[c] = 0; FA[c] = 0 } else { FV[c] = Math.max(-1, Math.min(1, r.x / scale)); FA[c] = r.w }
      }
      for (let i = 0; i < ny; i++) {
        for (let j = 0; j < nx; j++) {
          let sv = 0, sw = 0, n = 0
          for (let di = -1; di <= 1; di++) {
            const ii = i + di
            if (ii < 0 || ii >= ny) continue
            for (let dj = -1; dj <= 1; dj++) {
              const c = ii * nx + (j + dj + nx) % nx
              const w = (di === 0 && dj === 0) ? 4 : (di === 0 || dj === 0) ? 2 : 1
              sv += w * FA[c] * FV[c]; sw += w * FA[c]; n += w
            }
          }
          const c = i * nx + j
          BV[c] = sw > 0 ? sv / sw : 0
          BA[c] = FA[c] ? Math.max(0.6, sw / n) : sw / n * 0.5
        }
      }
      return true
    },
    invalidate () { key = '' }
  }
}
