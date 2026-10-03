import numpy as np, pandas as pd, glob, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
GROUPS = {
 "US index/ETF": ["GSPC","IXIC","NDX","DJI","RUT","SPY","QQQ","SMH","XLF","ARKK"],
 "Intl index": ["N225","FTSE","GDAXI","HSI","KS11"],
 "Single stock": ["NVDA","TSLA","AAPL","MSFT","AMZN","META","GOOGL","AMD","NFLX","INTC","CSCO","ORCL","QCOM",
                  "C","BAC","AIG","GE","F","XOM","JPM","BA","DIS","WMT"],
 "Other (not equity)": ["TLT","GLD","BTC-USD"],
}
BASKETS = {"B:MAG6+TSLA (2012+)": ["AAPL","MSFT","AMZN","GOOGL","META","NVDA","TSLA"],
           "B:NVDA+TSLA+QQQ (2010+)": ["NVDA","TSLA","QQQ"],
           "B:Financials-crash (1977+)": ["C","BAC","AIG","GE","F"],
           "B:SPY+QQQ+NVDA (1999+)": ["SPY","QQQ","NVDA"]}
F_WINDOW = 0.65   # assumed fraction (in log terms) of the open->close move that has happened at ~17:30 UTC (13:30 ET)

def load(t):
    return pd.read_csv(f"{D}/ohlc_{t.replace('^','')}.csv", index_col=0, parse_dates=True)

def returns(t, mode="close"):
    """Gross returns between consecutive rebalance points. mode 'window' = rebalance at O*(C/O)^F_WINDOW (assumption)."""
    d = load(t)
    if mode == "close":
        p = d.Close
    else:
        ok = (d.Open > 0) & (d.Open != d.Close)
        p = pd.Series(np.where(ok, d.Open * (d.Close / d.Open) ** F_WINDOW, d.Close), index=d.index)
    return (p / p.shift(1)).dropna()

def group_of(t):
    for g, l in GROUPS.items():
        if t in l: return g
    return "Basket"

def all_series(mode="close"):
    out = {}
    for g, l in GROUPS.items():
        for t in l: out[t] = returns(t, mode)
    for b, l in BASKETS.items():
        df = pd.concat([returns(t, mode) for t in l], axis=1, join="inner")
        out[b] = df.mean(axis=1)
    return out

EQ = ["US index/ETF", "Intl index", "Single stock"]
def pooled_windows(groups=EQ, win=252, step=252, mode="close", series=None):
    """Stack windows from all non-basket series in groups. Returns W (N,win), meta DataFrame(series, group, start)."""
    S = all_series(mode); Ws = []; meta = []
    for s, r in S.items():
        if group_of(s) not in groups or (series is not None and s not in series): continue
        idx = np.arange(0, len(r) - win + 1, step)
        if len(idx) == 0: continue
        Ws.append(np.stack([r.values[i:i + win] for i in idx]))
        meta.append(pd.DataFrame(dict(series=s, group=group_of(s), start=r.index[idx], i0=idx)))
    return np.concatenate(Ws), pd.concat(meta, ignore_index=True)
