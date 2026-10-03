"""Risk dial: tiers by m and floor; gradient-floor ideas (min-form, two-sleeve). Pooled non-overlapping equity windows, 6 bps one-way."""
import numpy as np, pandas as pd, sim, common as C
W, meta = C.pooled_windows()
hold = W.prod(1) - 1
up = hold > 0; bad = hold < -0.10
def metrics(V, floor, label, **extra):
    ret = V - 1
    f2 = lambda fl: (V < fl - 1e-9).mean() * 100
    return dict(label=label, floor=floor, breach_any=100 * (V < floor - 1e-9).mean(), breach_material=100 * (V < floor - 0.01).mean(),
                breach_below_80=100 * (V < 0.80).mean(), worst=100 * ret.min(), mean_ret=100 * ret.mean(), median_ret=100 * np.median(ret),
                capture_up=100 * ret[up].mean() / hold[up].mean(), bad_yr_median=100 * np.median(ret[bad]),
                **extra)
rows = []
MS = [1.5, 2, 3, 4, 5, 6, 8]
for fl in [0.8, 0.85, 0.9, 0.95]:
    res = sim.cppi(W, MS, floor=fl, cost=6e-4)
    for k, m in enumerate(MS):
        r = metrics(res["V"][:, k], fl, f"fixed m={m}", m=m, kind="fixed", locked_pct=100 * res["locked"][:, k].mean())
        # by group
        for g in C.EQ:
            sel = (meta.group == g).values
            r[f"breach_mat_{g}"] = 100 * (res["V"][sel, k] < fl - 0.01).mean()
            r[f"capture_{g}"] = 100 * (res["V"][sel, k][hold[sel] > 0] - 1).mean() / hold[sel][hold[sel] > 0].mean()
        rows.append(r)
print("hold: median %.1f%% mean %.1f%% bad-yr median %.1f%% n=%d (up %d, bad %d)" % (100*np.median(hold), 100*hold.mean(), 100*np.median(hold[bad]), len(hold), up.sum(), bad.sum()))
# gradient floor: min-form  E = min(m1*(V-F1), m2*(V-F2), V)
F1 = 0.9
for (m1, F2, m2) in [(4, 0.7, 3), (5, 0.7, 3), (6, 0.7, 3), (6, 0.75, 4), (8, 0.7, 3), (6, 0.8, 4), (8, 0.8, 4), (8, 0.8, 5)]:
    fn = lambda V, mrow, m1=m1, F2=F2, m2=m2: np.minimum(m1 * np.maximum(V - F1, 0), m2 * np.maximum(V - F2, 0))
    res = sim.cppi(W, [m1], floor=F1, cost=6e-4, tgt_fn=fn)
    rows.append(metrics(res["V"][:, 0], F1, f"min-form m1={m1} F1=90 | m2={m2} F2={int(F2*100)}", kind="minform", locked_pct=100*res["locked"][:,0].mean()))
# two-sleeve: weight w in sleeve A (floor 0.9, mA), rest in sleeve B (floor FB, mB). Blended guarantee = w*0.9+(1-w)*FB
for (w, mA, FB, mB) in [(0.5, 3, 0.7, 6), (0.5, 2, 0.7, 6), (0.7, 3, 0.7, 6), (0.5, 3, 0.8, 5), (0.5, 4, 0.8, 6), (0.7, 4, 0.7, 6)]:
    VA = sim.cppi(W, [mA], floor=0.9, cost=6e-4)["V"][:, 0]; VB = sim.cppi(W, [mB], floor=FB, cost=6e-4)["V"][:, 0]
    V = w * VA + (1 - w) * VB; blend = w * 0.9 + (1 - w) * FB
    r = metrics(V, 0.9, f"two-sleeve {int(w*100)}% (F=90,m={mA}) + {int((1-w)*100)}% (F={int(FB*100)},m={mB}) [blended floor {blend*100:.0f}%]", kind="sleeve")
    r["breach_blended_floor"] = 100 * (V < blend - 1e-9).mean(); r["blended_floor"] = blend
    r["breach_material_vs_blend"] = 100 * (V < blend - 0.01).mean()
    rows.append(r)
R = pd.DataFrame(rows); R.round(2).to_csv("results/T8_dial_and_gradient.csv", index=False)
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30); pd.set_option("display.max_colwidth", 80)
print(R[["label", "floor", "breach_any", "breach_material", "breach_below_80", "worst", "mean_ret", "median_ret", "capture_up", "bad_yr_median"]].round(1).to_string(index=False))
