"""Aggregate grid results into results/S1_nonoverlap.csv and S2_overlap.csv with year-cluster bootstrap 95% CIs.
Bootstrap = resample calendar start-years with replacement (blocks that keep cross-series and overlap correlation)."""
import numpy as np, pandas as pd
from common2 import *
rng = np.random.default_rng(7); B = 1000
GR = {"All equity (ex-basket)": lambda m: m.group.isin(["Index/ETF", "Single stock"]).values,
      "Index/ETF": lambda m: (m.group == "Index/ETF").values,
      "Single stock": lambda m: (m.group == "Single stock").values,
      "Basket": lambda m: (m.group == "Basket").values}

def boot_ratio(yr_codes, num, den, nyr):
    """per-year sums num/den -> bootstrap CI of sum(num)/sum(den)."""
    sn = np.bincount(yr_codes, weights=num, minlength=nyr); sd = np.bincount(yr_codes, weights=den, minlength=nyr)
    ids = rng.integers(0, nyr, (B, nyr)); a = sn[ids].sum(1); b = sd[ids].sum(1)
    with np.errstate(all="ignore"): x = a / b
    return np.nanpercentile(x, [2.5, 97.5]) if np.isfinite(x).any() else (np.nan, np.nan)

rows = []
for mode in ["nonov", "ov"]:
    for term in TERMS:
        g = np.load(f"data/grid_{term}_{mode}.npz"); meta = pd.read_csv(f"data/meta_{term}_{mode}.csv.gz")
        hold = g["hold"].astype(float) - 1
        for gname, sel in GR.items():
            s = sel(meta)
            if s.sum() < 5: continue
            yrs, yc = np.unique(meta.year.values[s], return_inverse=True); ny = len(yrs)
            h = hold[s]; up = h > 0; down = h < 0; sev = h < -0.10
            for cb in COSTS:
                for fl in FLOORS:
                    p = int(round(fl * 100)); V = g[f"V_{cb}_{p}"][s].astype(float); ret = V - 1
                    fk = g[f"first_lock_{cb}_{p}"][s]; lock = ~np.isnan(fk)
                    bm = (V < fl - 0.01).astype(float); ba = (V < fl - 1e-6).astype(float)
                    one = np.ones(len(V))
                    lo, hi = boot_ratio(yc, bm, one, ny); alo, ahi = boot_ratio(yc, ba, one, ny)
                    llo, lhi = boot_ratio(yc, lock.astype(float), one, ny)
                    clo, chi = boot_ratio(yc, np.where(up, ret, 0), np.where(up, h, 0), ny)
                    rows.append(dict(mode=mode, term=term, group=gname, cost=cb, floor=p, n=int(s.sum()), n_years=ny,
                        breach_mat=bm.mean(), breach_mat_lo=lo, breach_mat_hi=hi, breach_any=ba.mean(), breach_any_lo=alo, breach_any_hi=ahi,
                        worst_shortfall_pts=float(np.min(V - fl) * 100), worst_ret=ret.min(),
                        lock=lock.mean(), lock_lo=llo, lock_hi=lhi, lock_when_med=float(np.nanmedian(fk)) if lock.any() else np.nan,
                        med_ret=np.median(ret), mean_ret=ret.mean(), med_hold=np.median(h), mean_hold=h.mean(),
                        capture_up=ret[up].sum() / h[up].sum() if up.any() else np.nan, capture_lo=clo, capture_hi=chi,
                        med_up_ret=np.median(ret[up]) if up.any() else np.nan, med_up_hold=np.median(h[up]) if up.any() else np.nan,
                        med_down_ret=np.median(ret[down]) if down.any() else np.nan, med_down_hold=np.median(h[down]) if down.any() else np.nan,
                        n_sev=int(sev.sum()), med_sev_ret=np.median(ret[sev]) if sev.any() else np.nan, med_sev_hold=np.median(h[sev]) if sev.any() else np.nan,
                        near_floor=(V < fl + 0.02).mean(), breach_depth_med_pts=(float(np.median((V - fl)[V < fl - 1e-6]) * 100) if (V < fl - 1e-6).any() else np.nan), pct_gain=(V > 1 + 1e-6).mean(), pct_ge_dep=(V >= 1 - 1e-6).mean(), pct_down_gt0=(ret < -1e-6).mean(),
                        cost_paid=g[f"cost_{cb}_{p}"][s].mean(), turnover=g[f"turn_{cb}_{p}"][s].mean(),
                        avg_exp=g[f"avgE_{cb}_{p}"][s].mean(), mostly_cash=(g[f"avgE_{cb}_{p}"][s] < 0.05).mean(),
                        never_above_2pct=(g[f"maxE_{cb}_{p}"][s] < 0.02).mean()))
        print(mode, term, flush=True)
df = pd.DataFrame(rows)
df[df["mode"] == "nonov"].drop(columns="mode").to_csv("results/S1_nonoverlap.csv", index=False)
df[df["mode"] == "ov"].drop(columns="mode").to_csv("results/S2_overlap.csv", index=False)
