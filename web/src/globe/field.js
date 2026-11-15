// Capas de datos del globo (Fase 3 §2): una interfaz común `FieldSource` para la grilla global
// de 1° (precipitación, humedad) y las teselas de 0.1° por región (vegetación, temperatura).
//
//   layer.sample(lat, lon, t) → valor absoluto o NaN
//   layer.anomaly(lat, lon, tf, base, rel) → diferencia con el promedio de la línea base (NaN si no hay)
//   layer.build(s) → campo normalizado y suavizado 3×3 para pintar (porta buildField del prototipo)
//   layer.fieldAt(fi, fj) → { t, a } (posición en la paleta y opacidad) por bilineal, o null
//
// Valores en Float32Array con orden [mes][fila][columna] (fila 0 al norte), NaN = faltante.

/**
 * @param {{ res:number, lat0:number, lon0:number, nx:number, ny:number }} grid centro de la primera fila/columna
 * @param {Float32Array} values
 * @param {number} nmonths
 * @param {{ wrap?: boolean }} opts wrap = la grilla da la vuelta al globo en longitud
 */
export function createGridLayer (grid, values, nmonths, { wrap = false } = {}) {
  const { res, lat0, lon0, nx, ny } = grid, nc = nx * ny
  const latN = lat0 + res / 2, latS = lat0 - res * (ny - 0.5)
  const lonW = lon0 - res / 2, lonE = lon0 + res * (nx - 0.5)
  const FT = new Float32Array(nc), FA = new Float32Array(nc), BT = new Float32Array(nc), BA = new Float32Array(nc)
  let key = ''

  const dlon = lo => (wrap ? ((((lo - lonW) % 360) + 360) % 360) : lo - lonW)
  /** Índices fraccionarios (fila, columna) del punto, referidos a los centros de celda. */
  const frac = (la, lo) => ({ fi: (lat0 - la) / res, fj: dlon(lo) / res - 0.5 })
  const contains = (la, lo) => la <= latN && la >= latS && (wrap || (lo >= lonW && lo <= lonE))
  const cellAt = (la, lo) => {
    if (!contains(la, lo)) return -1
    const i = Math.min(ny - 1, Math.max(0, Math.floor((latN - la) / res)))
    let j = Math.floor(dlon(lo) / res)
    j = wrap ? ((j % nx) + nx) % nx : Math.min(nx - 1, Math.max(0, j))
    return i * nx + j
  }

  /** Diferencia de la celda c en el año fraccionario tf respecto a la media de base = [a, b]. */
  function cellAnom (c, tf, base, rel) {
    const t0 = Math.floor(tf), t1 = Math.min(nmonths - 1, t0 + 1), f = tf - t0
    let v0 = values[t0 * nc + c], v1 = values[t1 * nc + c]
    if (Number.isNaN(v1)) v1 = v0
    if (Number.isNaN(v0)) v0 = v1
    const val = v0 * (1 - f) + v1 * f
    let m = 0, k = 0
    for (let t = base[0]; t <= base[1]; t++) { const y = values[t * nc + c]; if (!Number.isNaN(y)) { m += y; k++ } }
    if (!k || Number.isNaN(val)) return NaN
    m /= k
    return rel ? (val / m - 1) * 100 : val - m
  }

  return {
    grid, wrap, contains,
    sample (la, lo, t) { const c = cellAt(la, lo); return c < 0 ? NaN : values[t * nc + c] },
    anomaly (la, lo, tf, base, rel) { const c = cellAt(la, lo); return c < 0 ? NaN : cellAnom(c, tf, base, rel) },
    get key () { return key },
    /** s = { id, tf, base: [a, b], scale, rel }. Devuelve true si recalculó. */
    build (s) {
      const k = `${s.id}|${s.tf.toFixed(2)}|${s.base}|${s.scale}`
      if (k === key) return false
      key = k
      for (let c = 0; c < nc; c++) {
        const d = cellAnom(c, s.tf, s.base, s.rel)
        if (Number.isNaN(d)) { FA[c] = 0; FT[c] = 0.5; continue }
        const x = Math.max(-1, Math.min(1, d / s.scale))
        FT[c] = (x + 1) / 2
        FA[c] = Math.max(0, Math.min(1, (Math.abs(x) - 0.1) / 0.35))
      }
      for (let i = 0; i < ny; i++) {
        for (let j = 0; j < nx; j++) {
          let sv = 0, sw = 0, n = 0
          for (let di = -1; di <= 1; di++) {
            const ii = i + di
            if (ii < 0 || ii >= ny) continue
            for (let dj = -1; dj <= 1; dj++) {
              let jj = j + dj
              if (wrap) jj = (jj + nx) % nx
              else if (jj < 0 || jj >= nx) continue
              const c = ii * nx + jj, w = (di === 0 && dj === 0) ? 4 : (di === 0 || dj === 0) ? 2 : 1
              sv += w * FA[c] * FT[c]; sw += w * FA[c]; n += w
            }
          }
          const c = i * nx + j
          BT[c] = sw > 0 ? sv / sw : 0.5
          BA[c] = sw / n
        }
      }
      return true
    },
    frac,
    /** Campo suavizado en (fi, fj) por bilineal: { t, a }. */
    fieldAt (fi, fj) {
      let i0 = Math.floor(fi), j0 = Math.floor(fj)
      const di = fi - i0, dj = fj - j0
      const i1 = Math.min(ny - 1, Math.max(0, i0 + 1)); i0 = Math.min(ny - 1, Math.max(0, i0))
      let ja, jb
      if (wrap) { ja = ((j0 % nx) + nx) % nx; jb = (ja + 1) % nx } else { ja = Math.min(nx - 1, Math.max(0, j0)); jb = Math.min(nx - 1, Math.max(0, j0 + 1)) }
      const b = arr => (arr[i0 * nx + ja] * (1 - dj) + arr[i0 * nx + jb] * dj) * (1 - di) + (arr[i1 * nx + ja] * (1 - dj) + arr[i1 * nx + jb] * dj) * di
      return { a: b(BA), t: b(BT) }
    }
  }
}

/** Primera capa que contiene el punto (las teselas van antes que la global). */
export function layerAt (layers, la, lo) {
  for (const L of layers) if (L.contains(la, lo)) return L
  return null
}
