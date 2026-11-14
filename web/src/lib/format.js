// Formato de números y textos en español (prototipo de Pulso Verde).
export const sgn = x => (x > 0 ? '+' : x < 0 ? '−' : '')
export const num = (x, d) => Math.abs(x).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d })
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
export const fmtLL = (la, lo) => `${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'O'}`
/** Unidad de la diferencia evento − comparación: % en la precipitación, unitsCh en las demás (UNIT). */
export const unitOf = v => (v.rel ? '%' : v.unitsCh)
/** Diferencia con signo y unidad (fmtA del prototipo). */
export const fmtA = (v, x) => v.rel
  ? `${sgn(x)}${num(x, 0)} %`
  : `${sgn(x)}${num(x, v.id === 'sm' ? 3 : v.id === 'lst' ? 2 : 1)} ${v.unitsCh}`
/** "1 año" / "3 años" */
export const YRS = n => `${n} ${n === 1 ? 'año' : 'años'}`
