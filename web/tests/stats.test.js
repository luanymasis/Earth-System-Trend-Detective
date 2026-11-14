import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sen, mk, trendStats, threshold, levelOf, chanceText, Phi } from '../src/lib/stats.js'
import * as P from './prototype-oracle.js'
import { rng } from './helpers.js'

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`)

test('Phi: valores conocidos', () => {
  close(Phi(0), 0.5, 1e-7, 'Phi(0)')
  close(Phi(1.959964), 0.975, 1e-6, 'Phi(1.96)')
})

test('Sen y MK: tendencia perfecta', () => {
  const y = Array.from({ length: 24 }, (_, t) => 2 + 0.5 * t)
  assert.equal(sen(y), 0.5)
  const r = mk(y)
  assert.equal(r.S, 276)
  assert.equal(r.tau, 1)
  assert.ok(r.p < 0.001)
  assert.ok(trendStats(y).p < 0.001)
})

test('Sen: mediana con número par de pendientes', () => {
  // pendientes: 1, 1.5, 1, 2, 1, 0 → mediana 1
  assert.equal(sen([0, 1, 3, 3]), 1)
})

test('trendStats coincide con el prototipo (500 series aleatorias)', () => {
  const { g, u } = rng(7)
  for (let s = 0; s < 500; s++) {
    const b = (u() - 0.5) * 0.2, phi = u() * 0.8
    const y = new Float64Array(24)
    let e = g()
    for (let t = 0; t < 24; t++) { if (t) e = phi * e + g() * Math.sqrt(1 - phi * phi); y[t] = 10 + b * t + e }
    for (const pw of [true, false]) {
      const a = trendStats(y, pw), o = P.trendStats(Float64Array.from(y), 24, pw)
      for (const k of ['slope', 'p', 'Z', 'S', 'tau', 'r1', 'sdRes']) close(a[k], o[k], 1e-12, `${k} (serie ${s})`)
    }
  }
})

test('MK con TFPW sobre ruido blanco: ~5 % de falsos positivos', () => {
  const { g } = rng(123)
  let hits = 0
  const N = 1000
  for (let s = 0; s < N; s++) {
    const y = Array.from({ length: 24 }, () => g())
    if (trendStats(y).p < 0.05) hits++
  }
  const rate = hits / N
  assert.ok(rate > 0.02 && rate < 0.08, `tasa ${rate}`)
})

test('FDR Benjamini-Hochberg: caso de juguete', () => {
  // m = 5, α = 0.05: umbrales k/m·α = 0.01, 0.02, 0.03, 0.04, 0.05
  assert.equal(threshold([0.001, 0.015, 0.029, 0.2, 0.9]), 0.029)
  assert.equal(threshold([0.02, 0.5, 0.9]), 0) // 0.02 > 1/3·0.05
  assert.equal(threshold([0.04, 0.04, 0.04, 0.04, NaN]), 0.04)
  assert.equal(threshold([0.3], 0.05, 'none'), 0.05)
  const p = [0.001, 0.015, 0.029, 0.2, 0.9, NaN]
  assert.equal(threshold(p), P.threshold(p, 0.05, 'fdr'))
})

test('niveles y texto de casualidad', () => {
  assert.deepEqual([0.005, 0.03, 0.07, 0.4].map(levelOf), [4, 3, 2, 1])
  assert.equal(chanceText(0.0004), '< 1 en 1,000')
  assert.equal(chanceText(0.02), '1 en 50')
  assert.equal(chanceText(0.35), '35 %')
})
