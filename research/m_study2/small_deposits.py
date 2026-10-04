"""Effect of deposit size / minTrade on behaviour (non-overlapping 1y and 90d windows, ex-basket equity pool, 6 bps).
min buy = minTrade/(D*w); sells allowed above dust (1 USDT): min sell = min(dust, minTrade)/(D*w). w = token weight (1, or 1/3)."""
import numpy as np, pandas as pd
from common2 import *
S = series_returns(); rows = []
combos = [(55, 6), (125, 6), (125, 20), (500, 20), (1000, 20), (5000, 20), (1e9, 20)]
for term in [90, 365]:
    T = TERMS[term]; Ws = []
    for n, r in S.items():
        if SGROUP[n] == "Basket": continue
        v = r.values; idx = np.arange(0, len(v) - T + 1, T)
        if len(idx): Ws.append(np.stack([v[i:i + T] for i in idx]))
    W = np.concatenate(Ws); h = W.prod(1) - 1; up = h > 0
    for D, mt in combos:
        for w, wl in [(1.0, "1 token"), (1 / 3, "3 tokens equal")]:
            for fl in [0.80, 0.90, 0.95, 0.98]:
                estar = min(4 * (1 - fl), 1.0)
                ok_first = estar * w * D >= mt            # factory: every token's first target >= minTrade
                o = cppi2(W, fl, 6e-4, min_buy=mt / (D * w), min_sell=min(1.0, mt) / (D * w))
                V = o["V"]; ret = V - 1
                rows.append(dict(term=term, deposit=D if D < 1e8 else "infinite", minTrade=mt, basket=wl, floor=int(fl * 100), accepted_by_factory=ok_first,
                    n=len(V), breach_mat=(V < fl - 0.01).mean(), breach_any=(V < fl - 1e-6).mean(), mean_ret=ret.mean(), med_ret=np.median(ret),
                    capture_up=ret[up].sum() / h[up].sum(), avg_exp=o["avgE"].mean(), turnover=o["turn"].mean(), cost_paid=o["cost"].mean()))
pd.DataFrame(rows).to_csv("results/S5_deposit_size.csv", index=False)
