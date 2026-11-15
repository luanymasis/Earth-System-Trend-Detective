"""Une las series y grillas de pipeline/out/ en el contrato de datos (PLAN_FASE3 §4).

No calcula el análisis (vive solo en web/src/lib/event.js). Por cada variable del contrato:
  - si hay pipeline/out/series_{var}.json con rol «primary» → se usan los datos reales;
  - si no, y existe el mock (npm run mock), se conservan las series, teselas y capa global SIMULADAS
    de esa variable, marcadas con "synthetic": true. Con --no-mock quedan en null.
El manifest lleva "synthetic": true mientras quede alguna variable simulada.

Las series de verificación (rol verify_*) van a events/{id}.json → "verify".

Uso (desde pipeline/):
  python build_events.py            # escribe en web/public/data/
  python build_events.py --no-mock  # solo datos reales
"""
from __future__ import annotations

import argparse
import csv
import json
import sys

import numpy as np

from common import NT, OUT, SOURCES, WEB_DATA, Y0, Y1, load_events

MISSING = -32768

# Metadata de las variables del contrato (igual que web/scripts/mock-verde.mjs).
VARS = [
    {"id": "tree", "short": "Vegetación", "name": "Cobertura arbórea", "noun": "la cobertura arbórea", "units": "%", "unitsCh": "puntos",
     "rel": False, "minsd": 0.6, "palette": "VEGDIV", "scale": 14, "layer": "tiles", "q": 0.01,
     "product": "MODIS VCF (MOD44B), vía AppEEARS", "source": {"tool": "AppEEARS", "product": "MOD44B.061", "layer": "Percent_Tree_Cover"}},
    {"id": "lst", "short": "Temperatura", "name": "Temperatura de superficie (día)", "noun": "la temperatura de superficie", "units": "°C", "unitsCh": "°C",
     "rel": False, "minsd": 0.12, "palette": "RdBu", "scale": 1.5, "layer": "tiles", "q": 0.01,
     "product": "MODIS LST (MOD11), vía AppEEARS", "source": {"tool": "AppEEARS", "product": "MOD11B3.061", "layer": "LST_Day_6km"}},
    {"id": "sm", "short": "Humedad", "name": "Humedad del suelo", "noun": "la humedad del suelo", "units": "m³/m³", "unitsCh": "m³/m³",
     "rel": False, "minsd": 0.004, "palette": "BrBG", "scale": 0.03, "layer": "global", "q": 0.0001,
     "product": "GLDAS Noah 2.1 (0–10 cm), NASA GES DISC", "source": {"tool": "GES DISC", "product": "GLDAS_NOAH025_M.2.1", "layer": "SoilMoi0_10cm_inst"}},
    {"id": "precip", "short": "Precipitación", "name": "Precipitación", "noun": "la precipitación", "units": "mm/mes", "unitsCh": "%",
     "rel": True, "minsd": 2.5, "palette": "BrBG", "scale": 25, "layer": "global", "q": 0.1,
     "product": "GPM IMERG mensual, vía Giovanni", "source": {"tool": "Giovanni", "product": "GPM_3IMERGM v07", "layer": "precipitation"}},
]


def rbox(b: dict) -> dict:
    return {k: round(v, 3) for k, v in b.items()}


def same_box(a: dict | None, b: dict, tol: float = 0.01) -> bool:
    return a is not None and all(abs(a[k] - b[k]) <= tol for k in ("la0", "la1", "lo0", "lo1"))


def r5(x):
    return None if x is None else round(x, 5)


def load_real() -> tuple[dict, dict]:
    """{var: series_json} con rol primary y {verify_id: series_json}."""
    prim, ver = {}, {}
    for p in sorted(OUT.glob("series_*.json")):
        s = json.loads(p.read_text(encoding="utf-8"))
        if len(s["regions"]) and len(next(iter(s["regions"].values()))["y"]) != NT or s["years"] != [Y0, Y1]:
            sys.exit(f"{p.name}: años distintos de {Y0}–{Y1}")
        (prim if s["role"] == "primary" else ver)[s["var"]] = s
    return prim, ver


def write_grid(path, data: np.ndarray, q: float) -> int:
    buf = np.where(np.isfinite(data), np.clip(np.round(data / q), -32767, 32767), MISSING).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buf.tobytes())
    return buf.nbytes


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-mock", action="store_true", help="no rellenar variables sin datos reales con el mock")
    args = ap.parse_args(argv)

    evs = load_events()
    prim, ver = load_real()
    contract_ids = {v["id"] for v in VARS}
    for vid in prim:
        if vid not in contract_ids:
            sys.exit(f"series_{vid}.json tiene rol primary pero «{vid}» no es una variable del contrato")

    mock = None
    mpath = WEB_DATA / "manifest.json"
    if not args.no_mock:
        if not mpath.exists():
            sys.exit("No hay datos del mock en web/public/data. Corre «npm run mock» en web/ o usa --no-mock.")
        mock = json.loads(mpath.read_text(encoding="utf-8"))
        mock_events = {e["id"]: e for e in mock["events"]}
        # leer TODO el mock antes de escribir encima
        mock_series = {e["id"]: json.loads((WEB_DATA / e["series"]).read_text(encoding="utf-8")) for e in mock["events"]}
        mock_vars = {v["id"]: v for v in mock["variables"]}
        mock_synth = {vid: (mock_vars.get(vid, {}).get("synthetic", mock.get("synthetic", False))) for vid in contract_ids}

    def synthetic_fallback(vid: str) -> bool:
        return mock is not None and vid not in prim and mock_synth.get(vid, False)

    variables, bytes_total = [], 0
    for v in VARS:
        out = {k: x for k, x in v.items() if k != "q"}
        if v["id"] in prim:
            s = prim[v["id"]]
            out["synthetic"] = False
            out["source"] = {"tool": s["tool"], "product": s["product"], "layer": s["layer"]}
        else:
            out["synthetic"] = synthetic_fallback(v["id"])
            if out["synthetic"]:
                out["product"] = mock_vars[v["id"]].get("product", out["product"])
        variables.append(out)

    (WEB_DATA / "events").mkdir(parents=True, exist_ok=True)
    m_events, warnings = [], []
    for e in evs:
        eid = e["id"]
        me = mock_events.get(eid) if mock else None
        box_ok = me is not None and same_box(me["box"], e["box"]) and same_box(me["ctrl"]["box"], e["ctrl_box"])
        if mock and not box_ok:
            warnings.append(f"{eid}: las cajas cambiaron respecto al mock; las variables simuladas quedan en null")
        series = {}
        for v in VARS:
            vid = v["id"]
            if vid in prim:
                rE, rC = prim[vid]["regions"].get(f"{eid}:E"), prim[vid]["regions"].get(f"{eid}:C")
                if rE is None or rC is None:
                    warnings.append(f"{eid}: {vid} sin caja en series_{vid}.json (¿cambió events.yaml? vuelve a procesar)")
                series[vid] = {"event": [r5(x) for x in (rE or {"y": [None] * NT})["y"]],
                               "control": [r5(x) for x in (rC or {"y": [None] * NT})["y"]],
                               "n_event": (rE or {}).get("n", 0), "n_control": (rC or {}).get("n", 0)}
            elif synthetic_fallback(vid) and box_ok:
                series[vid] = mock_series[eid]["series"][vid]
            else:
                series[vid] = {"event": [None] * NT, "control": [None] * NT, "n_event": 0, "n_control": 0}
        verify = {}
        for vid, s in ver.items():
            rE, rC = s["regions"].get(f"{eid}:E"), s["regions"].get(f"{eid}:C")
            if rE and rC:
                verify[vid] = {"role": s["role"], "product": s["product"], "layer": s["layer"], "units": s["units"],
                               "event": [r5(x) for x in rE["y"]], "control": [r5(x) for x in rC["y"]]}
        stations = mock_series[eid].get("stations", []) if (mock and box_ok and eid in mock_series) else []
        doc = {"id": eid, "series": series, "verify": verify, "stations": stations}
        txt = json.dumps(doc, ensure_ascii=False)
        (WEB_DATA / "events" / f"{eid}.json").write_text(txt, encoding="utf-8")
        bytes_total += len(txt.encode())

        tiles = []
        if me and box_ok:  # teselas solo existen simuladas por ahora (vegetación y temperatura, H7)
            for t in me.get("tiles", []):
                files = {k: f for k, f in t["files"].items() if synthetic_fallback(k)}
                if files:
                    tiles.append({**t, "files": files, "enc": {k: t["enc"][k] for k in files}})
        la, lo = e["center"]; cla, clo = e["control"]["center"]
        m_events.append({
            "id": eid, "type": e["type"], "name": e["name"], "place": e["place"], "desc": e.get("desc", ""),
            "lat": la, "lon": lo, "r": e["r"], "year": e["year"], "skip": e.get("skip", 0), "box": rbox(e["box"]),
            "ctrl": {"name": e["control"]["name"], "lat": cla, "lon": clo, "box": rbox(e["ctrl_box"]),
                     "status": e["control"].get("status", ""), "why": e["control"].get("why", "")},
            "series": f"events/{eid}.json", "tiles": tiles,
        })

    glob = []
    for v in VARS:
        vid = v["id"]
        if v["layer"] != "global":
            continue
        gp = OUT / f"grid_{vid}.npz"
        if vid in prim and gp.exists():
            z = np.load(gp)
            grid = json.loads(str(z["grid"]))
            data = z["data"]
            if data.shape != (NT, grid["ny"], grid["nx"]):
                sys.exit(f"{gp.name}: forma {data.shape} ≠ ({NT}, {grid['ny']}, {grid['nx']})")
            file = f"global/{vid}.bin"
            bytes_total += write_grid(WEB_DATA / file, data, v["q"])
            glob.append({"var": vid, "grid": grid, "file": file, "scale": v["q"], "offset": 0})
        elif synthetic_fallback(vid):
            glob += [g for g in mock.get("global", []) if g["var"] == vid]

    sources = []
    if SOURCES.exists():
        with SOURCES.open(encoding="utf-8", newline="") as f:
            sources = list(csv.DictReader(f))

    manifest = {
        "synthetic": any(v["synthetic"] for v in variables) or not prim,
        "years": [Y0, Y1],
        "variables": variables,
        "events": m_events,
        "global": glob,
        "sources": sources,
    }
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    for w in warnings:
        print("⚠", w)
    print("Variables:", ", ".join(f"{v['id']}={'simulada' if v['synthetic'] else ('real' if v['id'] in prim else 'sin datos')}" for v in variables))
    print(f"Listo: {WEB_DATA} (+{bytes_total / 1e6:.1f} MB escritos)")


if __name__ == "__main__":
    main()
