"""GLDAS Noah 2.1 + MERRA-2 mensual → variables ambientales de la aplicación.

PLAN_FASE3 §3.3 (humedad) y §3.4 (verificación). De cada archivo mensual se usan 3 variables:

  SoilMoi0_10cm_inst  → `sm`            humedad del suelo 0–10 cm (variable principal de la UI)
  Rainf_tavg          → `gldas_precip`  precipitación total (verifica IMERG y alimenta el globo)
  Tair_f_inst         → `lst`           temperatura del aire (variable principal de la UI)
  GRN                → `tree`          fracción de verdor MERRA-2 (variable principal de la UI)

Cada mes se reduce enseguida a (a) la media de cada caja de events.yaml y (b) una grilla de 1°,
se guarda en pipeline/raw/gldas/monthly/AAAAMM.npz y el archivo crudo se borra. Es idempotente:
los meses ya procesados no se vuelven a pedir.

Uso (desde pipeline/):
  python gldas.py fetch --only 2016-05          # probar primero con un mes (regla 3 del plan)
  python gldas.py fetch --workers 4             # 2001-01 … 2024-12, solo los meses que falten
  python gldas.py local DIR                     # procesar .nc4 ya descargados (no los borra)
  python gldas.py aggregate                     # valores mensuales → pipeline/out/ + SOURCES.csv

Credenciales de Earthdata Login (nunca en el repo), una de estas dos:
  - variable de entorno EARTHDATA_TOKEN (token de https://urs.earthdata.nasa.gov → Generate Token)
  - archivo ~/.netrc (o %USERPROFILE%\\_netrc en Windows) con:  machine urs.earthdata.nasa.gov login … password …
  Además hay que haber autorizado la aplicación «NASA GESDISC DATA ARCHIVE» en el perfil de Earthdata.

Modos de descarga (--via):
  opendap (por defecto): OPeNDAP en la nube de Earthdata, solo las 3 variables (~10 MB por mes, sin comprimir).
  https: el archivo completo de GES DISC (GLDAS ~24 MB y MERRA-2 ~80 MB por mes; se borra al procesarlo).
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

from common import DATES, NM, OUT, RAW, Y0, Y1, box_mean, load_events, nan_to_none, regions, today, upsert_sources, write_json

SHORT = "GLDAS_NOAH025_M"
VERSION = "2.1"
COLLECTION = "C1342986036-GES_DISC"  # concept-id en CMR (consultado el 2026-11-14)
HTTPS = "https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/{y}/GLDAS_NOAH025_M.A{y}{m:02d}.021.nc4"
# TODO(verificar): sintaxis DAP4 del OPeNDAP en la nube. Si --only 2016-05 falla, usar --via https.
OPENDAP = ("https://opendap.earthdata.nasa.gov/collections/" + COLLECTION +
           "/granules/GLDAS_NOAH025_M.2.1%3AGLDAS_NOAH025_M.A{y}{m:02d}.021.nc4.dap.nc4?dap4.ce={ce}")
MERRA_SHORT = "M2TMNXLND"
MERRA_VERSION = "5.12.4"
MERRA_COLLECTION = "C1276812856-GES_DISC"
MERRA_HTTPS = ("https://data.gesdisc.earthdata.nasa.gov/data/MERRA2_MONTHLY/"
               "M2TMNXLND.5.12.4/{y}/MERRA2_{stream}.tavgM_2d_lnd_Nx.{y}{m:02d}.nc4")

# id de salida → (variable en el archivo, rol, unidad de salida)
VARS = {
    "sm": ("SoilMoi0_10cm_inst", "primary", "m³/m³"),
    "gldas_precip": ("Rainf_tavg", "verify_precip", "mm/mes"),
    "lst": ("Tair_f_inst", "primary", "°C"),
}
TREE_VAR = ("GRN", "primary", "%")
ALL_VARS = {**VARS, "tree": TREE_VAR}
# Cachés mensuales de una versión anterior (sin meta["source_vars"]): guardaban Rainf_f_tavg y AvgSurfT_inst
# (como «gldas_skint»). No coinciden con las capas actuales, así que esos meses se deben volver a procesar.
LEGACY_SOURCE_VARS = {"sm": "SoilMoi0_10cm_inst", "gldas_precip": "Rainf_f_tavg", "gldas_skint": "AvgSurfT_inst"}
ICE_SM = 0.55            # m³/m³: por encima no es suelo (hielo glaciar: GLDAS llega a 1; la porosidad de Noah ≤ ~0.47)
MIN_CELLS_1DEG = 8       # GLDAS: celdas de 0.25° válidas (de 16) para una celda de 1°
MIN_CELLS_MERRA_1DEG = 2 # MERRA-2: al menos la mitad de sus ~4 celdas por celda de 1°
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


def to_1deg(lat: np.ndarray, lon: np.ndarray, field: np.ndarray, min_cells: int = MIN_CELLS_1DEG) -> np.ndarray:
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
    g[c < min_cells] = np.nan
    return g.astype(np.float32)


def convert_tree(units: str, a: np.ndarray) -> np.ndarray:
    """Convierte GRN a porcentaje, conservando explícitamente la fracción válida."""
    u = units.strip().lower().replace(" ", "")
    if u not in ("1", "fraction", "unitless", "none", "-"):
        raise ValueError(f"GRN: unidad inesperada «{units}»")
    finite = a[np.isfinite(a)]
    if finite.size and (np.nanmin(finite) < 0 or np.nanmax(finite) > 1):
        raise ValueError(f"GRN: rango inesperado {np.nanmin(finite):.4g}–{np.nanmax(finite):.4g}")
    return a * 100


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
            if vid == "sm":
                # Hielo glaciar (Groenlandia, Ártico): GLDAS da 100 kg/m² (= 1 m³/m³) en el hielo y valores
                # de 0,6–0,9 en sus bordes. No es suelo: se enmascara antes de promediar cajas y celdas de 1°.
                a[a >= ICE_SM] = np.nan
            out["units_in"][vid] = v.units
            out["grids"][vid] = to_1deg(lat, lon, a)
            bx, cn = zip(*(box_mean(lat, lon, a, b) for b in regs.values())) if regs else ((), ())
            out["boxes"][vid] = np.array(bx, dtype=float)
            out["counts"][vid] = np.array(cn, dtype=int)
    sm = out["grids"]["sm"]
    if np.isfinite(sm).any() and (np.nanmin(sm) < 0 or np.nanmax(sm) > ICE_SM):
        print(f"  ⚠ {y}-{m:02d}: humedad fuera de rango físico ({np.nanmin(sm):.3f}–{np.nanmax(sm):.3f})")
    return out


def process_merra_file(path: Path, regs: dict[str, dict]) -> dict:
    """Lee GRN de un granulo MERRA-2 y devuelve la misma forma reducida que GLDAS."""
    import netCDF4

    with netCDF4.Dataset(path) as ds:
        ds.set_auto_maskandscale(True)
        lat = np.asarray(ds.variables["lat"][:], dtype=float)
        lon = np.asarray(ds.variables["lon"][:], dtype=float)
        v = ds.variables["GRN"]
        dims = v.dimensions
        a = np.ma.filled(np.ma.asarray(v[:], dtype=float), np.nan)
        if a.ndim == 3:
            if a.shape[0] != 1:
                raise ValueError(f"GRN: se esperaba un solo tiempo, hay {a.shape[0]}")
            a = a[0]
            dims = dims[1:]
        if dims[0] != "lat":
            a = a.T
        a = convert_tree(getattr(v, "units", "1"), a)
        return {
            "boxes": {"tree": np.array([x[0] for x in (box_mean(lat, lon, a, b) for b in regs.values())], dtype=float)},
            "counts": {"tree": np.array([x[1] for x in (box_mean(lat, lon, a, b) for b in regs.values())], dtype=int)},
            "grids": {"tree": to_1deg(lat, lon, a, MIN_CELLS_MERRA_1DEG)},
            "units_in": {"tree": getattr(v, "units", "1")},
        }


def save_month(y: int, m: int, res: dict, regs: dict, source: str) -> None:
    MONTHLY.mkdir(parents=True, exist_ok=True)
    arrs = {}
    for vid in res["boxes"]:
        arrs[f"box_{vid}"] = res["boxes"][vid]
        arrs[f"n_{vid}"] = res["counts"][vid]
        arrs[f"grid_{vid}"] = res["grids"][vid]
    meta = {
        "regions": list(regs), "boxes": regs, "units_in": res["units_in"],
        "source_vars": {vid: ALL_VARS[vid][0] for vid in res["boxes"]},
        "source": source, "processed": today(),
    }
    tmp = MONTHLY / f"{y}{m:02d}.tmp.npz"
    np.savez_compressed(tmp, meta=json.dumps(meta), **arrs)
    os.replace(tmp, MONTHLY / f"{y}{m:02d}.npz")


def source_vars(meta: dict) -> dict:
    """Capa de origen de cada variable guardada en un mes (las cachés antiguas no la registraban)."""
    return meta.get("source_vars") or LEGACY_SOURCE_VARS


def empty_res() -> dict:
    return {"boxes": {}, "counts": {}, "grids": {}, "units_in": {}}


def merge_res(res: dict, part: dict) -> dict:
    """Agrega las variables de `part` a `res` sin borrar las que ya tenía."""
    for k in ("boxes", "counts", "grids", "units_in"):
        res[k].update(part[k])
    return res


def load_month(y: int, m: int, regs: dict) -> tuple[dict, str]:
    """Variables ya válidas de un mes en caché (capa correcta y mismas cajas), para no volver a descargarlas."""
    res = empty_res()
    p = MONTHLY / f"{y}{m:02d}.npz"
    if not p.exists():
        return res, ""
    with np.load(p) as z:
        meta = json.loads(str(z["meta"]))
        if list(meta["regions"]) != list(regs) or any(meta["boxes"].get(k) != b for k, b in regs.items()):
            return res, ""
        src = source_vars(meta)
        for vid, (name, _, _) in ALL_VARS.items():
            if src.get(vid) == name and f"grid_{vid}" in z:
                res["boxes"][vid] = z[f"box_{vid}"]
                res["counts"][vid] = z[f"n_{vid}"]
                res["grids"][vid] = z[f"grid_{vid}"]
                res["units_in"][vid] = meta["units_in"].get(vid, "")
    return res, meta.get("source", "")


def month_done(y: int, m: int, regs: dict, require_tree: bool = True) -> bool:
    p = MONTHLY / f"{y}{m:02d}.npz"
    if not p.exists():
        return False
    with np.load(p) as z:
        meta = json.loads(str(z["meta"]))
    boxes_ok = all(meta["boxes"].get(k) == b for k, b in regs.items())
    src = source_vars(meta)
    gldas_ok = all(src.get(vid) == name for vid, (name, _, _) in VARS.items())
    return boxes_ok and gldas_ok and (not require_tree or src.get("tree") == TREE_VAR[0])


# ---------------------------------------------------------------- descarga
def session():
    import requests
    from requests.utils import get_netrc_auth

    s = requests.Session()  # con ~/.netrc, requests reenvía las credenciales a urs.earthdata.nasa.gov
    tok = os.environ.get("EARTHDATA_TOKEN")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    else:
        auth = get_netrc_auth("https://urs.earthdata.nasa.gov")
        if not auth:
            sys.exit("Faltan credenciales de Earthdata: define EARTHDATA_TOKEN o crea ~/.netrc / _netrc "
                     "(ver el encabezado de gldas.py).")
        # Requests only consults .netrc for the initial hostname. Explicitly
        # attach the Earthdata credentials so redirects through URS retain auth.
        s.auth = auth
    return s


def url_for(y: int, m: int, via: str) -> str:
    if via == "https":
        return HTTPS.format(y=y, m=m)
    names = ["lat", "lon", "time"] + [v[0] for v in VARS.values()]
    ce = quote(";".join("/" + n for n in names), safe="")
    return OPENDAP.format(y=y, m=m, ce=ce)


def merra_url_for(y: int, m: int) -> str:
    # MERRA-2 stream 300 covers 2001–2010; stream 400 starts in 2011.
    # The stream is part of the granule name, not a version of the collection.
    stream = 300 if y <= 2010 else 400
    return MERRA_HTTPS.format(y=y, m=m, stream=stream)


def merra_urls_for(y: int, m: int) -> list[str]:
    """Return the normal MERRA URL followed by the known 400/401 fallback."""
    primary = merra_url_for(y, m)
    if y <= 2010:
        return [primary]
    alternate_stream = 401 if "_400." in primary else 400
    alternate = MERRA_HTTPS.format(y=y, m=m, stream=alternate_stream)
    return [primary, alternate]


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
                if "<html" in txt.lower() or "<!doctype" in txt.lower():
                    raise PermissionError(
                        f"La respuesta fue una página de Earthdata Login; revisa EARTHDATA_TOKEN o ~/.netrc "
                        f"y la autorización de «NASA GESDISC DATA ARCHIVE» ({url})"
                    )
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


def download_merra(s, y: int, m: int, dest: Path) -> str:
    """Download a MERRA granule, retrying the known stream-name exception."""
    import requests

    errors = []
    for url in merra_urls_for(y, m):
        try:
            download(s, url, dest, tries=1)
            return url
        except (OSError, PermissionError, ValueError, requests.RequestException) as e:
            errors.append(f"{url}: {e}")
            dest.unlink(missing_ok=True)
    raise RuntimeError("No se pudo descargar MERRA-2:\n" + "\n".join(errors))


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
        dest = TMP / f"{y}{m:02d}.nc4"
        merra_dest = TMP / f"merra_{y}{m:02d}.nc4"
        with lock:
            res, old_source = load_month(y, m, regs)  # lo que ya es válido no se vuelve a descargar
        sources = [x for x in old_source.split("|") if x and not x.startswith("local:")]
        if not all(v in res["boxes"] for v in VARS):
            gl_url = url_for(y, m, args.via)
            download(s, gl_url, dest)
            with lock:
                try:
                    merge_res(res, process_file(dest, y, m, regs))
                finally:
                    dest.unlink(missing_ok=True)  # el crudo no se guarda (§1, regla de volumen)
            sources = [x for x in sources if "GLDAS" not in x] + [gl_url.split("?")[0]]
        if "tree" not in res["boxes"]:
            try:
                merra_url = download_merra(s, y, m, merra_dest)
            except RuntimeError as e:
                # GLDAS variables remain usable while a MERRA stream/auth issue is retried
                # by the next invocation; month_done() will require tree before completion.
                print(f"  ⚠ {y}-{m:02d}: MERRA-2 omitido; GLDAS sí procesado: {e}")
            else:
                try:
                    with lock:
                        merge_res(res, process_merra_file(merra_dest, regs))
                finally:
                    merra_dest.unlink(missing_ok=True)
                sources = [x for x in sources if "MERRA" not in x] + [merra_url]
        with lock:
            save_month(y, m, res, regs, "|".join(sources))
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
        if not args.force and month_done(y, m, regs, require_tree=False):
            continue
        res, old_source = load_month(y, m, regs)  # conserva tree (MERRA-2) si ya estaba
        merra = [x for x in old_source.split("|") if "MERRA" in x] if "tree" in res["boxes"] else []
        save_month(y, m, merge_res(res, process_file(p, y, m, regs)), regs, "|".join([f"local:{p.name}", *merra]))
        print(f"{y}-{m:02d} listo")


# ---------------------------------------------------------------- exportación mensual
def cmd_aggregate(args) -> None:
    evs = load_events()
    regs = regions(evs)
    keys = list(regs)
    box = {v: np.full((NM, len(keys)), np.nan) for v in ALL_VARS}
    cnt = {v: np.zeros((NM, len(keys)), dtype=int) for v in ALL_VARS}
    grid = {v: np.full((NM, 180, 360), np.nan, dtype=np.float32) for v in ALL_VARS}
    missing, units_in, stale = [], {}, set()
    wrong = {v: [] for v in ALL_VARS}  # meses cuya caché trae otra capa de origen
    for k, (y, m) in enumerate(months(None)):
        p = MONTHLY / f"{y}{m:02d}.npz"
        if not p.exists():
            missing.append(f"{y}-{m:02d}")
            continue
        z = np.load(p)
        meta = json.loads(str(z["meta"]))
        src = source_vars(meta)
        for v, (name, _, _) in ALL_VARS.items():
            if f"grid_{v}" not in z or src.get(v) != name:
                wrong[v].append(f"{y}-{m:02d}")
                continue
            units_in[v] = meta["units_in"].get(v, "")
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
    for v, ms in wrong.items():
        if ms:
            print(f"⚠ {v}: {len(ms)} meses sin {ALL_VARS[v][0]} en la caché (versión anterior o MERRA-2 pendiente); "
                  f"quedan vacíos. Corre «fetch» para reprocesarlos.")
    if stale:
        print(f"⚠ cajas sin procesar en algunos meses (cambió events.yaml): {sorted(stale)}. Corre «fetch» de nuevo.")

    OUT.mkdir(parents=True, exist_ok=True)
    for v, (name, role, units) in ALL_VARS.items():
        series = {key: {"y": nan_to_none(box[v][:, j]), "n": int(np.median(cnt[v][:, j][cnt[v][:, j] > 0])) if (cnt[v][:, j] > 0).any() else 0}
                  for j, key in enumerate(keys)}
        tool = "GES DISC (OPeNDAP / HTTPS)"
        product = f"{SHORT}.{VERSION}" if v != "tree" else f"{MERRA_SHORT}.{MERRA_VERSION}"
        write_json(OUT / f"series_{v}.json", {
            "var": v, "role": role, "dates": DATES, "units": units,
            "tool": tool, "product": product, "layer": name,
            "regions": series,
        })
        np.savez_compressed(OUT / f"grid_{v}.npz", data=grid[v], grid=json.dumps(GRID1), units=units)
        valid = sum(1 for s in series.values() if sum(x is not None for x in s["y"]) >= 240)
        print(f"{v:13s} {role:14s} cajas con ≥ 240 meses: {valid}/{len(keys)}")

    period = f"{Y0}-01/{Y1}-12" if not missing else f"{Y0}-01/{Y1}-12 (faltan {len(missing)} meses)"
    upsert_sources([{
        "var": v, "role": role, "tool": "GES DISC (OPeNDAP en la nube o HTTPS)",
        "product": f"{SHORT}.{VERSION} ({COLLECTION})" if v != "tree" else f"{MERRA_SHORT}.{MERRA_VERSION} ({MERRA_COLLECTION})",
        "layer": name, "region": "global → cajas de events.yaml y grilla de 1°", "period": period,
        "units_in": units_in.get(v, ""), "conversion": {
            "sm": "kg/m² ÷ (1000·0,1 m) → m³/m³", "gldas_precip": "kg m-2 s-1 × 86400 × días del mes → mm/mes",
            "lst": "Tair_f_inst: K − 273,15 → °C",
            "tree": "GRN: fracción 0–1 × 100 → %"}[v],
        "request": (HTTPS if v != "tree" else MERRA_HTTPS).replace("{y}", "AAAA").replace("{m:02d}", "MM").replace("{stream}", "300/400"),
        "downloaded": today(), "notes": "valores mensuales; caja = media ponderada por cos(lat)",
    } for v, (name, role, _) in ALL_VARS.items()])
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
