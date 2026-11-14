import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitLine, predict, hindcast, timeToDetect, probAbove, clampPrediction } from '../src/lib/forecast.js'
import { trendStats } from '../src/lib/stats.js'
import * as P from './prototype-oracle.js'
import { rng } from './helpers.js'

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`)

function series (seed, b) {
  const { g } = rng(seed)
  return Array.from({ length: 24 }, (_, t) => 5 + b * t + 0.4 * g())
}

test('fitLine, predict y hindcast coinciden con el prototipo', () => {
  for (let s = 0; s < 200; s++) {
    const y = series(s + 1, (s % 7 - 3) * 0.02)
    const F = fitLine(y), O = P.fitLine(y)
    for (const k of ['slope', 'icpt', 'sd', 'phi', 'mean', 'p']) close(F[k], O[k], 1e-12, `fitLine.${k}`)
    assert.equal(F.sig, O.sig)
    for (const t of [10, 24, 29, 34]) {
      const a = predict(F, t), o = P.predict(O, t)
      for (const k of ['m', 'sd', 'lo', 'hi']) close(a[k], o[k], 1e-12, `predict.${k}`)
    }
    const h = hindcast(y), ho = P.hindcast(y)
    assert.equal(h.inside, ho.inside)
    close(h.gain, ho.gain, 1e-9, 'gain')
  }
})

test('predict: sin tendencia usa la media; el rango se ensancha al extrapolar', () => {
  const F = fitLine(series(42, 0))
  if (!F.sig) assert.equal(predict(F, 40).m, F.mean)
  const up = Array.from({ length: 24 }, (_, t) => t * 0.3 + (t % 2 ? 0.1 : -0.1))
  const G = fitLine(up)
  assert.ok(G.sig)
  assert.ok(predict(G, 34).sd > predict(G, 12).sd)
  close(predict(G, 29).m, G.icpt + G.slope * 29, 1e-12, 'm')
  assert.ok(probAbove(G, 24) > 0.99)
})

test('clampPrediction recorta al rango físico', () => {
  const p = { m: 99, sd: 3, lo: 95, hi: 103 }
  assert.deepEqual(clampPrediction(p, { id: 'snow', mode: 'pct' }), { m: 99, sd: 3, lo: 95, hi: 100 })
  assert.equal(clampPrediction({ m: 1, lo: -2, hi: 3 }, { id: 'precip', mode: 'pct' }).lo, 0)
  assert.equal(clampPrediction({ m: -5, lo: -8, hi: -2 }, { id: 't2m', mode: 'abs' }).lo, -8)
})

test('timeToDetect coincide con el prototipo y con la fórmula de Weatherhead', () => {
  for (let s = 0; s < 100; s++) {
    const r = trendStats(series(s + 300, 0.01 * (s % 5)))
    const a = timeToDetect(r), o = P.timeToDetect(r)
    if (Number.isFinite(o)) close(a, o, 1e-12, 'toe'); else assert.equal(a, Infinity)
  }
  // σ = 1, ω = 0.1, φ = 0 (r1 negativo se acota a 0) → 33^(2/3)
  close(timeToDetect({ slope: 0.1, sdRes: 1, r1: -0.2 }), Math.pow(33, 2 / 3), 1e-12, 'manual')
  assert.equal(timeToDetect({ slope: 0, sdRes: 1, r1: 0 }), Infinity)
})
