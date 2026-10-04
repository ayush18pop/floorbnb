"""Grid: term x floor x cost, non-overlapping ('nonov') and weekly-start overlapping ('ov') windows.
usage: run_grid.py TERM_DAYS  -> data/grid_<term>.npz (per-window arrays) + data/meta_<term>_<mode>.csv.gz"""
import sys, numpy as np, pandas as pd
from common2 import *
term = int(sys.argv[1]); T = TERMS[term]
S = series_returns()
for mode in ["nonov", "ov"]:
    step = T if mode == "nonov" else (1 if T <= 5 else 5)
    Ws, meta = [], []
    for name, r in S.items():
        v = r.values; lr = np.log(r.values)
        idx = np.arange(0, len(v) - T + 1, step)
        if len(idx) == 0: continue
        Ws.append(np.stack([v[i:i + T] for i in idx]))
        vol = pd.Series(lr).rolling(20).std().shift(0).values          # vol of the 20 days BEFORE the start (index i = first window day)
        vol_pre = np.where(idx >= 20, vol[np.maximum(idx - 1, 0)], np.nan)
        cum = np.exp(np.cumsum(lr)); peak = pd.Series(cum).rolling(252, min_periods=60).max().values
        dd = np.where(idx >= 1, cum[np.maximum(idx - 1, 0)] / peak[np.maximum(idx - 1, 0)] - 1, np.nan)
        pct = pd.Series(vol_pre).rank(pct=True).values
        meta.append(pd.DataFrame(dict(series=name, group=SGROUP[name], start=r.index[idx], year=r.index[idx].year,
                                      volpct=pct, dd=dd)))
    W = np.concatenate(Ws); meta = pd.concat(meta, ignore_index=True)
    out = dict(hold=W.prod(1))
    for cb in COSTS:
        for fl in FLOORS:
            o = cppi2(W, fl, cb / 1e4)
            for k, a in o.items(): out[f"{k}_{cb}_{int(round(fl*100))}"] = a.astype(np.float32)
    np.savez_compressed(f"data/grid_{term}_{mode}.npz", **out)
    meta.to_csv(f"data/meta_{term}_{mode}.csv.gz", index=False)
    print(term, mode, W.shape, flush=True)
