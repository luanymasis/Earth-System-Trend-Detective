// Lectura del contrato de datos de Fase 3 (PLAN_FASE3 §4).
// manifest.json se carga una vez; las series de cada evento, las teselas y las capas globales
// se cargan bajo demanda y quedan en caché.
import { createGridLayer } from '../globe/field.js'

const BASE = new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI).toString()
const MISSING = -32768

let manifestPromise = null
const cache = new Map() // ruta → Promise
const ready = new Map() // ruta → valor ya cargado

export function loadManifest () {
  if (!manifestPromise) {
    const url = `${BASE}manifest.json`
    manifestPromise = fetch(url, { cache: 'no-store' }).then(async r => {
      const text = await r.text()
      if (!r.ok) throw new Error(`No se encontró manifest.json (${r.status}) en ${url}`)
      try {
        return JSON.parse(text)
      } catch {
        const preview = text.trim().slice(0, 80).replace(/\s+/g, ' ')
        throw new Error(`manifest.json no es JSON válido en ${url}: ${preview}`)
      }
    }).catch(err => { manifestPromise = null; throw err })
  }
  return manifestPromise
}

function once (path, load) {
  if (!cache.has(path)) {
    const p = load().then(v => { ready.set(path, v); return v })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path)
}

async function fetchOk (path) {
  const url = new URL(path, BASE).toString()
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`No se pudo leer ${path} (${r.status}) en ${url}`)
  return r
}

/** events/{id}.json → { id, series: { var: { event, control, n_event, n_control } }, stations } */
export const loadEventSeries = ev => once(ev.series, async () => (await fetchOk(ev.series)).json())

/** Decodifica Int16 [mes][fila][col] a Float32 (NaN = faltante). */
function decode (buf, scale, offset, n) {
  const ints = new Int16Array(buf) // little-endian en todas las plataformas web actuales
  if (ints.length !== n) throw new Error(`Tamaño inesperado (${ints.length} ≠ ${n})`)
  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) out[k] = ints[k] === MISSING ? NaN : ints[k] * scale + offset
  return out
}

/**
 * Capa de datos (FieldSource). desc = { file, grid, scale, offset, wrap }.
 */
export function loadLayer (desc, nmonths) {
  return once(desc.file, async () => {
    const buf = await (await fetchOk(desc.file)).arrayBuffer()
    const { nx, ny } = desc.grid
    return createGridLayer(desc.grid, decode(buf, desc.scale, desc.offset ?? 0, nmonths * nx * ny), nmonths, { wrap: !!desc.wrap })
  })
}
/** La capa si ya terminó de cargar; si no, null. */
export const peekLayer = desc => ready.get(desc.file) ?? null

/** Descriptores de las capas de una variable para un evento: sus teselas y, si existe, la capa global. */
export function layerDescs (manifest, varId, ev) {
  const out = []
  for (const t of ev?.tiles ?? []) {
    const file = t.files?.[varId]
    if (!file) continue
    const enc = t.enc?.[varId] ?? { scale: 1, offset: 0 }
    out.push({ file, grid: t.grid, scale: enc.scale, offset: enc.offset, wrap: false })
  }
  const g = manifest.global?.find(x => x.var === varId)
  if (g) out.push({ file: g.file, grid: g.grid, scale: g.scale, offset: g.offset, wrap: g.grid.nx * g.grid.res >= 359.9 })
  return out
}
