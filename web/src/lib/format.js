// Formato de números y textos en español.
export const sgn = x => (x > 0 ? '+' : x < 0 ? '−' : '')
export const num = (x, d) => Math.abs(x).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d })
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
export const fmtLL = (la, lo) => `${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'O'}`
/** Escala de la leyenda en texto: "6,0 mm/mes" */
export const fmtScale = (meta, s) => `${num(s, meta.dec > 2 ? meta.dec - 1 : 1)} ${meta.units}`
