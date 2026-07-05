# Habit Journey

A single, self-contained screen: a horizontally-scrolling, Duolingo-inspired **habit roadmap** you can drag, swipe, wheel, or arrow-key through. Built with **React + TypeScript + Vite + Tailwind CSS + Framer Motion**. No routing, auth, or extra pages — just the one polished screen.

## Run

```bash
cd habit-journey
npm install
npm run dev
```

Open the printed local URL. `npm run typecheck` runs a strict `tsc` pass; `npm run build` produces a production bundle.

## Features

- **Infinite horizontal roadmap** — milestones are generated deterministically per index, so the trail never ends (more tips append as you approach the tail).
- **Virtualized** — only the milestones inside the viewport (plus a small buffer) are rendered, so hundreds of nodes stay smooth.
- **Gentle curved path** — a smooth Catmull-Rom → bézier curve threads the nodes, which alternate above/below the baseline.
- **Milestone states** — completed (green), current (glowing pulse), locked (faded); optional streak badges.
- **Parallax background** — mountains, hills, clouds, twinkling stars and drifting sparkles move slower than the roadmap.
- **Interactions** — click & drag, momentum + snapping, horizontal mouse-wheel, touch swipe, and `←`/`→`/`Home` keyboard navigation.
- **Accessible** — focusable nodes with descriptive ARIA labels, keyboard nav, and full `prefers-reduced-motion` support.
- **Dark mode** — toggled in the header; follows the system preference by default.

## Structure

```
src/
  App.tsx                    # dark-mode shell
  components/
    HabitJourneyScreen.tsx   # header + roadmap layout
    Roadmap.tsx              # composes data + scroll + path + nodes (virtualized)
    Milestone.tsx            # a single node (bubble + card + state + motion)
    Path.tsx                 # smooth curved connecting trail (SVG)
    Background.tsx           # parallax decorative layers (SVG)
    icons.tsx                # simple currentColor SVG icon set
  hooks/
    useDragScroll.ts         # drag / wheel / keyboard / momentum / snapping
    useInfiniteRoadmap.ts    # lazy-growing milestone list
  data/habitTips.ts          # curated tips + deterministic milestone generator
  lib/layout.ts              # node geometry + virtualization math (the contract)
  types.ts                   # shared types + component/hook contracts
```

All data is mock. Tune the look in `lib/layout.ts` (spacing, amplitude) and `tailwind.config.ts` (accent ramp).
