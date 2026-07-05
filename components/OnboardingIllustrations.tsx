import React from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from "react-native-svg";
import { type LumoPalette } from "@/constants/theme";

type IllustrationName = "habits" | "progress" | "challenge" | "nickname";

// Colorful base layer rendered behind every illustration: soft color clouds for
// fullness plus a few bold accent specks. It sits under the line art, so any
// speck overlapping a subject is simply hidden — only the empty areas get color.
function IllustrationBackdrop({ palette }: { palette: LumoPalette }) {
  return (
    <G>
      {/* Soft color clouds for a full, flat base (Storyset-style). */}
      <Circle cx={158} cy={114} r={116} fill={palette.greenSoft} opacity={0.42} />
      <Circle cx={216} cy={60} r={66} fill={palette.glowSoft} opacity={0.72} />
      <Circle cx={78} cy={178} r={54} fill={palette.glowSoft} opacity={0.55} />
      {/* Grounding floor shadow under the subject. */}
      <Ellipse cx={160} cy={226} rx={124} ry={15} fill={palette.greenDark} opacity={0.08} />

      {/* Geometric accents tucked into the corners, drawn behind the subject
          so any that overlap are hidden — only empty space gets decorated. */}
      <G strokeLinecap="round" fill="none">
        <Path d="M28 32v14M21 39h14" stroke={palette.glow} strokeWidth={3} />
        <Circle cx={292} cy={44} r={8} stroke={palette.green} strokeWidth={3} />
        <Circle cx={30} cy={206} r={7} stroke={palette.accent} strokeWidth={3} />
        <Path d="M292 196v14M285 203h14" stroke={palette.green} strokeWidth={3} />
      </G>

      {/* Flat accent dots. */}
      <Circle cx={302} cy={150} r={4} fill={palette.green} />
      <Circle cx={18} cy={120} r={4} fill={palette.glow} />
      <Circle cx={150} cy={20} r={4} fill={palette.accent} />
      <Circle cx={250} cy={214} r={4} fill={palette.glow} />
    </G>
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
  const line = palette.greenDark;
  const yellow = palette.glow;
  const yellowSoft = palette.glowSoft;
  const green = palette.green;
  const greenSoft = palette.greenSoft;
  const coral = palette.danger;
  const card = palette.card;

  if (name === "progress") {
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <IllustrationBackdrop palette={palette} />
        <G stroke={line} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3}>
          <Circle cx={80} cy={98} r={34} fill={yellow} />
          <Line x1={80} y1={43} x2={80} y2={28} />
          <Line x1={80} y1={168} x2={80} y2={199} />
          <Line x1={25} y1={98} x2={11} y2={98} />
          <Line x1={149} y1={98} x2={163} y2={98} />
          <Line x1={41} y1={58} x2={30} y2={47} />
          <Line x1={119} y1={58} x2={130} y2={47} />
          <Line x1={41} y1={138} x2={30} y2={149} />
          <Line x1={119} y1={138} x2={130} y2={149} />
          <Path d="M64 96c8 9 22 9 32 0" />
          <Circle cx={68} cy={88} r={3} fill={line} stroke="none" />
          <Circle cx={93} cy={88} r={3} fill={line} stroke="none" />

          <Path d="M134 153c22-29 52-44 86-43 31 1 55 17 72 41" stroke={green} strokeWidth={8} />
          <Path d="M139 155c20-20 46-31 78-30 28 1 50 11 67 29" stroke={yellow} strokeWidth={8} />
          <Ellipse cx={182} cy={151} rx={42} ry={31} fill={card} />
          <Circle cx={171} cy={145} r={3} fill={line} stroke="none" />
          <Circle cx={192} cy={145} r={3} fill={line} stroke="none" />
          <Path d="M170 159c7 6 18 6 25 0" />
          <Line x1={151} y1={158} x2={141} y2={164} />
          <Line x1={213} y1={158} x2={224} y2={164} />

          <Path d="M219 81c-4-24 11-43 34-40 21 3 34 27 28 52-5 24-25 43-41 41-13-2-18-25-21-53Z" fill={coral} />
          <Path d="M237 76c8 9 19 10 30 2" />
          <Circle cx={240} cy={92} r={3} fill={line} stroke="none" />
          <Circle cx={262} cy={91} r={3} fill={line} stroke="none" />

          <Path d="M258 172c17-18 44-17 53 1 8 17-6 39-28 43-23 4-41-14-25-44Z" fill={greenSoft} />
          <Circle cx={281} cy={180} r={3} fill={line} stroke="none" />
          <Circle cx={298} cy={180} r={3} fill={line} stroke="none" />
          <Path d="M284 195c5 4 12 4 17 0" />
          {/* blush cheeks */}
          <Ellipse cx={63} cy={99} rx={4.5} ry={3} fill={coral} stroke="none" opacity={0.45} />
          <Ellipse cx={98} cy={99} rx={4.5} ry={3} fill={coral} stroke="none" opacity={0.45} />
          <Ellipse cx={164} cy={154} rx={4} ry={2.6} fill={coral} stroke="none" opacity={0.5} />
          <Ellipse cx={200} cy={154} rx={4} ry={2.6} fill={coral} stroke="none" opacity={0.5} />
        </G>
      </Svg>
    );
  }

  if (name === "challenge") {
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <IllustrationBackdrop palette={palette} />
        <G stroke={line} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3}>
          <Path d="M58 191h204" />
          <Path d="M79 183 159 96l79 87Z" fill={coral} opacity={0.86} stroke="none" />
          <Path d="M110 180h100l-12-55h-76Z" fill={card} />
          <Path d="M144 148l14-7 14 7-3 16 12 11-16 2-7 14-7-14-16-2 12-11Z" fill={greenSoft} />

          <Path d="M103 75c17-27 96-27 114 0l-12 57c-6 30-83 31-90 0Z" fill={yellowSoft} />
          <Path d="M107 81c-27 9-27 42 5 47" />
          <Path d="M213 81c27 9 27 42-5 47" />
          <Path d="M133 118c16 20 39 20 55 0" />
          <Path d="M135 91c6-8 17-8 23 0" />
          <Path d="M167 91c6-8 17-8 23 0" />
          <Line x1={145} y1={122} x2={145} y2={134} />
          <Line x1={160} y1={125} x2={160} y2={139} />
          <Line x1={176} y1={122} x2={176} y2={134} />
          <Path d="M136 59c10-15 34-15 45 0" />
          <Path d="M160 42l6 9 10 2-8 7 2 11-10-5-10 5 2-11-8-7 10-2Z" fill={card} />
          <Path d="M102 51 91 36" stroke={coral} />
          <Path d="M121 39 116 21" stroke={coral} />
          <Path d="M203 39l5-18" stroke={coral} />
          {/* blush cheeks */}
          <Ellipse cx={124} cy={116} rx={4.5} ry={2.8} fill={coral} stroke="none" opacity={0.45} />
          <Ellipse cx={197} cy={116} rx={4.5} ry={2.8} fill={coral} stroke="none" opacity={0.45} />
        </G>
      </Svg>
    );
  }

  if (name === "nickname") {
    return (
      <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
        <IllustrationBackdrop palette={palette} />
        <G stroke={line} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3}>
          <Path d="M98 175c23-39 71-58 121-35" stroke={yellowSoft} strokeWidth={28} />
          <Circle cx={137} cy={104} r={38} fill={yellow} />
          <Ellipse cx={135} cy={151} rx={30} ry={38} fill={yellowSoft} />
          <Ellipse cx={209} cy={121} rx={48} ry={25} fill={greenSoft} transform="rotate(-25 209 121)" />
          <Ellipse cx={205} cy={151} rx={34} ry={15} fill={green} transform="rotate(15 205 151)" />
          <Path d="M126 63c-8-20-21-26-31-14" />
          <Path d="M151 63c7-19 20-25 31-14" />
          <Circle cx={127} cy={97} r={3} fill={line} stroke="none" />
          <Circle cx={148} cy={97} r={3} fill={line} stroke="none" />
          <Path d="M126 115c8 6 19 6 27 0" />
          <Path d="M74 198c58 19 142 19 200-1" />
          {/* bee body stripes */}
          <Path d="M113 146q22 9 44 0" strokeWidth={5} />
          <Path d="M111 166q24 9 48 0" strokeWidth={5} />
          {/* blush cheeks */}
          <Ellipse cx={118} cy={110} rx={5} ry={3.2} fill={coral} stroke="none" opacity={0.5} />
          <Ellipse cx={157} cy={110} rx={5} ry={3.2} fill={coral} stroke="none" opacity={0.5} />
        </G>
      </Svg>
    );
  }

  return (
    <Svg width={width} height={height} viewBox="0 0 320 250" fill="none">
      <IllustrationBackdrop palette={palette} />
      <G stroke={line} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3}>
        <Path d="M57 71h143l39 125H94Z" fill={card} />
        <Path d="M44 97h27l40 116h153l-25-17" fill={greenSoft} />
        <Path d="M91 91h84" />
        <Path d="M98 118h43" />
        <Path d="M103 147h60" />
        <Rect x={83} y={109} width={24} height={24} fill={greenSoft} rx={2} />
        <Rect x={92} y={144} width={24} height={24} fill={card} rx={2} />
        <Rect x={77} y={74} width={100} height={18} fill={card} rx={2} />
        <Path d="m88 119 7 7 15-24" stroke={green} strokeWidth={4} />
        <Path d="m98 153 7 7 16-23" stroke={green} strokeWidth={4} />
        <Path d="M92 214h150l24-15" />

        <Circle cx={222} cy={110} r={25} fill={yellowSoft} />
        <Ellipse cx={247} cy={112} rx={26} ry={14} fill={greenSoft} transform="rotate(-29 247 112)" />
        <Path d="M206 91c-5-14-14-17-21-9" />
        <Path d="M224 88c5-13 14-16 22-8" />
        <Circle cx={213} cy={106} r={3} fill={line} stroke="none" />
        <Circle cx={230} cy={106} r={3} fill={line} stroke="none" />
        <Path d="M213 121c7 5 16 5 23-1" />
        <Path d="M212 139c-10 21-36 24-51 7" />
        <Path d="M236 136c7 23 23 31 44 23" />
        <Line x1={178} y1={152} x2={164} y2={170} />
        <Line x1={260} y1={163} x2={270} y2={183} />
        <Line x1={266} y1={161} x2={287} y2={168} />
        <Polygon points="198,188 268,189 248,204 205,202" fill={coral} />
        {/* blush cheeks */}
        <Ellipse cx={207} cy={116} rx={4} ry={2.6} fill={coral} stroke="none" opacity={0.5} />
        <Ellipse cx={237} cy={116} rx={4} ry={2.6} fill={coral} stroke="none" opacity={0.5} />
      </G>
    </Svg>
  );
}
