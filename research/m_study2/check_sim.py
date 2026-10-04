"""Sanity: cppi2 reproduces m_study/sim.cppi when min sizes are equal."""
import numpy as np
from common2 import *
import sim
rng = np.random.default_rng(1)
r = np.exp(rng.normal(0.0004, 0.02, (2000, 252)))
r[::50, 100] = 0.6
for fl in [0.8, 0.9, 0.95, 0.98]:
    a = sim.cppi(r, [4.0], floor=fl, cost=0.0006)["V"][:, 0]; b = cppi2(r, fl, 0.0006)["V"]
    print(fl, np.abs(a - b).max())
