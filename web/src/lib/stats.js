// Estadística de tendencias en el cliente (PLAN §4.3, §5). Porta `sen`, `mk`, `trendStats`
// y `threshold` del prototipo; mismas fórmulas que pipeline/stats.py.
// Mann 1945 · Kendall 1975 · Sen 1968 · Yue et al. 2002 (TFPW) · Benjamini & Hochberg 1995.

export function erf (x) {
  const s = Math.sign(x)
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x))
}
export const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2))

const median = a => {
  const s = Float64Array.from(a).sort(), m = s.length
  return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2
}
export { median }

/** Pendiente de Sen: mediana de (y[j]-y[i])/(j-i), i<j. Unidades por paso de tiempo. */
export function sen (y) {
  const n = y.length, sl = new Float64Array(n * (n - 1) / 2)
  let m = 0
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) sl[m++] = (y[j] - y[i]) / (j - i)
  return median(sl)
}

/** Mann-Kendall sin corrección por empates. */
export function mk (y) {
  const n = y.length
  let S = 0
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = y[j] - y[i]; S += d > 0 ? 1 : d < 0 ? -1 : 0 }
  const sv = Math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
  const Z = S > 0 ? (S - 1) / sv : S < 0 ? (S + 1) / sv : 0
  return { S, Z, p: 2 * (1 - Phi(Math.abs(Z))), tau: S / (n * (n - 1) / 2) }
}

/**
 * Tendencia de una serie: Sen + (TFPW) + Mann-Kendall.
 * Devuelve { slope (por año), p, Z, S, tau, r1, sdRes, n }.
 */
export function trendStats (y, prewhiten = true) {
  const n = y.length, b = sen(y), D = new Float64Array(n)
  let m = 0
  for (let t = 0; t < n; t++) { D[t] = y[t] - b * t; m += D[t] }
  m /= n
  let num = 0, den = 0
  for (let t = 0; t < n; t++) { den += (D[t] - m) ** 2; if (t) num += (D[t] - m) * (D[t - 1] - m) }
  const r1 = den > 0 ? num / den : 0
  const sdRes = Math.sqrt(den / Math.max(1, n - 2))
  let arr = y
  if (prewhiten && r1 > 0) {
    arr = new Float64Array(n - 1)
    for (let t = 1; t < n; t++) arr[t - 1] = D[t] - r1 * D[t - 1] + b * t
  }
  return { ...mk(arr), slope: b, r1, n, sdRes }
}

/** Umbral FDR de Benjamini-Hochberg: mayor p_(k) con p_(k) ≤ k/m·α (0 si ninguna). */
export function threshold (p, alpha = 0.05, method = 'fdr') {
  if (method === 'none') return alpha
  const ps = Array.from(p).filter(x => Number.isFinite(x)).sort((a, b) => a - b)
  const m = ps.length
  let thr = 0
  for (let k = 1; k <= m; k++) if (ps[k - 1] <= k / m * alpha) thr = ps[k - 1]
  return thr
}

// Niveles de confianza en lenguaje cotidiano (PLAN §4.5).
export const LEVELS = ['', 'Sin evidencia clara', 'Posible, sin confirmar', 'Seguro', 'Muy seguro']
export const LEVEL_COLORS = ['', '#9a9b85', '#dda15e', '#606c38', '#283618']
export const levelOf = p => (p < 0.01 ? 4 : p < 0.05 ? 3 : p < 0.1 ? 2 : 1)

/** "¿Podría ser casualidad?" en texto. */
export function chanceText (p) {
  if (p < 0.001) return '< 1 en 1,000'
  if (p < 0.1) return `1 en ${Math.round(1 / p)}`
  return `${Math.round(p * 100)} %`
}
