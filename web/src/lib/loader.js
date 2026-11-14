// Lectura del contrato de datos del pipeline (PLAN §4.6).
// manifest.json se carga una vez; cada variable se carga bajo demanda y se guarda en caché.

const BASE = `${import.meta.env.BASE_URL}data/`
const MISSING = -32768

let manifestPromise = null
const variableCache = new Map()

export function loadManifest () {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}manifest.json`).then(r => {
      if (!r.ok) throw new Error(`No se encontró manifest.json (${r.status}). Corre "python pipeline/mock.py".`)
      return r.json()
    }).catch(err => { manifestPromise = null; throw err })
  }
  return manifestPromise
}

async function fetchBuffer (name) {
  const r = await fetch(BASE + name)
  if (!r.ok) throw new Error(`No se pudo leer ${name} (${r.status})`)
  return r.arrayBuffer()
}

/**
 * Carga una variable.
 * Devuelve { meta, ncell, nyears, values, valid, stats }:
 * - values: Float32Array [cell*nyears + year] con valores reales (NaN = faltante)
 * - valid: Uint8Array por celda (1 si la celda tiene datos)
 * - stats: { sen_per_decade, p_trend, sig_trend, sens_b, p_sens, sig_sens } (Float32Array de ncell)
 */
export function loadVariable (id) {
  if (variableCache.has(id)) return variableCache.get(id)
  const p = (async () => {
    const manifest = await loadManifest()
    const meta = manifest.variables.find(v => v.id === id)
    if (!meta) throw new Error(`Variable desconocida: ${id}`)
    const { nx, ny } = manifest.grid
    const ncell = nx * ny
    const nyears = manifest.years[1] - manifest.years[0] + 1
    const [raw, st] = await Promise.all([fetchBuffer(meta.data), fetchBuffer(meta.stats)])

    const ints = new Int16Array(raw) // little-endian en todas las plataformas web actuales
    if (ints.length !== ncell * nyears) throw new Error(`${meta.data}: tamaño inesperado`)
    const values = new Float32Array(ints.length)
    const valid = new Uint8Array(ncell)
    for (let k = 0; k < ints.length; k++) {
      const q = ints[k]
      if (q === MISSING) values[k] = NaN
      else { values[k] = q * meta.scale + meta.offset; valid[(k / nyears) | 0] = 1 }
    }

    const floats = new Float32Array(st)
    const fields = manifest.stats_fields
    if (floats.length !== ncell * fields.length) throw new Error(`${meta.stats}: tamaño inesperado`)
    const stats = Object.fromEntries(fields.map((f, i) => [f, floats.subarray(i * ncell, (i + 1) * ncell)]))

    return { meta, ncell, nyears, values, valid, stats }
  })()
  p.catch(() => variableCache.delete(id))
  variableCache.set(id, p)
  return p
}

export function loadDiscover () {
  return fetch(`${BASE}discover.json`).then(r => (r.ok ? r.json() : { changes: [], contrasts: [] }))
}

// ---- Geometría de la grilla ----
export const latOf = (grid, i) => grid.lat0 - grid.res * i
export const lonOf = (grid, j) => grid.lon0 + grid.res * j
export function cellOf (grid, lat, lon) {
  const i = Math.min(grid.ny - 1, Math.max(0, Math.floor((90 - lat) / grid.res)))
  const j = ((Math.floor((lon + 180) / grid.res) % grid.nx) + grid.nx) % grid.nx
  return i * grid.nx + j
}
