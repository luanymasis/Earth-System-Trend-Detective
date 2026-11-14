import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoneSeries, zoneStats, analyzeSeries, mean3, diffText, boxOf } from '../src/lib/zone.js'
import * as P from './prototype-oracle.js'
import { hasData, manifest, loadVar } from './helpers.js'

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`)
const GUANACASTE = { lat: 10.5, lon: -85.4, name: 'Guanacaste, Costa Rica' }
const skip = !hasData() && 'faltan datos: corre "python pipeline/mock.py"'

test('boxOf: ±4° de latitud y 4°/cos(lat) de longitud (máx. 30°)', () => {
  const b = boxOf({ lat: 60, lon: 0 })
  assert.equal(b.la1 - b.la0, 8)
  close(b.dlo, 8, 1e-12, 'dlo')
  assert.equal(boxOf({ lat: 89, lon: 0 }).dlo, 30)
})

test('mean3 y diffText', () => {
  assert.equal(mean3([1, 2, 3, 4], 0), 1.5)
  assert.equal(mean3([1, 2, 3, 4], 2), 3)
  assert.equal(diffText({ mode: 'pct', fdec: 0 }, 5, 100), '+5,0 %')
  assert.equal(diffText({ mode: 'pct', fdec: 0 }, -25, 100), '−25 %')
  assert.equal(diffText({ mode: 'abs', fdec: 1 }, 0.84, 30), '+0,8 °C')
})

test('zoneSeries: media ponderada por cos(lat) y años faltantes', () => {
  const grid = { nx: 4, ny: 2, res: 2, lat0: 1, lon0: -3 }
  const v = { nyears: 2, valid: new Uint8Array(8), values: new Float32Array(16).fill(NaN) }
  // celda 1 (lat 1, lon −1) y celda 6 (lat −1, lon 1): mismo peso cos(1°)
  v.valid[1] = 1; v.values.set([10, 20], 2)
  v.valid[6] = 1; v.values.set([30, NaN], 12)
  const s = zoneSeries(v, grid, { lat: 0, lon: 0 })
  assert.equal(s.k, 2)
  close(s.y[0], 20, 1e-6, 'año 0 (pesos iguales)')
  close(s.y[1], 20, 1e-6, 'año 1 (solo una celda)')
  assert.equal(zoneSeries(v, grid, { lat: 0, lon: 120 }), null)
})

test('Guanacaste (mock): los números coinciden con el prototipo con la misma serie', { skip }, () => {
  const M = manifest()
  let n = 0
  for (const meta of M.variables) {
    const v = loadVar(M, meta.id)
    const s = zoneSeries(v, M.grid, GUANACASTE)
    if (!s) continue
    n++
    const Z = analyzeSeries(s.y), O = P.placeFromSeries(s.y)
    close(Z.r.slope, O.r.slope, 1e-10, `${meta.id} slope`)
    close(Z.r.p, O.r.p, 1e-10, `${meta.id} p`)
    close(Z.pct, O.pct, 0.01, `${meta.id} pct (±1 %)`)
    close(Z.total, O.total, 1e-9, `${meta.id} total`)
    assert.equal(Z.level, O.level, `${meta.id} level`)
    if (Number.isFinite(O.toe)) close(Z.toe, O.toe, 1e-9, `${meta.id} toe`)
    close(Z.F.icpt, P.fitLine(Array.from(s.y)).icpt, 1e-10, `${meta.id} icpt`)
  }
  assert.ok(n >= 3, `variables con datos en Guanacaste: ${n}`)
})

test('Sen por celda en el cliente coincide con el del pipeline (_stats.bin)', { skip }, () => {
  const M = manifest()
  const v = loadVar(M, 'precip')
  let checked = 0
  for (let c = 0; c < v.ncell && checked < 200; c += 37) {
    if (!v.valid[c]) continue
    const y = Array.from(v.values.subarray(c * v.nyears, (c + 1) * v.nyears))
    if (y.some(Number.isNaN)) continue
    const Z = analyzeSeries(y)
    // Los valores del .bin están cuantizados a Int16 (error ≤ scale/2 por año).
    const tol = v.meta.scale * 20
    assert.ok(Math.abs(Z.r.slope * 10 - v.stats.sen_per_decade[c]) <= tol, `celda ${c}: ${Z.r.slope * 10} vs ${v.stats.sen_per_decade[c]}`)
    checked++
  }
  assert.ok(checked > 50)
})

test('zoneStats memoiza por variable y zona', { skip }, () => {
  const M = manifest()
  const v = loadVar(M, 't2m')
  const a = zoneStats(v, M.grid, GUANACASTE)
  assert.equal(a, zoneStats(v, M.grid, { ...GUANACASTE }))
  assert.ok(a.k >= 4)
})
