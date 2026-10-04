"""Start-date-matters view: results by the regime at the window start (overlapping weekly starts, cost 6 bps) and
named crisis starts. Writes results/S3_start_regime.csv and S4_named_starts.csv."""
import numpy as np, pandas as pd
from common2 import *
rng = np.random.default_rng(11); B = 1000
rows = []
def ci(yc, ny, x):
    s = np.bincount(yc, weights=x, minlength=ny); n = np.bincount(yc, minlength=ny).astype(float)
    ids = rng.integers(0, ny, (B, ny)); v = s[ids].sum(1) / n[ids].sum(1); return np.nanpercentile(v, [2.5, 97.5])
REG = {"all starts": lambda m: np.ones(len(m), bool),
       "calm start (20d vol in bottom half)": lambda m: (m.volpct < 0.5).values,
       "high-vol start (20d vol in top 10%)": lambda m: (m.volpct >= 0.9).values,
       "start >=20% below 1y peak": lambda m: (m.dd <= -0.20).values,
       "start within 5% of 1y peak": lambda m: (m.dd >= -0.05).values}
for term in [7, 14, 30, 90, 365]:
    g = np.load(f"data/grid_{term}_ov.npz"); meta = pd.read_csv(f"data/meta_{term}_ov.csv.gz")
    base = meta.group.isin(["Index/ETF", "Single stock"]).values & meta.volpct.notna().values & meta.dd.notna().values
    hold = g["hold"].astype(float) - 1
    for rname, f in REG.items():
        s = base & f(meta)
        yrs, yc = np.unique(meta.year.values[s], return_inverse=True); ny = len(yrs)
        for fl in [80, 90, 95, 98]:
            V = g[f"V_6_{fl}"][s].astype(float); ret = V - 1; h = hold[s]; up = h > 0
            lock = ~np.isnan(g[f"first_lock_6_{fl}"][s]); ba = V < fl / 100 - 1e-6; bm = V < fl / 100 - 0.01
            l_lo, l_hi = ci(yc, ny, lock.astype(float)); b_lo, b_hi = ci(yc, ny, bm.astype(float))
            rows.append(dict(term=term, regime=rname, floor=fl, n=int(s.sum()), n_years=ny, lock=lock.mean(), lock_lo=l_lo, lock_hi=l_hi,
                breach_mat=bm.mean(), breach_mat_lo=b_lo, breach_mat_hi=b_hi, breach_any=ba.mean(),
                med_ret=np.median(ret), mean_ret=ret.mean(), med_hold=np.median(h), mean_hold=h.mean(),
                capture_up=ret[up].sum() / h[up].sum(), p10_ret=np.percentile(ret, 10), p10_hold=np.percentile(h, 10),
                worst_ret=ret.min(), worst_hold=h.min(), pct_loss=(ret < -1e-6).mean()))
pd.DataFrame(rows).to_csv("results/S3_start_regime.csv", index=False)
# named starts
S = series_returns(); named = {"1987-10-12": "Oct 1987 crash week", "2000-03-10": "Nasdaq 2000 peak", "2008-09-02": "Sep 2008 (Lehman month)",
    "2020-02-19": "Feb 2020 (Covid peak)", "2022-01-03": "Jan 2022 bear start", "2025-04-02": "Apr 2025 tariff shock"}
rows = []
for tk in ["GSPC", "NDX", "NVDA", "TSLA"]:
    r = S[tk]
    for d, lab in named.items():
        i = r.index.searchsorted(pd.Timestamp(d))
        if i >= len(r) or abs((r.index[i] - pd.Timestamp(d)).days) > 7 or r.index[0] > pd.Timestamp(d): continue
        for term, T in TERMS.items():
            if term not in (7, 30, 90, 365) or i + T > len(r): continue
            W = r.values[i:i + T][None, :]
            for fl in [80, 90, 95, 98]:
                o = cppi2(W, fl / 100, 6e-4)
                rows.append(dict(series=tk, start=r.index[i].date(), event=lab, term=term, floor=fl, hold=W.prod() - 1, vault=o["V"][0] - 1,
                                 locked=not np.isnan(o["first_lock"][0]), lock_at=o["first_lock"][0], end_vs_floor_pts=(o["V"][0] - fl / 100) * 100))
pd.DataFrame(rows).to_csv("results/S4_named_starts.csv", index=False)
