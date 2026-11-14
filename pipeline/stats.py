"""Estadística de tendencias vectorizada (PLAN §4.3).

Mismas fórmulas que el prototipo (`sen`, `mk`, `trendStats`, `threshold`, `regressGT`):
- Pendiente de Sen (Sen 1968)
- Mann-Kendall (Mann 1945; Kendall 1975) sin corrección por empates
- Pre-blanqueo TFPW (Yue et al. 2002)
- FDR de Benjamini-Hochberg (1995)
- Sensibilidad al calentamiento global por OLS con error inflado por AR(1)

Todas las funciones reciben Y con forma (ncell, n). Las celdas con algún NaN
devuelven NaN (el MVP exige series completas).
"""
import numpy as np
from scipy.special import erf

_PAIRS = {}


def _pairs(n):
    if n not in _PAIRS:
        i, j = np.triu_indices(n, k=1)
        _PAIRS[n] = (i, j)
    return _PAIRS[n]


def phi(z):
    return 0.5 * (1 + erf(np.asarray(z) / np.sqrt(2)))


def sen_slope(Y):
    """Mediana de (y[j]-y[i])/(j-i) para i<j. Unidades por paso de tiempo."""
    n = Y.shape[1]
    i, j = _pairs(n)
    return np.median((Y[:, j] - Y[:, i]) / (j - i), axis=1)


def mk_test(Y):
    """Mann-Kendall. Devuelve S, Z, p (dos colas), tau."""
    n = Y.shape[1]
    i, j = _pairs(n)
    S = np.sign(Y[:, j] - Y[:, i]).sum(axis=1)
    sv = np.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    Z = np.where(S > 0, (S - 1) / sv, np.where(S < 0, (S + 1) / sv, 0.0))
    p = 2 * (1 - phi(np.abs(Z)))
    tau = S / (n * (n - 1) / 2)
    return S, Z, p, tau


def trend_stats(Y, prewhiten=True):
    """Tendencia por celda: Sen + (TFPW) + MK.

    Devuelve dict con slope (por año), p, Z, tau, r1 (lag-1 de la serie sin
    tendencia) y sd_res (desviación residual).
    """
    Y = np.asarray(Y, dtype=np.float64)
    ncell, n = Y.shape
    ok = np.all(np.isfinite(Y), axis=1)
    out = {k: np.full(ncell, np.nan) for k in ("slope", "p", "Z", "tau", "r1", "sd_res")}
    if not ok.any():
        return out
    y = Y[ok]
    t = np.arange(n, dtype=np.float64)
    b = sen_slope(y)
    D = y - b[:, None] * t
    Dc = D - D.mean(axis=1, keepdims=True)
    den = (Dc ** 2).sum(axis=1)
    num = (Dc[:, 1:] * Dc[:, :-1]).sum(axis=1)
    r1 = np.where(den > 0, num / np.where(den > 0, den, 1), 0.0)
    sd_res = np.sqrt(den / max(1, n - 2))

    _, Z, p, tau = mk_test(y)
    if prewhiten:
        pw = r1 > 0
        if pw.any():
            Yp = D[pw, 1:] - r1[pw, None] * D[pw, :-1] + b[pw, None] * t[1:]
            _, Zp, pp, taup = mk_test(Yp)
            Z[pw], p[pw], tau[pw] = Zp, pp, taup

    for k, v in (("slope", b), ("p", p), ("Z", Z), ("tau", tau), ("r1", r1), ("sd_res", sd_res)):
        out[k][ok] = v
    return out


def fdr_threshold(p, alpha=0.05):
    """Mayor p_(k) con p_(k) <= k/m * alpha (Benjamini-Hochberg). 0 si ninguna."""
    ps = np.sort(p[np.isfinite(p)])
    m = ps.size
    if m == 0:
        return 0.0
    k = np.arange(1, m + 1)
    passed = ps <= k / m * alpha
    return float(ps[passed].max()) if passed.any() else 0.0


def fdr_mask(p, alpha=0.05):
    thr = fdr_threshold(p, alpha)
    sig = np.zeros(p.shape, dtype=bool)
    if thr > 0:
        f = np.isfinite(p)
        sig[f] = p[f] <= thr
    return sig, thr


def regress_gt(Y, gt):
    """Regresión OLS y ~ GT por celda (pattern scaling).

    b en unidades por °C de calentamiento global. El error estándar se infla
    por sqrt((1+φ)/(1-φ)), con φ = lag-1 de los residuos acotado a [0, 0.9].
    """
    Y = np.asarray(Y, dtype=np.float64)
    gt = np.asarray(gt, dtype=np.float64)
    ncell, n = Y.shape
    ok = np.all(np.isfinite(Y), axis=1)
    b = np.full(ncell, np.nan)
    se = np.full(ncell, np.nan)
    p = np.full(ncell, np.nan)
    if not ok.any():
        return b, se, p
    y = Y[ok]
    g = gt - gt.mean()
    sxx = (g ** 2).sum()
    yc = y - y.mean(axis=1, keepdims=True)
    bb = (yc * g).sum(axis=1) / sxx
    res = yc - bb[:, None] * g
    ss = (res ** 2).sum(axis=1)
    r1n = (res[:, 1:] * res[:, :-1]).sum(axis=1)
    ph = np.clip(np.where(ss > 0, r1n / np.where(ss > 0, ss, 1), 0.0), 0, 0.9)
    s = np.sqrt(ss / (n - 2) / sxx * (1 + ph) / (1 - ph))
    z = np.where(s > 0, bb / np.where(s > 0, s, 1), 0.0)
    b[ok], se[ok], p[ok] = bb, s, 2 * (1 - phi(np.abs(z)))
    return b, se, p


def global_mean_series(cube, valid, weights):
    """Serie anual de la anomalía media ponderada (cube: ncell x n)."""
    w = weights * valid
    anom = cube - np.nanmean(cube, axis=1, keepdims=True)
    anom = np.where(valid[:, None], anom, 0.0)
    return (w[:, None] * anom).sum(axis=0) / w.sum()


def variable_stats(cube, gt, alpha=0.05):
    """Los 6 campos de {id}_stats.bin (PLAN §4.6)."""
    tr = trend_stats(cube, prewhiten=True)
    sig_t, _ = fdr_mask(tr["p"], alpha)
    b, _, ps = regress_gt(cube, gt)
    sig_s, _ = fdr_mask(ps, alpha)
    return {
        "sen_per_decade": tr["slope"] * 10,
        "p_trend": tr["p"],
        "sig_trend": sig_t.astype(np.float64),
        "sens_b": b,
        "p_sens": ps,
        "sig_sens": sig_s.astype(np.float64),
    }
