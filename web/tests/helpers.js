// Carga los datos del mock desde web/public/data con fs (mismo formato que loader.js).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
export const hasData = () => existsSync(join(DATA, 'manifest.json'))
export const manifest = () => JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'))

export function loadVar (M, id) {
  const meta = M.variables.find(v => v.id === id)
  const ncell = M.grid.nx * M.grid.ny, nyears = M.years[1] - M.years[0] + 1
  const raw = readFileSync(join(DATA, meta.data))
  const ints = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  const values = new Float32Array(ints.length), valid = new Uint8Array(ncell)
  for (let k = 0; k < ints.length; k++) {
    if (ints[k] === -32768) values[k] = NaN
    else { values[k] = ints[k] * meta.scale + meta.offset; valid[(k / nyears) | 0] = 1 }
  }
  const st = readFileSync(join(DATA, meta.stats))
  const fl = new Float32Array(st.buffer.slice(st.byteOffset, st.byteOffset + st.byteLength))
  const stats = Object.fromEntries(M.stats_fields.map((f, i) => [f, fl.subarray(i * ncell, (i + 1) * ncell)]))
  return { meta, ncell, nyears, values, valid, stats }
}

/** RNG reproducible (mulberry32 + Box-Muller) para series de prueba. */
export function rng (seed) {
  let a = seed
  const u = () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  const g = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()) }
  return { u, g }
}
