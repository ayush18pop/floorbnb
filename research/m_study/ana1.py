import pandas as pd, numpy as np
d=pd.read_csv("data/hist_windows.csv.gz",parse_dates=["start"])
d["year"]=d.start.dt.year
d["breach"]=(d.ret< d.floor-1-1e-9)
base=d[(d["mode"]=="close")&(d.floor==0.9)&(d.cost_bps==6)&(d.group!="Other (not equity)")&(d.group!="Basket")]
print(base.groupby("group").series.nunique(), base[base.m==4].groupby("group").size())
g=base.groupby(["group","m"]).breach.mean().unstack(0)*100
print(g.round(1))
print(base.groupby("m").breach.mean().mul(100).round(1).to_string())
