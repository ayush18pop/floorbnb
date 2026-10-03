import numpy as np, pandas as pd, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams.update({"figure.dpi": 110, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.alpha": .25, "font.size": 9})
BL, OR, GR, TL, PK = "#0072B2", "#D55E00", "#666666", "#009E73", "#CC79A7"   # Okabe-Ito (CVD-safe)
T1 = pd.read_csv("results/T1_pooled_floor90_cost6_close.csv")
# 1 breach vs m
fig, ax = plt.subplots(1, 2, figsize=(9, 3.6), sharey=True)
for a, col, ttl in [(ax[0], "breach_any", "Any shortfall below the 90% floor"), (ax[1], "breach_material", "Material: more than 1 pt below floor")]:
    for g, c in [("US index/ETF", BL), ("Intl index", TL), ("Single stock", OR)]:
        x = T1[T1.group == g]; a.plot(x.m, x[col], color=c, label=g, lw=2)
    a.set_title(ttl); a.set_xlabel("multiplier m")
ax[0].set_ylabel("% of 1-year windows (non-overlapping)"); ax[0].axvline(4, color=GR, ls=":"); ax[1].axvline(4, color=GR, ls=":"); ax[0].legend(frameon=False)
fig.suptitle("Breach rate vs m, 90% floor, 6 bps one-way, daily rebalance (1,581 windows, 38 series, 1928-2026)", fontsize=9)
fig.tight_layout(); fig.savefig("charts/1_breach_vs_m.png"); plt.close()
# 2 gap step
b = pd.read_csv("results/MC2_garch_gap.csv"); b = b[(b.floor == .9) & (b.label.str.startswith("index"))]
fig, ax = plt.subplots(figsize=(5.5, 3.6))
for m, c in zip([3, 4, 5, 6, 8], [TL, BL, OR, PK, GR]):
    x = b[b.m == m]; ax.plot(x.gap * 100, x.mbreach * 100, "o-", color=c, label=f"m={m} (1/m={100/m:.0f}%)")
ax.set_xlabel("single-day gap injected at a random day (%)"); ax.set_ylabel("P(end >1pt below floor), %"); ax.legend(frameon=False, fontsize=8)
ax.set_title("Floor survives gaps smaller than 1/m, fails past it\n(GJR-GARCH-t, 18% vol, 90% floor)", fontsize=9)
fig.tight_layout(); fig.savefig("charts/2_gap_vs_one_over_m.png"); plt.close()
# 3 dial: capture vs material breach by floor
R = pd.read_csv("results/T8_dial_and_gradient.csv"); R = R[R.kind == "fixed"]
fig, ax = plt.subplots(figsize=(5.8, 3.8))
for fl, c in zip([.8, .85, .9, .95], [BL, TL, OR, GR]):
    x = R[R.floor == fl]; ax.plot(x.breach_material, x.capture_up, "o-", color=c, label=f"floor {int(fl*100)}%")
    for _, r in x.iterrows():
        if r.m in (2, 3, 4, 6): ax.annotate(f"m={int(r.m)}", (r.breach_material, r.capture_up), fontsize=7, xytext=(3, -9), textcoords="offset points")
ax.set_xlabel("material breach rate, % of windows"); ax.set_ylabel("upside kept in up years, %"); ax.legend(frameon=False)
ax.set_title("Risk dial: upside kept vs breach rate (1,581 equity windows)", fontsize=9)
fig.tight_layout(); fig.savefig("charts/3_dial_capture_vs_breach.png"); plt.close()
# 4 sample dependence
d = pd.read_pickle("data/hist_eq.pkl"); d = d[(d["mode"] == "close") & (d.floor == .9) & (d.cost_bps == 6) & d.group.isin(["US index/ETF", "Intl index", "Single stock"])]
d["per"] = np.where(d.start >= "2018-01-01", "2018-2026 (team sample)", "before 2018")
g = d[d.m.isin([3, 4, 5, 6])].groupby(["per", "m"]).agg(any_=("breach", "mean"), mat=("mbreach", "mean"), n=("ret", "size")).reset_index()
g.to_csv("results/T13_period_split.csv", index=False)
fig, ax = plt.subplots(figsize=(5.8, 3.6)); w = .38
for i, (p, c) in enumerate([("2018-2026 (team sample)", BL), ("before 2018", OR)]):
    x = g[g.per == p]; ax.bar(np.arange(4) + (i - .5) * w, x.any_ * 100, w - .04, color=c, label=f"{p} (n={x.n.iloc[0]})")
ax.set_xticks(range(4)); ax.set_xticklabels(["m=3", "m=4", "m=5", "m=6"]); ax.set_ylabel("any-shortfall breach rate, %"); ax.legend(frameon=False)
ax.set_title("The 2018+ sample understates risk (equity windows, 90% floor)", fontsize=9)
fig.tight_layout(); fig.savefig("charts/4_sample_dependence.png"); plt.close()
# 5 frontier ML/dynamic (cut2014 test)
O = pd.read_csv("results/T11_ml_vs_rules_all.csv"); O = O[O.split == "cut2014"]
fig, ax = plt.subplots(figsize=(6, 3.9))
for fam, c, mk in [("fixed", BL, "o"), ("trailing-worst-gap (static/term)", OR, "s"), ("trailing-vol (static/term)", TL, "^"), ("ML (GBM q90 of worst 1-day loss)", PK, "D")]:
    x = O[(O.family == fam) & (O.test_breach_mat <= 2)].sort_values("test_breach_mat"); ax.plot(x.test_breach_mat, x.test_mean_ret, mk + "-", color=c, ms=4, lw=1.3, label=fam.split(" (")[0].replace("ML","ML GBM"))
ax.set_xlabel("material breach rate on test terms 2015-2026, %"); ax.set_ylabel("mean 1-yr return on test terms, %"); ax.legend(frameon=False, fontsize=8)
ax.set_title("Fixed m vs rules vs ML, out of sample (frontiers overlap)", fontsize=9)
fig.tight_layout(); fig.savefig("charts/5_dynamic_ml_frontier.png"); plt.close()
# 6 bootstrap
a = pd.read_csv("results/MC1_block_bootstrap.csv"); a = a[(a.floor == .9) & (a.every == 1) & (a.block == 21)]
fig, ax = plt.subplots(figsize=(5.8, 3.6))
for p, c in zip(["S&P 500 1928-2026", "US index/ETF pool", "Intl index pool", "Single-stock pool (23)"], [BL, TL, GR, OR]):
    x = a[a.pool == p]; ax.plot(x.m, x.breach * 100, color=c, lw=2, label=p)
ax.set_xlabel("multiplier m"); ax.set_ylabel("any-shortfall breach %"); ax.legend(frameon=False, fontsize=8)
ax.set_title("Block bootstrap (21-day blocks, 6,000 synthetic years each)", fontsize=9)
fig.tight_layout(); fig.savefig("charts/6_block_bootstrap.png"); plt.close()
print(g)
