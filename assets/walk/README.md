# Walk art

| File | Size | Used as |
|---|---|---|
| `LumoWalking.webp` | 853 × 1844 | Backdrop plate — the Walk home and active screens |
| `LumoDoneWalking.webp` | 853 × 1844 | Backdrop plate — the walk-complete screen |
| `LumoWalked.webp` | 941 × 1672 | Full-bleed scene, the same shape as the journal's today scene |
| `LumoWalkingNight.webp` | 853 × 1844 | Night cut of the walking scene — **not wired up** |
| `LumoWalkedNight.webp` | 941 × 1672 | Night cut of the waving scene — the `walkDone` plate in dark mode |
| `LumoWalkingDark.webp` | 822 × 1913 | Dark cut of `LumoWalking`, from `scripts/dark-plates.py` — the `walking` plate in dark mode |

The two plates share `BACKGROUND_ASPECT` (853/1844) with everything in
`assets/bg/`, so they slot into the background registry unchanged.

## Encoding

Same recipe as the rest of the app's art. The sources were 1.0–1.5 MB PNGs; at
this setting they land at 30–60 KB, in line with the existing plates.

```sh
for f in *.png; do
  cwebp -q 82 -m 6 -mt "$f" -o "${f%.png}.webp"
done
```

`-q 82` is the quality floor where the soft gradients in Lumo's art stay clean —
lower starts banding the skies. `-m 6` is the slowest, smallest compression pass,
which is free here because encoding happens once.

**Do not** apply this to `assets/Splash.png` or the app icon; those must stay PNG.

## Which plates are in use

`LumoWalking.webp` backs the Move screens and `LumoDoneWalking.webp` the
completion ones, both through `components/WalkBackground.tsx` — which draws them
at full strength with no bottom fade, unlike the eight landscape washes.

`LumoWalkedNight` is the dark-mode `walkDone` plate (same frame as `LumoWalked`). `LumoWalkingNight` is **not referenced by any screen**. They were encoded for a
day/night swap at 6pm–4am that was backed out before it shipped; wiring them
back up means a `WalkPlate` entry each, their own `PLATE_FIT` row — they are cut
to DIFFERENT frames from each other, so neither can borrow the other's numbers —
and a `PLATE_TINT` sampled from the art's top band (`#000F2E` and `#0C1535` as
encoded here).

`LumoWalked.webp` is **currently unused as a background**. It is framed the
other way round from the two above — sky at the top, Lumo at the foot — so it
cannot be dropped into their fit without its own anchoring. Kept rather than
deleted: Metro only bundles what is `require`d, so an unreferenced plate costs
nothing in the app.
