"""Escritura del contrato de datos con el frontend (PLAN §4.6).

- manifest.json
- {id}.bin        Int16 LE, orden [cell][year], real = int*scale + offset, faltante = -32768
- {id}_stats.bin  Float32 LE, 6 bloques de nx*ny en el orden de STATS_FIELDS
- discover.json   {"changes": [...], "contrasts": [...]}

Este módulo lo usan tanto mock.py como el pipeline real, así ambos producen
exactamente el mismo formato.
"""
import json
from pathlib import Path

import numpy as np

from config import MANIFEST_FIELDS

MISSING = -32768
STATS_FIELDS = ["sen_per_decade", "p_trend", "sig_trend", "sens_b", "p_sens", "sig_sens"]


def encode_int16(cube):
    """Devuelve (int16 array, scale, offset) sin saturar el rango."""
    finite = np.isfinite(cube)
    if not finite.any():
        return np.full(cube.shape, MISSING, dtype="<i2"), 1.0, 0.0
    lo, hi = float(np.min(cube[finite])), float(np.max(cube[finite]))
    offset = (lo + hi) / 2
    scale = (hi - lo) / 64000 if hi > lo else 1.0
    q = np.round((cube - offset) / scale)
    q = np.where(finite, np.clip(q, -32000, 32000), MISSING)
    return q.astype("<i2"), scale, offset


def write_dataset(out_dir, *, grid, years, gt_series, obs_warming, variables,
                  synthetic=False, discover=None):
    """variables: lista de dicts con la metadata de config + 'cube' (ncell x nyears, NaN = faltante)
    y 'stats' (dict con STATS_FIELDS, arrays de ncell)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ncell = grid["nx"] * grid["ny"]
    nyears = years[1] - years[0] + 1
    entries = []
    for v in variables:
        cube = np.asarray(v["cube"], dtype=np.float64)
        assert cube.shape == (ncell, nyears), (v["id"], cube.shape)
        q, scale, offset = encode_int16(cube)
        (out / f"{v['id']}.bin").write_bytes(q.tobytes(order="C"))
        blocks = [np.asarray(v["stats"][k], dtype="<f4") for k in STATS_FIELDS]
        for b in blocks:
            assert b.shape == (ncell,)
        (out / f"{v['id']}_stats.bin").write_bytes(np.concatenate(blocks).tobytes())
        e = {k: v[k] for k in MANIFEST_FIELDS}
        e.update(data=f"{v['id']}.bin", stats=f"{v['id']}_stats.bin",
                 scale=scale, offset=offset)
        entries.append(e)

    manifest = {
        "synthetic": bool(synthetic),
        "grid": grid,
        "years": list(years),
        "gt": {"series": [round(float(x), 5) for x in gt_series],
               "obs_warming": round(float(obs_warming), 4)},
        "stats_fields": STATS_FIELDS,
        "variables": entries,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    disc = discover if discover is not None else {"changes": [], "contrasts": []}
    (out / "discover.json").write_text(json.dumps(disc, ensure_ascii=False), encoding="utf-8")
    return manifest
