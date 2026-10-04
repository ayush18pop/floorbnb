"""Builds markdown tables (results/tables.md) used verbatim in REPORT.md."""
import pandas as pd, numpy as np
d = pd.read_csv("results/S1_nonoverlap.csv"); o = pd.read_csv("results/S2_overlap.csv"); p = pd.read_csv("results/P1_median_ci.csv"); st = pd.read_csv("results/S6_stress_counts.csv")
A = d[(d.group == "All equity (ex-basket)") & (d.cost == 6)]
Ao = o[(o.group == "All equity (ex-basket)") & (o.cost == 6)]
TERMN = {7: "1 wk", 14: "2 wk", 30: "1 mo", 90: "3 mo", 180: "6 mo", 365: "1 yr"}
FL5 = [80, 85, 90, 95, 98]
def pct(x, k=2): return f"{x*100:.{k}f}%"
def ci(r, c, k=2):
    c2 = 'capture' if c == 'capture_up' else c
    return f"{r[c]*100:.{k}f}% ({r[c2+'_lo']*100:.{k}f} to {r[c2+'_hi']*100:.{k}f})"
out = []
def table(title, f, floors=FL5, src=A):
    out.append(f"**{title}**\n"); out.append("| Floor | " + " | ".join(TERMN[t] for t in TERMN) + " |"); out.append("|---|" + "---|" * len(TERMN))
    for fl in floors:
        out.append(f"| {fl}% | " + " | ".join(f(src[(src.term == t) & (src.floor == fl)].iloc[0]) for t in TERMN) + " |")
    out.append("")
table("T1. Ended more than 1 point below the floor (non-overlapping windows, 95% CI)", lambda r: ci(r, "breach_mat"))
table("T2. Ended below the floor by any amount", lambda r: ci(r, "breach_any"))
table("T3. Worst shortfall (points below floor, single worst window) and median shortfall of the breaching windows", lambda r: f"{r.worst_shortfall_pts:.1f} / {r.breach_depth_med_pts:.2f}")
table("T4. Windows that hit the cash lock (V reached the floor), and median point in the term when it happened", lambda r: f"{pct(r.lock)} @ {r.lock_when_med*100:.0f}%" if r.lock > 0 else "0%")
table("T5. Share of windows that ended within 2 points above the floor or below it (floor effectively 'used')", lambda r: pct(r.near_floor, 1))
table("T6. Upside kept: vault gain / holding gain, summed over windows where holding gained (CI = year-block bootstrap)", lambda r: ci(r, "capture_up", 0))
out.append("**T7. Median and mean return, vault vs simply holding (all equity series ex-basket, 6 bps)**\n")
out.append("| Term | Hold median [95% CI] | Hold mean | Floor 80 median / mean | Floor 90 median [CI] / mean | Floor 95 median / mean | Floor 98 median / mean |"); out.append("|---|---|---|---|---|---|---|")
for t in TERMN:
    q = p[(p.term == t) & (p.cost == 6)]
    def g(fl): return q[q.floor == fl].iloc[0]
    r90 = g(90)
    out.append(f"| {TERMN[t]} | {r90.med_hold*100:+.2f}% [{r90.medh_lo*100:+.2f}, {r90.medh_hi*100:+.2f}] | {r90.mean_hold*100:+.2f}% | " +
               " | ".join((f"{g(fl).med_ret*100:+.2f}% [{g(fl).med_lo*100:+.2f}, {g(fl).med_hi*100:+.2f}] / {g(fl).mean_ret*100:+.2f}%" if fl == 90 else f"{g(fl).med_ret*100:+.2f}% / {g(fl).mean_ret*100:+.2f}%") for fl in [80, 90, 95, 98]) + " |")
out.append("")
out.append("**T8. Down windows (holding lost money): median vault return vs median holding return. Severe = holding lost more than 10%.**\n")
out.append("| Term | n down / n severe | Floor 90: down vault vs hold | Floor 90: severe vault vs hold | Floor 95: severe vault vs hold | Floor 98: severe vault vs hold |"); out.append("|---|---|---|---|---|---|")
for t in TERMN:
    def g(fl): return A[(A.term == t) & (A.floor == fl)].iloc[0]
    a = g(90); n_down = round((1 - a.pct_gain) * 0)  # placeholder
    out.append(f"| {TERMN[t]} | {a.n_sev} severe of {a.n} | {a.med_down_ret*100:+.1f}% vs {a.med_down_hold*100:+.1f}% | {a.med_sev_ret*100:+.1f}% vs {a.med_sev_hold*100:+.1f}% | {g(95).med_sev_ret*100:+.1f}% vs {g(95).med_sev_hold*100:+.1f}% | {g(98).med_sev_ret*100:+.1f}% vs {g(98).med_sev_hold*100:+.1f}% |")
out.append("")
table("T9. Cost paid, % of deposit, 6 bps one-way (25 bps in T9b)", lambda r: pct(r.cost_paid, 3))
table("T9b. Cost paid at 25 bps one-way", lambda r: pct(r.cost_paid, 3), src=d[(d.group == "All equity (ex-basket)") & (d.cost == 25)])
table("T10. Average stock exposure over the term (share of vault value in stock)", lambda r: pct(r.avg_exp, 0))
table("T11. Mean return vault at 25 bps one-way (compare T7 6 bps)", lambda r: f"{r.mean_ret*100:+.2f}%", src=d[(d.group == "All equity (ex-basket)") & (d.cost == 25)])
table("T12. Turnover (multiples of deposit traded over the term, 6 bps)", lambda r: f"{r.turnover:.2f}x")
table("T13. Overlapping weekly-start windows (breach >1pt, CI), All equity", lambda r: ci(r, "breach_mat"), src=Ao)
table("T14. Overlapping: cash lock", lambda r: ci(r, "lock"), src=Ao)
for g in ["Index/ETF", "Single stock", "Basket"]:
    table(f"T15. By group ({g}), non-overlapping: >1pt below floor / any shortfall", lambda r: f"{r.breach_mat*100:.2f}% / {r.breach_any*100:.2f}% (n={r.n})", src=d[(d.group == g) & (d.cost == 6)])
out.append("**T16. Evidence strength: windows where holding ended BELOW the floor (the floor was actually under stress), non-overlapping, indices+single stocks**\n")
out.append("| Floor | " + " | ".join(f"{TERMN[t]} (windows / years)" for t in TERMN) + " |"); out.append("|---|" + "---|" * 6)
for fl in [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 98]:
    out.append(f"| {fl}% | " + " | ".join(f"{int(r.n_stress)} / {int(r.n_stress_years)}" for t in TERMN for r in [st[(st.term == t) & (st.floor == fl)].iloc[0]]) + " |")
out.append("")
out.append("**T17. When the floor WAS under stress (holding ended below it), how often did the vault still end below it? (1 year)**\n")
out.append("| Floor | stress windows | vault ended below floor | vault >1pt below |"); out.append("|---|---|---|---|")
for fl in [50, 60, 70, 75, 80, 85, 90, 95, 98]:
    r = st[(st.term == 365) & (st.floor == fl)].iloc[0]; out.append(f"| {fl}% | {int(r.n_stress)} | {r.vault_below_floor_in_stress*100:.0f}% | {r.vault_mat_breach_in_stress*100:.1f}% |")
out.append("")
s3 = pd.read_csv("results/S3_start_regime.csv")
out.append("**T18. Start-date view (weekly-start overlapping windows, indices+single stocks, 6 bps). Floor 90 unless noted.**\n")
out.append("| Term | Start regime | n | Hit cash lock [95% CI] | >1pt below floor | Median vault / hold | 10th pct vault / hold | Upside kept |"); out.append("|---|---|---|---|---|---|---|---|")
for t in [7, 30, 90]:
    for rg in s3.regime.unique():
        r = s3[(s3.term == t) & (s3.regime == rg) & (s3.floor == 90)].iloc[0]
        out.append(f"| {TERMN[t]} | {rg} | {r.n} | {r.lock*100:.2f}% ({r.lock_lo*100:.2f} to {r.lock_hi*100:.2f}) | {r.breach_mat*100:.2f}% | {r.med_ret*100:+.2f}% / {r.med_hold*100:+.2f}% | {r.p10_ret*100:+.1f}% / {r.p10_hold*100:+.1f}% | {r.capture_up*100:.0f}% |")
out.append("")
out.append("**T19. Same start regimes at floor 98: share of windows with the cash lock, and 10th-percentile vault / hold**\n")
out.append("| Term | Start regime | Cash lock | Median vault | 10th pct vault / hold |"); out.append("|---|---|---|---|---|")
for t in [30, 90]:
    for rg in s3.regime.unique():
        r = s3[(s3.term == t) & (s3.regime == rg) & (s3.floor == 98)].iloc[0]
        out.append(f"| {TERMN[t]} | {rg} | {r.lock*100:.2f}% | {r.med_ret*100:+.2f}% | {r.p10_ret*100:+.2f}% / {r.p10_hold*100:+.1f}% |")
out.append("")
nm = pd.read_csv("results/S4_named_starts.csv")
out.append("**T20. Named crisis starts, floor 90, 6 bps (actual path, daily closes). Vault / hold; 'pts above floor' at the end.**\n")
out.append("| Series | Start | Event | 1 mo vault / hold | 3 mo vault / hold | 3 mo end vs floor (pts) |"); out.append("|---|---|---|---|---|---|")
for (s_, sd, ev), q in nm[nm.floor == 90].groupby(["series", "start", "event"]):
    a = q[q.term == 30]; b = q[q.term == 90]
    if len(a) and len(b): out.append(f"| {s_} | {sd} | {ev} | {a.vault.iloc[0]*100:+.1f}% / {a.hold.iloc[0]*100:+.1f}% | {b.vault.iloc[0]*100:+.1f}% / {b.hold.iloc[0]*100:+.1f}% | {b.end_vs_floor_pts.iloc[0]:+.1f} |")
out.append("")
s5 = pd.read_csv("results/S5_deposit_size.csv")
out.append("**T21. Small deposits: effect of minTrade on a 1-year, floor-90 and floor-95 ride (single token; 3-token = equal weights; indices+single stocks)**\n")
out.append("| Deposit / minTrade | Basket | Floor | Factory | Avg stock exposure | Upside kept | Mean return | >1pt below floor |"); out.append("|---|---|---|---|---|---|---|---|")
for (D, mt, b), q in s5[(s5.term == 365) & (s5.floor.isin([90, 95]))].groupby(["deposit", "minTrade", "basket"], sort=False):
    for _, r in q.iterrows():
        out.append(f"| {D} / {mt} | {b} | {r.floor}% | {'accepts' if r.accepted_by_factory else 'REJECTS'} | {r.avg_exp*100:.0f}% | {r.capture_up*100:.0f}% | {r.mean_ret*100:+.2f}% | {r.breach_mat*100:.2f}% |")
out.append("")
open("results/tables.md", "w").write("\n".join(out))
