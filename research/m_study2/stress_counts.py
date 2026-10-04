"""How many non-overlapping windows actually put the floor under stress (holding the stock ended below the floor)?
Evidence strength per (term, floor). Also 'floor engaged' = vault sold down (avg exposure below start) -> proxied by hold < 1/... """
import numpy as np, pandas as pd
from common2 import *
rows = []
for term in TERMS:
    g = np.load(f"data/grid_{term}_nonov.npz"); meta = pd.read_csv(f"data/meta_{term}_nonov.csv.gz"); h = g["hold"].astype(float)
    s = meta.group.isin(["Index/ETF", "Single stock"]).values
    for fl in FLOORS:
        p = int(round(fl * 100)); st = s & (h < fl)
        V = g[f"V_6_{p}"].astype(float)
        rows.append(dict(term=term, floor=p, n=int(s.sum()), n_stress=int(st.sum()), n_stress_years=int(meta.year[st].nunique()), n_stress_series=int(meta.series[st].nunique()),
                         vault_med_in_stress=float(np.median(V[st] - 1)) if st.any() else np.nan, hold_med_in_stress=float(np.median(h[st] - 1)) if st.any() else np.nan,
                         vault_below_floor_in_stress=float((V[st] < fl - 1e-6).mean()) if st.any() else np.nan,
                         vault_mat_breach_in_stress=float((V[st] < fl - 0.01).mean()) if st.any() else np.nan))
pd.DataFrame(rows).to_csv("results/S6_stress_counts.csv", index=False)
d = pd.DataFrame(rows); print(d.pivot(index="floor", columns="term", values="n_stress")); print(d.pivot(index="floor", columns="term", values="n_stress_years"))
print(d[d.term == 365][["floor", "n_stress", "vault_below_floor_in_stress", "vault_mat_breach_in_stress"]])
