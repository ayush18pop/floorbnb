"""Static per-term choice of m: fixed vs simple rules vs gradient boosting predicting the term's worst 1-day loss.
Strict walk-forward: model/k chosen using only terms that END before the cutoff; test terms START after it. Inside calibration,
k for the ML rule is chosen from purged time-block cross-validated predictions (not in-sample ones)."""
import numpy as np, pandas as pd, sim, common as C
from sklearn.ensemble import GradientBoostingRegressor
from scipy.stats import spearmanr
rng = np.random.default_rng(11)
LB, TERM = 252, 252
rows = []; Ws = []
for s, r in C.all_series("close").items():
    g = C.group_of(s)
    if g not in C.EQ: continue
    v = r.values; lr = np.log(v); loss = np.maximum(1 - v, 0); ps = pd.Series
    vol = lambda n: ps(lr).rolling(n).std().values
    w63 = ps(loss).rolling(63).max().values; w252 = ps(loss).rolling(LB).max().values
    wall = ps(loss).expanding(min_periods=LB).max().values
    cum = np.cumsum(lr); cl = np.exp(cum)
    dd = cl / ps(cl).rolling(LB).max().values - 1
    ret = lambda n: np.r_[np.full(n, np.nan), cum[n:] - cum[:-n]]
    sk = ps(lr).rolling(LB).skew().values; ku = ps(lr).rolling(LB).kurt().values
    for i in range(LB + 1, len(v) - TERM + 1, 21):
        j = i - 1
        win = v[i:i + TERM]
        rows.append(dict(series=s, group=g, start=r.index[i], end=r.index[i + TERM - 1], on63=((i - LB - 1) % 63 == 0),
                         vol21=vol(21)[j], vol63=vol(63)[j], vol252=vol(252)[j], w63=w63[j], w252=w252[j], wall=wall[j],
                         dd=dd[j], r21=ret(21)[j], r63=ret(63)[j], r252=ret(252)[j], skew=sk[j], kurt=ku[j],
                         is_idx=g != "Single stock", y=np.log(max(1 - win.min(), 0.005))))
        Ws.append(win)
M = pd.DataFrame(rows); W = np.array(Ws); hold = W.prod(1) - 1
ok = M.drop(columns=["series", "group", "start", "end", "on63", "y"]).notna().all(axis=1).values
M, W, hold = M[ok].reset_index(drop=True), W[ok], hold[ok]
FEATS = ["vol21", "vol63", "vol252", "w63", "w252", "wall", "dd", "r21", "r63", "r252", "skew", "kurt", "is_idx"]
print("terms", len(M), flush=True)

def outcome(m_w):
    return sim.cppi(W, [0], floor=0.9, cost=6e-4, m_path=np.repeat(m_w[:, None], W.shape[1], 1))["V"][:, 0]
def mk_model(): return GradientBoostingRegressor(loss="quantile", alpha=0.9, n_estimators=120, max_depth=3, learning_rate=0.05, subsample=0.7, min_samples_leaf=40, random_state=0)
KG = np.round(np.concatenate([np.arange(0.1, 0.5, 0.05), np.arange(0.5, 1.5, 0.1)]), 2)
def evalset(V, sel):
    ret = V[sel] - 1; h = hold[sel]; up = h > 0
    return dict(n=int(sel.sum()), breach_any=100 * (ret < -0.1 - 1e-9).mean(), breach_mat=100 * (ret < -0.11).mean(), worst=100 * ret.min(),
                mean_ret=100 * ret.mean(), capture_up=100 * ret[up].mean() / h[up].mean())
def cluster_diff(Va, Vb, sel, B=2000):
    """paired year-cluster bootstrap of (mean_ret_a - mean_ret_b) and (mat breach a - b), in points."""
    yr = M.start.dt.year.values[sel]; a = Va[sel] - 1; b = Vb[sel] - 1
    ys = np.unique(yr); idx = {y: np.where(yr == y)[0] for y in ys}; dm = []; db = []
    for _ in range(B):
        ii = np.concatenate([idx[y] for y in rng.choice(ys, len(ys))])
        dm.append(100 * (a[ii].mean() - b[ii].mean())); db.append(100 * ((a[ii] < -0.11).mean() - (b[ii] < -0.11).mean()))
    return np.percentile(dm, [2.5, 97.5]), np.percentile(db, [2.5, 97.5])

out = []; picks = []
for tag, cut in [("cut2014", "2014-12-31"), ("cut2019", "2019-12-31")]:
    cal_all = (M.end <= pd.Timestamp(cut)).values; test = ((M.start > pd.Timestamp(cut)) & M.on63).values
    cal63 = cal_all & M.on63.values
    # --- purged CV predictions on calibration terms (5 contiguous time blocks, purge +-TERM days)
    cal_idx = np.where(cal_all)[0]; order = cal_idx[np.argsort(M.start.values[cal_idx])]
    blocks = np.array_split(order, 5); cvpred = np.full(len(M), np.nan)
    for bl in blocks:
        lo, hi = M.start.values[bl].min() - np.timedelta64(400, "D"), M.end.values[bl].max() + np.timedelta64(400, "D")
        tr = cal_idx[~((M.end.values[cal_idx] >= lo) & (M.start.values[cal_idx] <= hi))]
        mdl = mk_model().fit(M.loc[tr, FEATS], M.y.values[tr]); cvpred[bl] = mdl.predict(M.loc[bl, FEATS])
    final = mk_model().fit(M.loc[cal_all, FEATS], M.y.values[cal_all]); pred = cvpred.copy(); pred[test] = final.predict(M.loc[test, FEATS])
    # predictive skill on test (does it forecast the term's worst 1-day loss better than trailing worst gap?)
    rho_ml = spearmanr(pred[test], M.y.values[test])[0]; rho_w = spearmanr(np.log(np.maximum(M.w252.values[test], .005)), M.y.values[test])[0]
    rho_v = spearmanr(M.vol63.values[test], M.y.values[test])[0]
    mse = lambda p: np.mean((p - M.y.values[test]) ** 2)
    print(tag, "test Spearman(pred, realised worst-1day-loss): ML %.3f | trailing worst gap %.3f | trailing vol %.3f" % (rho_ml, rho_w, rho_v), flush=True)
    fams = {}
    fams["fixed"] = {m: np.full(len(M), m) for m in np.arange(1, 8.5, 0.5)}
    fams["trailing-worst-gap (static/term)"] = {k: np.clip(k / np.maximum(M.w252.values, .02), 1, 8) for k in KG}
    fams["trailing-vol (static/term)"] = {k: np.clip(k / np.maximum(M.vol63.values, .004), 1, 8) for k in np.round(np.arange(0.03, 0.2, 0.01), 3)}
    pm = np.exp(np.nan_to_num(pred, nan=np.log(.1)))
    fams["ML (GBM q90 of worst 1-day loss)"] = {k: np.clip(k / pm, 1, 8) for k in KG}
    res = {}
    for fam, d in fams.items():
        for p, mw in d.items():
            V = outcome(mw); res[(fam, p)] = V
            out.append(dict(split=tag, family=fam, param=p, avg_m=mw[test].mean(), **{f"test_{k}": v for k, v in evalset(V, test).items()},
                            **{f"cal_{k}": v for k, v in evalset(V, cal63).items()}))
    O = pd.DataFrame(out); O = O[O.split == tag]
    chosen = {}
    for fam in fams:
        c = O[(O.family == fam) & (O.cal_breach_mat <= 1.0)]
        if c.empty: continue
        p = c.loc[c.cal_mean_ret.idxmax(), "param"]; chosen[fam] = p
    base_V = res[("fixed", chosen["fixed"])]
    for fam, p in chosen.items():
        r = O[(O.family == fam) & (O.param == p)].iloc[0].to_dict(); r["chosen"] = p
        if fam != "fixed":
            (dlo, dhi), (blo, bhi) = cluster_diff(res[(fam, p)], base_V, test)
            r.update(d_mean_ret_vs_fixed_lo=dlo, d_mean_ret_vs_fixed_hi=dhi, d_breach_mat_vs_fixed_lo=blo, d_breach_mat_vs_fixed_hi=bhi)
        r.update(rho_ml=rho_ml, rho_trailing_gap=rho_w, rho_vol=rho_v); picks.append(r)
    ft = res[("fixed", 4.0)]
pd.DataFrame(out).round(3).to_csv("results/T11_ml_vs_rules_all.csv", index=False)
P = pd.DataFrame(picks); P.round(3).to_csv("results/T12_ml_vs_rules_walkforward.csv", index=False)
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
print(P[["split", "family", "chosen", "avg_m", "test_n", "cal_cal_breach_mat" if False else "cal_breach_mat", "test_breach_any", "test_breach_mat", "test_worst", "test_mean_ret",
         "test_capture_up", "d_mean_ret_vs_fixed_lo", "d_mean_ret_vs_fixed_hi", "d_breach_mat_vs_fixed_lo", "d_breach_mat_vs_fixed_hi"]].round(2).to_string(index=False))
