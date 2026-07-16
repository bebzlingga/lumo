import React from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { type LumoPalette } from "@/constants/theme";

type IllustrationName = "habits" | "progress" | "challenge" | "nickname" | "journal";

/**
 * Flat, unDraw-style scenes: neutral grayscale shapes, one vivid accent color,
 * faceless figures, no outlines. Colors derive from the palette so the scenes
 * follow the active theme — under the onboarding "light black" palette they
 * render monochrome with an amber accent.
 */

// Simple faceless standing figure (unDraw-style): head + torso + legs, with an
// optional single arm reaching toward a point in the scene.
function Figure({
  x,
  baseline,
  shirt,
  ink,
  armTo
}: {
  x: number;
  baseline: number;
  shirt: string;
  ink: string;
  armTo?: { x: number; y: number };
}) {
  const headY = baseline - 86;
  const torsoY = baseline - 72;

  return (
    <G>
      <Circle cx={x} cy={headY} r={11} fill={ink} />
      <Rect x={x - 13} y={torsoY} width={26} height={38} rx={10} fill={shirt} />
      {armTo ? (
        <Line
          x1={armTo.x < x ? x - 8 : x + 8}
          y1={torsoY + 9}
          x2={armTo.x}
          y2={armTo.y}
          stroke={shirt}
          strokeWidth={7}
          strokeLinecap="round"
        />
      ) : null}
      <Rect x={x - 11} y={baseline - 34} width={8} height={34} rx={3.5} fill={ink} />
      <Rect x={x + 3} y={baseline - 34} width={8} height={34} rx={3.5} fill={ink} />
    </G>
  );
}

// Minimal backdrop: one soft blob behind the subject, a thin ground line, and
// a soft shadow — quiet, professional staging.
function Backdrop({ palette, shadowCx = 160 }: { palette: LumoPalette; shadowCx?: number }) {
  return (
    <G>
      <Circle cx={160} cy={116} r={104} fill={palette.greenSoft} opacity={0.4} />
      <Line x1={48} y1={218} x2={272} y2={218} stroke={palette.hairline} strokeWidth={2} strokeLinecap="round" />
      <Ellipse cx={shadowCx} cy={218} rx={92} ry={7} fill={palette.greenDark} opacity={0.05} />
    </G>
  );
}

// White check mark drawn inside a circle centered at (cx, cy).
function CheckMark({ cx, cy, scale = 1, color }: { cx: number; cy: number; scale?: number; color: string }) {
  const s = scale;

  return (
    <Path
      d={`M${cx - 6 * s} ${cy}l${4.5 * s} ${4.5 * s} ${8 * s} -${9 * s}`}
      stroke={color}
      strokeWidth={3.4 * s}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

export function OnboardingIllustration({
  name,
  palette,
  width,
  height = 250
}: {
  name: IllustrationName;
  palette: LumoPalette;
  width: number;
  height?: number;
}) {
  const ink = palette.greenDark;
  const mid = palette.green;
  const soft = palette.greenSoft;
  const accent = palette.accent;
  const card = palette.card;
  const hairline = palette.hairline;
  const white = palette.white;

  if (name === "progress") {
    // Analytics panel with rising bars, a trend line, and a figure presenting it.
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <Backdrop palette={palette} />

        <Rect x={62} y={56} width={152} height={134} rx={14} fill={card} stroke={hairline} strokeWidth={2} />
        <Line x1={80} y1={168} x2={196} y2={168} stroke={hairline} strokeWidth={2} strokeLinecap="round" />
        <Rect x={86} y={138} width={22} height={30} rx={6} fill={soft} />
        <Rect x={118} y={118} width={22} height={50} rx={6} fill={mid} />
        <Rect x={150} y={92} width={22} height={76} rx={6} fill={accent} />

        <Path d="M86 124 129 102l32-24 26-15" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d="M180 60h9v9" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(20 187 63)" />
        <Circle cx={129} cy={102} r={3.4} fill={ink} />
        <Circle cx={161} cy={78} r={3.4} fill={ink} />

        <Circle cx={236} cy={70} r={5} fill={accent} />
        <Circle cx={54} cy={98} r={4} fill={mid} opacity={0.6} />

        <Figure x={250} baseline={218} shirt={mid} ink={ink} armTo={{ x: 222, y: 128 }} />
      </Svg>
    );
  }

  if (name === "challenge") {
    // Two figures celebrating a shared goal under one check badge.
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <Backdrop palette={palette} />

        <Circle cx={160} cy={84} r={24} fill={accent} />
        <CheckMark cx={160} cy={85} scale={1.2} color={white} />
        <Circle cx={160} cy={84} r={33} stroke={accent} strokeWidth={2} opacity={0.35} fill="none" />

        <Figure x={112} baseline={218} shirt={mid} ink={ink} armTo={{ x: 143, y: 104 }} />
        <Figure x={208} baseline={218} shirt={accent} ink={ink} armTo={{ x: 177, y: 104 }} />

        <Circle cx={64} cy={128} r={4} fill={accent} />
        <Circle cx={258} cy={112} r={4} fill={mid} opacity={0.6} />
        <Circle cx={230} cy={62} r={3} fill={soft} />
      </Svg>
    );
  }

  if (name === "journal") {
    // Open notebook with a figure writing in it — one line a day.
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <Backdrop palette={palette} />

        {/* Open notebook: two pages + spine. */}
        <Rect x={84} y={70} width={64} height={112} rx={10} fill={card} stroke={hairline} strokeWidth={2} />
        <Rect x={148} y={70} width={64} height={112} rx={10} fill={card} stroke={hairline} strokeWidth={2} />
        <Line x1={148} y1={76} x2={148} y2={176} stroke={hairline} strokeWidth={2} />

        {/* Left page: written lines. */}
        <Rect x={96} y={88} width={40} height={7} rx={3.5} fill={mid} />
        <Rect x={96} y={104} width={34} height={7} rx={3.5} fill={soft} />
        <Rect x={96} y={120} width={40} height={7} rx={3.5} fill={soft} />
        <Rect x={96} y={136} width={26} height={7} rx={3.5} fill={soft} />

        {/* Right page: today's line being written. */}
        <Rect x={160} y={88} width={40} height={7} rx={3.5} fill={mid} />
        <Rect x={160} y={104} width={28} height={7} rx={3.5} fill={accent} />

        {/* Bookmark ribbon. */}
        <Rect x={192} y={62} width={11} height={26} rx={3} fill={accent} />

        {/* Floating heart — the good moments worth keeping. */}
        <Path
          d="M70 64c-4-5-12-4-13 2-1 5 5 10 13 14 8-4 14-9 13-14-1-6-9-7-13-2Z"
          fill={accent}
        />
        <Circle cx={236} cy={66} r={4} fill={mid} opacity={0.6} />

        <Figure x={252} baseline={218} shirt={mid} ink={ink} armTo={{ x: 206, y: 122 }} />
      </Svg>
    );
  }

  if (name === "nickname") {
    // Profile card: avatar, name lines, verified badge.
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <Backdrop palette={palette} />

        <Rect x={76} y={74} width={168} height={106} rx={14} fill={card} stroke={hairline} strokeWidth={2} />
        <Circle cx={114} cy={112} r={19} fill={soft} />
        <Circle cx={114} cy={106} r={7} fill={mid} />
        <Path d="M101 122c3-8 23-8 26 0" fill={mid} />
        <Rect x={144} y={100} width={72} height={9} rx={4.5} fill={mid} />
        <Rect x={144} y={118} width={48} height={9} rx={4.5} fill={soft} />
        <Rect x={92} y={148} width={124} height={9} rx={4.5} fill={soft} />

        <Circle cx={236} cy={82} r={15} fill={accent} />
        <CheckMark cx={236} cy={83} scale={0.8} color={white} />

        <Figure x={258} baseline={218} shirt={mid} ink={ink} armTo={{ x: 238, y: 150 }} />
      </Svg>
    );
  }

  // "habits": phone with a habit checklist and a figure checking items off.
  return (
    <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
      <Backdrop palette={palette} />

      <Rect x={88} y={40} width={120} height={172} rx={18} fill={card} stroke={hairline} strokeWidth={2} />
      <Rect x={102} y={56} width={58} height={9} rx={4.5} fill={soft} />

      <Circle cx={116} cy={92} r={9} fill={accent} />
      <CheckMark cx={116} cy={92.5} scale={0.55} color={white} />
      <Rect x={134} y={87} width={58} height={8} rx={4} fill={mid} />

      <Circle cx={116} cy={124} r={9} fill={accent} />
      <CheckMark cx={116} cy={124.5} scale={0.55} color={white} />
      <Rect x={134} y={119} width={44} height={8} rx={4} fill={mid} />

      <Circle cx={116} cy={156} r={8} stroke={mid} strokeWidth={2.5} fill={card} />
      <Rect x={134} y={151} width={52} height={8} rx={4} fill={soft} />

      <Rect x={102} y={182} width={92} height={8} rx={4} fill={soft} />
      <Rect x={102} y={182} width={62} height={8} rx={4} fill={accent} />

      <Circle cx={224} cy={54} r={15} fill={accent} />
      <CheckMark cx={224} cy={55} scale={0.8} color={white} />
      <Circle cx={70} cy={80} r={4} fill={mid} opacity={0.6} />
      <Circle cx={244} cy={100} r={4} fill={accent} />

      <Figure x={248} baseline={218} shirt={mid} ink={ink} armTo={{ x: 216, y: 152 }} />
    </Svg>
  );
}
