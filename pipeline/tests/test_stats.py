import sys
from pathlib import Path

import numpy as np
import pymannkendall as pmk
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stats import fdr_mask, fdr_threshold, mk_test, regress_gt, sen_slope, trend_stats  # noqa: E402

N = 24


def _ar1(rng, n_series, phi=0.3, trend=0.0):
    e = np.zeros((n_series, N))
    e[:, 0] = rng.standard_normal(n_series)
    for t in range(1, N):
        e[:, t] = phi * e[:, t - 1] + rng.standard_normal(n_series)
    return e + trend * np.arange(N)


def test_sen_matches_pymannkendall():
    rng = np.random.default_rng(0)
    Y = _ar1(rng, 50, trend=rng.uniform(-0.1, 0.1, (50, 1)))
    ours = sen_slope(Y)
    ref = np.array([pmk.sens_slope(y).slope for y in Y])
    np.testing.assert_allclose(ours, ref, atol=1e-6)


def test_plain_mk_matches_pymannkendall():
    rng = np.random.default_rng(1)
    Y = _ar1(rng, 50, phi=0.0, trend=rng.uniform(-0.08, 0.08, (50, 1)))
    S, Z, p, tau = mk_test(Y)
    for k, y in enumerate(Y):
        r = pmk.original_test(y)
        assert S[k] == pytest.approx(r.s)
        assert p[k] == pytest.approx(r.p, abs=1e-9)


def test_tfpw_decision_matches_pymannkendall():
    rng = np.random.default_rng(2)
    Y = _ar1(rng, 50, phi=0.4, trend=rng.uniform(-0.12, 0.12, (50, 1)))
    ours = trend_stats(Y, prewhiten=True)
    agree = 0
    for k, y in enumerate(Y):
        r = pmk.trend_free_pre_whitening_modification_test(y)
        agree += (ours["p"][k] < 0.05) == (r.p < 0.05)
    # pymannkendall estima r1 con otra normalización de la autocorrelación;
    # aceptamos diferencias pequeñas en p, pero la decisión al 5 % debe coincidir casi siempre.
    assert agree >= 47


def test_perfect_trend_is_significant():
    Y = np.arange(N, dtype=float)[None, :] * 0.5
    r = trend_stats(Y)
    assert r["p"][0] < 0.001
    assert r["slope"][0] == pytest.approx(0.5)


def test_white_noise_false_positive_rate():
    rng = np.random.default_rng(3)
    r = trend_stats(rng.standard_normal((1000, N)), prewhiten=False)
    rate = np.mean(r["p"] < 0.05)
    assert 0.02 < rate < 0.08


def test_nan_cells_are_skipped():
    Y = np.vstack([np.arange(N, dtype=float), np.full(N, np.nan)])
    r = trend_stats(Y)
    assert np.isfinite(r["p"][0]) and np.isnan(r["p"][1])


def test_fdr_toy_case():
    p = np.array([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216, np.nan])
    # BH con alpha=0.05, m=10: umbrales k*0.005 -> solo las dos primeras pasan
    assert fdr_threshold(p, 0.05) == pytest.approx(0.008)
    sig, _ = fdr_mask(p, 0.05)
    assert sig.tolist() == [True, True] + [False] * 9


def test_fdr_none_pass():
    assert fdr_threshold(np.array([0.5, 0.9]), 0.05) == 0.0


def test_regress_gt_recovers_slope():
    rng = np.random.default_rng(4)
    gt = np.linspace(-0.2, 0.2, N) + rng.normal(0, 0.02, N)
    Y = 3.0 * gt[None, :] + rng.normal(0, 0.05, (20, N))
    b, se, p = regress_gt(Y, gt)
    assert np.all(np.abs(b - 3.0) < 4 * se)
    assert np.all(p < 0.001)
