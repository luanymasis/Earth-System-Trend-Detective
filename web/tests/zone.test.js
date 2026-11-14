import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boxSeries, cellsInBox } from '../src/lib/zone.js'

// Grilla de 1° con 3 filas × 4 columnas alrededor de (0, 0).
const grid = { res: 1, lat0: 1, lon0: -1.5, nx: 4, ny: 3 }
const box = { la0: -1, la1: 1, lo0: -1, lo1: 1 }

test('cellsInBox: solo celdas válidas dentro de la caja', () => {
  const valid = new Uint8Array(12).fill(1); valid[5] = 0
  assert.deepEqual(cellsInBox(valid, grid, box), [1, 2, 6, 9, 10])
})

test('boxSeries: media ponderada por cos(lat), años sin datos en null', () => {
  const nyears = 3, values = new Float32Array(12 * nyears).fill(NaN), valid = new Uint8Array(12)
  const put = (c, ys) => { valid[c] = 1; ys.forEach((y, t) => { values[c * nyears + t] = y }) }
  put(1, [1, 1, NaN]) // lat 1
  put(5, [3, NaN, NaN]) // lat 0
  const r = boxSeries({ values, valid, nyears }, grid, box)
  const w1 = Math.cos(Math.PI / 180)
  assert.equal(r.k, 2)
  assert.ok(Math.abs(r.y[0] - (w1 * 1 + 3) / (w1 + 1)) < 1e-12)
  assert.equal(r.y[1], 1)
  assert.equal(r.y[2], null)
  assert.equal(boxSeries({ values, valid: new Uint8Array(12), nyears }, grid, box), null)
})
