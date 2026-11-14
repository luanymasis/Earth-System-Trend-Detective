// Análisis de un evento: impacto, aparición y tiempo de restauración (PLAN_FASE3 §5.1).
// Port exacto de `analyzeEvent` del prototipo (docs/fase3/prototipo-pulso-verde.html), con manejo
// de años sin dato (null). El análisis vive solo aquí; el pipeline no lo duplica.
import { isNum, mean, sdv, count, welch } from './stats.js'

/**
 * Analiza una variable.
 * @param {(number|null)[]} E serie anual del evento
 * @param {(number|null)[]} C serie anual de la región de comparación
 * @param {{ te:number, pre:[number,number], refo:boolean, rel:boolean, minsd:number }} o
 *   te = índice del año del evento; pre = línea base; rel = diferencia en % (precipitación)
 * @returns {object} { status, sig, peak, kpk, onset, rec, est, end, sd0, p, post, a, d, yE, yC }
 *   status: recovered | recovering | persistent | none | effect | noeffect | insufficient
 */
export function analyzeVar (E, C, { te, pre, refo, rel, minsd }) {
  const n = Math.max(E.length, C.length)
  const d = Array.from({ length: n }, (_, t) => (isNum(E[t]) && isNum(C[t]) ? (rel ? (E[t] / C[t] - 1) * 100 : E[t] - C[t]) : null))
  let NT = n
  while (NT > 0 && !isNum(d[NT - 1])) NT--
  const base = { yE: E, yC: C, d, a: null, sig: false, peak: 0, kpk: null, onset: null, rec: null, est: null, end: null, sd0: null, p: null, post: NT - 1 - te }
  if (pre[1] < pre[0] || count(d, pre[0], pre[1]) < 2 || NT - 1 < te || count(d, te, NT - 1) < 1) return { ...base, status: 'insufficient' }

  const m0 = mean(d, pre[0], pre[1]), sd0 = Math.max(minsd, sdv(d, pre[0], pre[1]))
  const a = d.map(x => (isNum(x) ? x - m0 : null))
  let kpk = te
  while (!isNum(a[kpk])) kpk++
  for (let t = kpk + 1; t < NT; t++) if (isNum(a[t]) && Math.abs(a[t]) > Math.abs(a[kpk])) kpk = t
  const peak = a[kpk], post = NT - 1 - te
  const ps = Math.max(te, Math.min(kpk - 1, NT - 3))
  const cmpEnd = refo ? [Math.max(te, NT - 4), NT - 1] : [ps, Math.min(NT - 1, ps + 2)]
  const W = welch(a, pre[0], pre[1], cmpEnd[0], cmpEnd[1])
  const p = W ? W.p : 1

  const ok = x => isNum(x) && Math.abs(x) > 2 * sd0 && Math.sign(x) === Math.sign(peak)
  let onset = null
  for (let t = te; t < NT; t++) if (ok(a[t]) && t < NT - 1 && ok(a[t + 1])) { onset = t - te; break }
  const sig = Math.abs(peak) > 2 * sd0 && (p < 0.05 || onset !== null)
  const end = mean(a, Math.max(te, NT - 3), NT - 1)

  let status = 'none', rec = null, est = null
  if (sig && !refo) {
    const inBand = x => isNum(x) && Math.abs(x) <= sd0
    for (let t = kpk + 1; t < NT; t++) if (inBand(a[t]) && (t === NT - 1 || inBand(a[t + 1]))) { rec = t - te; break }
    if (rec !== null) status = 'recovered'
    else if (kpk > NT - 4) status = 'persistent'
    else {
      // Recta de mínimos cuadrados sobre los últimos años (≥ 4) para estimar cuánto falta.
      const t0 = Math.max(kpk + 1, NT - 4)
      let sx = 0, sy = 0, sxy = 0, sxx = 0, k = 0
      for (let t = t0; t < NT; t++) { if (!isNum(a[t])) continue; sx += t; sy += a[t]; sxy += t * a[t]; sxx += t * t; k++ }
      const slope = k > 1 ? (k * sxy - sx * sy) / (k * sxx - sx * sx) : 0, last = a[NT - 1]
      if (Math.sign(slope) === -Math.sign(peak) && Math.abs(slope) > 1e-9 && Math.abs(last) > sd0) {
        const rem = (Math.abs(last) - sd0) / Math.abs(slope)
        est = post + rem
        status = est <= 60 ? 'recovering' : 'persistent'
      } else status = 'persistent'
    }
  } else if (sig && refo && onset !== null) status = 'effect'
  else status = refo ? 'noeffect' : 'none'

  return { ...base, a, sd0, peak, kpk: kpk - te, sig, p, onset, rec, est, status, end, post }
}

/**
 * Analiza un evento con todas sus variables.
 * @param {{ year:number, skip?:number, type:string }} ev
 * @param {{ [varId:string]: { event:(number|null)[], control:(number|null)[] } }} series
 * @param {{ id:string, rel:boolean, minsd:number }[]} vars
 * @param {number} y0 primer año de las series
 * @returns {{ te:number, pre:[number,number], R: { [varId:string]: object } }}
 */
export function analyzeEvent (ev, series, vars, y0) {
  const te = ev.year - y0, pre = [Math.max(0, te - 6), te - 1 - (ev.skip || 0)], refo = ev.type === 'reforestacion', R = {}
  for (const v of vars) {
    const s = series[v.id]
    R[v.id] = s ? analyzeVar(s.event, s.control, { te, pre, refo, rel: !!v.rel, minsd: v.minsd }) : { status: 'insufficient', sig: false, a: null }
  }
  return { te, pre, R }
}
