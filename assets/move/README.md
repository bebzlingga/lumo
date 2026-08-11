# Lumo Move — asset slots

Nothing in this folder yet, deliberately. §42 of the spec says not to create
artwork programmatically, so Move ships with **visible placeholders** and clean
slots for the real illustrations. Everything below is wired and laid out; each
one is a one-line swap when the art arrives.

## What is currently a placeholder

| Slot | Placeholder today | Where |
|---|---|---|
| Journey stage scenery (7) | An emoji per stage (`🌳 🏘️ 🌲 🌄 ⛰️ 🌊 🧭`) | `JOURNEY_STAGES[].glyph` in `lib/move/journey.ts` |
| Lumo on the trail | `🚶` | `components/move/MoveJourney.tsx` |
| Move badges (7) | Drawn in code — a tiered hexagon with the milestone's short name | `components/MilestoneBadge.tsx` |
| Move header mascot | None — the screen uses the shared `habits` landscape plate | `app/(tabs)/move.tsx` |

The badges are **not** waiting on art. They are drawn in code the same way the
streak badges are (`components/BadgeArt`), so the ladder can grow a rung without
anyone redrawing anything. Replace them only if hand-drawn medals are wanted.

## What to provide

1. **Seven journey environments** — park, neighborhood, forest, hills,
   mountains, coast, adventure trail. Wide-ish, roughly square, readable at
   52 pt. Export WebP.
2. **Mascot states** (§42) — resting, walking, encouraging, celebrating, badge
   unlocked, and a group variant with several Lumos. Same 941 × 1672 scene frame
   the journal and walk scenes use.
3. **A Move header plate** — landscape family, `853 × 1844`, if Move should stop
   borrowing the habits plate.

## How to add them

All art in this repo is WebP. From this folder:

```sh
for f in *.png; do cwebp -q 82 -m 6 -mt "$f" -o "${f%.png}.webp"; done && rm *.png
```

Then register in `constants/backgroundAssets.ts` (plates) or
`constants/mascotAssets.ts` (scenes), following the entries already there. For
the journey, swap `glyph: string` for an `ImageSourcePropType` and change the
one `<AppText>` in `MoveJourney` to an `<Image>` — the spacing, the trail line
and the position maths all stay as they are.

## Badge art

`badges/locked/` and `badges/unlocked/` hold one illustration per milestone —
the same badge in colour and in greyscale with a padlock.

**All fourteen are normalised to a 600 × 600 canvas with the solid badge shape
at 86% of the canvas height, centred on the badge rather than on the frame.**
That is not cosmetic. The originals arrived in three different frames
(1536 × 1024, 1024 × 1536, 1254 × 1254), several with the artwork off-centre
inside them, so `resizeMode="contain"` fitted some by width and others by
height — the unlocked badges rendered about a third smaller than the locked
ones. Styling cannot fix that; the frames have to agree.

If you replace or add a badge, run it through the same normalisation:

```py
# solid bbox = alpha > 128 — a lower threshold catches the halo on the unlocked
# art and makes those badges come out smaller than the locked ones.
solid  = im.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
scale  = (600 * 0.86) / (solid[3] - solid[1])          # scale on HEIGHT
# then paste centred on the solid bbox's own centre into a 600x600 transparent
# canvas and save as WebP, quality 88.
```

Widths still vary a little between rungs (419–476 px). That is the artwork —
some hexagons are genuinely wider — not a framing error.

### The shadow is in the artwork

Each badge carries a soft drop shadow baked into its own alpha — blurred
silhouette, offset 7px, 38% black, all at the 600px canvas size.

That is not a stylistic choice. React Native draws a view's `shadow*` from its
BOUNDS, so a hexagonal badge inside a square view gets a **square** shadow, and
Android's `elevation` is bounds-based in the same way. The alpha channel is the
only thing that knows the badge's real outline, and the only place that can read
it is the image pipeline.

```py
alpha  = im.getchannel("A").filter(ImageFilter.GaussianBlur(9))
alpha  = alpha.point(lambda a: int(a * 0.38))
shadow = Image.new("RGBA", im.size, (0, 0, 0, 0)); shadow.putalpha(alpha)
out    = Image.new("RGBA", im.size, (0, 0, 0, 0))
out.paste(shadow, (0, 7), shadow); out.alpha_composite(im)
```

Blur plus offset comes to about 16px, which fits inside the 14% transparent
margin the normalisation leaves — so nothing clips. **Do not add `shadow*` in
the component**; it will draw a rectangle behind this one.
