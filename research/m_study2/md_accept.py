import pandas as pd
A = pd.read_csv("results/A1_contract_accept.csv"); out = []
for mt in (20, 6):
    out.append(f"**Highest floor the factory accepts (minTrade {mt} USDT). 'all' = every floor 50 to 98 passes; 'none' = rejected at every floor.**\n")
    out.append("| Basket | 55 USDT | 125 USDT | 500 USDT | 1000 USDT | 5000 USDT (above 1000 launch cap) |"); out.append("|---|---|---|---|---|---|")
    for b in A.basket.unique():
        cells = []
        for D in (55, 125, 500, 1000, 5000):
            q = A[(A.minTrade == mt) & (A.basket == b) & (A.deposit == D)].sort_values("floor"); ok = q[q.result == "OK"]
            cells.append("none" if ok.empty else ("all" if len(ok) == len(q) else f"up to {int(ok.floor.max())}%"))
            assert (q.result[q.floor <= (ok.floor.max() if not ok.empty else 0)] == "OK").all()
        out.append(f"| {b} | " + " | ".join(cells) + " |")
    out.append("")
open("results/accept_tables.md", "w").write("\n".join(out)); print("\n".join(out))
m = pd.read_csv("results/A2_min_deposit.csv"); print(m[m.floor.isin([80,85,90,92,95,96,98])].pivot_table(index=["minTrade","basket"],columns="floor",values="min_deposit_usdt").to_string())
