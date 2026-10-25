"""
Dark cuts of the background plates, with Lumo left exactly as painted.

The scene is graded down onto the dark canvas (cream maps to #111010, every
darker detail to a darker shade of it), a soft warm glow is laid behind Lumo,
and Lumo's own pixels are composited back on top untouched.

Lumo is found by his own colours — the yellow body and the black hoodie —
joined and hole-filled, but only inside a hand-placed box per plate (BOXES):
across the whole plate the foliage is more saturated yellow than his face.
Re-check the box if a plate is redrawn.

Needs Pillow, NumPy and SciPy (not app dependencies):
    python3 -m venv /tmp/v && /tmp/v/bin/pip install pillow numpy scipy
    /tmp/v/bin/python scripts/dark-plates.py
Writes <name>Dark.png beside each source; encode with the folder's cwebp recipe.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent / "assets"
CANVAS = np.array([0x11, 0x10, 0x10], float)  # darkPalette.canvas
GLOW = np.array([0xF4, 0xB6, 0x32], float)  # brand gold

# (x0, y0, x1, y1) around every Lumo in the plate, in source pixels.
BOXES = {
    "bg-home/LumoEarlyMorning": [(520, 200, 775, 545)],
    "bg-home/LumoMorning": [(515, 250, 705, 605)],
    "bg-home/LumoLunch": [(545, 245, 800, 725)],
    "bg-home/LumoAfternoon": [(505, 265, 785, 645)],
    "bg-home/LumoLateAfternoon": [(460, 265, 765, 725)],
    "bg-home/LumoEvening": [(470, 250, 770, 705)],
    "walk/LumoWalking": [(330, 270, 560, 545)],
    # Journal scenes (constants/mascotAssets.ts sceneArt), not plates.
    "mascot/Lumo_JournalAdd 1": [(1440, 10, 1920, 580)],
    # The book splits off both feet, so each is its own blob.
    "mascot/Lumo_JournalToday": [(285, 395, 725, 1005), (405, 880, 500, 1005), (545, 880, 650, 1005)],
    # The launch splash (PNG — the splash must stay PNG). Lumo plus his waving hand.
    "Splash": [(265, 855, 790, 1450)],
}

# Lumo's yellow starts around this hue. 38 suits most plates; where wood or a
# glow beside him sits at 36-42 the floor goes up, but not on warm-lit plates,
# where his own shading drops into that band.
HUE_FLOOR = {"bg-home/LumoLunch": 43, "mascot/Lumo_JournalToday": 30}

# Hedge in his own yellow that touches him along a wide edge, which nothing
# above can tell apart from him. Cut by hand, same coordinates as BOXES.
#
# GroupBG is deliberately absent: three Lumos in a field of the same yellow
# grass could not be cut cleanly, so the group screen keeps its dimmed plate.
EXCLUDE = {
    "bg-home/LumoMorning": [(505, 460, 538, 512)],
    # The cushion he sits on, let in by that plate's lower hue floor.
    "mascot/Lumo_JournalToday": [(280, 870, 405, 1005), (642, 880, 725, 1005)],
}

# Landscape washes with no Lumo in them.
PLAIN = [
    "bg/01_onboarding",
    "bg/02_today",
    "bg/03_habits",
    "bg/04_habit_details",
    "bg/05_insights",
    "bg/06_journal",
    "bg/07_challenge",
    "bg/08_trophies",
]


def lumo_mask(rgb, boxes, hue_floor=38, exclude=()):
    """0..1, where 1 is Lumo (and whatever he is holding)."""
    hsv = np.array(Image.fromarray(rgb).convert("HSV"), float) / 255
    hue, sat, val = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    body = (hue > hue_floor) & (hue < 64) & (sat > 0.5) & (val > 0.7)
    hoodie = val < 0.35
    mask = np.zeros(val.shape, bool)
    for x0, y0, x1, y1 in exclude:
        body[y0:y1, x0:x1] = False

    for x0, y0, x1, y1 in boxes:
        inside = np.zeros_like(mask)
        inside[y0:y1, x0:x1] = True
        solid = nd.binary_closing((body | hoodie) & inside, iterations=3) & inside
        labels, n = nd.label(solid)
        if n == 0:
            continue
        sizes = nd.sum(solid, labels, range(1, n + 1))
        lumo = labels == np.argmax(sizes) + 1
        # Holes are his: eyes, mouth, cheeks and the pale middle of his face.
        lumo = nd.binary_fill_holes(lumo)
        # Grass beside him is HIS yellow too, so it is cut by shape: he is one
        # smooth blob, foliage hangs off it through narrow necks. Opening
        # breaks the necks; regrowing a few pixels inside the original puts
        # his own edge back.
        core = nd.binary_opening(lumo, iterations=6)
        cores, count = nd.label(core)
        if count:
            core = cores == np.argmax(nd.sum(core, cores, range(1, count + 1))) + 1
            lumo = nd.binary_dilation(core, iterations=7) & lumo
        mask |= lumo

    mask = nd.binary_dilation(mask, iterations=1)
    return np.clip(nd.gaussian_filter(mask.astype(float), 1.5), 0, 1)


def glow(shape, boxes):
    """A soft warm pool behind each Lumo — he is a spark, and it hides the cut."""
    ys, xs = np.mgrid[0 : shape[0], 0 : shape[1]]
    out = np.zeros(shape[:2])
    for x0, y0, x1, y1 in boxes:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        r = max(x1 - x0, y1 - y0) * 0.9
        out = np.maximum(out, np.clip(1 - np.hypot(xs - cx, ys - cy) / r, 0, 1) ** 2)
    return out


def darken(rgb):
    """Cream to the dark canvas; detail keeps its relative shade, a little lifted."""
    ref = np.percentile(rgb.reshape(-1, 3), 97, axis=0)
    ratio = np.clip(rgb / np.maximum(ref, 1), 0, 1)
    return CANVAS * ratio**0.6


def make(name, boxes):
    src = ROOT / f"{name}.webp"
    if not src.exists():
        src = src.with_suffix(".png")
    rgb = np.array(Image.open(src).convert("RGB"), float)
    out = darken(rgb)

    if boxes:
        g = glow(rgb.shape, boxes)[..., None] * 0.22
        out = out + (GLOW - out) * g
        m = lumo_mask(rgb.astype(np.uint8), boxes, HUE_FLOOR.get(name, 38), EXCLUDE.get(name, ()))[..., None]
        out = out * (1 - m) + rgb * m

    dest = src.with_name(f"{src.stem}Dark.png")
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dest)
    print(dest.relative_to(ROOT.parent))


if __name__ == "__main__":
    for name, boxes in BOXES.items():
        make(name, boxes)
    for name in PLAIN:
        make(name, None)
