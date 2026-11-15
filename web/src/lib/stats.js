// Estadística en el cliente. Tendencias (fase 1): porta `sen`, `mk`, `trendStats`
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

// ---- Fase 3: comparación de períodos (porta lgamma, betacf, ibeta, tPval y welch del prototipo) ----
// Welch 1947. Los años en null (sin dato) se ignoran.

export const isNum = x => x != null && Number.isFinite(x)

/** Media de y[a..b] ignorando nulls (null si no hay ningún valor). */
export function mean (y, a, b) {
  let s = 0, k = 0
  for (let t = a; t <= b; t++) if (isNum(y[t])) { s += y[t]; k++ }
  return k ? s / k : null
}
/** Desviación estándar muestral de y[a..b] ignorando nulls (null si no hay valores). */
export function sdv (y, a, b) {
  const m = mean(y, a, b)
  if (m === null) return null
  let s = 0, k = 0
  for (let t = a; t <= b; t++) if (isNum(y[t])) { s += (y[t] - m) ** 2; k++ }
  return Math.sqrt(s / Math.max(1, k - 1))
}
/** Número de valores válidos en y[a..b]. */
export const count = (y, a, b) => { let k = 0; for (let t = a; t <= b; t++) if (isNum(y[t])) k++; return k }

export function lgamma (z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < 9; i++) x += c[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
function betacf (a, b, x) {
  const FP = 1e-300
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - qab * x / qap
  if (Math.abs(d) < FP) d = FP
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP
    c = 1 + aa / c; if (Math.abs(c) < FP) c = FP
    d = 1 / d; h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP
    c = 1 + aa / c; if (Math.abs(c) < FP) c = FP
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-12) break
  }
  return h
}
/** Beta incompleta regularizada I_x(a, b). */
export function ibeta (a, b, x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b
}
/** p bilateral de una t de Student con df grados de libertad. */
export const tPval = (t, df) => ibeta(df / 2, 0.5, df / (df + t * t))

/**
 * Welch: ¿la media de y[b0..b1] difiere de la de y[a0..a1]?
 * Devuelve { mA, mB, d, p } o null si algún período no tiene datos.
 */
export function welch (y, a0, a1, b0, b1) {
  const A = [], B = []
  for (let t = a0; t <= a1; t++) if (isNum(y[t])) A.push(y[t])
  for (let t = b0; t <= b1; t++) if (isNum(y[t])) B.push(y[t])
  const nA = A.length, nB = B.length
  if (!nA || !nB) return null
  const mA = A.reduce((s, x) => s + x, 0) / nA, mB = B.reduce((s, x) => s + x, 0) / nB
  let vA = 0, vB = 0
  for (const x of A) vA += (x - mA) ** 2
  for (const x of B) vB += (x - mB) ** 2
  vA /= Math.max(1, nA - 1); vB /= Math.max(1, nB - 1)
  const se2 = vA / nA + vB / nB, d = mB - mA
  if (se2 <= 1e-12) return { mA, mB, d, p: Math.abs(d) > 1e-9 ? 0 : 1 }
  const tt = d / Math.sqrt(se2)
  const df = se2 * se2 / ((vA / nA) ** 2 / Math.max(1, nA - 1) + (vB / nB) ** 2 / Math.max(1, nB - 1))
  return { mA, mB, d, p: tPval(Math.abs(tt), Math.max(1, df)) }
}
