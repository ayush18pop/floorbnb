import numpy as np
from PIL import Image
from typolib import font, Layer, flat_color
from kern_table import KERN_ANTON
A = font('anton')
lines = ["Set a floor", "under your", "Your money.", "Your vault.", "Your agent can", "Sell as prices fall.", "Buy as they rise.", "Drag the floor.", "We are live", "Floor. Cushion.", "Higher floor: less loss,", "Review, then confirm.", "Spot swaps only."]
size = 120; lead = 116
L = Layer(1900, lead * len(lines) * 2 + 40)
c = L.ctx; c.set_source_rgb(0, 0, 0)
y = 120
for t in lines:
    for kern, x0 in ((None, 20), (KERN_ANTON, 20)):
        g, w = A.shape(t, size, tracking=-0.015, kern=kern)
        A.draw(c, g, x0, y, size); y += lead
im = L.rgba(); bg = np.full(im.shape[:2] + (3,), 250, np.uint8)
a = im[..., 3:4] / 255.0; out = (bg * (1 - a)).astype(np.uint8)
Image.fromarray(out).resize((out.shape[1] // 2, out.shape[0] // 2), Image.LANCZOS).save('/tmp/claude-0/-home-user-floorbnb/d042d1a4-1388-5a06-8ec0-c9cf8f5bdbbd/scratchpad/kern_proof.png')
