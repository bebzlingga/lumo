import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

const HORIZON = 1.0; // fraction of screen height where the beams start (device bottom edge)
const RAY_DIM = 0.2; // global ray opacity multiplier — beams render at 20% strength
const BLUE = "#7FA8FF";
const GOLD = "#FFCB6E";
const WHITE = "#FFF3D0";

// --- Light beams -----------------------------------------------------------
// Each beam is a thin triangle with its apex at the bottom, fanning upward.
// Specs are stored as screen fractions and resolved to pixels at render time.
type Beam = { ox: number; angle: number; hw: number; lenF: number; color: string; o: number };
const BEAMS: Beam[] = [];
const pushBeam = (ox: number, angle: number, hw: number, lenF: number, color: string, o: number) =>
  BEAMS.push({ ox, angle, hw, lenF, color, o });

// Cool blue shafts spraying up from either side of centre — brighter the more
// vertical. Angles straddle the middle so there is no hard vertical centre ray.
for (let i = 0; i < 6; i++) {
  const a = -60 + (120 / 5) * i; // -60,-36,-12,12,36,60 — no beam at 0
  const o = 0.035 + 0.08 * (1 - Math.abs(a) / 90);
  pushBeam(0.5, a, 0.5 + 0.3 * Math.abs(Math.sin(i * 1.7)), 1.05, BLUE, o);
}
// Warm gold bursts from two points either side of centre; they cross toward it.
for (let i = 0; i < 4; i++) {
  const a = -58 + (66 / 3) * i; // -58 .. +8
  pushBeam(0.32, a, 0.55 + 0.25 * Math.abs(Math.sin(i * 2.1)), 0.85, GOLD, 0.05 + 0.06 * (1 - i / 4));
}
for (let i = 0; i < 4; i++) {
  const a = 58 - (66 / 3) * i; // +58 .. -8
  pushBeam(0.68, a, 0.55 + 0.25 * Math.abs(Math.sin(i * 2.1)), 0.85, GOLD, 0.05 + 0.06 * (1 - i / 4));
}
function beamPath(sx: number, sy: number, angleDeg: number, halfDeg: number, len: number): string {
  const toXY = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(sx + Math.sin(a) * len).toFixed(1)},${(sy - Math.cos(a) * len).toFixed(1)}`;
  };
  return `M${sx.toFixed(1)},${sy.toFixed(1)} L${toXY(angleDeg - halfDeg)} L${toXY(angleDeg + halfDeg)} Z`;
}

// --- Sparkle particles -----------------------------------------------------
// Deterministic scatter (seeded) so the field is stable across re-renders.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type Spark = { x: number; y: number; r: number; o: number; color: string };
const SPARKS: Spark[] = [];
const rng = makeRng(20260801);
const addSparks = (count: number, yMin: number, yMax: number, spread: number, rMin: number, rMax: number) => {
  for (let i = 0; i < count; i++) {
    const x = clamp01(0.5 + (rng() - 0.5) * spread);
    const y = yMin + rng() * (yMax - yMin);
    SPARKS.push({
      x,
      y,
      r: rMin + rng() * (rMax - rMin),
      o: 0.3 + rng() * 0.7,
      color: rng() > 0.22 ? GOLD : WHITE
    });
  }
};
addSparks(28, HORIZON - 0.12, 1.0, 1.2, 0.6, 2.2); // glowing band near the bottom
addSparks(16, 0.45, HORIZON - 0.12, 0.9, 0.5, 1.4); // motes rising along the beams

/**
 * Full-screen "award ceremony" backdrop for the Trophies screen — a deep navy sky
 * with cool blue and warm gold light beams fanning up from a glow at the bottom
 * edge, plus a shower of gold sparkle particles. Fills the whole screen (no seam)
 * so the header melts into it and the trophy shelves sit on one continuous scene.
 */
export function TrophiesBackdrop({ width, height, insetTop: _insetTop }: { width: number; height: number; insetTop: number }) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const w = width;
  const h = height;
  const hy = HORIZON * h;

  return (
    <Svg width={w} height={h} pointerEvents="none">
      <Defs>
        <LinearGradient id="tbSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#05091C" />
          <Stop offset="0.5" stopColor="#0A1332" />
          <Stop offset="1" stopColor="#101E46" />
        </LinearGradient>
        {/* warm bloom around the bottom glow */}
        <RadialGradient id="tbHorizon" cx={w / 2} cy={hy} r={w * 0.7} fx={w / 2} fy={hy} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE6A8" stopOpacity="0.14" />
          <Stop offset="0.4" stopColor="#FFC24D" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#FFC24D" stopOpacity="0" />
        </RadialGradient>
        {/* gold hotspots under the two side bursts, reused for both */}
        <RadialGradient id="tbSpot" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFCB6E" stopOpacity="0.09" />
          <Stop offset="1" stopColor="#FFCB6E" stopOpacity="0" />
        </RadialGradient>
        {/* bright core of the glow line */}
        <LinearGradient id="tbLine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFF3D0" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFF7E4" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFF3D0" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* sky + bottom glow + side hotspots */}
      <Rect x="0" y="0" width={w} height={h} fill="url(#tbSky)" />
      <Rect x="0" y="0" width={w} height={h} fill="url(#tbHorizon)" />
      <Circle cx={w * 0.32} cy={hy} r={w * 0.22} fill="url(#tbSpot)" />
      <Circle cx={w * 0.68} cy={hy} r={w * 0.22} fill="url(#tbSpot)" />

      {/* light beams fanning up from the bottom */}
      {BEAMS.map((b, index) => (
        <Path key={`beam-${index}`} d={beamPath(b.ox * w, hy, b.angle, b.hw, b.lenF * h)} fill={b.color} opacity={b.o * RAY_DIM} />
      ))}

      {/* bright glow line at the bottom — soft band then a crisp core */}
      <Rect x="0" y={hy - 6} width={w} height={12} fill="url(#tbLine)" opacity={0.18} />
      <Rect x="0" y={hy - 1} width={w} height={2} fill="url(#tbLine)" opacity={0.7} />

      {/* sparkle particles on top of everything */}
      {SPARKS.map((s, index) => (
        <Circle key={`spark-${index}`} cx={s.x * w} cy={s.y * h} r={s.r} fill={s.color} opacity={s.o} />
      ))}
    </Svg>
  );
}
