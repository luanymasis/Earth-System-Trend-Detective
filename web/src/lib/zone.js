// Media regional ponderada por área (∝ cos(lat)) de una caja lat/lon.
// Porta `cellsIn` + `regionSeries` del prototipo. Sin imports: la usan el mock (Node) y la validación.
// Ya no la usa la interfaz (Fase 3 §2).

const D2R = Math.PI / 180

/**
 * Celdas válidas de la grilla dentro de la caja.
 * grid = { res, lat0, lon0, nx, ny } (lat0/lon0 = centro de la primera fila/columna, fila 0 al norte)
 * box = { la0, la1, lo0, lo1 }. La longitud se compara respecto al centro de la caja (sirve si cruza ±180°).
 */
export function cellsInBox (valid, grid, box) {
  const { nx, ny, res, lat0, lon0 } = grid
  const loc = (box.lo0 + box.lo1) / 2, half = (box.lo1 - box.lo0) / 2
  const out = []
  for (let i = 0; i < ny; i++) {
    const la = lat0 - res * i
    if (la < box.la0 || la > box.la1) continue
    for (let j = 0; j < nx; j++) {
      const d = ((lon0 + res * j - loc + 540) % 360) - 180
      if (Math.abs(d) > half) continue
      const c = i * nx + j
      if (valid[c]) out.push(c)
    }
  }
  return out
}

/**
 * Serie anual de la caja. v = { values: [cell*nyears + t] (NaN = faltante), valid, nyears }.
 * Un año sin ninguna celda con dato queda en null; con algunas, se renormalizan los pesos.
 * Devuelve { y: (number|null)[], k: nº de celdas, area: km² } o null si la caja no tiene celdas.
 */
export function boxSeries (v, grid, box) {
  const cs = cellsInBox(v.valid, grid, box)
  if (!cs.length) return null
  const n = v.nyears, sum = new Float64Array(n), wsum = new Float64Array(n)
  const cellKm = (grid.res * 111.32) ** 2
  let area = 0
  for (const c of cs) {
    const w = cellKm * Math.cos((grid.lat0 - grid.res * Math.floor(c / grid.nx)) * D2R)
    area += w
    for (let t = 0; t < n; t++) {
      const y = v.values[c * n + t]
      if (!Number.isNaN(y)) { sum[t] += w * y; wsum[t] += w }
    }
  }
  const y = Array.from(sum, (s, t) => (wsum[t] > 0 ? s / wsum[t] : null))
  return { y, k: cs.length, area }
}
