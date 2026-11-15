// Paletas semánticas del globo. x ∈ [-1, 1], positivo = aumenta → t = (x+1)/2.
export const PALETTES = {
  RdBu: ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'],
  BrBG: ['#8c510a', '#d8b365', '#f6e8c3', '#f5f5f5', '#c7eae5', '#5ab4ac', '#01665e'],
  PuOr: ['#b35806', '#f1a340', '#fee0b6', '#f7f7f7', '#d8daeb', '#998ec3', '#542788'],
  GnPi: ['#4d9221', '#a1d76a', '#e6f5d0', '#f7f7f7', '#fde0ef', '#e9a3c9', '#c51b7d'],
  // Vegetación (Pulso Verde): pérdida en tierra, ganancia en verde
  VEGDIV: ['#7f2704', '#b5541c', '#dda15e', '#f3eed6', '#a9c47f', '#5b8c3a', '#1f4d2b']
}
const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16))
const RGB = Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.map(hex)]))
const cl = x => Math.max(0, Math.min(1, x))

export function cmap (name, t) {
  const s = RGB[name] || RGB.RdBu
  t = cl(t) * (s.length - 1)
  const k = Math.min(s.length - 2, Math.floor(t)), f = t - k
  return [0, 1, 2].map(q => s[k][q] + (s[k + 1][q] - s[k][q]) * f)
}
export const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
export const colorX = (palette, x) => cmap(palette, (x + 1) / 2)
export const upCol = palette => rgb(colorX(palette, 0.95))
export const downCol = palette => rgb(colorX(palette, -0.95))
export const gradCSS = palette => `linear-gradient(90deg, ${(PALETTES[palette] || PALETTES.RdBu).join(',')})`

const lutCache = new Map()
/** LUT de 256 colores (Uint8Array rgb) para pintar la capa raster. */
export function lut (palette) {
  if (!lutCache.has(palette)) {
    const L = new Uint8Array(256 * 3)
    for (let k = 0; k < 256; k++) {
      const c = colorX(palette, k / 127.5 - 1)
      L[k * 3] = c[0]; L[k * 3 + 1] = c[1]; L[k * 3 + 2] = c[2]
    }
    lutCache.set(palette, L)
  }
  return lutCache.get(palette)
}

/** Tipos de evento: etiqueta y color (prototipo). */
export const TYPES = {
  deforestacion: { l: 'Deforestación', c: '#b5541c' },
  incendio: { l: 'Incendio', c: '#d9480f' },
  reforestacion: { l: 'Reforestación', c: '#3f7a35' }
}
/** Color de la dirección de un cambio en la paleta de la variable (dirCol del prototipo). */
export const dirCol = (palette, d) => rgb(cmap(palette, d > 0 ? 0.95 : 0.05))
