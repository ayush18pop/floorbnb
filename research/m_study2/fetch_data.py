"""Download daily OHLC (auto_adjust=True, i.e. split/dividend adjusted) for the study universe into data/ohlc_<tkr>.csv."""
import sys, os, time
import pandas as pd, yfinance as yf
T = {
 "indices": ["^GSPC","^IXIC","^NDX","^DJI","^RUT","^N225","^FTSE","^GDAXI","^HSI","^KS11"],
 "etfs": ["SPY","QQQ","ARKK","SMH","XLF","TLT","GLD"],
 "stocks": ["NVDA","TSLA","AAPL","MSFT","AMZN","META","GOOGL","AMD","NFLX","INTC",
            "CSCO","ORCL","QCOM","C","BAC","AIG","GE","F","XOM","JPM","BA","DIS","WMT"],
 "other": ["BTC-USD"],
}
os.makedirs("data", exist_ok=True)
missing=[]
for grp, ts in T.items():
    for t in ts:
        ok=False
        for k in range(3):
            try:
                df = yf.download(t, start="1927-01-01", interval="1d", auto_adjust=True, progress=False, threads=False)
                if isinstance(df.columns, pd.MultiIndex): df.columns = df.columns.get_level_values(0)
                df = df[["Open","High","Low","Close","Volume"]].dropna(subset=["Close"])
                if len(df)>100:
                    df.to_csv(f"data/ohlc_{t.replace('^','')}.csv"); ok=True
                    print(t, df.index[0].date(), df.index[-1].date(), len(df), flush=True); break
            except Exception as e:
                print(t,"err",repr(e)[:100]); time.sleep(3)
        if not ok: missing.append(t)
print("MISSING:", missing)
