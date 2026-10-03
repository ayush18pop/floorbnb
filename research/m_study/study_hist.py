"""Historical grid: non-overlapping 1-year windows. Writes data/hist_windows.csv.gz (one row per series x window x config)."""
import numpy as np, pandas as pd, itertools, sim, common as C
MS = np.arange(1, 8.5, 0.5); FLOORS = [0.80, 0.85, 0.90, 0.95]; COSTS = [2, 6, 25, 50]
rows = []
S = {"close": C.all_series("close"), "window": C.all_series("window")}
for name in S["close"]:
    for mode in ["close", "window", "weekly"]:
        r = S["window" if mode == "window" else "close"][name]
        if name == "BTC-USD" and mode != "close": continue
        v = r.values
        W, idx = sim.make_windows(v, 252, 252)
        if len(W) < 2: continue
        dates = r.index[idx]
        h = W.prod(1)
        for fl in FLOORS:
            for cb in COSTS:
                res = sim.cppi(W, MS, floor=fl, cost=cb / 1e4, every=5 if mode == "weekly" else 1)
                for k, m in enumerate(MS):
                    rows.append(pd.DataFrame(dict(series=name, group=C.group_of(name), mode=mode, floor=fl, cost_bps=cb, m=m,
                        start=dates, hold=h - 1, ret=res["V"][:, k] - 1, locked=res["locked"][:, k],
                        turnover=res["turnover"][:, k], cost_paid=res["cost"][:, k])))
    print(name, flush=True)
pd.concat(rows).to_csv("data/hist_windows.csv.gz", index=False)
