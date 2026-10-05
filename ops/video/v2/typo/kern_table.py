# Manual kerning for Anton (em units), derived from spacing.py (area-based optical gap) and checked by eye
# on kern_proof.png. Anton's GPOS in the @fontsource subset only kerns a handful of capital pairs (AV, To, LT).
KERN_ANTON = {
    ('Y', 'o'): -0.040, ('y', 'o'): -0.008, ('F', 'l'): -0.030, ('V', 'a'): -0.015, ('W', 'e'): -0.010,
    ('r', 'a'): -0.022, ('r', 'e'): -0.022, ('r', 'o'): -0.022, ('r', 'u'): -0.012, ('r', 'i'): -0.010,
    ('r', 'm'): -0.010, ('r', '.'): -0.035, ('y', '.'): -0.022, ('w', ','): -0.020, ('r', ':'): -0.020,
    ('s', ','): -0.008, ('w', 'a'): -0.010, ('s', 'w'): -0.010, ('v', 'a'): -0.010, ('e', 'v'): -0.006,
    ('t', '.'): -0.012, ('e', '.'): -0.008, ('o', '.'): -0.008, ('s', '.'): -0.006,
}
