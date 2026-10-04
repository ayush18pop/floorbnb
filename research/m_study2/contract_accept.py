"""Which (floor, deposit, basket) combos does FloorFactory.createPosition accept? Exact integer mirror of
createPosition/_checkNotTooSmall (packages/contracts/src/FloorFactory.sol) and CPPIMath (floorFor rounds UP,
exposureTarget = min(4*C, V), assetTarget = estar*w/10000 rounded down, buy band = buyBandBps*w/10000 (>=1)).
Writes results/A1_contract_accept.csv and A2_min_deposit.csv. Verifies against the contract's own test cases."""
import numpy as np, pandas as pd
WAD = 10**18; BPS = 10_000; BUYBAND = 200
def accept(dep_usdt, floor_bps, weights, min_trade_usdt):
    D = int(dep_usdt * WAD); mt = int(min_trade_usdt * WAD)
    F = -(-D * floor_bps // BPS); C = D - F if D > F else 0
    est = min(C * 4, D)
    for w in weights:
        t = est * w // BPS
        if t < mt: return "TOO_SMALL"
        band = BUYBAND * w // BPS
        if t * BPS < (band if band else 1) * D: return "BAD_FLOOR"
    return "OK"
# --- check against contract tests (PashovFix4.t.sol lead (b)), minTrade 20
assert accept(50, 9000, [10000], 20) == "OK" and accept(49, 9000, [10000], 20) == "TOO_SMALL"
assert accept(1, 9000, [10000], 20) == "TOO_SMALL" and accept(500, 9800, [10000], 20) == "OK" and accept(200, 9800, [10000], 20) == "TOO_SMALL"
assert accept(100, 9000, [6000, 4000], 20) == "TOO_SMALL" and accept(150, 9000, [6000, 4000], 20) == "OK"
BASKETS = {"1 token": [10000], "2 tokens 50/50": [5000, 5000], "3 tokens 34/33/33": [3400, 3300, 3300]}
FL = list(range(50, 99)); DEPS = [55, 125, 500, 1000, 5000]
rows = []
for mt in (6, 20):
    for bn, w in BASKETS.items():
        for D in DEPS:
            for f in FL:
                est = min(4 * (100 - f) / 100, 1.0)
                rows.append(dict(minTrade=mt, basket=bn, deposit=D, floor=f, result=accept(D, f * 100, w, mt), first_buy_usdt=round(est * D, 2), first_buy_pct_of_deposit=round(est * 100, 1)))
A = pd.DataFrame(rows); A.to_csv("results/A1_contract_accept.csv", index=False)
# closed form: smallest weight w_min (fraction): need min(1, 4*(1-f)) * D * w_min >= minTrade  ->  D >= minTrade / (w_min * min(1, 4*(1-f)))
# equivalently max floor f_max = 1 - minTrade/(4*D*w_min)  (when that is >= 0.75; else any floor 50..75 passes if D*w_min >= minTrade)
def closed(D, f, wmin, mt): return "OK" if min(1, 4 * (1 - f / 100)) * D * wmin >= mt - 1e-9 else "TOO_SMALL"
bad = 0
for mt in (6, 20):
    for bn, w in BASKETS.items():
        for D in list(range(1, 1001, 7)) + DEPS:
            for f in FL:
                a = accept(D, f * 100, w, mt); c = closed(D, f, min(w) / BPS, mt)
                if a != c: bad += 1
print("closed-form mismatches vs exact:", bad)
rows = []
for mt in (6, 20):
    for bn, w in BASKETS.items():
        for f in [50, 60, 70, 75, 80, 85, 88, 90, 92, 94, 95, 96, 97, 98]:
            rows.append(dict(minTrade=mt, basket=bn, floor=f, min_deposit_usdt=round(mt / (min(w) / BPS * min(1, 4 * (1 - f / 100))), 2)))
pd.DataFrame(rows).to_csv("results/A2_min_deposit.csv", index=False)
print("BAD_FLOOR ever returned:", (A.result == "BAD_FLOOR").any())
P = A[A.deposit.isin(DEPS)].pivot_table(index=["minTrade", "basket", "deposit"], columns="floor", values="result", aggfunc="first")
for k, row in P.iterrows():
    rej = [c for c in P.columns if row[c] != "OK"]
    print(k, "rejected floors:", (f"{min(rej)}..{max(rej)}" if rej else "none") if not rej or rej == list(range(min(rej), max(rej) + 1)) else rej)
