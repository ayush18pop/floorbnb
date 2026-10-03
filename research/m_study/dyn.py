"""Dynamic m: simple explainable rules vs fixed m, walk-forward (calibrate before cutoff, test after). Equity series, floor 90%, 6 bps."""
import numpy as np, pandas as pd, sim, common as C
rng = np.random.default_rng(3)
STEP = 63; LB = 252
S = C.all_series("close")
rows = []; Ws = []; Mp = {"gap": [], "vol": []}; meta = []
KG = np.round(np.concatenate([np.arange(0.10, 0.50, 0.05), np.arange(0.5, 1.31, 0.1)]), 2)           # k for m = k / trailing-worst-1day-loss
KV = np.round(np.arange(0.03, 0.181, 0.01), 3)        # k for m = k / trailing 63d daily vol
for s, r in S.items():
    if C.group_of(s) not in C.EQ: continue
    v = r.values; loss = np.maximum(1 - v, 0)
    ls = pd.Series(loss)
    G = ls.rolling(LB).max().clip(lower=0.02).values            # worst 1-day loss over last 252 days (incl. today)
    sig = pd.Series(v - 1).rolling(63).std().clip(lower=0.004).values
    idx = np.arange(LB, len(v) - 252 + 1, STEP)
    if len(idx) == 0: continue
    for i in idx:
        Ws.append(v[i:i + 252])
        # feature for step j uses data through index i+j-1
        g = G[i - 1:i - 1 + 252]; sg = sig[i - 1:i - 1 + 252]
        Mp["gap"].append(np.clip(KG[None, :] / g[:, None], 1, 8)); Mp["vol"].append(np.clip(KV[None, :] / sg[:, None], 1, 8))
        meta.append((s, C.group_of(s), r.index[i], r.index[i + 251]))
W = np.array(Ws); MG = np.stack(Mp["gap"]); MV = np.stack(Mp["vol"])
meta = pd.DataFrame(meta, columns=["series", "group", "start", "end"])
hold = W.prod(1) - 1
print("windows", len(W))
MSF = np.arange(1, 8.5, 0.5)
fixed = sim.cppi(W, MSF, floor=0.9, cost=6e-4)["V"]
dgap = dvol = None
# average m used (for reference)
avg_m_gap = MG.mean(1); avg_m_vol = MV.mean(1)
mx = 1 - W.min(1)   # realised worst 1-day drop in each window
orc_m = np.clip(0.98 / np.maximum(mx, 1e-6), 1, 8)
oracle = np.array([sim.cppi(W[i:i + 1], [orc_m[i]], floor=0.9, cost=6e-4)["V"][0, 0] for i in range(len(W))])[:, None]
np.savez("data/dyn_cache.npz", W=W, MG=MG, MV=MV, fixed=fixed, oracle=oracle)
meta.to_pickle("data/dyn_meta.pkl")
def met(V, sel):
    ret = V[sel] - 1; h = hold[sel]; up = h > 0
    return dict(n=int(sel.sum()), breach_any=100 * (ret < -0.1 - 1e-9).mean(), breach_mat=100 * (ret < -0.11).mean(), worst=100 * ret.min(),
                mean_ret=100 * ret.mean(), capture_up=100 * ret[up].mean() / h[up].mean(), bad_yr=100 * np.median(ret[h < -0.1]))
def run_cfg(V2d, sel):
    return met(V2d, sel)
VG = [sim.cppi(W, [0], floor=0.9, cost=6e-4, m_path=MG[:, :, k])['V'] for k in range(len(KG))]
VV = [sim.cppi(W, [0], floor=0.9, cost=6e-4, m_path=MV[:, :, k])['V'] for k in range(len(KV))]
print('sims done', flush=True)
out = []
for tag, cut in [("cut2014", "2014-12-31"), ("cut2019", "2019-12-31"), ("ALL", None)]:
    if cut is None: cal = test = np.ones(len(W), bool)
    else:
        cal = (meta.end <= pd.Timestamp(cut)).values; test = (meta.start > pd.Timestamp(cut)).values
    for part, sel in [("cal", cal), ("test", test)]:
        for k, m in enumerate(MSF): out.append(dict(split=tag, part=part, rule="fixed", param=m, avg_m=m, **met(fixed[:, [k]], sel)))
        for k, p in enumerate(KG):
            V = VG[k]
            out.append(dict(split=tag, part=part, rule="trailing-worst-gap", param=p, avg_m=MG[:, :, k][sel].mean(), **met(V, sel)))
        for k, p in enumerate(KV):
            V = VV[k]
            out.append(dict(split=tag, part=part, rule="trailing-vol", param=p, avg_m=MV[:, :, k][sel].mean(), **met(V, sel)))
        out.append(dict(split=tag, part=part, rule="oracle (hindsight)", param=np.nan, avg_m=orc_m[sel].mean(), **met(oracle, sel)))
O = pd.DataFrame(out); O.round(2).to_csv("results/T9_dynamic_m_all.csv", index=False)
# walk-forward pick: maximise cal mean_ret s.t. cal breach_mat <= 1%
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
sel_rows = []
for tag in ["cut2014", "cut2019"]:
    for rule in ["fixed", "trailing-worst-gap", "trailing-vol"]:
        c = O[(O.split == tag) & (O.part == "cal") & (O.rule == rule) & (O.breach_mat <= 1.0)]
        if c.empty: continue
        p = c.loc[c.mean_ret.idxmax(), "param"]
        t = O[(O.split == tag) & (O.part == "test") & (O.rule == rule) & (O.param == p)].iloc[0].to_dict()
        cc = c[c.param == p].iloc[0]
        t.update(cal_breach_mat=cc.breach_mat, cal_mean_ret=cc.mean_ret, chosen_param=p); sel_rows.append(t)
    t = O[(O.split == tag) & (O.part == "test") & (O.rule.str.startswith("oracle"))].iloc[0].to_dict(); sel_rows.append(t)
SR = pd.DataFrame(sel_rows)
SR.round(2).to_csv("results/T10_dynamic_walkforward_pick.csv", index=False)
print(SR[["split", "rule", "chosen_param", "avg_m", "n", "cal_breach_mat", "breach_any", "breach_mat", "worst", "mean_ret", "capture_up", "bad_yr"]].round(2).to_string(index=False))
