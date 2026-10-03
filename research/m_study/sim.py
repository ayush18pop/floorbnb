"""Vectorised CPPI vault simulator mirroring docs/CONTRACTS.md section 5 (bands, minTrade, E*=min(m*(V-F),V)).

Units: deposit D = 1. One risky asset (or a daily-rebalanced equal-weight basket treated as one asset) plus
stablecoin at 0% yield. r[n, t] = gross return of the risky asset between consecutive rebalance opportunities
(so overnight and weekend gaps are fully inside r; there is no hedging between rebalances).
Cost model: cost (one-way fraction) is charged on every trade notional (buy: asset gets amt*(1-cost);
sell: cash gets amt*(1-cost)); the final maturity unwind is charged too.
Breach = final value < floor F (what the user would receive at maturity). 1-year term = 252 rebalance steps.
"""
import numpy as np

SELL_BAND, BUY_BAND, MIN_TRADE = 0.01, 0.02, 0.002   # 1% V, 2% V, 20 USDT on a 10,000 deposit


def cppi(r, m, floor=0.90, cost=0.0006, every=1, bands=True, sell_band=SELL_BAND, buy_band=BUY_BAND,
         min_trade=MIN_TRADE, m_path=None, tgt_fn=None):
    """r: (N,T). m: (K,) fixed multipliers, or m_path (N,T,[K]) of per-step multipliers (dynamic m).
    Returns dict of arrays shape (N,K)."""
    r = np.asarray(r, float); N, T = r.shape
    m = np.atleast_1d(np.asarray(m, float)); K = len(m)
    F = floor
    mm = lambda t: (m[None, :] if m_path is None else (m_path[:, t, :] if m_path.ndim == 3 else m_path[:, t][:, None]))
    V = np.ones((N, K)); E = np.zeros((N, K)); S = np.ones((N, K))
    cum_cost = np.zeros((N, K)); turn = np.zeros((N, K)); locked = np.zeros((N, K)); vmin = np.ones((N, K))

    def rebalance(V, E, S, mrow, first=False):
        C = np.maximum(V - F, 0.0)
        Tgt = np.minimum(mrow * C, V) if tgt_fn is None else np.minimum(tgt_fn(V, mrow), V)
        dead = V <= F + 1e-12
        Tgt = np.where(dead, 0.0, Tgt)
        d = Tgt - E
        if first or not bands:
            trade = d.copy()
        else:
            sell = (d <= -sell_band * V); buy = (d >= buy_band * V)
            trade = np.where(sell | buy, d, 0.0)
            trade = np.where(np.abs(trade) < min_trade, 0.0, trade)
            trade = np.where(dead & (E > 1e-9), -E, trade)          # full unwind overrides minTrade
        trade = np.where(trade > 0, np.minimum(trade, S), trade)     # buys capped by cash
        trade = np.where(trade < 0, np.maximum(trade, -E), trade)
        amt = np.abs(trade); c = amt * cost
        E = E + np.where(trade > 0, trade * (1 - cost), trade)
        S = S + np.where(trade > 0, -trade, -trade * (1 - cost))
        return E, S, amt, c

    E, S, amt, c = rebalance(V, E, S, mm(0), first=True)
    V = E + S; cum_cost += c; turn += amt
    for t in range(T):
        E = E * r[:, t][:, None]; V = E + S
        vmin = np.minimum(vmin, V)
        if (t + 1) % every == 0 and t < T - 1:
            E, S, amt, c = rebalance(V, E, S, mm(t + 1))
            V = E + S; cum_cost += c; turn += amt
        locked += (V <= F + 1e-12)
    fin_cost = E * cost; V = V - fin_cost; cum_cost += fin_cost; turn += E
    return dict(V=V, vmin=vmin, cost=cum_cost, turnover=turn, locked=locked / T)


def hold_return(r):
    return np.prod(r, axis=1)


def make_windows(ret, win=252, step=252, offset=0):
    """ret: 1d gross-return array -> (N, win) windows."""
    idx = np.arange(offset, len(ret) - win + 1, step)
    return np.stack([ret[i:i + win] for i in idx]), idx


def summarize(V, hold, F=0.90):
    """V:(N,K), hold:(N,). Returns dict of (K,) metrics."""
    N, K = V.shape
    breach = (V < F - 1e-9)
    up = hold > 1; bad = hold < 0.9
    ret = V - 1
    out = dict(
        n=np.full(K, N), breach_rate=breach.mean(0),
        worst_ret=ret.min(0), med_ret=np.median(ret, 0), mean_ret=ret.mean(0),
        capture_up=(ret[up].mean(0) / (hold[up].mean() - 1)) if up.any() else np.full(K, np.nan),
        bad_year_ret=np.median(ret[bad], 0) if bad.any() else np.full(K, np.nan),
        n_bad=np.full(K, int(bad.sum())), n_up=np.full(K, int(up.sum())))
    return out
