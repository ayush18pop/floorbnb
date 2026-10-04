"""Public-number tables with 95% year-cluster bootstrap CIs (incl. medians) -> results/P1_public_numbers.csv and printed markdown."""
import numpy as np, pandas as pd
from common2 import *
rng = np.random.default_rng(3); B = 300
rows = []
for term in TERMS:
    g = np.load(f"data/grid_{term}_nonov.npz"); meta = pd.read_csv(f"data/meta_{term}_nonov.csv.gz")
    s = meta.group.isin(["Index/ETF", "Single stock"]).values; yr = meta.year.values[s]; yrs = np.unique(yr)
    byy = {y: np.where(yr == y)[0] for y in yrs}; h = g["hold"].astype(float)[s] - 1
    draws = [np.concatenate([byy[y] for y in rng.choice(yrs, len(yrs))]) for _ in range(B)]
    mh = np.percentile([np.median(h[d]) for d in draws], [2.5, 97.5])
    for fl in [80, 85, 90, 95, 98]:
        for cb in COSTS:
            V = g[f"V_{cb}_{fl}"].astype(float)[s]; ret = V - 1
            med = np.percentile([np.median(ret[d]) for d in draws], [2.5, 97.5])
            mean = np.percentile([ret[d].mean() for d in draws], [2.5, 97.5])
            rows.append(dict(term=term, floor=fl, cost=cb, n=int(s.sum()), med_ret=np.median(ret), med_lo=med[0], med_hi=med[1], med_hold=np.median(h), medh_lo=mh[0], medh_hi=mh[1],
                             mean_ret=ret.mean(), mean_lo=mean[0], mean_hi=mean[1], mean_hold=h.mean()))
pd.DataFrame(rows).to_csv("results/P1_median_ci.csv", index=False)
