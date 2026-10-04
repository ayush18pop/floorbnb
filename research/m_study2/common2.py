"""Shared helpers for the floor/term study. Reuses research/m_study/{sim,common}.py (read-only) and its data layout."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m_study"))
import numpy as np, pandas as pd
import common as C0            # m_study/common.py (its D points at m_study/data, so override below)
C0.D = os.path.join(HERE, "data")
import sim

TERMS = {7: 5, 14: 10, 30: 21, 90: 63, 180: 126, 365: 252}      # calendar days -> trading-day steps
FLOORS = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.88, 0.90, 0.92, 0.94, 0.95, 0.96, 0.98]
COSTS = [6, 25]
M = 4.0
SGROUP = {}
for g, l in C0.GROUPS.items():
    for t in l:
        SGROUP[t] = {"US index/ETF": "Index/ETF", "Intl index": "Index/ETF", "Single stock": "Single stock"}.get(g, "Other")
for b in C0.BASKETS: SGROUP[b] = "Basket"

def cppi2(r, floor, cost, m=M, min_buy=sim.MIN_TRADE, min_sell=sim.MIN_TRADE, sell_band=0.01, buy_band=0.02):
    """Like sim.cppi (fixed m, daily rebalance at close) plus: first-lock step, average/max exposure, and separate
    minimum sizes for buys and sells (the contract lets sells above `dust` through; buys need minTrade).
    Units: deposit = 1. Returns dict of (N,) arrays."""
    r = np.asarray(r, float); N, T = r.shape; F = floor
    V = np.ones(N); E = np.zeros(N); S = np.ones(N)
    cum = np.zeros(N); turn = np.zeros(N); first_lock = np.full(N, np.nan); sumE = np.zeros(N); maxE = np.zeros(N)
    def reb(V, E, S, first=False):
        C = np.maximum(V - F, 0.0); Tgt = np.minimum(m * C, V)
        dead = V <= F + 1e-12; Tgt = np.where(dead, 0.0, Tgt); d = Tgt - E
        if first: trade = d.copy()
        else:
            sell = d <= -sell_band * V; buy = d >= buy_band * V
            trade = np.where(sell | buy, d, 0.0)
            trade = np.where((trade > 0) & (trade < min_buy), 0.0, trade)
            trade = np.where((trade < 0) & (-trade < min_sell), 0.0, trade)
            trade = np.where(dead & (E > 1e-9), -E, trade)
        trade = np.where(trade > 0, np.minimum(trade, S), trade)
        trade = np.where(trade < 0, np.maximum(trade, -E), trade)
        amt = np.abs(trade)
        E = E + np.where(trade > 0, trade * (1 - cost), trade)
        S = S + np.where(trade > 0, -trade, -trade * (1 - cost))
        return E, S, amt, amt * cost
    # first trade: contract rejects the position if E* < minTrade (see acceptance table); the sim buys regardless
    E, S, amt, c = reb(V, E, S, True); V = E + S; cum += c; turn += amt
    for t in range(T):
        E = E * r[:, t]; V = E + S
        if t < T - 1:
            E, S, amt, c = reb(V, E, S); V = E + S; cum += c; turn += amt
        lk = (V <= F + 1e-12)
        first_lock = np.where(lk & np.isnan(first_lock), (t + 1) / T, first_lock)
        sumE += E / np.maximum(V, 1e-12); maxE = np.maximum(maxE, E / np.maximum(V, 1e-12))
    fin = E * cost; V = V - fin; cum += fin; turn += E
    return dict(V=V, cost=cum, turn=turn, first_lock=first_lock, avgE=sumE / T, maxE=maxE)

def series_returns():
    S = C0.all_series("close")
    return {k: v for k, v in S.items() if SGROUP.get(k) in ("Index/ETF", "Single stock", "Basket")}
