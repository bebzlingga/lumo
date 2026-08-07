import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

// Theme-aware palette — a soft green wash plus a friendly cast of avatar
// "bubbles", a connecting garland and hearts. Bottom fades out so the roll-call
// card overlapping the lower half blends cleanly.
const THEMES = {
  light: {
    fadeTop: "#D2EEDC",
    fadeMid: "#E7F5ED",
    bubbles: ["#B7E4C8", "#9BD6B0", "#CBEBD6", "#8FD3A8", "#A8DEBB"],
    face: "#2E6B4D",
    cheek: "#F3AEBA",
    glow: "#A8DEBB",
    line: "#93CDAB",
    heart: "#F1A0AE",
    spark: "#BDE7CD",
    highlight: "#FFFFFF",
    highlightO: 0.32
  },
  dark: {
    fadeTop: "#12332A",
    fadeMid: "#0E2A22",
    bubbles: ["#1E4B39", "#255241", "#1A4230", "#2C6049", "#204935"],
    face: "#8ACEA8",
    cheek: "#B5707C",
    glow: "#245241",
    line: "#2C5E47",
    heart: "#C87C88",
    spark: "#2E5C46",
    highlight: "#DFF5E8",
    highlightO: 0.16
  }
} as const;

// Symmetric heart centred at (cx,cy) sized by s.
function heartPath(cx: number, cy: number, s: number): string {
  return (
    `M${cx},${cy + s * 0.35}` +
    ` C${cx - s * 0.55},${cy - s * 0.05} ${cx - s * 0.35},${cy - s * 0.55} ${cx},${cy - s * 0.2}` +
    ` C${cx + s * 0.35},${cy - s * 0.55} ${cx + s * 0.55},${cy - s * 0.05} ${cx},${cy + s * 0.35} Z`
  );
}

// Smooth garland threaded through the bubble centres (quadratic via midpoints).
function garlandPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) {
    return "";
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    const my = (pts[i - 1].y + pts[i].y) / 2;
    d += ` Q${pts[i - 1].x.toFixed(1)},${pts[i - 1].y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  return d;
}

// Friend bubbles arc across the top (x-order), framing the centred group avatar.
const BUBBLES: { x: number; y: number; r: number; c: number; face: boolean }[] = [
  { x: 0.08, y: 0.37, r: 0.07, c: 2, face: false },
  { x: 0.21, y: 0.2, r: 0.115, c: 0, face: true },
  { x: 0.35, y: 0.11, r: 0.06, c: 3, face: false },
  { x: 0.65, y: 0.11, r: 0.06, c: 4, face: false },
  { x: 0.79, y: 0.2, r: 0.12, c: 1, face: true },
  { x: 0.93, y: 0.38, r: 0.075, c: 3, face: true }
];

const HEARTS: { x: number; y: number; s: number }[] = [
  { x: 0.5, y: 0.06, s: 13 },
  { x: 0.12, y: 0.52, s: 9 },
  { x: 0.88, y: 0.54, s: 8 }
];

const SPARKS: { x: number; y: number; r: number }[] = [
  { x: 0.15, y: 0.1, r: 2.2 },
  { x: 0.44, y: 0.3, r: 1.6 },
  { x: 0.6, y: 0.46, r: 2 },
  { x: 0.9, y: 0.16, r: 1.6 },
  { x: 0.31, y: 0.52, r: 1.8 }
];

/**
 * Friends-themed header backdrop for the group screen — a soft, theme-aware
 * green wash with a cast of connected avatar bubbles (soft glow, shine, smiley
 * faces + cheeks), a dotted garland and hearts, fading out toward the bottom.
 * Self-measures (like ChallengesHeroArt) so it fills a parent whose height the
 * caller sets. Purely cosmetic; render it behind the header.
 */
export function GroupHeaderArt({ isDark, width, height }: { isDark: boolean; width?: number; height?: number }) {
  const [measured, setMeasured] = React.useState({ w: 0, h: 0 });
  const w = width ?? measured.w;
  const h = height ?? measured.h;
  const c = isDark ? THEMES.dark : THEMES.light;
  const centers = BUBBLES.map((b) => ({ x: b.x * w, y: b.y * h }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setMeasured({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}
    >
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id="ghSky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.fadeTop} stopOpacity="1" />
              <Stop offset="0.45" stopColor={c.fadeMid} stopOpacity="0.7" />
              <Stop offset="1" stopColor={c.fadeMid} stopOpacity="0" />
            </LinearGradient>
            <RadialGradient id="ghGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c.glow} stopOpacity="0.55" />
              <Stop offset="1" stopColor={c.glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <Path d={`M0,0 H${w} V${h} H0 Z`} fill="url(#ghSky)" />

          {/* sparkle dots */}
          {SPARKS.map((s, index) => (
            <Circle key={`spark-${index}`} cx={s.x * w} cy={s.y * h} r={s.r} fill={c.spark} opacity={0.8} />
          ))}

          {/* dotted garland connecting the friends */}
          <Path d={garlandPath(centers)} stroke={c.line} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="1 7" fill="none" opacity={0.85} />

          {/* hearts */}
          {HEARTS.map((ht, index) => (
            <Path key={`heart-${index}`} d={heartPath(ht.x * w, ht.y * h, ht.s)} fill={c.heart} opacity={0.8} />
          ))}

          {/* friend bubbles: glow, disc, shine, face */}
          {BUBBLES.map((b, index) => {
            const cx = b.x * w;
            const cy = b.y * h;
            const r = b.r * w;
            return (
              <React.Fragment key={`bubble-${index}`}>
                <Circle cx={cx} cy={cy} r={r * 1.55} fill="url(#ghGlow)" />
                <Circle cx={cx} cy={cy} r={r} fill={c.bubbles[b.c]} opacity={0.95} />
                <Circle cx={cx - r * 0.32} cy={cy - r * 0.36} r={r * 0.32} fill={c.highlight} opacity={c.highlightO} />
                {b.face ? (
                  <>
                    <Circle cx={cx - r * 0.45} cy={cy + r * 0.2} r={r * 0.15} fill={c.cheek} opacity={0.7} />
                    <Circle cx={cx + r * 0.45} cy={cy + r * 0.2} r={r * 0.15} fill={c.cheek} opacity={0.7} />
                    <Circle cx={cx - r * 0.28} cy={cy - r * 0.05} r={r * 0.1} fill={c.face} />
                    <Circle cx={cx + r * 0.28} cy={cy - r * 0.05} r={r * 0.1} fill={c.face} />
                    <Path
                      d={`M${cx - r * 0.28},${cy + r * 0.14} Q${cx},${cy + r * 0.42} ${cx + r * 0.28},${cy + r * 0.14}`}
                      stroke={c.face}
                      strokeWidth={Math.max(1, r * 0.1)}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </>
                ) : null}
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
