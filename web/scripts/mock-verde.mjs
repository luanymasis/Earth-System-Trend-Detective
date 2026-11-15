// Datos simulados de Pulso Verde con el contrato de Fase 3 (PLAN_FASE3 §4).
// Porta el motor sintético de docs/fase3/prototipo-pulso-verde.html (EVENTS, VARS, makeSmooth,
// regionSeries, findControl) y escribe web/public/data/ con "synthetic": true.
//
//   node scripts/mock-verde.mjs        (o npm run mock)
//
// El motor trabaja en la grilla de 1.5° del prototipo. A partir de ella:
// - events/{id}.json: series regionales del evento y su comparación (como regionSeries del prototipo)
// - tiles/*.bin: teselas de 0.1° (vegetación y temperatura) por interpolación bilineal
// - global/*.bin: capas de 1° (precipitación y humedad)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { geoContains } from 'd3'
import { feature } from 'topojson-client'
import { boxSeries, cellsInBox } from '../src/lib/zone.js'
import { countryName } from '../src/lib/countries.js'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(WEB, 'public', 'data')
const readJSON = p => JSON.parse(readFileSync(join(WEB, 'node_modules', p), 'utf8'))
const LAND110 = feature(readJSON('world-atlas/land-110m.json'), readJSON('world-atlas/land-110m.json').objects.land)
const COUNTRIES = (t => feature(t, t.objects.countries).features)(readJSON('world-atlas/countries-110m.json'))

// ================= Motor (prototipo) =================
const RES = 1.5, NX = 360 / RES, NYG = 180 / RES, NC = NX * NYG
const Y0 = 2001, Y1 = 2024, NT = Y1 - Y0 + 1
const latOf = i => 90 - RES * (i + 0.5), lonOf = j => -180 + RES * (j + 0.5)
const GRID = { res: RES, lat0: latOf(0), lon0: lonOf(0), nx: NX, ny: NYG }
const D2R = Math.PI / 180

// Máscara de tierra: el prototipo rellena la geometría 110m en un canvas equirectangular de 1440×720.
// Aquí se rasteriza con un barrido por filas (regla nonzero, centro del píxel). La Antártida se omite
// (el motor la trata como tierra al sur de 64°S y no es válida al sur de 58°S).
const MW = 1440, MH = 720, LANDPX = new Uint8Array(MW * MH)
;(() => {
  const edges = []
  const polys = (LAND110.features || [LAND110]).flatMap(f => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates])
  for (const poly of polys) {
    for (const ring of poly) {
      if (Math.max(...ring.map(p => p[1])) < -60) continue
      for (let k = 0; k + 1 < ring.length; k++) {
        const [lo1, la1] = ring[k], [lo2, la2] = ring[k + 1]
        edges.push([(lo1 + 180) / 360 * MW, (90 - la1) / 180 * MH, (lo2 + 180) / 360 * MW, (90 - la2) / 180 * MH])
      }
    }
  }
  for (let y = 0; y < MH; y++) {
    const yc = y + 0.5, xs = []
    for (const [x1, y1, x2, y2] of edges) {
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push([x1 + (yc - y1) / (y2 - y1) * (x2 - x1), y2 > y1 ? 1 : -1])
    }
    xs.sort((a, b) => a[0] - b[0])
    let w = 0
    for (let k = 0; k < xs.length - 1; k++) {
      w += xs[k][1]
      if (w === 0) continue
      const xa = Math.max(0, Math.ceil(xs[k][0] - 0.5)), xb = Math.min(MW - 1, Math.floor(xs[k + 1][0] - 0.5))
      for (let x = xa; x <= xb; x++) LANDPX[y * MW + x] = 1
    }
  }
})()
const isLand = (la, lo) => {
  const x = Math.min(MW - 1, Math.max(0, Math.floor((lo + 180) / 360 * MW))), y = Math.min(MH - 1, Math.max(0, Math.floor((90 - la) / 180 * MH)))
  return LANDPX[y * MW + x] === 1
}
const isGreen = (la, lo) => lo > -74 && lo < -11 && la > 59
/** Punto válido para las capas finas (mismo criterio que VALID del motor, pero en el punto). */
const pointValid = (la, lo) => la > -58 && isLand(la, lo) && !isGreen(la, lo)

const LAND = new Uint8Array(NC), LANDANY = new Uint8Array(NC), GREEN = new Uint8Array(NC)
for (let i = 0; i < NYG; i++) {
  for (let j = 0; j < NX; j++) {
    const la = latOf(i), lo = lonOf(j), c = i * NX + j
    let n = 0
    const S = [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1], [0, -1.2], [0, 1.2], [-1.2, 0], [1.2, 0]]
    for (const [a, b] of S) if (isLand(la + a * RES * 0.4, lo + b * RES * 0.4)) n++
    LAND[c] = (la < -64 || isLand(la, lo)) ? 1 : 0
    LANDANY[c] = (la < -64 || n > 0) ? 1 : 0
    GREEN[c] = (LAND[c] && isGreen(la, lo)) ? 1 : 0
  }
}

function mulberry32 (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function gaussRng (r) { return () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()) } }
const cl = x => Math.max(0, Math.min(1, x))
const ga = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2)
const bl = (la, lo, cla, clo, sla, slo) => { const d = ((lo - clo + 540) % 360) - 180; return Math.exp(-0.5 * (((la - cla) / sla) ** 2 + (d / slo) ** 2)) }
function makeSmooth (seed) {
  const r = mulberry32(seed), comps = []
  for (let k = 0; k < 5; k++) comps.push({ a: (r() * 0.6 + 0.4) / Math.sqrt(k + 1), fx: (1 + Math.floor(r() * 4)) * (r() < 0.5 ? -1 : 1), fy: 1 + Math.floor(r() * 4), ph: r() * 6.283 })
  const norm = Math.sqrt(comps.reduce((s, c) => s + c.a * c.a / 2, 0))
  return (la, lo) => { const x = lo * Math.PI / 180, y = la * Math.PI / 180; let s = 0; for (const c of comps) s += c.a * Math.sin(c.fx * x + 2 * c.fy * y + c.ph); return s / norm }
}
const boxAround = (la, lo, r) => ({ la0: la - r, la1: la + r, lo0: lo - r / Math.cos(la * D2R), lo1: lo + r / Math.cos(la * D2R) })
const cum = rate => { const a = [0]; for (let t = 1; t < NT; t++) a.push(a[t - 1] + rate(t)); return a }

const EVENTS = [
  { id: 'rondonia', type: 'deforestacion', name: 'Pico de deforestación en Rondônia', place: 'Rondônia, Brasil', la: -10.8, lo: -62.8, r: 2.2, year: 2004,
    desc: 'Entre 2003 y 2006 la deforestación en Rondônia alcanzó máximos por la expansión ganadera y de soya. Las áreas taladas en su mayoría no se regeneraron.', real: 'Contexto real; valores simulados.',
    fp: [-10.8, -62.8, 2.2, 2.8], base: 25, treeA: cum(t => { const y = Y0 + t; return y < 2004 ? -0.3 : y <= 2007 ? -3.2 : -0.4 }), ctrl: { name: 'Amazonas, Brasil', la: -4.5, lo: -65 } },
  { id: 'chaco', type: 'deforestacion', name: 'Desmonte ganadero en el Chaco', place: 'Chaco paraguayo', la: -21.7, lo: -60.6, r: 1.8, year: 2008,
    desc: 'Desde 2008 el desmonte para ganadería se aceleró en el Chaco seco paraguayo, con pérdida de bosque persistente.', real: 'Contexto real; valores simulados.',
    fp: [-21.7, -60.6, 1.8, 2], base: 18, treeA: cum(t => { const y = Y0 + t; return y < 2008 ? -0.3 : y <= 2012 ? -2.2 : -0.5 }) },
  { id: 'borneo', type: 'incendio', name: 'Incendios de 2015 en Kalimantan', place: 'Kalimantan, Indonesia', la: 0.5, lo: 114, r: 2.2, year: 2015,
    desc: 'Durante El Niño de 2015, incendios en turberas y bosques arrasaron grandes áreas de Kalimantan. Parte de la vegetación se regenera desde entonces.', real: 'Evento real; valores simulados.',
    fp: [0.5, 114, 2.2, 2.8], base: 0, tree: t => { const y = Y0 + t; return -0.6 * Math.min(t, 14) + (y >= 2015 ? -10 + 1.1 * (y - 2015) : 0) }, ctrl: { name: 'Papúa, Indonesia', la: -4.5, lo: 139 } },
  { id: 'australia', type: 'incendio', name: 'Incendios del "Verano Negro"', place: 'Sureste de Australia', la: -35.8, lo: 149, r: 1.8, year: 2020, skip: 1,
    desc: 'Tras la sequía de 2019, los incendios de 2019–2020 quemaron millones de hectáreas en Nueva Gales del Sur y Victoria. Los eucaliptos rebrotan rápido.', real: 'Evento real; valores simulados.',
    fp: [-35.8, 149, 1.6, 1.9], base: 28, tree: t => { const y = Y0 + t; return y >= 2020 ? Math.min(0, -16 + 2.8 * (y - 2020)) : 0 },
    precip: t => t === 18 ? -0.38 : t === 17 ? -0.18 : 0, temp: t => (t === 18 || t === 19) ? 1.3 : 0, sm: t => t === 18 ? -0.06 : t === 17 ? -0.03 : 0 },
  { id: 'chiquitania', type: 'incendio', name: 'Incendios en la Chiquitanía', place: 'Chiquitanía, Bolivia', la: -16.6, lo: -60.6, r: 1.6, year: 2019,
    desc: 'En 2019 los incendios en el bosque seco chiquitano de Bolivia fueron de los más extensos de su historia.', real: 'Evento real; valores simulados.',
    fp: [-16.6, -60.6, 1.4, 1.6], base: 12, tree: t => { const y = Y0 + t; return y >= 2019 ? Math.min(0, -12 + 2.2 * (y - 2019)) : 0 } },
  { id: 'mata', type: 'reforestacion', name: 'Pacto por la Restauración de la Mata Atlántica', place: 'Mata Atlántica, Brasil', la: -22.6, lo: -45.6, r: 1.8, year: 2009,
    desc: 'En 2009 gobiernos, empresas y ONG lanzaron un pacto para restaurar millones de hectáreas del bosque atlántico.', real: 'Iniciativa real; valores simulados.',
    fp: [-22.6, -45.6, 1.8, 2.2], base: 8, tree: t => { const y = Y0 + t; return y < 2009 ? -0.1 * t : -0.8 + 0.4 * (y - 2009) } },
  { id: 'kp', type: 'reforestacion', name: '"Tsunami de mil millones de árboles"', place: 'Khyber Pakhtunkhwa, Pakistán', la: 34.6, lo: 72.3, r: 1.6, year: 2014,
    desc: 'Entre 2014 y 2017 la provincia de Khyber Pakhtunkhwa plantó y regeneró bosques en cientos de miles de hectáreas.', real: 'Iniciativa real; valores simulados.',
    fp: [34.6, 72.3, 1.4, 1.8], base: 10, tree: t => { const y = Y0 + t; return y >= 2014 ? 0.55 * (y - 2014) : 0 } },
  { id: 'ethiopia', type: 'reforestacion', name: 'Legado Verde de Etiopía', place: 'Tierras altas de Etiopía', la: 9.6, lo: 38.6, r: 1.6, year: 2019,
    desc: 'Desde 2019, la iniciativa Legado Verde moviliza campañas masivas de plantación de árboles en las tierras altas etíopes.', real: 'Iniciativa real; valores simulados.',
    fp: [9.6, 38.6, 1.4, 1.6], base: 6, tree: t => { const y = Y0 + t; return y >= 2019 ? 0.5 * (y - 2019) : 0 } }
]
EVENTS.forEach(ev => { ev.box = boxAround(ev.la, ev.lo, ev.r) })
const zero = () => 0
const fpw = (e, la, lo) => bl(la, lo, e.fp[0], e.fp[1], e.fp[2], e.fp[3])
const DESERT = (la, lo) => Math.max(bl(la, lo, 23, 12, 6, 22), bl(la, lo, 23, 47, 6, 10), bl(la, lo, -25, 133, 7, 11), bl(la, lo, 42, 68, 6, 18), bl(la, lo, 32, -110, 4, 7), bl(la, lo, -23, -69, 4, 3), bl(la, lo, 40, 95, 5, 15))

// Metadata de variables (contrato §4) + etiquetas para la interfaz (product, noun).
const VARS = [
  { id: 'tree', short: 'Vegetación', name: 'Cobertura arbórea', noun: 'la cobertura arbórea', units: '%', unitsCh: 'puntos', rel: false, minsd: 0.6, palette: 'VEGDIV', scale: 14,
    layer: 'tiles', product: 'MODIS VCF (MOD44B), vía AppEEARS', source: { tool: 'AppEEARS', product: 'MOD44B.061', layer: 'Percent_Tree_Cover' }, q: 0.01 },
  { id: 'lst', short: 'Temperatura', name: 'Temperatura de superficie (día)', noun: 'la temperatura de superficie', units: '°C', unitsCh: '°C', rel: false, minsd: 0.12, palette: 'RdBu', scale: 1.5,
    layer: 'tiles', product: 'MODIS LST (MOD11), vía AppEEARS', source: { tool: 'AppEEARS', product: 'MOD11B3.061', layer: 'LST_Day_6km' }, q: 0.01 },
  { id: 'sm', short: 'Humedad', name: 'Humedad del suelo', noun: 'la humedad del suelo', units: 'm³/m³', unitsCh: 'm³/m³', rel: false, minsd: 0.004, palette: 'BrBG', scale: 0.03,
    layer: 'global', product: 'GLDAS Noah (0–10 cm), vía Giovanni', source: { tool: 'Giovanni', product: 'GLDAS_NOAH025_M 2.1', layer: 'SoilMoi0_10cm_inst' }, q: 0.0001 },
  { id: 'precip', short: 'Precipitación', name: 'Precipitación', noun: 'la precipitación', units: 'mm/mes', unitsCh: '%', rel: true, minsd: 2.5, palette: 'BrBG', scale: 25,
    layer: 'global', product: 'GPM IMERG mensual, vía Giovanni', source: { tool: 'Giovanni', product: 'GPM_3IMERGM v07', layer: 'precipitation' }, q: 0.1 }
]

const VALID = new Uint8Array(NC)
for (let i = 0; i < NYG; i++) for (let j = 0; j < NX; j++) { const c = i * NX + j; VALID[c] = (LANDANY[c] && latOf(i) > -58 && !GREEN[c]) ? 1 : 0 }

const D = {}
for (const id of ['tree', 'lst', 'sm', 'precip']) D[id] = new Float32Array(NC * NT)
;(() => {
  const fields = seed => { const out = []; for (let t = 0; t < NT; t++) { const f = makeSmooth(seed * 131 + t * 17 + 5), a = new Float32Array(NC); for (let i = 0; i < NYG; i++) { const la = latOf(i); for (let j = 0; j < NX; j++) a[i * NX + j] = f(la, lonOf(j)) } out.push(a) } return out }
  const NP = fields(3), NT_ = fields(7), NV = fields(11), NN = fields(13)
  const s1 = makeSmooth(21), s2 = makeSmooth(22), s3 = makeSmooth(23), g = gaussRng(mulberry32(99))
  const treeOf = e => e.treeA ? (t => e.treeA[t]) : (e.tree || zero)
  const dT = new Float64Array(NT), L3 = new Float64Array(NT), L6 = new Float64Array(NT)
  for (let i = 0; i < NYG; i++) {
    for (let j = 0; j < NX; j++) {
      const c = i * NX + j
      if (!VALID[c]) continue
      const la = latOf(i), lo = lonOf(j), al = Math.abs(la), des = DESERT(la, lo), n1 = s1(la, lo), n2 = s2(la, lo), n3 = s3(la, lo)
      const ws = EVENTS.map(e => fpw(e, la, lo))
      let T0 = 72 * ga(la, 0, 11) + 48 * ga(al, 57, 9) + 15 * ga(al, 30, 8) - 70 * des + 7 * n1
      EVENTS.forEach((e, k) => { T0 += ws[k] * e.base }); T0 = Math.max(1, Math.min(88, T0))
      const bg = -0.03 * ga(la, 0, 12) * (1 + 0.5 * n2) + 0.04 * ga(la, 60, 8) + 0.12 * bl(la, lo, 30, 112, 6, 8)
      const P0 = Math.max(8, 70 + 160 * ga(la, 5, 9) + 50 * ga(al, 55, 10) - 50 * ga(al, 25, 7) - 60 * des)
      const pTr = 0.3 * bl(la, lo, 13, 0, 4, 18) - 0.3 * bl(la, lo, 39, 15, 6, 22) + 0.1 * n3
      const L0 = 31 - 0.42 * al + 7 * des + 5 * (1 - T0 / 100) * (1 - des), lTr = 0.02 + 0.03 * cl((la - 40) / 40) + 0.008 * n2
      const tw = 0.6 + 0.4 * ga(la, 0, 25)
      // cambio de cobertura y sus versiones con retraso: la humedad responde en ~2-3 años, la lluvia en ~5
      for (let t = 0; t < NT; t++) {
        let tr = 0
        EVENTS.forEach((e, k) => { if (ws[k] >= 0.01) tr += ws[k] * treeOf(e)(t) })
        dT[t] = bg * t + tr
        L3[t] = t ? L3[t - 1] + (dT[t] - L3[t - 1]) / 2.5 : dT[t]
        L6[t] = t ? L6[t - 1] + (dT[t] - L6[t - 1]) / 5 : dT[t]
      }
      for (let t = 0; t < NT; t++) {
        const o = c * NT + t, tc = t - (NT - 1) / 2
        let pe = 0, te = 0, se = 0
        EVENTS.forEach((e, k) => { const w = ws[k]; if (w < 0.01) return; if (e.precip) pe += w * e.precip(t); if (e.temp) te += w * e.temp(t); if (e.sm) se += w * e.sm(t) })
        D.tree[o] = Math.max(0, Math.min(95, T0 + dT[t] + 0.6 * NV[t][c] + 0.25 * g()))
        const P = Math.max(1, P0 + pTr * tc + P0 * (0.08 * NP[t][c] + 0.025 * g()) + P0 * pe + P0 * 0.0016 * L6[t]), pa = (P - P0) / P0
        D.precip[o] = P
        D.lst[o] = L0 + lTr * tc + 0.28 * NT_[t][c] + te - 0.1 * dT[t] * tw
        D.sm[o] = Math.max(0.03, Math.min(0.5, 0.1 + 0.22 * cl(P0 / 220) + 0.06 * pa + se + 0.0013 * L3[t] + 0.006 * NN[t][c]))
      }
    }
  }
})()

const asVar = id => ({ values: D[id], valid: VALID, nyears: NT })
const regionSeries = (id, box) => boxSeries(asVar(id), GRID, box)
const km = (a, b) => { const p1 = a.la * D2R, p2 = b.la * D2R, dl = (b.lo - a.lo) * D2R; return 6371 * Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))) }
const mean = (y, a, b) => { let s = 0; for (let t = a; t <= b; t++) s += y[t]; return s / (b - a + 1) }
const fmtLL = (la, lo) => `${Math.abs(la).toFixed(1)}°${la >= 0 ? 'N' : 'S'}, ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? 'E' : 'O'}`
function nameAt (la, lo) {
  for (const [a, b] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
    const f = COUNTRIES.find(f => geoContains(f, [lo + b, la + a]))
    if (f) return countryName(f)
  }
  return `Zona ${fmtLL(la, lo)}`
}

// Región de comparación (porta findControl del prototipo).
function findControl (ev) {
  if (ev.ctrl) return { name: ev.ctrl.name, la: ev.ctrl.la, lo: ev.ctrl.lo, box: boxAround(ev.ctrl.la, ev.ctrl.lo, ev.r) }
  const te = ev.year - Y0, yE = regionSeries('tree', ev.box).y, cov0 = mean(yE, Math.max(0, te - 4), te - 1), pE = mean(regionSeries('precip', ev.box).y, 0, NT - 1)
  let best = null, bs = 1e9
  for (const relax of [1, 1.6]) {
    for (let la = ev.la - 14; la <= ev.la + 14; la += 1.5) {
      for (let lo = ev.lo - 22; lo <= ev.lo + 22; lo += 1.5) {
        const c = { la, lo }, d = km(ev, c)
        if (d < 250 || d > 2000 * relax) continue
        if (EVENTS.some(e => fpw(e, la, lo) > 0.05)) continue
        const box = boxAround(la, lo, ev.r)
        if (cellsInBox(VALID, GRID, box).length < 4) continue
        const yT = regionSeries('tree', box).y, chg = mean(yT, NT - 5, NT - 1) - mean(yT, 0, 4)
        if (Math.abs(chg) > 1.5 * relax) continue
        const cov = mean(yT, Math.max(0, te - 4), te - 1)
        if (Math.abs(cov - cov0) > 12 * relax) continue
        const pC = mean(regionSeries('precip', box).y, 0, NT - 1)
        if (Math.abs(pC - pE) / pE > 0.35 * relax) continue
        const s = Math.abs(cov - cov0) / 12 + Math.abs(pC - pE) / pE / 0.35 + d / 2000
        if (s < bs) { bs = s; best = { name: nameAt(la, lo), la, lo, box } }
      }
    }
    if (best) break
  }
  return best
}

// ================= Remuestreo a las capas del contrato =================
/** Valor de la grilla de 1.5° en (la, lo) por bilineal sobre celdas válidas (NaN si no hay). */
function sampleGrid (data, t, la, lo) {
  const fi = (90 - la) / RES - 0.5, fj = (lo + 180) / RES - 0.5
  const i0 = Math.floor(fi), j0 = Math.floor(fj), di = fi - i0, dj = fj - j0
  let s = 0, w = 0
  for (const [ii, wi] of [[i0, 1 - di], [i0 + 1, di]]) {
    if (ii < 0 || ii >= NYG) continue
    for (const [jj, wj] of [[j0, 1 - dj], [j0 + 1, dj]]) {
      const c = ii * NX + ((jj % NX) + NX) % NX, ww = wi * wj
      if (!VALID[c] || ww <= 0) continue
      s += ww * data[c * NT + t]; w += ww
    }
  }
  if (w > 1e-9) return s / w
  const ic = Math.min(NYG - 1, Math.max(0, Math.round(fi))), jc = ((Math.round(fj) % NX) + NX) % NX, c = ic * NX + jc
  return VALID[c] ? data[c * NT + t] : NaN
}

const MISSING = -32768
/** Escribe una capa Int16 [year][row][col]. Devuelve los metadatos de la grilla. */
function writeLayer (file, v, grid) {
  const { nx, ny, res, lat0, lon0 } = grid, buf = new Int16Array(NT * ny * nx)
  for (let t = 0; t < NT; t++) {
    for (let r = 0; r < ny; r++) {
      const la = lat0 - res * r
      for (let k = 0; k < nx; k++) {
        const lo = ((lon0 + res * k + 540) % 360) - 180, o = (t * ny + r) * nx + k
        const val = pointValid(la, lo) ? sampleGrid(D[v.id], t, la, lo) : NaN
        buf[o] = Number.isNaN(val) ? MISSING : Math.max(-32767, Math.min(32767, Math.round(val / v.q)))
      }
    }
  }
  writeFileSync(join(OUT, file), Buffer.from(buf.buffer))
  return buf.byteLength
}
const tileGrid = (box, res = 0.1) => {
  const ny = Math.round((box.la1 - box.la0) / res), nx = Math.round((box.lo1 - box.lo0) / res)
  return { res, lat0: +(box.la1 - res / 2).toFixed(4), lon0: +(box.lo0 + res / 2).toFixed(4), nx, ny }
}
const r5 = x => (x == null ? null : Math.round(x * 1e5) / 1e5)
const rbox = b => Object.fromEntries(Object.entries(b).map(([k, x]) => [k, +x.toFixed(3)]))

// ================= Salida =================
rmSync(OUT, { recursive: true, force: true })
for (const d of ['events', 'tiles', 'global']) mkdirSync(join(OUT, d), { recursive: true })
let bytes = 0
const manifestEvents = []
for (const ev of EVENTS) {
  const ctrl = findControl(ev)
  if (!ctrl) throw new Error(`Sin región de comparación para ${ev.id}`)
  const series = {}
  for (const v of VARS) {
    const E = regionSeries(v.id, ev.box), C = regionSeries(v.id, ctrl.box)
    series[v.id] = { event: E.y.map(r5), control: C.y.map(r5), n_event: E.k, n_control: C.k }
  }
  const json = JSON.stringify({ id: ev.id, series, stations: [] })
  writeFileSync(join(OUT, 'events', `${ev.id}.json`), json); bytes += json.length
  const tiles = []
  for (const [region, box, tag] of [['event', ev.box, 'E'], ['control', ctrl.box, 'C']]) {
    const grid = tileGrid(box), files = {}, enc = {}
    for (const v of VARS.filter(v => v.layer === 'tiles')) {
      files[v.id] = `tiles/${ev.id}_${tag}_${v.id}.bin`
      enc[v.id] = { scale: v.q, offset: 0 }
      bytes += writeLayer(files[v.id], v, grid)
    }
    tiles.push({ region, grid, files, enc })
  }
  manifestEvents.push({
    id: ev.id, type: ev.type, name: ev.name, place: ev.place, desc: ev.desc, real: ev.real,
    lat: ev.la, lon: ev.lo, r: ev.r, year: ev.year, skip: ev.skip || 0, box: rbox(ev.box),
    ctrl: { name: ctrl.name, lat: ctrl.la, lon: ctrl.lo, box: rbox(ctrl.box) },
    series: `events/${ev.id}.json`, tiles
  })
  console.log(`${ev.id.padEnd(12)} control: ${ctrl.name} (${ctrl.la.toFixed(1)}, ${ctrl.lo.toFixed(1)})`)
}
const GLOBAL = { res: 1, lat0: 89.5, lon0: -179.5, nx: 360, ny: 180 }
const global = []
for (const v of VARS.filter(v => v.layer === 'global')) {
  const file = `global/${v.id}.bin`
  bytes += writeLayer(file, v, GLOBAL)
  global.push({ var: v.id, grid: GLOBAL, file, scale: v.q, offset: 0 })
}
const manifest = {
  synthetic: true,
  years: [Y0, Y1],
  variables: VARS.map(({ q, ...v }) => ({ ...v, synthetic: true })),
  events: manifestEvents,
  global,
  sources: []
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log(`Listo: web/public/data (${(bytes / 1e6).toFixed(1)} MB)`)
