# Focus ambience loops

Eleven loops, offered three at a time by colour theme — see `constants/sounds.ts`
for which theme gets which, and note that `fireplace` is deliberately shared by
Cream and Sunset.

## Requirements

- **Seamlessly loopable.** These play for hours. Any click, level jump or
  recognisable event at the seam becomes maddening on the tenth repeat — which
  is roughly ten minutes in. Cross-fade the tail into the head before exporting
  and listen to at least five consecutive loops before accepting one.
- **30–60 seconds.** Shorter starts to sound like a pattern; longer costs binary
  size for texture nobody consciously registers.
- **No melody, no speech, no birdsong with a repeating phrase.** Anything the ear
  can latch onto stops being background.
- **Level-matched across all eleven**, so switching sounds mid-session doesn't
  jump in volume. Normalise to about −20 LUFS integrated.

## Encoding

Mono AAC at 64 kbps. Ambience is near-mono anyway, and stereo doubles the size
for width that a phone speaker cannot reproduce.

```sh
# One file
ffmpeg -i source.wav -ac 1 -c:a aac -b:a 64k -movflags +faststart fireplace.m4a

# The whole folder
for f in raw/*.wav; do
  ffmpeg -i "$f" -ac 1 -c:a aac -b:a 64k -movflags +faststart \
    "$(basename "${f%.wav}").m4a"
done
```

At this recipe a 45-second loop lands around 360 KB, so all eleven come to
roughly 4 MB — the budget this was scoped against. If the folder passes ~8 MB,
something was exported in stereo or at the wrong bitrate; check before shipping,
since it goes straight onto the App Store download size.

Keep the WebP rule in mind too: **audio never goes through the image pipeline**,
and these files are the only non-image assets in the app.

## Wiring a file up

1. Drop `<id>.m4a` here, named for its `SoundId` in `constants/sounds.ts`.
2. Replace that entry's `source: PLACEHOLDER_SOURCE` with
   `require("../../assets/audio/<id>.m4a")`.
3. Once all eleven are in, flip `SOUNDS_READY` to `true`.

Until that flag is true the picker stays hidden and Focus runs silent — the
feature degrades to a working stopwatch rather than a broken player.
