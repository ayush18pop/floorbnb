"""Tables from the non-overlapping grid + overlapping check + 1/m rule check."""
import pandas as pd, numpy as np, sim, common as C
rng = np.random.default_rng(1)
d = pd.read_csv("data/hist_windows.csv.gz", parse_dates=["start"])
d["year"] = d.start.dt.year
d["breach"] = d.ret < d.floor - 1 - 1e-9
d["mbreach"] = d.ret < d.floor - 1 - 0.01     # material: more than 1 point of deposit below the floor
d["shortfall"] = np.maximum(d.floor - 1 - d.ret, 0)
EQ = ["US index/ETF", "Intl index", "Single stock"]
d = d[d.group.isin(EQ + ["Basket"])]
d.to_pickle("data/hist_eq.pkl")

def agg(x):
    up = x.hold > 0
    return pd.Series(dict(
        n=len(x), breach_any=100 * x.breach.mean(), breach_material=100 * x.mbreach.mean(),
        worst_ret=100 * x.ret.min(), median_ret=100 * x.ret.median(), mean_ret=100 * x.ret.mean(),
        median_hold=100 * x.hold.median(), mean_hold=100 * x.hold.mean(),
        capture_up=100 * x.ret[up].mean() / x.hold[up].mean() if up.any() else np.nan,
        bad_yr_ret=100 * x.ret[x.hold < -0.1].median() if (x.hold < -0.1).any() else np.nan,
        bad_yr_hold=100 * x.hold[x.hold < -0.1].median() if (x.hold < -0.1).any() else np.nan,
        locked_pct=100 * x.locked.mean(), turnover=x.turnover.mean(), cost_drag_pct=100 * x.cost_paid.mean()))

def boot_ci(x, col, B=1000):
    """Year-cluster bootstrap CI for a rate: resample calendar years of window start (cross-asset dependence)."""
    g = {y: v[col].values for y, v in x.groupby("year")}
    ys = np.array(list(g)); out = []
    for _ in range(B):
        pick = rng.choice(ys, len(ys))
        out.append(np.concatenate([g[y] for y in pick]).mean())
    return 100 * np.percentile(out, [2.5, 97.5])

base = d[(d["mode"] == "close") & (d.floor == 0.9) & (d.cost_bps == 6)]
# pooled by group, then "all equity single+index" (excl. baskets, which are re-uses of the same stocks)
base_nb = base[base.group.isin(EQ)]
tabs = []
for gname, x in list(base_nb.groupby("group")) + [("ALL equity series", base_nb)]:
    t = x.groupby("m").apply(agg)
    t.insert(0, "group", gname); tabs.append(t.reset_index())
T1 = pd.concat(tabs)
# CI for breach at m=2..8 for ALL and each group
ci = []
for gname, x in list(base_nb.groupby("group")) + [("ALL equity series", base_nb)]:
    for m in [2, 3, 4, 5, 6, 8]:
        xm = x[x.m == m]
        lo, hi = boot_ci(xm, "mbreach"); lo2, hi2 = boot_ci(xm, "breach")
        ci.append(dict(group=gname, m=m, mbreach_lo=lo, mbreach_hi=hi, breach_lo=lo2, breach_hi=hi2))
T1 = T1.merge(pd.DataFrame(ci), on=["group", "m"], how="left")
T1.round(2).to_csv("results/T1_pooled_floor90_cost6_close.csv", index=False)
# baskets and sensitivity
tb = base[base.group == "Basket"].groupby(["series", "m"]).apply(agg).reset_index()
tb.round(2).to_csv("results/T2_baskets.csv", index=False)
sens = []
for (mode, fl, cb), x in d[d.group.isin(EQ)].groupby(["mode", "floor", "cost_bps"]):
    for m in [2, 3, 4, 5, 6]:
        a = agg(x[x.m == m]); a["mode"] = mode; a["floor"] = fl; a["cost_bps"] = cb; a["m"] = m; sens.append(a)
pd.DataFrame(sens).round(2).to_csv("results/T3_sensitivity.csv", index=False)
per = base_nb[base_nb.m == 4].groupby("series").apply(agg)
per.insert(0, "group", [C.group_of(s) for s in per.index])
per.round(2).to_csv("results/T4_per_series_m4.csv")
# history per series
hist = []
for s, r in C.all_series("close").items():
    hist.append(dict(series=s, group=C.group_of(s), first=r.index[0].date(), last=r.index[-1].date(), days=len(r),
                     worst_1day=100 * (r.min() - 1), worst_date=r.idxmin().date(), n_nonoverlap_windows=len(r) // 252))
pd.DataFrame(hist).round(2).to_csv("results/T0_data_inventory.csv", index=False)

# 1/m rule check: max single-period drop per window vs material breach, m=4, 6, 8
rows = []
for s, r in C.all_series("close").items():
    if C.group_of(s) not in EQ: continue
    W, idx = sim.make_windows(r.values, 252, 252)
    mx = (1 - W.min(1))
    for m in [3, 4, 5, 6, 8]:
        v = sim.cppi(W, [m], floor=0.9, cost=6e-4)["V"][:, 0] - 1
        rows.append(pd.DataFrame(dict(series=s, m=m, maxdrop=mx, ret=v)))
R = pd.concat(rows); R["mb"] = R.ret < -0.11
R["over"] = R.maxdrop > 1 / R.m
chk = R.groupby(["m", "over"]).agg(n=("mb", "size"), material_breaches=("mb", "sum"), rate=("mb", "mean")).round(4)
chk.to_csv("results/T5_one_over_m_rule.csv"); print(chk)
# cases: material breach but maxdrop <= 1/m
odd = R[(R.mb) & (~R.over)]
print("material breaches with no single-day drop > 1/m:\n", odd.round(3).to_string())
# overlapping (step 21) check at default config, equity series
ov = []
for s, r in C.all_series("close").items():
    if C.group_of(s) not in EQ: continue
    W, idx = sim.make_windows(r.values, 252, 21)
    res = sim.cppi(W, [3, 4, 5, 6], floor=0.9, cost=6e-4)
    for k, m in enumerate([3, 4, 5, 6]):
        ov.append(pd.DataFrame(dict(series=s, group=C.group_of(s), m=m, hold=W.prod(1) - 1, ret=res["V"][:, k] - 1)))
ov = pd.concat(ov); ov["b"] = ov.ret < -0.1 - 1e-9; ov["mb"] = ov.ret < -0.11
print(ov.groupby(["group", "m"])[["b", "mb"]].mean().mul(100).round(2).unstack(0))
print("windows:", ov[ov.m == 4].groupby("group").size())
ov.groupby(["group", "m"])[["b", "mb"]].mean().mul(100).round(2).to_csv("results/T6_overlap_step21.csv")
