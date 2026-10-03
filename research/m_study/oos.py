"""Out-of-sample choice of m. Calibrate on windows that END before the cutoff, test on windows that START after it
(windows straddling the cutoff are dropped = purge). Selection rules:
  naive0 : largest m with ZERO breaches (any shortfall) in calibration  (the logic of '93/93 held')
  mat1   : largest m with material breach rate (>1pt below floor) <= 1% in calibration
  best   : m maximising calibration mean return subject to material breach <= 1%
"""
import pandas as pd, numpy as np
d = pd.read_pickle("data/hist_eq.pkl")
d = d[(d["mode"] == "close") & (d.floor == 0.9) & (d.cost_bps == 6) & d.group.isin(["US index/ETF", "Intl index", "Single stock"])].copy()
d["end"] = d.start + pd.Timedelta(days=365)
UNIV = {"US index/ETF": ["US index/ETF"], "Single stock": ["Single stock"], "ALL equity": ["US index/ETF", "Intl index", "Single stock"],
        "Team assets (NVDA,TSLA,QQQ,SPY,AAPL)": None}
TEAM = ["NVDA", "TSLA", "QQQ", "SPY", "AAPL"]
def sub(u):
    return d[d.series.isin(TEAM)] if UNIV[u] is None else d[d.group.isin(UNIV[u])]
def pick(cal, rule):
    g = cal.groupby("m").agg(b=("breach", "mean"), mb=("mbreach", "mean"), mean=("ret", "mean"), n=("ret", "size"))
    if rule == "naive0": ok = g[g.b == 0]
    elif rule == "mat1": ok = g[g.mb <= 0.01]
    else: ok = g[g.mb <= 0.01]
    if ok.empty: return np.nan
    return ok["mean"].idxmax() if rule == "best" else ok.index.max()
def ev(x, m):
    x = x[x.m == m]; up = x.hold > 0
    return dict(n=len(x), breach_any=100 * x.breach.mean(), breach_mat=100 * x.mbreach.mean(), worst=100 * x.ret.min(),
                mean_ret=100 * x.ret.mean(), mean_hold=100 * x.hold.mean(),
                capture_up=100 * x.ret[up].mean() / x.hold[up].mean())
rows = []
splits = [("calibrate <=2014, test 2015+", None, "2014-12-31", "fwd"), ("calibrate <=2019, test 2020+", None, "2019-12-31", "fwd"),
          ("calibrate 2018+ (team sample), test <2018", "2018-01-01", None, "rev")]
for u in UNIV:
    x = sub(u)
    for name, a, cut, kind in splits:
        if kind == "fwd":
            cal = x[x.end <= pd.Timestamp(cut)]; te = x[x.start > pd.Timestamp(cut)]
        else:
            cal = x[x.start >= pd.Timestamp(a)]; te = x[x.end < pd.Timestamp(a)]
        if len(cal) < 5 or len(te) < 5: continue
        for rule in ["naive0", "mat1", "best"]:
            m = pick(cal, rule)
            if np.isnan(m): continue
            c = ev(cal, m); t = ev(te, m)
            rows.append(dict(universe=u, split=name, rule=rule, chosen_m=m, cal_n=c["n"], cal_breach_any=c["breach_any"], cal_breach_mat=c["breach_mat"],
                             test_n=t["n"], test_breach_any=t["breach_any"], test_breach_mat=t["breach_mat"], test_worst=t["worst"],
                             test_mean_ret=t["mean_ret"], test_mean_hold=t["mean_hold"], test_capture_up=t["capture_up"]))
R = pd.DataFrame(rows).round(2); R.to_csv("results/T7_oos_choice.csv", index=False)
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
print(R.to_string(index=False))
# fixed m=4 in each split, as reference
ref = []
for u in UNIV:
    x = sub(u)
    for name, a, cut, kind in splits:
        te = x[x.start > pd.Timestamp(cut)] if kind == "fwd" else x[x.end < pd.Timestamp(a)]
        for m in [3, 4, 5, 6]:
            if len(te): ref.append(dict(universe=u, split=name, m=m, **ev(te, m)))
pd.DataFrame(ref).round(2).to_csv("results/T7b_oos_fixed_m.csv", index=False)
