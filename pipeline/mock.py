"""Datos sintéticos con el MISMO formato que export.py (PLAN §4.7).

Porta el motor del prototipo: campos de tendencia por variable, campos anuales
espacialmente coherentes (YF) y ruido AR(1), con el mismo generador mulberry32.

Uso:
    python pipeline/mock.py            # grilla de 2° -> web/public/data/
    python pipeline/mock.py --res 3    # grilla de 3° (la del prototipo), útil para comparar

Nota: la máscara tierra/mar se calcula con geometría (no con el canvas del
prototipo), así que puede diferir en celdas de costa; eso desplaza la secuencia
aleatoria y los valores no coinciden bit a bit con el prototipo.
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from matplotlib.path import Path as MPath

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import ASSETS, DATA_OUT, VARIABLES, YEARS  # noqa: E402
from export import write_dataset  # noqa: E402
from stats import trend_stats, variable_stats  # noqa: E402

M32 = 0xFFFFFFFF


# ---------------- RNG (idéntico al prototipo) ----------------
def _imul(a, b):
    return (a * b) & M32


def mulberry32(seed):
    state = [seed & M32]

    def r():
        a = (state[0] + 0x6D2B79F5) & M32
        state[0] = a
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return r


def gauss_rng(r):
    def g():
        u = 0.0
        while u == 0.0:
            u = r()
        return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * r())

    return g


def make_smooth(seed):
    r = mulberry32(seed)
    comps = []
    for k in range(5):
        a = (r() * 0.6 + 0.4) / math.sqrt(k + 1)
        fx = (1 + math.floor(r() * 4)) * (-1 if r() < 0.5 else 1)
        fy = 1 + math.floor(r() * 4)
        ph = r() * 6.283
        comps.append((a, fx, fy, ph))
    norm = math.sqrt(sum(c[0] ** 2 / 2 for c in comps))

    def f(la, lo):
        x = lo * math.pi / 180
        y = la * math.pi / 180
        s = 0.0
        for a, fx, fy, ph in comps:
            s = s + a * np.sin(fx * x + 2 * fy * y + ph)
        return s / norm

    return f


# ---------------- Máscara tierra/mar ----------------
def load_land_polygons(path):
    topo = json.loads(Path(path).read_text(encoding="utf-8"))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        a = np.cumsum(np.asarray(arc, dtype=np.float64), axis=0)
        arcs.append(np.column_stack([a[:, 0] * sx + tx, a[:, 1] * sy + ty]))

    def ring(idx):
        pts = []
        for k in idx:
            seg = arcs[k] if k >= 0 else arcs[~k][::-1]
            pts.append(seg if not pts else seg[1:])
        return np.vstack(pts)

    polys = []
    for geom in topo["objects"]["land"]["geometries"]:
        parts = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        for poly in parts:
            rings = [ring(r) for r in poly]
            polys.append((MPath(rings[0]), [MPath(h) for h in rings[1:]]))
    return polys


def build_masks(res):
    nx, ny = int(360 / res), int(180 / res)
    lat = 90 - res * (np.arange(ny) + 0.5)
    lon = -180 + res * (np.arange(nx) + 0.5)
    LA, LO = np.meshgrid(lat, lon, indexing="ij")
    LA, LO = LA.ravel(), LO.ravel()
    polys = load_land_polygons(ASSETS / "land-110m.json")

    # Como el prototipo: 9 muestras por celda, cada una ajustada al centro de un píxel de 1440x720
    MW, MH = 1440, 720
    offs = [(0, 0), (-1, -1), (-1, 1), (1, -1), (1, 1), (0, -1.2), (0, 1.2), (-1.2, 0), (1.2, 0)]
    samples = []
    for a, b in offs:
        sla = LA + a * res * 0.4
        slo = LO + b * res * 0.4
        x = np.clip(np.floor((slo + 180) / 360 * MW), 0, MW - 1)
        y = np.clip(np.floor((90 - sla) / 180 * MH), 0, MH - 1)
        samples.append(np.column_stack([(x + 0.5) / MW * 360 - 180, 90 - (y + 0.5) / MH * 180]))
    pts = np.vstack(samples)
    inside = np.zeros(len(pts), dtype=bool)
    for outer, holes in polys:
        m = outer.contains_points(pts)
        for h in holes:
            m &= ~h.contains_points(pts)
        inside |= m
    inside = inside.reshape(len(offs), -1)
    n = inside.sum(axis=0)
    land = (LA < -64) | inside[0]
    land_any = (LA < -64) | (n > 0)
    ocean_any = (n < len(offs)) & (LA > -66)
    green = land & (LO > -74) & (LO < -11) & (LA > 59)
    return dict(nx=nx, ny=ny, la=LA, lo=LO, land=land, land_any=land_any,
                ocean_any=ocean_any, green=green)


def domain_mask(dom, M):
    la = M["la"]
    if dom == "all":
        return np.ones_like(la, dtype=bool)
    if dom == "land":
        return M["land_any"].copy()
    if dom == "land_core":
        return M["land_any"] & (la > -60) & ~M["green"]
    if dom == "ocean":
        return M["ocean_any"] & (np.abs(la) < 75)
    if dom == "snow":
        return M["land_any"] & (la > 36)
    raise ValueError(dom)


# ---------------- Campos del prototipo ----------------
def cl(x):
    return np.clip(x, 0, 1)


def ga(x, m, s):
    return np.exp(-0.5 * ((x - m) / s) ** 2)


def bl(la, lo, cla, clo, sla, slo):
    d = ((lo - clo + 540) % 360) - 180
    return np.exp(-0.5 * (((la - cla) / sla) ** 2 + (d / slo) ** 2))


A = np.abs
GEN = {
    "precip": dict(seed=23, sd=6, phi=0.15,
        base=lambda la, lo: np.maximum(15, 70 + 160 * ga(la, 5, 9) + 50 * ga(A(la), 55, 10) - 50 * ga(A(la), 25, 7)),
        trend=lambda la, lo, n: 0.4 * ga(la, 5, 8) + 0.24 * ga(A(la), 58, 9) - 0.38 * ga(A(la), 27, 6) + 0.12 * n
            - 0.3 * bl(la, lo, 39, 15, 6, 22) + 0.3 * bl(la, lo, 13, 0, 4, 18) - 2.1 * bl(la, lo, 13, -87, 4, 6)),
    "t2m": dict(seed=11, sd=0.35, phi=0.3,
        base=lambda la, lo: 30 - 0.5 * A(la),
        trend=lambda la, lo, n: 0.013 + 0.05 * cl((la - 40) / 40) + 0.01 * n - 0.04 * bl(la, lo, 38, -90, 6, 12)
            + 0.02 * bl(la, lo, -10, -55, 8, 10) + 0.012 * bl(la, lo, 13, -87, 5, 7)),
    "sst": dict(seed=67, sd=0.15, phi=0.6,
        base=lambda la, lo: 28 - 0.42 * A(la),
        trend=lambda la, lo, n: 0.018 + 0.01 * n + 0.02 * bl(la, lo, 40, 165, 8, 25) + 0.02 * cl((la - 60) / 15)
            - 0.05 * bl(la, lo, 55, -35, 5, 12) - 0.014 * cl((-la - 45) / 15) - 0.014 * bl(la, lo, 0, -110, 5, 30)),
    "snow": dict(seed=53, sd=4, phi=0.2,
        base=lambda la, lo: 15 + 75 * cl((la - 35) / 25),
        trend=lambda la, lo, n: cl((la - 33) / 15) * (-0.4 * ga(la, 45, 8) - 0.18 * ga(la, 60, 8)
            + 0.7 * bl(la, lo, 64, 125, 6, 22) + 0.12 * n)),
    "ndvi": dict(seed=41, sd=0.02, phi=0.25,
        base=lambda la, lo: np.maximum(0.08, 0.25 + 0.4 * ga(la, 0, 14) + 0.15 * ga(la, 55, 10) - 0.2 * ga(A(la), 25, 6)),
        trend=lambda la, lo, n: 0.0008 * n + 0.002 * cl((la - 50) / 20) + 0.003 * bl(la, lo, 22, 80, 6, 8)
            + 0.0025 * bl(la, lo, 35, 112, 6, 10) - 0.003 * bl(la, lo, -10, -55, 6, 8) + 0.0015 * bl(la, lo, 13, 0, 4, 18)
            - 0.0012 * bl(la, lo, -20, 25, 6, 10) - 0.0016 * bl(la, lo, 13, -87, 4, 6)),
    "sm": dict(seed=37, sd=0.012, phi=0.35,
        base=lambda la, lo: 0.22 + 0.1 * ga(la, 0, 12) - 0.1 * ga(A(la), 25, 7),
        trend=lambda la, lo, n: 0.0003 * n - 0.0012 * bl(la, lo, 40, 15, 6, 22) - 0.001 * bl(la, lo, 35, -110, 7, 10)
            - 0.001 * bl(la, lo, -8, -40, 6, 8) + 0.001 * bl(la, lo, 13, 0, 4, 18) + 0.0008 * bl(la, lo, 22, 78, 6, 8)
            - 0.0007 * bl(la, lo, 48, 40, 6, 20) - 0.0012 * bl(la, lo, 13, -87, 4, 6)),
    "aod": dict(seed=79, sd=0.025, phi=0.3,
        base=lambda la, lo: 0.12 + 0.25 * bl(la, lo, 25, 80, 8, 12) + 0.25 * bl(la, lo, 33, 113, 8, 12) + 0.25 * bl(la, lo, 18, 5, 8, 25),
        trend=lambda la, lo, n: -0.0035 * bl(la, lo, 48, 12, 8, 18) - 0.003 * bl(la, lo, 38, -85, 8, 15)
            - 0.006 * bl(la, lo, 32, 113, 7, 12) + 0.0045 * bl(la, lo, 24, 80, 6, 10) + 0.002 * bl(la, lo, -10, -58, 6, 12)
            + 0.0006 * n),
}


def generate(vid, M, nt):
    p = GEN[vid]
    meta = next(v for v in VARIABLES if v["id"] == vid)
    la, lo = M["la"], M["lo"]
    ncell = la.size
    valid = domain_mask(meta["domain"], M)
    sm = make_smooth(p["seed"])(la, lo)
    tr = p["trend"](la, lo, sm)
    base = p["base"](la, lo)
    kk = np.maximum(0.3, base / 100) if vid == "precip" else np.ones(ncell)
    YF = np.stack([make_smooth(p["seed"] * 131 + t * 17 + 5)(la, lo).astype(np.float32) for t in range(nt)])
    g = gauss_rng(mulberry32(p["seed"] * 7919 + 1))
    sd, ph = p["sd"], p["phi"]
    s = sd * math.sqrt(1 - ph * ph)
    anom = np.zeros((ncell, nt), dtype=np.float32)
    tc = np.arange(nt) - (nt - 1) / 2
    for c in np.flatnonzero(valid):
        k = kk[c]
        e = sd * k * (0.55 * g() + 0.83 * float(YF[0, c]))
        row = np.empty(nt)
        row[0] = e
        for t in range(1, nt):
            e = ph * e + s * k * (0.55 * g() + 0.83 * float(YF[t, c]))
            row[t] = e
        anom[c] = tr[c] * tc + row
    cube = np.where(valid[:, None], base[:, None] + anom.astype(np.float64), np.nan)
    return cube, anom, valid


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--res", type=float, default=2)
    ap.add_argument("--out", default=str(DATA_OUT))
    args = ap.parse_args()
    res = args.res
    t0 = time.time()
    M = build_masks(res)
    nt = YEARS[1] - YEARS[0] + 1
    print(f"Máscaras listas ({M['nx']}x{M['ny']}, {M['land_any'].sum()} celdas con tierra) en {time.time() - t0:.1f}s")

    gen = {}
    for v in VARIABLES:
        t1 = time.time()
        gen[v["id"]] = generate(v["id"], M, nt)
        print(f"  {v['id']:7s} {gen[v['id']][2].sum():6d} celdas válidas · {time.time() - t1:.1f}s")

    # Temperatura global anual (como el prototipo: t2m sobre celdas con centro en tierra + sst)
    w = np.cos(np.deg2rad(M["la"]))
    gt = np.zeros(nt)
    wt = 0.0
    for vid, mask in (("t2m", M["land"]), ("sst", None)):
        _, anom, valid = gen[vid]
        sel = valid & (mask if mask is not None else True)
        a = anom[sel].astype(np.float64)
        a = a - a.mean(axis=1, keepdims=True)
        gt += (w[sel][:, None] * a).sum(axis=0)
        wt += w[sel].sum()
    gt /= wt
    obs = trend_stats(gt[None, :], prewhiten=False)["slope"][0] * (nt - 1)

    variables = []
    for v in VARIABLES:
        cube = gen[v["id"]][0]
        variables.append(dict(v, cube=cube, stats=variable_stats(cube, gt)))
        sig = variables[-1]["stats"]["sig_trend"].sum()
        print(f"  {v['id']:7s} tendencia significativa (FDR) en {int(sig)} celdas")

    grid = dict(res=res, nx=M["nx"], ny=M["ny"], lat0=90 - res / 2, lon0=-180 + res / 2)
    write_dataset(args.out, grid=grid, years=YEARS, gt_series=gt, obs_warming=obs,
                  variables=variables, synthetic=True)
    print(f"Calentamiento observado (GT): {obs:.3f} °C · datos en {args.out} · {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
