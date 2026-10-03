"""Monte Carlo: (1) block bootstrap of real daily returns; (2) GJR-GARCH-t + injected single gaps; (3) deterministic 1/m test."""
import numpy as np, pandas as pd, sim, common as C
rng = np.random.default_rng(7)
MS = np.arange(1, 8.5, 0.5); T = 252
def stats(V, F=0.9):
    return dict(b=(V < F - 1e-9).mean(0), mb=(V < F - 0.01).mean(0), worst=V.min(0) - 1, med=np.median(V, 0) - 1)

# ---- (1) block bootstrap -------------------------------------------------------------------------------
series = C.all_series("close")
def pool(names): return [series[n].values for n in names]
POOLS = {"S&P 500 1928-2026": ["GSPC"],
         "US index/ETF pool": GROUPS if False else C.GROUPS["US index/ETF"],
         "Single-stock pool (23)": C.GROUPS["Single stock"],
         "Intl index pool": C.GROUPS["Intl index"]}
def bootstrap(arrs, n, L, rng):
    nb = T // L + 1
    out = np.empty((n, nb * L))
    for i in range(n):
        for j in range(nb):
            a = arrs[rng.integers(len(arrs))] if len(arrs) > 1 else arrs[0]
            s = rng.integers(0, len(a) - L)
            out[i, j * L:(j + 1) * L] = a[s:s + L]
    return out[:, :T]
import os
rows = []
for L in ([] if os.environ.get('SKIPBOOT') else [21, 63]):
    for name, names in POOLS.items():
        arrs = pool(names); N = 6000
        paths = bootstrap(arrs, N, L, rng)
        for fl in [0.8, 0.9, 0.95]:
            for mode_every in [1, 5]:
                res = sim.cppi(paths, MS, floor=fl, cost=6e-4, every=mode_every)
                st = stats(res["V"], fl); hold = paths.prod(1) - 1
                for k, m in enumerate(MS):
                    rows.append(dict(kind="block_bootstrap", pool=name, block=L, floor=fl, every=mode_every, m=m, breach=st["b"][k],
                                     mbreach=st["mb"][k], worst=st["worst"][k], median=st["med"][k], n=N))
    print("bootstrap", L, flush=True)
if rows: pd.DataFrame(rows).to_csv("results/MC1_block_bootstrap.csv", index=False)

# ---- (2) GJR-GARCH(1,1) with Student-t(4), plus injected gaps --------------------------------------------
def garch_paths(n, ann_vol, drift_ann=0.08, nu=4, alpha=0.07, gam=0.10, rng=rng, T=T):
    s2lr = (ann_vol / np.sqrt(252)) ** 2
    beta = 0.86; pers = alpha + gam / 2 + beta
    omega = s2lr * (1 - pers)
    s2 = np.full(n, s2lr); out = np.empty((n, T)); sc = np.sqrt((nu - 2) / nu)
    for t in range(T):
        z = rng.standard_t(nu, n) * sc
        e = np.clip(np.sqrt(s2) * z, -0.5, 0.5)
        out[:, t] = 1 + drift_ann / 252 + e
        s2 = np.minimum(omega + (alpha + gam * (e < 0)) * e ** 2 + beta * s2, 0.10 ** 2)
    return np.maximum(out, 0.05)
rows = []
for label, vol in [("index-like (18% vol)", 0.18), ("stock-like (45% vol)", 0.45)]:
    base = garch_paths(8000, vol)
    for g in [0, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40]:
        p = base.copy()
        if g > 0:
            d = rng.integers(0, T, len(p)); p[np.arange(len(p)), d] *= (1 - g)   # replaces that day's return multiplier
        for fl in [0.8, 0.9, 0.95]:
            res = sim.cppi(p, MS, floor=fl, cost=6e-4)
            st = stats(res["V"], fl)
            for k, m in enumerate(MS):
                rows.append(dict(kind="garch_gap", label=label, gap=g, floor=fl, m=m, breach=st["b"][k], mbreach=st["mb"][k], worst=st["worst"][k], n=len(p)))
    print("garch", label, flush=True)
pd.DataFrame(rows).to_csv("results/MC2_garch_gap.csv", index=False)

# ---- (3) deterministic 1/m test: start at target, calm path, one gap on day 100 -----------------------------
rows = []
gaps = np.arange(0.05, 0.50, 0.01)
for fl in [0.8, 0.9, 0.95]:
    for m in [2, 3, 4, 5, 6, 8]:
        for lead in ["start", "after +20% run-up"]:
            p = np.ones((len(gaps), T))
            if lead != "start": p[:, 50] = 1.0   # placeholder
            if lead == "after +20% run-up":
                p[:, 10:30] = 1.20 ** (1 / 20)       # +20% over 20 days
            p[np.arange(len(gaps)), 100] = 1 - gaps
            V = sim.cppi(p, [m], floor=fl, cost=0.0)["V"][:, 0]
            # breach at the gap day? use value just after gap: rerun truncated
            Vg = sim.cppi(p[:, :101], [m], floor=fl, cost=0.0)["vmin"][:, 0]
            for g, v in zip(gaps, Vg):
                rows.append(dict(floor=fl, m=m, scenario=lead, gap=g, breach=v < fl - 1e-9))
D = pd.DataFrame(rows)
thr = D[~D.breach].groupby(["floor", "m", "scenario"]).gap.max().rename("max_gap_survived").reset_index()
brk = D[D.breach].groupby(["floor", "m", "scenario"]).gap.min().rename("min_gap_breaching").reset_index()
thr = thr.merge(brk, on=["floor", "m", "scenario"]); thr["one_over_m"] = 1 / thr.m
thr.round(3).to_csv("results/MC3_deterministic_gap_threshold.csv", index=False); print(thr.round(3).to_string())
