// Validación del análisis de eventos (PLAN_FASE3 §7, H7). Lee web/public/data y escribe docs/VALIDATION.md.
//
//   node scripts/validate.mjs        (o npm run validate)        → falla (exit 1) si los placebos superan el 10 %
//
// 1. Placebo temporal: en los eventos con ≥ 10 años previos se aplica el análisis con años falsos
//    (2008–2011) usando solo los datos anteriores al evento real (y a su año excluido, `skip`).
// 2. Sensibilidad: línea base de 4 años vs la de 6 años del análisis.
// 3. Verificación con GLDAS (events/{id}.json → verify): ¿coincide la dirección del cambio tras el evento
//    entre la variable de la UI y la serie independiente? (lluvia: IMERG vs GLDAS; temperatura: LST vs piel GLDAS).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyzeEvent, analyzeVar } from '../src/lib/event.js'
import { isNum, mean } from '../src/lib/stats.js'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(WEB, 'public', 'data')
const read = p => JSON.parse(readFileSync(join(DATA, p), 'utf8'))
const M = read('manifest.json')
const Y0 = M.years[0], VARS = M.variables
const S = Object.fromEntries(M.events.map(e => [e.id, read(e.series)]))
const synth = v => v.synthetic ?? M.synthetic
const tag = v => `${v.short}${synth(v) ? ' (simulada)' : ''}`
const pct = (a, b) => (b ? `${Math.round(100 * a / b)} %` : '—')
const lines = []
const out = s => lines.push(s)

out('# Validación del análisis de eventos')
out('')
out(`Generado por \`web/scripts/validate.mjs\` el ${new Date().toISOString().slice(0, 10)} con los datos de \`web/public/data\`.`)
out(M.synthetic ? `\n> ⚠ El manifest tiene variables **simuladas**: ${VARS.filter(synth).map(v => v.short).join(', ') || '—'}. Sus resultados solo prueban el método, no la realidad.\n` : '')

// ---------------------------------------------------------------- 1. placebo
const FAKE = [2008, 2009, 2010, 2011]
let nTests = 0, nSig = 0
const byVar = Object.fromEntries(VARS.map(v => [v.id, { n: 0, sig: 0 }]))
const rows = []
for (const ev of M.events) {
  const teReal = ev.year - Y0, cut = teReal - (ev.skip || 0)  // índices [0, cut) son anteriores al evento
  if (cut < 10) continue
  for (const fy of FAKE) {
    const fte = fy - Y0
    if (fte + 3 > cut) continue  // al menos 3 años tras el año falso
    const series = Object.fromEntries(Object.entries(S[ev.id].series).map(([k, s]) => [k, { event: s.event.slice(0, cut), control: s.control.slice(0, cut) }]))
    const A = analyzeEvent({ ...ev, year: fy, skip: 0 }, series, VARS, Y0)
    for (const v of VARS) {
      const r = A.R[v.id]
      if (r.status === 'insufficient') continue
      nTests++; byVar[v.id].n++
      if (r.sig) { nSig++; byVar[v.id].sig++; rows.push(`| ${ev.place} | ${fy} | ${tag(v)} | ${r.status} | ${r.p != null ? r.p.toFixed(3) : '—'} |`) }
    }
  }
}
const rate = nTests ? nSig / nTests : 0
out('## 1. Placebo temporal')
out('')
out(`Eventos con ≥ 10 años previos: ${M.events.filter(e => e.year - Y0 - (e.skip || 0) >= 10).map(e => `${e.place.split(',')[0]} ${e.year}`).join(', ')}. Años falsos: ${FAKE.join(', ')}.`)
out('')
out(`**Falsos positivos: ${nSig} de ${nTests} pruebas (${pct(nSig, nTests)}).** Criterio: ≤ 10 % → ${rate <= 0.1 ? '✅ cumple' : '❌ NO cumple: hay que endurecer el criterio para todos los eventos por igual (PLAN_FASE3 §7) y anotarlo en DECISIONS.md'}.`)
out('')
out('| Variable | Pruebas | Con «cambio significativo» |')
out('|---|---|---|')
for (const v of VARS) out(`| ${tag(v)} | ${byVar[v.id].n} | ${byVar[v.id].sig} (${pct(byVar[v.id].sig, byVar[v.id].n)}) |`)
if (rows.length) { out(''); out('| Evento | Año falso | Variable | Estado | p |'); out('|---|---|---|---|---|'); rows.forEach(r => out(r)) }
out('')

// ---------------------------------------------------------------- 2. sensibilidad
out('## 2. Sensibilidad a la línea base (4 vs 6 años)')
out('')
out('| Evento | Variable | 6 años | 4 años |')
out('|---|---|---|---|')
let nCmp = 0, nChg = 0
for (const ev of M.events) {
  const te = ev.year - Y0, refo = ev.type === 'reforestacion', skip = ev.skip || 0
  for (const v of VARS) {
    const s = S[ev.id].series[v.id]
    if (!s) continue
    const o = { te, refo, rel: !!v.rel, minsd: v.minsd }
    const r6 = analyzeVar(s.event, s.control, { ...o, pre: [Math.max(0, te - 6), te - 1 - skip] })
    const r4 = analyzeVar(s.event, s.control, { ...o, pre: [Math.max(0, te - 4), te - 1 - skip] })
    if (r6.status === 'insufficient' && r4.status === 'insufficient') continue
    nCmp++
    const same = r6.status === r4.status
    if (!same) nChg++
    if (!same) out(`| ${ev.place} | ${tag(v)} | ${r6.status} | ${r4.status} |`)
  }
}
out('')
out(`Cambian de estado ${nChg} de ${nCmp} casos (${pct(nChg, nCmp)}); en la tabla solo aparecen los que cambian.`)
out('')

// ---------------------------------------------------------------- 3. verificación GLDAS
const PAIRS = [['precip', 'gldas_precip'], ['lst', 'gldas_skint']]
out('## 3. Verificación con GLDAS')
out('')
const vrows = []
for (const ev of M.events) {
  const ver = S[ev.id].verify || {}
  const te = ev.year - Y0, pre = [Math.max(0, te - 6), te - 1 - (ev.skip || 0)]
  for (const [vid, gid] of PAIRS) {
    const v = VARS.find(x => x.id === vid), s = S[ev.id].series[vid], g = ver[gid]
    if (!v || !s || !g) continue
    const diff = (E, C, rel) => E.map((x, t) => (isNum(x) && isNum(C[t]) ? (rel ? (x / C[t] - 1) * 100 : x - C[t]) : null))
    const dV = diff(s.event, s.control, v.rel), dG = diff(g.event, g.control, v.rel)
    const post = [te, Math.min(dV.length - 1, te + 2)]
    const aV = mean(dV, post[0], post[1]) - mean(dV, pre[0], pre[1]), aG = mean(dG, post[0], post[1]) - mean(dG, pre[0], pre[1])
    if (!isNum(aV) || !isNum(aG)) continue
    // correlación de las diferencias anuales evento − comparación
    const ok = dV.map((x, t) => isNum(x) && isNum(dG[t]))
    const xs = dV.filter((_, t) => ok[t]), ys = dG.filter((_, t) => ok[t]), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
    let sxy = 0, sxx = 0, syy = 0
    xs.forEach((x, k) => { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) ** 2; syy += (ys[k] - my) ** 2 })
    const r = sxy / Math.sqrt(sxx * syy || 1)
    vrows.push(`| ${ev.place} | ${tag(v)} vs ${g.layer} | ${aV >= 0 ? '+' : '−'} / ${aG >= 0 ? '+' : '−'} | ${Math.sign(aV) === Math.sign(aG) ? '✅' : '❌'} | ${r.toFixed(2)} |`)
  }
}
if (vrows.length) {
  out('Dirección del cambio en los 3 primeros años del evento respecto a la línea base (diferencia evento − comparación).')
  out('La temperatura de piel de GLDAS es otra medida que la LST de MODIS: solo se compara la dirección.')
  out('')
  out('| Evento | Pareja | Dirección (UI / GLDAS) | Coincide | r anual |')
  out('|---|---|---|---|---|')
  vrows.forEach(r => out(r))
} else out('Sin series de verificación en los datos (corre `pipeline/gldas.py aggregate` y `build_events.py`).')
out('')

writeFileSync(join(WEB, '..', 'docs', 'VALIDATION.md'), lines.join('\n'))
console.log(`Placebo: ${nSig}/${nTests} (${pct(nSig, nTests)}) · sensibilidad: ${nChg}/${nCmp} cambian · verificación: ${vrows.length} parejas → docs/VALIDATION.md`)
if (rate > 0.1) process.exit(1)
