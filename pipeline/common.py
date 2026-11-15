"""Utilidades compartidas del pipeline de Pulso Verde (PLAN_FASE3 §3)."""
from __future__ import annotations

import csv
import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"            # descargas y cachés intermedias (fuera de git)
OUT = ROOT / "out"            # series y grillas listas para build_events.py (fuera de git)
WEB_DATA = ROOT.parent / "web" / "public" / "data"
SOURCES = ROOT / "SOURCES.csv"

Y0, Y1 = 2001, 2024
NT = Y1 - Y0 + 1
NM = NT * 12
DATES = [f"{y}-{m:02d}" for y in range(Y0, Y1 + 1) for m in range(1, 13)]


def box_around(lat: float, lon: float, r: float) -> dict:
    """Caja ±r° de latitud y ±r/cos(lat)° de longitud (como boxAround del prototipo)."""
    dl = r / math.cos(math.radians(lat))
    return {"la0": lat - r, "la1": lat + r, "lo0": lon - dl, "lo1": lon + dl}


def load_events(path: Path | None = None) -> list[dict]:
    """Lee events.yaml y agrega `box` y `ctrl_box`."""
    evs = yaml.safe_load((path or ROOT / "events.yaml").read_text(encoding="utf-8"))
    for e in evs:
        la, lo = e["center"]
        e["box"] = box_around(la, lo, e["r"])
        cla, clo = e["control"]["center"]
        e["ctrl_box"] = box_around(cla, clo, e["r"])
    return evs


def regions(evs: list[dict]) -> dict[str, dict]:
    """Todas las cajas a procesar: '{id}:E' (evento) y '{id}:C' (comparación)."""
    out = {}
    for e in evs:
        out[f"{e['id']}:E"] = e["box"]
        out[f"{e['id']}:C"] = e["ctrl_box"]
    return out


def box_mean(lat: np.ndarray, lon: np.ndarray, field: np.ndarray, box: dict) -> tuple[float, int]:
    """Media ponderada por cos(lat) de las celdas con centro dentro de la caja. (nan, 0) si no hay datos.

    lat, lon: vectores 1D; field: [lat, lon] con NaN donde falta.
    """
    li = (lat >= box["la0"]) & (lat <= box["la1"])
    lo_w = ((lon - box["lo0"]) % 360)  # admite cajas que cruzan el antimeridiano
    lj = lo_w <= (box["lo1"] - box["lo0"])
    sub = field[np.ix_(li, lj)]
    w = np.cos(np.radians(lat[li]))[:, None] * np.ones(int(lj.sum()))[None, :]
    ok = np.isfinite(sub)
    n = int(ok.sum())
    if n == 0:
        return float("nan"), 0
    return float((sub[ok] * w[ok]).sum() / w[ok].sum()), n


def annual_mean(monthly: np.ndarray, min_months: int) -> np.ndarray:
    """[NT*12, ...] → [NT, ...] con la media de los meses válidos (NaN si hay menos de min_months)."""
    m = monthly.reshape((NT, 12) + monthly.shape[1:])
    cnt = np.isfinite(m).sum(axis=1)
    with np.errstate(invalid="ignore"):
        s = np.nansum(m, axis=1) / np.where(cnt > 0, cnt, 1)
    s[cnt < min_months] = np.nan
    return s


def nan_to_none(a) -> list:
    return [None if not np.isfinite(x) else float(x) for x in np.asarray(a, dtype=float)]


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


SOURCE_FIELDS = ["var", "role", "tool", "product", "layer", "region", "period", "units_in", "conversion",
                 "request", "downloaded", "notes"]


def upsert_sources(rows: list[dict]) -> None:
    """Agrega o reemplaza filas de SOURCES.csv (clave: var + role + product + region)."""
    key = lambda r: (r["var"], r["role"], r["product"], r.get("region", ""))
    old = []
    if SOURCES.exists():
        with SOURCES.open(encoding="utf-8", newline="") as f:
            old = list(csv.DictReader(f))
    new_keys = {key(r) for r in rows}
    merged = [r for r in old if key(r) not in new_keys] + rows
    with SOURCES.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SOURCE_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in merged:
            w.writerow({k: r.get(k, "") for k in SOURCE_FIELDS})


def today() -> str:
    return date.today().isoformat()
