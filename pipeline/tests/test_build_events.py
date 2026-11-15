"""build_events.py: datos reales y ausencias explícitas en el contrato."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_events  # noqa: E402
import common  # noqa: E402

@pytest.fixture
def env(tmp_path, monkeypatch):
    web = tmp_path / "data"; web.mkdir()
    out = tmp_path / "out"; out.mkdir()
    for mod in (build_events, common):
        monkeypatch.setattr(mod, "WEB_DATA", web)
        monkeypatch.setattr(mod, "OUT", out)
        monkeypatch.setattr(mod, "SOURCES", tmp_path / "SOURCES.csv")
    evs = common.load_events()
    regs = common.regions(evs)
    ys = [0.2 + 0.001 * t for t in range(common.NM)]
    ys[3] = None
    common.write_json(out / "series_sm.json", {"var": "sm", "role": "primary", "dates": common.DATES, "units": "m³/m³",
                                               "tool": "GES DISC", "product": "GLDAS_NOAH025_M.2.1", "layer": "SoilMoi0_10cm_inst",
                                               "regions": {k: {"y": ys, "n": 100} for k in regs}})
    common.write_json(out / "series_gldas_skint.json", {"var": "gldas_skint", "role": "verify_lst", "dates": common.DATES,
                                                        "units": "°C", "tool": "GES DISC", "product": "GLDAS_NOAH025_M.2.1",
                                                        "layer": "Tair_f_inst", "regions": {k: {"y": [25.0] * common.NM, "n": 9} for k in regs}})
    g = np.full((common.NM, 180, 360), np.nan, dtype=np.float32); g[:, 100, 117] = 0.31
    np.savez_compressed(out / "grid_sm.npz", data=g, grid=json.dumps({"res": 1, "lat0": 89.5, "lon0": -179.5, "nx": 360, "ny": 180}))
    return web


def test_real_data_and_missing_values(env):
    build_events.main([])
    m = json.loads((env / "manifest.json").read_text(encoding="utf-8"))
    assert m["dates"][0] == "2001-01" and m["dates"][-1] == "2024-12"
    assert m["years"] == [common.Y0, common.Y1]
    assert all("synthetic" not in v for v in m["variables"])
    assert len(m["events"]) == 8 and m["events"][1]["ctrl"]["status"] == "provisional"
    ev = json.loads((env / "events" / "rondonia.json").read_text(encoding="utf-8"))
    assert ev["series"]["sm"]["event"][3] is None and ev["series"]["sm"]["event"][0] == 0.2
    assert ev["series"]["tree"]["event"] == [None] * common.NM
    assert ev["verify"]["gldas_skint"]["control"][0] == 25.0
    assert all(not t["files"] for e in m["events"] for t in e["tiles"])
    gs = {x["var"]: x for x in m["global"]}
    raw = np.frombuffer((env / gs["sm"]["file"]).read_bytes(), dtype="<i2").reshape(common.NM, 180, 360)
    assert raw[0, 100, 117] * gs["sm"]["scale"] == pytest.approx(0.31) and raw[0, 0, 0] == -32768


def test_missing_data_leaves_empty_layers(env):
    build_events.main([])
    m = json.loads((env / "manifest.json").read_text(encoding="utf-8"))
    ev = json.loads((env / "events" / "chaco.json").read_text(encoding="utf-8"))
    assert ev["series"]["tree"]["event"] == [None] * common.NM
    assert [x["var"] for x in m["global"]] == ["sm"]
