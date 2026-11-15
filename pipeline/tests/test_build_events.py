"""build_events.py: las variables reales reemplazan a las simuladas del mock y se marcan por variable."""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_events  # noqa: E402
import common  # noqa: E402

MOCK = common.WEB_DATA


@pytest.fixture
def env(tmp_path, monkeypatch):
    if not (MOCK / "manifest.json").exists() or not json.loads((MOCK / "manifest.json").read_text(encoding="utf-8"))["synthetic"]:
        pytest.skip("hace falta el mock en web/public/data (npm run mock)")
    web = tmp_path / "data"
    shutil.copytree(MOCK, web)
    out = tmp_path / "out"; out.mkdir()
    for mod in (build_events, common):
        monkeypatch.setattr(mod, "WEB_DATA", web)
        monkeypatch.setattr(mod, "OUT", out)
        monkeypatch.setattr(mod, "SOURCES", tmp_path / "SOURCES.csv")
    evs = common.load_events()
    regs = common.regions(evs)
    ys = [0.2 + 0.001 * t for t in range(common.NT)]
    ys[3] = None
    common.write_json(out / "series_sm.json", {"var": "sm", "role": "primary", "years": [common.Y0, common.Y1], "units": "m³/m³",
                                               "tool": "GES DISC", "product": "GLDAS_NOAH025_M.2.1", "layer": "SoilMoi0_10cm_inst",
                                               "regions": {k: {"y": ys, "n": 100} for k in regs}})
    common.write_json(out / "series_gldas_skint.json", {"var": "gldas_skint", "role": "verify_lst", "years": [common.Y0, common.Y1],
                                                        "units": "°C", "tool": "GES DISC", "product": "GLDAS_NOAH025_M.2.1",
                                                        "layer": "AvgSurfT_inst", "regions": {k: {"y": [25.0] * common.NT, "n": 9} for k in regs}})
    g = np.full((common.NT, 180, 360), np.nan, dtype=np.float32); g[:, 100, 117] = 0.31
    np.savez_compressed(out / "grid_sm.npz", data=g, grid=json.dumps({"res": 1, "lat0": 89.5, "lon0": -179.5, "nx": 360, "ny": 180}))
    return web


def test_mixed_real_and_mock(env):
    build_events.main([])
    m = json.loads((env / "manifest.json").read_text(encoding="utf-8"))
    flags = {v["id"]: v["synthetic"] for v in m["variables"]}
    assert flags == {"tree": True, "lst": True, "sm": False, "precip": True}
    assert m["synthetic"] is True
    assert len(m["events"]) == 8 and m["events"][1]["ctrl"]["status"] == "provisional"
    ev = json.loads((env / "events" / "rondonia.json").read_text(encoding="utf-8"))
    assert ev["series"]["sm"]["event"][3] is None and ev["series"]["sm"]["event"][0] == 0.2
    assert all(x is not None for x in ev["series"]["tree"]["event"])  # sigue el mock
    assert ev["verify"]["gldas_skint"]["control"][0] == 25.0
    # teselas: solo variables simuladas; capa global de sm real
    assert all(set(t["files"]) <= {"tree", "lst"} for e in m["events"] for t in e["tiles"])
    gs = {x["var"]: x for x in m["global"]}
    raw = np.frombuffer((env / gs["sm"]["file"]).read_bytes(), dtype="<i2").reshape(common.NT, 180, 360)
    assert raw[0, 100, 117] * gs["sm"]["scale"] == pytest.approx(0.31) and raw[0, 0, 0] == -32768


def test_no_mock_leaves_nulls(env):
    build_events.main(["--no-mock"])
    m = json.loads((env / "manifest.json").read_text(encoding="utf-8"))
    assert m["synthetic"] is False
    assert {v["id"]: v["synthetic"] for v in m["variables"]}["tree"] is False
    ev = json.loads((env / "events" / "chaco.json").read_text(encoding="utf-8"))
    assert ev["series"]["tree"]["event"] == [None] * common.NT
    assert [x["var"] for x in m["global"]] == ["sm"]
