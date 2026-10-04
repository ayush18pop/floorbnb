import pandas as pd, numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.alpha": .25, "figure.dpi": 130})
OI = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#D55E00", "#56B4E9"]
TN = {7: "1 wk", 14: "2 wk", 30: "1 mo", 90: "3 mo", 180: "6 mo", 365: "1 yr"}
d = pd.read_csv("results/S1_nonoverlap.csv"); A = d[(d.group == "All equity (ex-basket)") & (d.cost == 6)]
# 1 breach vs floor
fig, ax = plt.subplots(1, 2, figsize=(11, 4), sharey=False)
for k, (col, ttl) in enumerate([("breach_mat", "Ended more than 1 point below floor"), ("breach_any", "Ended below floor by any amount")]):
    for i, t in enumerate(TN):
        q = A[A.term == t]; ax[k].plot(q.floor, q[col] * 100, marker="o", ms=3, color=OI[i], label=TN[t])
    ax[k].set_title(ttl); ax[k].set_xlabel("Floor (% of deposit)"); ax[k].set_ylabel("% of windows"); ax[k].axvspan(50, 79.5, color="grey", alpha=.12)
ax[0].text(51, ax[0].get_ylim()[1] * .9, "thin evidence\n(few windows stressed the floor)", fontsize=8, va="top")
ax[1].legend(title="Term", ncol=2, fontsize=8)
fig.suptitle("Floor breaches by term and floor (m=4, 6 bps, indices+single stocks, non-overlapping windows)", fontsize=10); fig.tight_layout(); fig.savefig("charts/1_breach_vs_floor_term.png"); plt.close()
# 2 upside kept
fig, ax = plt.subplots(figsize=(6.5, 4.2))
for i, t in enumerate(TN):
    q = A[A.term == t]; ax.plot(q.floor, q.capture_up * 100, marker="o", ms=3, color=OI[i], label=TN[t])
x = np.arange(50, 99); ax.plot(x, np.minimum(100, 4 * (100 - x)), "k--", lw=1, label="4 x (100 - floor)")
ax.set_xlabel("Floor (% of deposit)"); ax.set_ylabel("Upside kept, % of the holder's gain"); ax.legend(fontsize=8, ncol=2); ax.set_title("Upside kept in up windows (the term barely matters; the floor does)", fontsize=10)
fig.tight_layout(); fig.savefig("charts/2_upside_kept_vs_floor.png"); plt.close()
# 3 median return
p = pd.read_csv("results/P1_median_ci.csv"); p = p[p.cost == 6]
fig, ax = plt.subplots(figsize=(8.5, 4.2)); w = .14; terms = list(TN)
for j, (lab, fl) in enumerate([("Holding", None), ("Floor 80", 80), ("Floor 90", 90), ("Floor 95", 95), ("Floor 98", 98)]):
    ys = []; lo = []; hi = []
    for t in terms:
        r = p[(p.term == t) & (p.floor == 90)].iloc[0] if fl is None else p[(p.term == t) & (p.floor == fl)].iloc[0]
        m_, l_, h_ = (r.med_hold, r.medh_lo, r.medh_hi) if fl is None else (r.med_ret, r.med_lo, r.med_hi)
        ys.append(m_ * 100); lo.append((m_ - l_) * 100); hi.append((h_ - m_) * 100)
    ax.bar(np.arange(len(terms)) + (j - 2) * w, ys, w, yerr=[lo, hi], color=(["#999999"] + OI[:4])[j], label=lab, capsize=1.5, error_kw=dict(lw=.7))
ax.set_xticks(range(len(terms))); ax.set_xticklabels([TN[t] for t in terms]); ax.set_ylabel("Median return over the term, %"); ax.legend(fontsize=8)
ax.set_title("Typical (median) outcome: vault vs holding, with 95% CI (year-block bootstrap)", fontsize=10); fig.tight_layout(); fig.savefig("charts/3_median_return_vs_hold.png"); plt.close()
# 4 start regime
s3 = pd.read_csv("results/S3_start_regime.csv"); s3 = s3[s3.floor == 90]
regs = [("start within 5% of 1y peak", "Near 1y high"), ("calm start (20d vol in bottom half)", "Calm (low 20d vol)"), ("high-vol start (20d vol in top 10%)", "High-vol start (top 10%)"), ("start >=20% below 1y peak", ">=20% below 1y peak")]
fig, ax = plt.subplots(figsize=(8.5, 4.2)); ts = [7, 14, 30, 90, 365]
for j, (rg, lab) in enumerate(regs):
    q = s3[s3.regime == rg].set_index("term").loc[ts]
    ax.bar(np.arange(len(ts)) + (j - 1.5) * .2, q.lock * 100, .2, yerr=[(q.lock - q.lock_lo) * 100, (q.lock_hi - q.lock) * 100], color=OI[j], label=lab, capsize=1.5, error_kw=dict(lw=.7))
ax.set_xticks(range(len(ts))); ax.set_xticklabels([TN[t] for t in ts]); ax.set_ylabel("% of windows that hit the cash lock"); ax.legend(fontsize=8)
ax.set_title("Start date matters: cash-lock rate at a 90% floor by market regime at the start (95% CI)", fontsize=10); fig.tight_layout(); fig.savefig("charts/4_start_regime_lock.png"); plt.close()
# 5 min deposit
m = pd.read_csv("results/A2_min_deposit.csv")
x = np.arange(50, 99); fig, ax = plt.subplots(figsize=(7, 4.4))
for i, (b, c) in enumerate(zip(["1 token", "2 tokens 50/50", "3 tokens 34/33/33"], OI)):
    for mt, ls in [(20, "-"), (6, ":")]:
        w_ = {"1 token": 1, "2 tokens 50/50": .5, "3 tokens 34/33/33": .33}[b]
        ax.plot(x, mt / (w_ * np.minimum(1, 4 * (1 - x / 100))), ls, color=c, label=f"{b}, minTrade {mt}")
for D in [55, 125, 500, 1000]: ax.axhline(D, color="k", lw=.6, alpha=.5); ax.text(95.5, D * 1.04, f"deposit {D}", fontsize=7)
ax.set_yscale("log"); ax.set_ylim(5, 1500); ax.set_xlabel("Floor (% of deposit)"); ax.set_ylabel("Minimum accepted deposit, USDT"); ax.legend(fontsize=7, ncol=2, loc="lower right")
ax.set_title("Contract minimum deposit by floor (above the line = accepted)", fontsize=10); fig.tight_layout(); fig.savefig("charts/5_min_deposit_vs_floor.png"); plt.close()
