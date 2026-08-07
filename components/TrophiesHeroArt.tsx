import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

const VB_W = 200;
const VB_H = 150;
const GOLD = "#FFE7A6";
const WHITE = "#FFFFFF";
const RAY_DIM = 0.45; // global ray opacity multiplier — keeps the beams subtle

// Light beams fanning up from the bottom-centre (mix of cool + warm, like the
// full Trophies backdrop). Angles are degrees from straight-up.
const RAYS: { a: number; hw: number; o: number; c: string }[] = [
  { a: -52, hw: 2.2, o: 0.1, c: "#8FB8FF" },
  { a: -30, hw: 3.0, o: 0.13, c: "#FFCF7A" },
  { a: -10, hw: 2.4, o: 0.11, c: "#FFCF7A" },
  { a: 12, hw: 3.0, o: 0.13, c: "#FFCF7A" },
  { a: 34, hw: 2.4, o: 0.11, c: "#8FB8FF" },
  { a: 54, hw: 2.2, o: 0.1, c: "#FFCF7A" }
];

const SPARKS: { x: number; y: number; r: number; o: number; c: string }[] = [
  { x: 24, y: 44, r: 1.6, o: 0.9, c: GOLD },
  { x: 48, y: 28, r: 1.0, o: 0.6, c: WHITE },
  { x: 70, y: 54, r: 1.3, o: 0.8, c: GOLD },
  { x: 96, y: 22, r: 1.1, o: 0.7, c: WHITE },
  { x: 120, y: 46, r: 1.5, o: 0.85, c: GOLD },
  { x: 150, y: 30, r: 1.0, o: 0.6, c: WHITE },
  { x: 172, y: 50, r: 1.4, o: 0.8, c: GOLD },
  { x: 36, y: 78, r: 1.1, o: 0.55, c: GOLD },
  { x: 132, y: 80, r: 1.2, o: 0.6, c: WHITE },
  { x: 88, y: 72, r: 1.0, o: 0.5, c: GOLD },
  { x: 60, y: 108, r: 1.2, o: 0.5, c: GOLD },
  { x: 150, y: 108, r: 1.1, o: 0.5, c: GOLD }
];

function rayPath(sx: number, sy: number, angleDeg: number, halfDeg: number, len: number): string {
  const toXY = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(sx + Math.sin(a) * len).toFixed(1)},${(sy - Math.cos(a) * len).toFixed(1)}`;
  };
  return `M${sx},${sy} L${toXY(angleDeg - halfDeg)} L${toXY(angleDeg + halfDeg)} Z`;
}

/**
 * The "award ceremony" scene used behind the Trophies nav tile — the boxed
 * counterpart to the full-screen TrophiesBackdrop. A deep indigo sky with light
 * beams fanning up from a glowing bottom edge and a scatter of gold sparkles.
 * Self-measures via an absolute-fill wrapper and feeds pixel dimensions to the
 * Svg so it fills a content-sized (flex) parent with no gaps.
 */
export function TrophiesHeroArt({ width, height }: { width?: number; height?: number }) {
  const [measured, setMeasured] = React.useState({ w: 0, h: 0 });
  const w = width ?? measured.w;
  const h = height ?? measured.h;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setMeasured({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}
    >
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="thSky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0A1430" />
              <Stop offset="0.55" stopColor="#0C1A3C" />
              <Stop offset="1" stopColor="#13254F" />
            </LinearGradient>
            <RadialGradient id="thGlow" cx={VB_W / 2} cy={VB_H} r={VB_W * 0.6} fx={VB_W / 2} fy={VB_H} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFD873" stopOpacity="0.3" />
              <Stop offset="0.5" stopColor="#FFC24D" stopOpacity="0.1" />
              <Stop offset="1" stopColor="#FFC24D" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id="thLine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFF3D0" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#FFF7E4" stopOpacity="0.7" />
              <Stop offset="1" stopColor="#FFF3D0" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <Rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#thSky)" />

          {RAYS.map((ray, index) => (
            <Path key={`ray-${index}`} d={rayPath(VB_W / 2, VB_H, ray.a, ray.hw, VB_H * 1.15)} fill={ray.c} opacity={ray.o * RAY_DIM} />
          ))}

          <Rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#thGlow)" />
          <Rect x="0" y={VB_H - 2} width={VB_W} height={2} fill="url(#thLine)" />

          {SPARKS.map((sp, index) => (
            <Circle key={`spark-${index}`} cx={sp.x} cy={sp.y} r={sp.r} fill={sp.c} opacity={sp.o} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
