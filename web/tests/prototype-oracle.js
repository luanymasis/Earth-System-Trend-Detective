// Funciones copiadas tal cual de prototipo-referencia.html (solo cambia el estilo de exportación).
// Sirven de oráculo: el port debe dar los mismos números con las mismas entradas.
function erf(x){ const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
const NT = 24;
const SL = new Float64Array(NT * NT), D = new Float64Array(NT), PWB = new Float64Array(NT);
function sen(y, n){ let m = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) SL[m++] = (y[j] - y[i]) / (j - i); const a = SL.subarray(0, m).sort(); return m % 2 ? a[(m - 1) / 2] : (a[m / 2 - 1] + a[m / 2]) / 2; }
function mk(y, n){
  let S = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++){ const d = y[j] - y[i]; S += d > 0 ? 1 : d < 0 ? -1 : 0; }
  const sv = Math.sqrt(n * (n - 1) * (2 * n + 5) / 18), Z = S > 0 ? (S - 1) / sv : S < 0 ? (S + 1) / sv : 0;
  return { S, Z, p: 2 * (1 - Phi(Math.abs(Z))), tau: S / (n * (n - 1) / 2) };
}
export function trendStats(y, n, pw){
  const b = sen(y, n);
  let m = 0; for (let t = 0; t < n; t++){ D[t] = y[t] - b * t; m += D[t]; } m /= n;
  let num = 0, den = 0; for (let t = 0; t < n; t++){ den += (D[t] - m) ** 2; if (t) num += (D[t] - m) * (D[t - 1] - m); }
  const r1 = den > 0 ? num / den : 0, sdRes = Math.sqrt(den / Math.max(1, n - 2));
  let arr = y, nn = n;
  if (pw && r1 > 0){ for (let t = 1; t < n; t++) PWB[t - 1] = D[t] - r1 * D[t - 1] + b * t; arr = PWB; nn = n - 1; }
  const r = mk(arr, nn); r.slope = b; r.r1 = r1; r.n = n; r.sdRes = sdRes; return r;
}
export function timeToDetect(r){
  const w = Math.abs(r.slope); if (w < 1e-12) return Infinity;
  const phi = Math.max(0, Math.min(0.9, r.r1));
  return Math.pow(3.3 * r.sdRes / w * Math.sqrt((1 + phi) / (1 - phi)), 2 / 3);
}
export function fitLine(y){
  const n = y.length, r = trendStats(Float64Array.from(y), n, true);
  const res = y.map((v, t) => v - r.slope * t).sort((a, b) => a - b), icpt = n % 2 ? res[(n - 1) / 2] : (res[n / 2 - 1] + res[n / 2]) / 2;
  const mean = y.reduce((a, b) => a + b, 0) / n, sig = r.p < 0.05;
  return { n, slope: r.slope, icpt, sd: r.sdRes, phi: Math.max(0, Math.min(.9, r.r1)), sig, mean, p: r.p };
}
export function predict(F, t){
  const infl = (1 + F.phi) / (1 - F.phi), tbar = (F.n - 1) / 2, sxx = F.n * (F.n * F.n - 1) / 12;
  if (F.sig){ const m = F.icpt + F.slope * t, sd = Math.sqrt(F.sd * F.sd * (1 + infl / F.n) + (t - tbar) ** 2 * F.sd * F.sd / sxx * infl); return { m, sd, lo: m - 1.28 * sd, hi: m + 1.28 * sd }; }
  const sdc = Math.sqrt(F.sd * F.sd * (1 + infl / F.n)); return { m: F.mean, sd: sdc, lo: F.mean - 1.28 * sdc, hi: F.mean + 1.28 * sdc };
}
export function hindcast(y){
  const k = 5, F = fitLine(y.slice(0, y.length - k)); let inside = 0, eM = 0, eC = 0;
  for (let t = y.length - k; t < y.length; t++){ const p = predict(F, t); if (y[t] >= p.lo && y[t] <= p.hi) inside++; eM += Math.abs(y[t] - p.m); eC += Math.abs(y[t] - F.mean); }
  return { inside, k, gain: eC > 0 ? (1 - eM / eC) * 100 : 0, sig: F.sig };
}
export function threshold(p, alpha, method){
  if (method === 'none') return alpha;
  const ps = []; for (let c = 0; c < p.length; c++) if (!Number.isNaN(p[c])) ps.push(p[c]);
  ps.sort((x, y) => x - y); const m = ps.length; let thr = 0;
  for (let k = 1; k <= m; k++) if (ps[k - 1] <= k / m * alpha) thr = ps[k - 1];
  return thr;
}
// placeAnalysis a partir de la serie ya agregada. El prototipo agrega anomalías y suma `base`;
// aquí la serie es absoluta, así que base = 0 y no se resta la media (Sen y MK no cambian con un desplazamiento).
export function placeFromSeries(y){
  const n = y.length, r = trendStats(Float64Array.from(y), n, true);
  const res = Array.from(y, (val, t) => val - r.slope * t).sort((p, q) => p - q);
  const icpt = n % 2 ? res[(n - 1) / 2] : (res[n / 2 - 1] + res[n / 2]) / 2;
  const start = icpt, end = start + r.slope * (n - 1), total = end - start;
  const pct = total / Math.abs(start) * 100;
  const level = r.p < 0.01 ? 4 : r.p < 0.05 ? 3 : r.p < 0.1 ? 2 : 1;
  return { r, start, end, total, pct, level, toe: timeToDetect(r) };
}
