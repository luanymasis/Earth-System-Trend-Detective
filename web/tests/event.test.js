// Tests de referencia de event.js y sim.js contra docs/fase3/eventos_sinteticos_fixture.json
// (8 eventos × 4 variables del prototipo). PLAN_FASE3 §5.1 y §5.2.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyzeEvent, analyzeVar } from '../src/lib/event.js'
import { empirical, simulate } from '../src/lib/sim.js'
import { welch, mean, sdv } from '../src/lib/stats.js'
import { rng } from './helpers.js'
import { runPrototype } from './prototype-oracle-verde.js'

const FIX = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'fase3', 'eventos_sinteticos_fixture.json'), 'utf8'))
const Y0 = FIX.years[0]
const VARS = ['tree', 'lst', 'sm', 'precip'].map(id => ({ id, rel: id === 'precip', minsd: FIX.minsd[id] }))

// El fixture guarda los números redondeados (5 decimales en general, menos en `est`):
// la tolerancia es la del plan o media unidad del último decimal guardado, lo que sea mayor.
const decimals = x => { const s = String(x); if (s.includes('e-')) return Number(s.split('e-')[1]) + (s.split('e')[0].split('.')[1]?.length ?? 0); return s.split('.')[1]?.length ?? 0 }
function close (a, b, tol, msg) {
  if (b === null) { assert.equal(a, null, msg); return }
  const t = Math.max(tol, 0.5 * 10 ** -decimals(b) + 1e-12)
  assert.ok(Math.abs(a - b) <= t, `${msg}: ${a} vs ${b} (tol ${t})`)
}

const analyses = FIX.events.map(e => ({ ev: e, A: analyzeEvent(e, e.series, VARS, Y0) }))
const PROTO = runPrototype(FIX)

test('el port es idéntico al prototipo con las mismas series (oráculo)', () => {
  PROTO.analyses.forEach(({ id, A: O }, i) => {
    const A = analyses[i].A
    assert.equal(A.te, O.te); assert.deepEqual(A.pre, O.pre)
    for (const v of VARS) {
      const r = A.R[v.id], o = O.R[v.id], tag = `${id}.${v.id}`
      for (const k of ['status', 'kpk', 'onset', 'rec', 'sig']) assert.equal(r[k], o[k], `${tag}.${k}`)
      for (const k of ['peak', 'sd0', 'end', 'p', 'est']) {
        if (o[k] === null) assert.equal(r[k], null, `${tag}.${k}`)
        else assert.ok(Math.abs(r[k] - o[k]) <= 1e-12 * Math.max(1, Math.abs(o[k])), `${tag}.${k}: ${r[k]} vs ${o[k]}`)
      }
      assert.ok(r.a.every((x, t) => Math.abs(x - o.a[t]) < 1e-12), `${tag}.a`)
    }
  })
  const E = empirical(analyses, VARS)
  for (const id of ['lst', 'sm', 'precip']) for (const k of ['lag', 'r', 's']) assert.equal(E[id][k], PROTO.emp[id][k], `emp.${id}.${k}`)
  assert.equal(E.regen, PROTO.emp.regen); assert.equal(E.refo, PROTO.emp.refo)
})

test('analyzeEvent coincide con el prototipo en los 8 eventos × 4 variables', () => {
  let n = 0
  for (const { ev, A } of analyses) {
    for (const v of VARS) {
      const r = A.R[v.id], x = ev.expected[v.id], tag = `${ev.id}.${v.id}`
      for (const k of ['status', 'kpk', 'onset', 'rec', 'sig']) assert.equal(r[k], x[k], `${tag}.${k}`)
      for (const k of ['peak', 'sd0', 'end']) close(r[k], x[k], 1e-4, `${tag}.${k}`)
      // `est` divide por una pendiente y amplifica el redondeo de las series del fixture (hasta ~1 %;
      // persistent con est > 60 años, mucho más). Se exige lo que muestra la interfaz: los mismos años
      // redondeados, o que ambos superen el límite de 60. La igualdad exacta se comprueba con el oráculo.
      if (x.est === null) assert.equal(r.est, null, `${tag}.est`)
      else if (x.est > 60) assert.ok(r.est > 60, `${tag}.est: ${r.est}`)
      else assert.equal(Math.round(r.est), Math.round(x.est), `${tag}.est: ${r.est} vs ${x.est}`)
      // p: el fixture lo calculó con las series sin redondear; con las series guardadas (5 decimales)
      // el prototipo original da hasta ~1e-3 de diferencia (la humedad, ~0,2 m³/m³, es la más sensible).
      // La igualdad exacta del port se comprueba con el oráculo.
      close(r.p, x.p, 2e-3, `${tag}.p`)
      n++
    }
  }
  assert.equal(n, 32)
})

test('empirical (Simular) coincide con el prototipo', () => {
  const E = empirical(analyses, VARS)
  for (const id of ['lst', 'sm', 'precip']) {
    assert.equal(E[id].lag, FIX.empirical[id].lag, `${id}.lag`)
    close(E[id].r, FIX.empirical[id].r, 1e-4, `${id}.r`)
    close(E[id].s, FIX.empirical[id].s, 1e-4, `${id}.s`)
  }
  close(E.regen, FIX.empirical.regen, 1e-4, 'regen')
  close(E.refo, FIX.empirical.refo, 1e-4, 'refo')
  assert.equal(E.n, 8)
})

test('simulate: talar sin regenerar no vuelve; con regeneración sí; reforestar llega al 80 %', () => {
  const E = empirical(analyses, VARS)
  const a = simulate({ act: 'deforestacion', M: 20, regen: false }, E, VARS)
  assert.equal(a.rows.find(r => r.v.id === 'tree').peak, -20)
  assert.ok(a.rows.every(r => r.when === null))
  const b = simulate({ act: 'deforestacion', M: 20, regen: true }, E, VARS)
  assert.ok(b.rows.find(r => r.v.id === 'tree').when > 0)
  const c = simulate({ act: 'reforestacion', M: 5, regen: true }, E, VARS)
  const tr = c.rows.find(r => r.v.id === 'tree')
  assert.equal(tr.peak, 5)
  assert.ok(tr.when !== null && c.traj.tree[c.traj.tree.length - 1] === 5)
  // Con la tasa aprendida (~0,3 puntos/año), 10 puntos no se alcanzan en 20 años.
  assert.ok(simulate({ act: 'reforestacion', M: 10, regen: true }, E, VARS).traj.tree.at(-1) < 10)
  // La temperatura baja al ganar bosque (relación negativa aprendida).
  assert.ok(c.rows.find(r => r.v.id === 'lst').peak < 0)
})

// ---- Años sin dato (null) ----

/** Copia de las series del evento con una fracción de años en null (nunca toda la línea base). */
function withNulls (e, frac, seed) {
  const { u } = rng(seed), out = {}
  for (const v of VARS) {
    out[v.id] = { event: e.series[v.id].event.slice(), control: e.series[v.id].control.slice() }
    for (const k of ['event', 'control']) out[v.id][k] = out[v.id][k].map(x => (u() < frac ? null : x))
  }
  return out
}

test('con 10–20 % de años en null el análisis no falla y devuelve estados válidos', () => {
  const OK = new Set(['recovered', 'recovering', 'persistent', 'none', 'effect', 'noeffect', 'insufficient'])
  let insufficient = 0, total = 0
  for (let s = 0; s < 40; s++) {
    for (const e of FIX.events) {
      const A = analyzeEvent(e, withNulls(e, 0.1 + 0.1 * (s % 2), 1000 + s), VARS, Y0)
      for (const v of VARS) {
        const r = A.R[v.id]
        total++
        assert.ok(OK.has(r.status), `${e.id}.${v.id}: ${r.status}`)
        if (r.status === 'insufficient') { insufficient++; continue }
        for (const k of ['peak', 'sd0', 'p', 'end']) assert.ok(Number.isFinite(r[k]), `${e.id}.${v.id}.${k} = ${r[k]}`)
        if (r.status === 'recovered') assert.ok(r.rec > 0 && Number.isFinite(r.rec))
        if (r.status === 'recovering') assert.ok(r.est > r.post && r.est <= 60)
        if (r.a) assert.ok(r.a.every((x, t) => (x === null) === (r.d[t] === null)), 'a y d tienen los mismos huecos')
      }
    }
  }
  assert.ok(insufficient < total * 0.1, `demasiados insuficientes: ${insufficient}/${total}`)
})

test('un null aislado tras el pico no cuenta como "volvió a la normalidad"', () => {
  const e = FIX.events.find(x => x.id === 'rondonia'), s = e.series.tree
  const E = s.event.slice()
  E[10] = null // Rondônia no se recupera; el hueco no debe parecer recuperación
  const r = analyzeVar(E, s.control, { te: e.year - Y0, pre: [0, 2], refo: false, rel: false, minsd: FIX.minsd.tree })
  assert.equal(r.status, 'persistent')
  assert.equal(r.rec, null)
})

test('sin datos en la línea base o después del evento → insufficient', () => {
  const e = FIX.events.find(x => x.id === 'borneo'), s = e.series.lst, te = e.year - Y0
  const o = { te, pre: [te - 6, te - 1], refo: false, rel: false, minsd: FIX.minsd.lst }
  const E1 = s.event.map((x, t) => (t >= te - 6 && t < te - 1 ? null : x)) // queda 1 año de base
  assert.equal(analyzeVar(E1, s.control, o).status, 'insufficient')
  const E2 = s.event.map((x, t) => (t >= te ? null : x))
  assert.equal(analyzeVar(E2, s.control, o).status, 'insufficient')
  // Último año faltante: el análisis usa el último año con dato.
  const E3 = s.event.slice(); E3[E3.length - 1] = null
  const r3 = analyzeVar(E3, s.control, o)
  assert.notEqual(r3.status, 'insufficient')
  assert.equal(r3.post, s.event.length - 2 - te)
})

test('welch, mean y sdv ignoran null', () => {
  assert.equal(mean([1, null, 3], 0, 2), 2)
  assert.equal(mean([null, null], 0, 1), null)
  assert.ok(Math.abs(sdv([1, null, 3], 0, 2) - Math.SQRT2) < 1e-12)
  assert.equal(welch([1, 2, null, null], 0, 1, 2, 3), null)
  const w = welch([0, 1, 0, 1, 5, 6, 5, 6], 0, 3, 4, 7)
  assert.ok(w.p < 0.001 && w.d === 5)
  assert.deepEqual(welch([0, 1, null, 5, 6, null], 0, 2, 3, 5), welch([0, 1, 5, 6], 0, 1, 2, 3))
})
