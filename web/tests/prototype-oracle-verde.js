// Oráculo de Fase 3: funciones de docs/fase3/prototipo-pulso-verde.html copiadas TAL CUAL
// (lgamma … welch, mean, sdv, analyzeEvent, empirical). El port de event.js y sim.js debe dar
// exactamente los mismos números con las mismas entradas (como prototype-oracle.js en H3).
// No editar estas funciones: si el prototipo cambia, volver a copiarlas.
/* eslint-disable */
const Y0 = 2001, NT = 24
let MINSD = null, VARS = null, EVENTS = [], CUR = null
const G = {}
// regionSeries del prototipo: aquí devuelve la serie del evento o del control del caso actual.
const regionSeries = (v, box) => ({ y: CUR.series[v.id][box] })

function lgamma(z){ const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < .5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i); const t = z + 7.5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x); }
function betacf(a, b, x){ const FP = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++){ const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
function ibeta(a, b, x){ if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
const tPval = (t, df) => ibeta(df / 2, .5, df / (df + t * t));
// Welch: ¿la media del período B difiere de la del período A?
function welch(y, a0, a1, b0, b1){
  let nA = 0, sA = 0, nB = 0, sB = 0; for (let t = a0; t <= a1; t++){ nA++; sA += y[t]; } for (let t = b0; t <= b1; t++){ nB++; sB += y[t]; }
  const mA = sA / nA, mB = sB / nB; let vA = 0, vB = 0; for (let t = a0; t <= a1; t++) vA += (y[t] - mA) ** 2; for (let t = b0; t <= b1; t++) vB += (y[t] - mB) ** 2;
  vA /= Math.max(1, nA - 1); vB /= Math.max(1, nB - 1); const se2 = vA / nA + vB / nB, d = mB - mA;
  if (se2 <= 1e-12) return { mA, mB, d, p: Math.abs(d) > 1e-9 ? 0 : 1 };
  const tt = d / Math.sqrt(se2), df = se2 * se2 / ((vA / nA) ** 2 / Math.max(1, nA - 1) + (vB / nB) ** 2 / Math.max(1, nB - 1));
  return { mA, mB, d, p: tPval(Math.abs(tt), Math.max(1, df)) };
}
function senSeg(y, i0, i1){ const s = []; for (let i = i0; i <= i1; i++) for (let j = i + 1; j <= i1; j++) s.push((y[j] - y[i]) / (j - i)); s.sort((a, b) => a - b); const m = s.length; return m ? (m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2) : 0; }

const mean = (y, a, b) => { let s = 0; for (let t = a; t <= b; t++) s += y[t]; return s / (b - a + 1); };
const sdv = (y, a, b) => { const m = mean(y, a, b); let s = 0; for (let t = a; t <= b; t++) s += (y[t] - m) ** 2; return Math.sqrt(s / Math.max(1, b - a)); };
function analyzeEvent(ev){
  const te = ev.year - Y0, pre = [Math.max(0, te - 6), te - 1 - (ev.skip || 0)], post = NT - 1 - te, refo = ev.type === 'reforestacion', R = {};
  for (const v of VARS){
    const yE = regionSeries(v, ev.box).y, yC = regionSeries(v, ev.ctrl.box).y;
    const d = v.id === 'precip' ? yE.map((x, t) => (x / yC[t] - 1) * 100) : yE.map((x, t) => x - yC[t]);
    const m0 = mean(d, pre[0], pre[1]), sd0 = Math.max(MINSD[v.id], sdv(d, pre[0], pre[1])), a = d.map(x => x - m0);
    let kpk = te; for (let t = te; t < NT; t++) if (Math.abs(a[t]) > Math.abs(a[kpk])) kpk = t;
    const peak = a[kpk], ps = Math.max(te, Math.min(kpk - 1, NT - 3)), cmpEnd = refo ? [Math.max(te, NT - 4), NT - 1] : [ps, Math.min(NT - 1, ps + 2)];
    const W = welch(a, pre[0], pre[1], cmpEnd[0], cmpEnd[1]);
    let onset = null; for (let t = te; t < NT; t++){ const ok = x => Math.abs(x) > 2 * sd0 && Math.sign(x) === Math.sign(peak); if (ok(a[t]) && t < NT - 1 && ok(a[t + 1])){ onset = t - te; break; } }
    const sig = Math.abs(peak) > 2 * sd0 && (W.p < .05 || onset !== null);
    const end = mean(a, Math.max(te, NT - 3), NT - 1);
    let status = 'none', rec = null, est = null;
    if (sig && !refo){
      for (let t = kpk + 1; t < NT; t++) if (Math.abs(a[t]) <= sd0 && (t === NT - 1 || Math.abs(a[t + 1]) <= sd0)){ rec = t - te; break; }
      if (rec !== null) status = 'recovered';
      else if (kpk > NT - 4) status = 'persistent';
      else { const t0 = Math.max(kpk + 1, NT - 4), n = NT - t0; let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let t = t0; t < NT; t++){ sx += t; sy += a[t]; sxy += t * a[t]; sxx += t * t; }
        const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0, last = a[NT - 1];
        if (Math.sign(slope) === -Math.sign(peak) && Math.abs(slope) > 1e-9 && Math.abs(last) > sd0){ const rem = (Math.abs(last) - sd0) / Math.abs(slope); est = post + rem; status = est <= 60 ? 'recovering' : 'persistent'; }
        else status = 'persistent'; }
    } else if (sig && refo && onset !== null) status = 'effect';
    else status = refo ? 'noeffect' : 'none';
    R[v.id] = { yE, yC, a, sd0, peak, kpk: kpk - te, sig, p: W.p, onset, rec, est, status, end };
  }
  return { te, pre, post, R };
}
function empirical(){
  if (G._emp) return G._emp; const ok = EVENTS.filter(e => e.A), out = {};
  for (const v of VARS){ if (v.id === 'tree') continue; let best = { lag: 0, r: 0, s: 0 };
    for (let lag = 0; lag <= 4; lag++){ let sxy = 0, sxx = 0, syy = 0, n = 0;
      for (const e of ok){ const T = e.A.R.tree.a, Y = e.A.R[v.id].a; for (let t = e.A.te; t < NT; t++){ const x = T[t - lag]; if (x === undefined) continue; sxy += x * Y[t]; sxx += x * x; syy += Y[t] * Y[t]; n++; } }
      const r = sxy / Math.sqrt(sxx * syy || 1); if (Math.abs(r) > Math.abs(best.r)) best = { lag, r, s: sxy / (sxx || 1) }; }
    out[v.id] = best; }
  const slopes = (type, from) => ok.filter(e => e.type === type).map(e => { const a = e.A.R.tree.a, t0 = e.A.te + (from === 'peak' ? e.A.R.tree.kpk : 0), n = NT - t0; if (n < 3) return null; let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let t = t0; t < NT; t++){ sx += t; sy += a[t]; sxy += t * a[t]; sxx += t * t; } return (n * sxy - sx * sy) / (n * sxx - sx * sx); }).filter(x => x !== null).sort((a, b) => a - b);
  const md = a => a.length ? a[Math.floor((a.length - 1) / 2)] : 1;
  out.regen = Math.max(.3, md(slopes('incendio', 'peak'))); out.refo = Math.max(.2, md(slopes('reforestacion', 'start')));
  return G._emp = out;
}

/**
 * Corre el prototipo sobre los eventos del fixture.
 * @returns {{ analyses: object[], emp: object }}
 */
export function runPrototype (fixture) {
  MINSD = fixture.minsd; delete G._emp
  VARS = ['tree', 'lst', 'sm', 'precip'].map(id => ({ id }))
  EVENTS = fixture.events.map(e => ({ ...e, box: 'event', ctrl: { box: 'control' } }))
  for (const ev of EVENTS) { CUR = ev; ev.A = analyzeEvent(ev) }
  return { analyses: EVENTS.map(ev => ({ id: ev.id, A: ev.A })), emp: empirical() }
}
