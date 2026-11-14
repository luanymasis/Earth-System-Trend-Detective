// "¿Qué pasaría si…?" (PLAN_FASE3 §5.2). Port de `empirical` y de la trayectoria de `renderSim`
// del prototipo: se aprende de los eventos analizados cómo responde cada variable a un cambio de
// cobertura arbórea (regresión con retardo de 0–4 años) y a qué ritmo se regenera o crece el bosque.
import { isNum } from './stats.js'

/** Pendiente de mínimos cuadrados de a[t0..] ignorando nulls (null si hay menos de 3 años). */
function olsFrom (a, t0) {
  const NT = a.length
  if (NT - t0 < 3) return null
  let sx = 0, sy = 0, sxy = 0, sxx = 0, k = 0
  for (let t = t0; t < NT; t++) { if (!isNum(a[t])) continue; sx += t; sy += a[t]; sxy += t * a[t]; sxx += t * t; k++ }
  return k > 1 ? (k * sxy - sx * sy) / (k * sxx - sx * sx) : null
}
const median = arr => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 1 }

/**
 * Relaciones empíricas aprendidas de los eventos.
 * @param {{ ev: { type:string }, A: { te:number, R:object } }[]} list eventos con su análisis
 * @param {{ id:string }[]} vars
 * @returns {{ [varId]: { lag, r, s }, regen:number, refo:number, n:number }}
 */
export function empirical (list, vars) {
  const ok = list.filter(x => x.A?.R?.tree?.a)
  const out = { n: ok.length }
  for (const v of vars) {
    if (v.id === 'tree') continue
    let best = { lag: 0, r: 0, s: 0 }
    for (let lag = 0; lag <= 4; lag++) {
      let sxy = 0, sxx = 0, syy = 0
      for (const { A } of ok) {
        const T = A.R.tree.a, Y = A.R[v.id]?.a
        if (!Y) continue
        for (let t = A.te; t < T.length; t++) {
          const x = T[t - lag]
          if (!isNum(x) || !isNum(Y[t])) continue
          sxy += x * Y[t]; sxx += x * x; syy += Y[t] * Y[t]
        }
      }
      const r = sxy / Math.sqrt(sxx * syy || 1)
      if (Math.abs(r) > Math.abs(best.r)) best = { lag, r, s: sxy / (sxx || 1) }
    }
    out[v.id] = best
  }
  const slopes = (type, from) => ok.filter(x => x.ev.type === type)
    .map(({ A }) => olsFrom(A.R.tree.a, A.te + (from === 'peak' ? A.R.tree.kpk : 0)))
    .filter(x => x !== null)
  out.regen = Math.max(0.3, median(slopes('incendio', 'peak')))
  out.refo = Math.max(0.2, median(slopes('reforestacion', 'start')))
  return out
}

/**
 * Trayectoria simulada de cada variable y resumen por tarjeta.
 * @param {{ act: 'deforestacion'|'reforestacion', M:number, regen:boolean }} S
 * @param {ReturnType<typeof empirical>} E
 * @param {{ id:string }[]} vars
 * @param {number} H años simulados después del cambio
 * @returns {{ xs:number[], traj:object, rows: { v, peak, at, when, weak }[] }}
 *   when = años hasta volver a la normalidad (talar con regeneración) o hasta el 80 % del efecto (reforestar)
 */
export function simulate (S, E, vars, H = 20) {
  const defo = S.act === 'deforestacion', tree = []
  for (let k = -2; k <= H; k++) {
    if (k < 0) { tree.push(0); continue }
    tree.push(defo ? Math.min(0, -S.M + (S.regen ? E.regen * k : 0)) : Math.min(S.M, E.refo * (k + 1)))
  }
  const xs = tree.map((_, i) => i - 2), traj = { tree }
  for (const v of vars) {
    if (v.id === 'tree') continue
    const e = E[v.id], tau = 1 + e.lag, y = []
    let cur = 0
    tree.forEach((x, i) => { cur += (e.s * x - cur) / tau; y.push(i < 2 ? 0 : cur) })
    traj[v.id] = y
  }
  const rows = vars.map(v => {
    const y = traj[v.id]
    let ip = 2
    y.forEach((z, i) => { if (Math.abs(z) > Math.abs(y[ip])) ip = i })
    const peak = y[ip], weak = v.id !== 'tree' && Math.abs(E[v.id].r) < 0.3
    let when = null
    if (defo && S.regen) {
      for (let i = ip + 1; i < y.length; i++) if (Math.abs(y[i]) <= Math.abs(peak) * 0.1) { when = xs[i]; break }
    } else if (!defo) {
      const fin = y[y.length - 1]
      for (let i = 2; i < y.length; i++) if (Math.abs(y[i]) >= Math.abs(fin) * 0.8) { when = xs[i]; break }
    }
    return { v, peak, at: xs[ip], when, weak }
  })
  return { xs, traj, rows }
}
