"""Tests de gldas.py con un .nc4 sintético que imita GLDAS_NOAH025_M.2.1 (sin red)."""
import calendar
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
netCDF4 = pytest.importorskip("netCDF4")

import common  # noqa: E402
import gldas  # noqa: E402

LAT = np.arange(-59.875, 90, 0.25)
LON = np.arange(-179.875, 180, 0.25)


def fake_gldas(path: Path, sm_kgm2: float = 25.0, rain: float = 3e-5, tskin: float = 300.0, ocean_lon=(0, 20)):
    """Archivo con campos constantes; una franja de «océano» (relleno) entre ocean_lon."""
    with netCDF4.Dataset(path, "w") as ds:
        ds.createDimension("time", 1); ds.createDimension("lat", LAT.size); ds.createDimension("lon", LON.size)
        ds.createVariable("lat", "f4", ("lat",))[:] = LAT
        ds.createVariable("lon", "f4", ("lon",))[:] = LON
        ds.createVariable("time", "f8", ("time",))[:] = [0]
        ocean = (LON >= ocean_lon[0]) & (LON < ocean_lon[1])
        for name, val, units in [("SoilMoi0_10cm_inst", sm_kgm2, "kg m-2"), ("Rainf_f_tavg", rain, "kg m-2 s-1"),
                                 ("AvgSurfT_inst", tskin, "K")]:
            v = ds.createVariable(name, "f4", ("time", "lat", "lon"), fill_value=-9999.0)
            v.units = units
            a = np.full((1, LAT.size, LON.size), val, dtype="f4")
            a[:, :, ocean] = -9999.0
            v[:] = a


def test_convert_units():
    a = np.array([25.0])
    assert gldas.convert("SoilMoi0_10cm_inst", "kg m-2", a, 2016, 5)[0] == pytest.approx(0.25)
    assert gldas.convert("SoilMoi10_40cm_inst", "kg m-2", np.array([90.0]), 2016, 5)[0] == pytest.approx(0.30)
    assert gldas.convert("Rainf_f_tavg", "kg m-2 s-1", np.array([1e-5]), 2016, 2)[0] == pytest.approx(1e-5 * 86400 * 29)
    assert gldas.convert("AvgSurfT_inst", "K", np.array([273.15]), 2016, 5)[0] == pytest.approx(0)
    with pytest.raises(ValueError):
        gldas.convert("SoilMoi0_10cm_inst", "m3 m-3", a, 2016, 5)


def test_box_mean_weights_and_antimeridian():
    lat = np.array([0.0, 60.0]); lon = np.array([179.0, -179.0])
    f = np.array([[1.0, 1.0], [3.0, 3.0]])
    m, n = common.box_mean(lat, lon, f, {"la0": -1, "la1": 61, "lo0": 178, "lo1": 182})
    assert n == 4
    w0, w1 = 1, math.cos(math.radians(60))
    assert m == pytest.approx((1 * w0 + 3 * w1) / (w0 + w1))


def test_process_file(tmp_path):
    p = tmp_path / "GLDAS_NOAH025_M.A201605.021.nc4"
    fake_gldas(p)
    regs = {"a:E": common.box_around(-10.8, -62.8, 2.2), "b:E": common.box_around(5, 20, 1)}
    res = gldas.process_file(p, 2016, 5, regs)
    assert res["boxes"]["sm"][0] == pytest.approx(0.25)
    assert res["boxes"]["gldas_precip"][0] == pytest.approx(3e-5 * 86400 * 31, rel=1e-5)
    assert res["boxes"]["gldas_skint"][0] == pytest.approx(300 - 273.15, abs=1e-4)
    assert res["counts"]["sm"][0] > 100
    # la caja b cae en parte sobre el «océano» (0–20°E): solo cuenta la parte al este de 20°E
    assert 0 < res["counts"]["sm"][1] < 8 * 9
    g = res["grids"]["sm"]
    assert g.shape == (180, 360)
    assert g[0, 0] == pytest.approx(0.25)      # 89.5°N: GLDAS llega a 89.875°N (4 filas de 0.25°)
    assert np.isnan(g[160]).all()             # 70.5°S: fuera de GLDAS
    assert g[100, 117] == pytest.approx(0.25)  # 10.5°S, 62.5°O
    assert np.isnan(g[100, 185])              # 5°E, «océano»


def test_annual_mean_min_months():
    a = np.ones((common.NT * 12, 2))
    a[:3, 0] = np.nan          # 2001 con 9 meses en la columna 0
    a[12:14, 0] = np.nan       # 2002 con 10 meses
    out = common.annual_mean(a, 10)
    assert np.isnan(out[0, 0]) and out[1, 0] == 1 and out[0, 1] == 1


def test_local_and_aggregate(tmp_path, monkeypatch):
    monkeypatch.setattr(gldas, "MONTHLY", tmp_path / "monthly")
    monkeypatch.setattr(gldas, "OUT", tmp_path / "out")
    monkeypatch.setattr(common, "SOURCES", tmp_path / "SOURCES.csv")
    src = tmp_path / "nc"; src.mkdir()
    for m in range(1, 13):
        fake_gldas(src / f"GLDAS_NOAH025_M.A2016{m:02d}.021.nc4", sm_kgm2=20 + m)
    gldas.main(["local", str(src)])
    gldas.main(["aggregate"])
    import json
    s = json.loads((tmp_path / "out" / "series_sm.json").read_text(encoding="utf-8"))
    y = s["regions"]["rondonia:E"]["y"]
    assert y[2016 - 2001] == pytest.approx(np.mean([(20 + m) / 100 for m in range(1, 13)]))
    assert y[0] is None
    z = np.load(tmp_path / "out" / "grid_sm.npz")
    assert z["data"].shape == (common.NT, 180, 360)
    pr = json.loads((tmp_path / "out" / "series_gldas_precip.json").read_text(encoding="utf-8"))["regions"]["rondonia:E"]["y"][15]
    days = sum(calendar.monthrange(2016, m)[1] for m in range(1, 13))
    assert pr == pytest.approx(3e-5 * 86400 * days / 12, rel=1e-5)
    assert len((tmp_path / "SOURCES.csv").read_text(encoding="utf-8").strip().splitlines()) == 4  # encabezado + 3
