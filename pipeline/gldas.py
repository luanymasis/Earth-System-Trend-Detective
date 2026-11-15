"""GLDAS Noah 2.1 mensual 0.25° (GLDAS_NOAH025_M.2.1) → humedad del suelo + verificación.

PLAN_FASE3 §3.3 (humedad) y §3.4 (verificación). De cada archivo mensual se usan 3 variables:

  SoilMoi0_10cm_inst  → `sm`            humedad del suelo 0–10 cm (variable principal de la UI)
  Rainf_f_tavg        → `gldas_precip`  precipitación total del forzamiento (verifica IMERG)
  AvgSurfT_inst       → `gldas_skint`   temperatura de piel de la superficie (verifica la dirección de LST)

Cada mes se reduce enseguida a (a) la media de cada caja de events.yaml y (b) una grilla de 1°,
se guarda en pipeline/raw/gldas/monthly/AAAAMM.npz y el archivo crudo se borra. Es idempotente:
los meses ya procesados no se vuelven a pedir.

Uso (desde pipeline/):
  python gldas.py fetch --only 2016-05          # probar primero con un mes (regla 3 del plan)
  python gldas.py fetch --workers 4             # 2001-01 … 2024-12, solo los meses que falten
  python gldas.py local DIR                     # procesar .nc4 ya descargados (no los borra)
  python gldas.py aggregate                     # medias anuales → pipeline/out/ + SOURCES.csv

Credenciales de Earthdata Login (nunca en el repo), una de estas dos:
  - variable de entorno EARTHDATA_TOKEN (token de https://urs.earthdata.nasa.gov → Generate Token)
  - archivo ~/.netrc (o %USERPROFILE%\\_netrc en Windows) con:  machine urs.earthdata.nasa.gov login … password …
  Además hay que haber autorizado la aplicación «NASA GESDISC DATA ARCHIVE» en el perfil de Earthdata.

Modos de descarga (--via):
  opendap (por defecto): OPeNDAP en la nube de Earthdata, solo las 3 variables (~10 MB por mes, sin comprimir).
  https: el archivo completo de GES DISC (24 MB por mes, ~7 GB en total; se borra al procesarlo).
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import numpy as np

from common import NT, OUT, RAW, Y0, Y1, annual_mean, box_mean, load_events, nan_to_none, regions, today, upsert_sources, write_json

SHORT = "GLDAS_NOAH025_M"
VERSION = "2.1"
COLLECTION = "C1342986036-GES_DISC"  # concept-id en CMR (consultado el 2026-11-14)
HTTPS = "https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/{y}/GLDAS_NOAH025_M.A{y}{m:02d}.021.nc4"
# TODO(verificar): sintaxis DAP4 del OPeNDAP en la nube. Si --only 2016-05 falla, usar --via https.
OPENDAP = ("https://opendap.earthdata.nasa.gov/collections/" + COLLECTION +
           "/granules/GLDAS_NOAH025_M.2.1%3AGLDAS_NOAH025_M.A{y}{m:02d}.021.nc4.dap.nc4?dap4.ce={ce}")

# id de salida → (variable en el archivo, rol, unidad de salida)
VARS = {
    "sm": ("SoilMoi0_10cm_inst", "primary", "m³/m³"),
    "gldas_precip": ("Rainf_f_tavg", "verify_precip", "mm/mes"),
    "gldas_skint": ("AvgSurfT_inst", "verify_lst", "°C"),
}
MIN_MONTHS = 10          # meses válidos para un año (§3.3)
MIN_CELLS_1DEG = 8       # celdas de 0.25° válidas (de 16) para una celda de 1°
GRID1 = {"res": 1, "lat0": 89.5, "lon0": -179.5, "nx": 360, "ny": 180}

MONTHLY = RAW / "gldas" / "monthly"
TMP = RAW / "gldas" / "tmp"


# ---------------------------------------------------------------- conversión de unidades
def convert(name: str, units: str, a: np.ndarray, y: int, m: int) -> np.ndarray:
    """Pasa cada variable a las unidades del contrato leyendo `units` del archivo."""
    u = units.replace(" ", "").lower()
    if name.startswith("SoilMoi"):
        # kg/m² en una capa de espesor d → m³/m³ = kg/m² / (1000 kg/m³ · d)
        if u not in ("kgm-2", "kg/m2", "kgm^-2"):
            raise ValueError(f"{name}: unidad inesperada «{units}»")
        top, bot = name.replace("SoilMoi", "").replace("_inst", "").replace("cm", "").split("_")
        depth_m = (float(bot) - float(top)) / 100
        return a / (1000 * depth_m)
    if name.startswith("Rainf"):
        if u not in ("kgm-2s-1", "kg/m2/s", "kgm^-2s^-1"):
            raise ValueError(f"{name}: unidad inesperada «{units}»")
        return a * 86400 * calendar.monthrange(y, m)[1]  # kg m-2 s-1 = mm/s → mm/mes
    if name.startswith("AvgSurfT") or name.startswith("Tair"):
        if u != "k":
            raise ValueError(f"{name}: unidad inesperada «{units}»")
        return a - 273.15
    raise ValueError(f"Sin conversión definida para {name}")


def to_1deg(lat: np.ndarray, lon: np.ndarray, field: np.ndarray) -> np.ndarray:
    """Media por bloques en la grilla global de 1° (fila 0 = 89.5°N). Sirve para cualquier grilla regular."""
    ii = np.clip(np.floor(90 - lat).astype(int), 0, 179)
    jj = np.clip(np.floor(((lon + 180) % 360)).astype(int), 0, 359)
    I, J = np.meshgrid(ii, jj, indexing="ij")
    ok = np.isfinite(field)
    s = np.zeros((180, 360)); c = np.zeros((180, 360))
    np.add.at(s, (I[ok], J[ok]), field[ok])
    np.add.at(c, (I[ok], J[ok]), 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        g = s / c
    g[c < MIN_CELLS_1DEG] = np.nan
    return g.astype(np.float32)


# ---------------------------------------------------------------- procesamiento de un mes
def process_file(path: Path, y: int, m: int, regs: dict[str, dict]) -> dict:
    """Lee un .nc4 de GLDAS y devuelve medias por caja, conteos y grillas de 1° de cada variable."""
    import netCDF4  # import diferido: solo hace falta al procesar

    out = {"boxes": {}, "counts": {}, "grids": {}, "units_in": {}}
    with netCDF4.Dataset(path) as ds:
        ds.set_auto_maskandscale(True)  # aplica scale_factor/add_offset y enmascara _FillValue/missing_value
        lat = np.asarray(ds.variables["lat"][:], dtype=float)
        lon = np.asarray(ds.variables["lon"][:], dtype=float)
        for vid, (name, _, _) in VARS.items():
            v = ds.variables[name]
            dims = v.dimensions
            a = np.ma.filled(np.ma.asarray(v[:], dtype=float), np.nan)
            if a.ndim == 3:
                if a.shape[0] != 1:
                    raise ValueError(f"{name}: se esperaba un solo tiempo, hay {a.shape[0]}")
                a = a[0]; dims = dims[1:]
            if dims[0] != "lat":  # por si viene [lon, lat]
                a = a.T
            a = convert(name, v.units, a, y, m)
            out["units_in"][vid] = v.units
            out["grids"][vid] = to_1deg(lat, lon, a)
            bx, cn = zip(*(box_mean(lat, lon, a, b) for b in regs.values())) if regs else ((), ())
            out["boxes"][vid] = np.array(bx, dtype=float)
            out["counts"][vid] = np.array(cn, dtype=int)
    sm = out["grids"]["sm"]
    if np.isfinite(sm).any() and (np.nanmin(sm) < 0 or np.nanmax(sm) > 0.7):
        print(f"  ⚠ {y}-{m:02d}: humedad fuera de rango físico ({np.nanmin(sm):.3f}–{np.nanmax(sm):.3f})")
    return out


def save_month(y: int, m: int, res: dict, regs: dict, source: str) -> None:
    MONTHLY.mkdir(parents=True, exist_ok=True)
    arrs = {}
    for vid in VARS:
        arrs[f"box_{vid}"] = res["boxes"][vid]
        arrs[f"n_{vid}"] = res["counts"][vid]
        arrs[f"grid_{vid}"] = res["grids"][vid]
    meta = {"regions": list(regs), "boxes": regs, "units_in": res["units_in"], "source": source, "processed": today()}
    tmp = MONTHLY / f"{y}{m:02d}.tmp.npz"
    np.savez_compressed(tmp, meta=json.dumps(meta), **arrs)
    os.replace(tmp, MONTHLY / f"{y}{m:02d}.npz")


def month_done(y: int, m: int, regs: dict) -> bool:
    p = MONTHLY / f"{y}{m:02d}.npz"
    if not p.exists():
        return False
    meta = json.loads(str(np.load(p)["meta"]))
    return all(meta["boxes"].get(k) == b for k, b in regs.items())


# ---------------------------------------------------------------- descarga
def session():
    import requests

    s = requests.Session()  # con ~/.netrc, requests reenvía las credenciales a urs.earthdata.nasa.gov
    tok = os.environ.get("EARTHDATA_TOKEN")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    else:
        from requests.utils import get_netrc_auth
        if not get_netrc_auth("https://urs.earthdata.nasa.gov"):
            sys.exit("Faltan credenciales de Earthdata: define EARTHDATA_TOKEN o crea ~/.netrc / _netrc "
                     "(ver el encabezado de gldas.py).")
    return s


def url_for(y: int, m: int, via: str) -> str:
    if via == "https":
        return HTTPS.format(y=y, m=m)
    names = ["lat", "lon", "time"] + [v[0] for v in VARS.values()]
    ce = quote(";".join("/" + n for n in names), safe="")
    return OPENDAP.format(y=y, m=m, ce=ce)


def download(s, url: str, dest: Path, tries: int = 4) -> None:
    for k in range(tries):
        try:
            with s.get(url, stream=True, timeout=300) as r:
                if r.status_code in (401, 403):
                    raise PermissionError(f"{r.status_code}: revisa credenciales y que la app GES DISC esté autorizada")
                r.raise_for_status()
                tmp = dest.with_suffix(".part")
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            head = tmp.read_bytes()[:8]
            if not head.startswith(b"\x89HDF") and not head.startswith(b"CDF"):
                txt = tmp.read_bytes()[:300].decode("utf-8", "replace")
                tmp.unlink()
                raise ValueError(f"La respuesta no es NetCDF (¿página de login?): {txt!r}")
            os.replace(tmp, dest)
            return
        except PermissionError:
            raise
        except Exception as e:  # noqa: BLE001 — reintento con espera
            if k == tries - 1:
                raise
            print(f"  reintento {k + 1} ({e})")
            time.sleep(5 * (k + 1))


def months(only: str | None) -> list[tuple[int, int]]:
    if only:
        out = []
        for part in only.split(","):
            y, m = part.split("-")
            out.append((int(y), int(m)))
        return out
    return [(y, m) for y in range(Y0, Y1 + 1) for m in range(1, 13)]


def cmd_fetch(args) -> None:
    regs = regions(load_events())
    todo = [(y, m) for y, m in months(args.only) if not month_done(y, m, regs)]
    print(f"{len(todo)} meses por procesar (vía {args.via}).")
    if not todo:
        return
    s = session()
    TMP.mkdir(parents=True, exist_ok=True)
    lock = threading.Lock()  # netCDF4/HDF5 no se usa en paralelo; solo la descarga

    def job(y, m):
        url = url_for(y, m, args.via)
        dest = TMP / f"{y}{m:02d}.nc4"
        download(s, url, dest)
        with lock:
            try:
                res = process_file(dest, y, m, regs)
                save_month(y, m, res, regs, url.split("?")[0])
            finally:
                dest.unlink(missing_ok=True)  # el crudo no se guarda (§1, regla de volumen)
        return y, m

    fails = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(job, y, m): (y, m) for y, m in todo}
        for k, f in enumerate(as_completed(futs), 1):
            y, m = futs[f]
            try:
                f.result()
                print(f"[{k}/{len(todo)}] {y}-{m:02d} listo")
            except PermissionError as e:
                ex.shutdown(cancel_futures=True)
                sys.exit(str(e))
            except Exception as e:  # noqa: BLE001
                fails.append((y, m))
                print(f"[{k}/{len(todo)}] {y}-{m:02d} FALLÓ: {e}")
    if fails:
        print(f"{len(fails)} meses fallaron; vuelve a correr el mismo comando para reintentarlos.")


def cmd_local(args) -> None:
    regs = regions(load_events())
    files = sorted(Path(args.dir).glob("GLDAS_NOAH025_M.A*.nc4"))
    if not files:
        sys.exit(f"No hay archivos GLDAS_NOAH025_M.A*.nc4 en {args.dir}")
    for p in files:
        ym = p.name.split(".A")[1][:6]
        y, m = int(ym[:4]), int(ym[4:])
        if not args.force and month_done(y, m, regs):
            continue
        save_month(y, m, process_file(p, y, m, regs), regs, f"local:{p.name}")
        print(f"{y}-{m:02d} listo")


# ---------------------------------------------------------------- agregación anual
def cmd_aggregate(args) -> None:
    evs = load_events()
    regs = regions(evs)
    keys = list(regs)
    nm = NT * 12
    box = {v: np.full((nm, len(keys)), np.nan) for v in VARS}
    cnt = {v: np.zeros((nm, len(keys)), dtype=int) for v in VARS}
    grid = {v: np.full((nm, 180, 360), np.nan, dtype=np.float32) for v in VARS}
    missing, units_in, stale = [], {}, set()
    for k, (y, m) in enumerate(months(None)):
        p = MONTHLY / f"{y}{m:02d}.npz"
        if not p.exists():
            missing.append(f"{y}-{m:02d}")
            continue
        z = np.load(p)
        meta = json.loads(str(z["meta"]))
        units_in.update(meta["units_in"])
        for v in VARS:
            grid[v][k] = z[f"grid_{v}"]
            for j, key in enumerate(keys):
                if key in meta["regions"] and meta["boxes"][key] == regs[key]:
                    i = meta["regions"].index(key)
                    box[v][k, j] = z[f"box_{v}"][i]
                    cnt[v][k, j] = z[f"n_{v}"][i]
                else:
                    stale.add(key)
    if missing:
        print(f"⚠ faltan {len(missing)} meses: {', '.join(missing[:12])}{' …' if len(missing) > 12 else ''}")
    if stale:
        print(f"⚠ cajas sin procesar en algunos meses (cambió events.yaml): {sorted(stale)}. Corre «fetch» de nuevo.")

    OUT.mkdir(parents=True, exist_ok=True)
    for v, (name, role, units) in VARS.items():
        ann = annual_mean(box[v], MIN_MONTHS)
        series = {key: {"y": nan_to_none(ann[:, j]), "n": int(np.median(cnt[v][:, j][cnt[v][:, j] > 0])) if (cnt[v][:, j] > 0).any() else 0}
                  for j, key in enumerate(keys)}
        write_json(OUT / f"series_{v}.json", {
            "var": v, "role": role, "years": [Y0, Y1], "units": units,
            "tool": "GES DISC (OPeNDAP / HTTPS)", "product": f"{SHORT}.{VERSION}", "layer": name,
            "min_months": MIN_MONTHS, "regions": series,
        })
        g = annual_mean(grid[v], MIN_MONTHS).astype(np.float32)
        np.savez_compressed(OUT / f"grid_{v}.npz", data=g, grid=json.dumps(GRID1), units=units)
        valid = sum(1 for s in series.values() if sum(x is not None for x in s["y"]) >= 20)
        print(f"{v:13s} {role:14s} cajas con ≥ 20 años: {valid}/{len(keys)}")

    period = f"{Y0}-01/{Y1}-12" if not missing else f"{Y0}-01/{Y1}-12 (faltan {len(missing)} meses)"
    upsert_sources([{
        "var": v, "role": role, "tool": "GES DISC (OPeNDAP en la nube o HTTPS)", "product": f"{SHORT}.{VERSION} ({COLLECTION})",
        "layer": name, "region": "global 0.25° → cajas de events.yaml y grilla de 1°", "period": period,
        "units_in": units_in.get(v, ""), "conversion": {
            "sm": "kg/m² ÷ (1000·0,1 m) → m³/m³", "gldas_precip": "kg m-2 s-1 × 86400 × días del mes → mm/mes",
            "gldas_skint": "K − 273,15 → °C"}[v],
        "request": HTTPS.replace("{y}", "AAAA").replace("{m:02d}", "MM"), "downloaded": today(),
        "notes": f"media anual con ≥ {MIN_MONTHS} meses; caja = media ponderada por cos(lat)",
    } for v, (name, role, _) in VARS.items()])
    print(f"Listo: {OUT} y SOURCES.csv")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch"); f.add_argument("--via", choices=["opendap", "https"], default="opendap")
    f.add_argument("--workers", type=int, default=3); f.add_argument("--only", help="AAAA-MM[,AAAA-MM…]")
    f.set_defaults(fn=cmd_fetch)
    lo = sub.add_parser("local"); lo.add_argument("dir"); lo.add_argument("--force", action="store_true"); lo.set_defaults(fn=cmd_local)
    ag = sub.add_parser("aggregate"); ag.set_defaults(fn=cmd_aggregate)
    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
