// Textos del panel de evento en lenguaje cotidiano (PLAN_FASE3 §5.3).
// Port de `plainVar`, `headline`, `spark` e `ICON` del prototipo.
import { cap, fmtA, YRS } from './format.js'
import { dirCol } from './colors.js'

const SVGI = p => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="vertical-align:-3px">${p}</svg>`
export const ICON = {
  tree: SVGI('<path d="M8 1 3 8h3l-3 4h4v3h2v-3h4l-3-4h3z" fill="#3f7a35"/>'),
  lst: SVGI('<rect x="6.5" y="1.5" width="3" height="9" rx="1.5" fill="none" stroke="#b2182b" stroke-width="1.4"/><circle cx="8" cy="12" r="2.6" fill="#b2182b"/>'),
  sm: SVGI('<path d="M8 1.5C6 5 4 7.2 4 10a4 4 0 0 0 8 0c0-2.8-2-5-4-8.5z" fill="#2c7a6e"/>'),
  precip: SVGI('<path d="M4.5 9a3 3 0 0 1 .4-6 4 4 0 0 1 7.3 1.4A2.5 2.5 0 0 1 11.5 9z" fill="#4f7a96"/><path d="M5 11l-1 3M8 11l-1 3M11 11l-1 3" stroke="#4f7a96" stroke-width="1.3"/>')
}

/**
 * Tarjeta de una variable: { main, sub, tone, col? }.
 * tone: good | wait | bad | none (color del borde superior).
 */
export function plainVar (ev, v, r) {
  if (r.status === 'insufficient') return { main: 'Sin datos suficientes', sub: 'Faltan años antes o después del evento', tone: 'none' }
  const refo = ev.type === 'reforestacion', after = r.post, up = x => x > 0
  const verb = x => v.id === 'lst' ? (up(x) ? 'subió' : 'bajó') : (up(x) ? 'aumentó' : 'bajó')
  const amount = x => fmtA(v, x).replace(/^[+−]/, '')
  if (refo) {
    if (r.status === 'effect') return { main: `${verb(r.end)} ${amount(r.end)}`, sub: `Se empezó a notar ${r.onset === 0 ? 'el mismo año' : `al año ${r.onset}`}`, tone: 'good', col: dirCol(v.palette, r.end) }
    return { main: 'Sin cambio claro todavía', sub: after < 7 ? 'Han pasado pocos años desde la plantación' : 'No se nota un efecto en los datos', tone: 'none' }
  }
  if (!r.sig) return { main: 'Sin cambio claro', sub: 'No se alteró de forma notable', tone: 'none' }
  const main = `${verb(r.peak)} ${amount(r.peak)}`
  if (r.status === 'recovered') return { main, sub: `Volvió a la normalidad en ${YRS(r.rec)}`, tone: 'good', col: dirCol(v.palette, r.peak) }
  if (r.status === 'recovering') return { main, sub: `Se está recuperando · faltan ≈ ${YRS(Math.max(1, Math.round(r.est - after)))}`, tone: 'wait', col: dirCol(v.palette, r.peak) }
  return { main, sub: `No se ha recuperado (${YRS(after)} después)`, tone: 'bad', col: dirCol(v.palette, r.peak) }
}

/** Veredicto del evento en una línea. */
export function headline (ev, R, vars) {
  const refo = ev.type === 'reforestacion'
  const nm = ids => ids.map(id => vars.find(v => v.id === id).short.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' y $1')
  const by = st => vars.filter(v => R[v.id]?.status === st).map(v => v.id)
  if (refo) {
    const ef = by('effect')
    if (!ef.length) return 'Todavía no se nota un efecto claro de la reforestación.'
    const rest = vars.filter(v => !ef.includes(v.id)).map(v => v.id)
    return `Tras reforestar, cambió ${nm(ef)}.${rest.length ? ` En ${nm(rest)} aún no se nota un efecto.` : ''}`
  }
  const rec = by('recovered'), wait = by('recovering'), per = by('persistent'), parts = []
  if (rec.length) parts.push(`${cap(nm(rec))} ya ${rec.length > 1 ? 'volvieron' : 'volvió'} a la normalidad`)
  if (wait.length) parts.push(`${nm(wait)} se ${wait.length > 1 ? 'están' : 'está'} recuperando`)
  if (per.length) parts.push(`${nm(per)} no se ${per.length > 1 ? 'han' : 'ha'} recuperado`)
  return parts.length ? cap(parts.join('; ')) + '.' : 'No se detectan alteraciones claras.'
}

/**
 * Minigráfica SVG (string): diferencia con lo normal desde la línea base hasta el último año,
 * franja gris = ±sd0 y línea punteada = año del evento. Los años sin dato cortan la línea.
 */
export function spark (ev, v, r, A) {
  if (!r.a) return ''
  const xs = [], ys = []
  for (let t = A.pre[0]; t < r.a.length; t++) { xs.push(t - A.te); ys.push(r.a[t]) }
  const vals = ys.filter(y => y !== null)
  const w = 150, h = 38, lo = Math.min(...vals, -r.sd0), hi = Math.max(...vals, r.sd0)
  const X = x => (x - xs[0]) / ((xs[xs.length - 1] - xs[0]) || 1) * (w - 4) + 2
  const Y = y => 3 + (hi - y) / ((hi - lo) || 1) * (h - 6)
  const segs = [[]]
  xs.forEach((x, i) => { if (ys[i] === null) { if (segs.at(-1).length) segs.push([]) } else segs.at(-1).push(`${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`) })
  const col = r.sig ? dirCol(v.palette, ev.type === 'reforestacion' ? r.end : r.peak) : '#9a9b85'
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true"><rect x="0" y="${Y(r.sd0)}" width="${w}" height="${Math.max(1, Y(-r.sd0) - Y(r.sd0))}" fill="rgba(107,111,82,.13)"/><line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${h}" stroke="#283618" stroke-dasharray="2 2"/>${segs.filter(s => s.length).map(s => `<polyline points="${s.join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`).join('')}</svg>`
}
