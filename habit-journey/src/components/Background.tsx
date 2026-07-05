import { useMemo } from "react";
import { motion } from "framer-motion";
import type { BackgroundProps } from "@/types";

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random helpers so decoration is stable across  */
/* renders (no layout thrash) and never reveals an empty parallax edge.*/
/* ------------------------------------------------------------------ */

/** Cheap deterministic hash → [0, 1). Stable for a given seed. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A parallax layer scrolls at `factor` × the roadmap. To feel endless with a
 * finite amount of SVG, every layer is built from a single repeating TILE that
 * is rendered enough times to cover the viewport, then shifted by the negative
 * parallax offset taken modulo the tile width. The seam therefore never shows.
 */
const TILE = 1600;

interface ParallaxLayerProps {
  factor: number;
  width: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps repeating tile content and translates it by the parallax amount. The
 * content is expected to be authored for a single [0, TILE] tile; we render
 * `copies` of it (offset by TILE each) and wrap the whole strip modulo TILE so
 * arbitrarily large scrollX stays covered with a constant number of nodes.
 */
function ParallaxLayer({ factor, width, className, children }: ParallaxLayerProps) {
  // How many tiles are needed to span the viewport, plus a spare on each side
  // to absorb the modulo shift without exposing an edge.
  const copies = Math.ceil(width / TILE) + 2;
  const offsets = Array.from({ length: copies }, (_, i) => (i - 1) * TILE);
  return (
    <div className={className} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }} data-parallax-factor={factor}>
        {offsets.map((ox) => (
          <div key={ox} style={{ position: "absolute", top: 0, bottom: 0, left: ox, width: TILE }}>
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Static tile artwork (authored once, reused every tile).             */
/* ------------------------------------------------------------------ */

function MountainsTile({ height }: { height: number }) {
  return (
    <svg
      width={TILE}
      height={height}
      viewBox={`0 0 ${TILE} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bg-mtn-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:theme(colors.slate.300)] dark:[stop-color:theme(colors.slate.800)]" />
          <stop offset="100%" className="[stop-color:theme(colors.slate.200)] dark:[stop-color:theme(colors.slate.900)]" />
        </linearGradient>
        <linearGradient id="bg-mtn-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:theme(colors.brand.300)] dark:[stop-color:theme(colors.brand.800)]" />
          <stop offset="100%" className="[stop-color:theme(colors.brand.200)] dark:[stop-color:theme(colors.brand.900)]" />
        </linearGradient>
      </defs>
      {/* Far, muted range — rounded peaks. */}
      <path
        d={`M0 ${height} L0 ${height * 0.62}
            Q ${TILE * 0.12} ${height * 0.36} ${TILE * 0.24} ${height * 0.58}
            Q ${TILE * 0.36} ${height * 0.34} ${TILE * 0.5} ${height * 0.55}
            Q ${TILE * 0.64} ${height * 0.32} ${TILE * 0.78} ${height * 0.56}
            Q ${TILE * 0.9} ${height * 0.38} ${TILE} ${height * 0.6}
            L ${TILE} ${height} Z`}
        fill="url(#bg-mtn-far)"
        opacity={0.55}
      />
      {/* Nearer green range — slightly taller, sits in front. */}
      <path
        d={`M0 ${height} L0 ${height * 0.74}
            Q ${TILE * 0.16} ${height * 0.46} ${TILE * 0.32} ${height * 0.7}
            Q ${TILE * 0.46} ${height * 0.44} ${TILE * 0.62} ${height * 0.68}
            Q ${TILE * 0.8} ${height * 0.46} ${TILE} ${height * 0.72}
            L ${TILE} ${height} Z`}
        fill="url(#bg-mtn-near)"
        opacity={0.5}
      />
    </svg>
  );
}

function HillsTile({ height }: { height: number }) {
  return (
    <svg
      width={TILE}
      height={height}
      viewBox={`0 0 ${TILE} ${height}`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <path
        d={`M0 ${height} L0 ${height * 0.86}
            Q ${TILE * 0.25} ${height * 0.66} ${TILE * 0.5} ${height * 0.84}
            Q ${TILE * 0.75} ${height} ${TILE} ${height * 0.82}
            L ${TILE} ${height} Z`}
        className="fill-brand-400/40 dark:fill-brand-700/40"
      />
      <path
        d={`M0 ${height} L0 ${height * 0.93}
            Q ${TILE * 0.3} ${height * 0.8} ${TILE * 0.58} ${height * 0.92}
            Q ${TILE * 0.82} ${height} ${TILE} ${height * 0.9}
            L ${TILE} ${height} Z`}
        className="fill-brand-500/35 dark:fill-brand-800/45"
      />
    </svg>
  );
}

/** A soft cloud = a cluster of overlapping circles. */
function Cloud({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="fill-white/70 dark:fill-slate-100/10">
      <circle cx={0} cy={0} r={26} />
      <circle cx={30} cy={-8} r={34} />
      <circle cx={66} cy={2} r={28} />
      <circle cx={34} cy={16} r={30} />
      <circle cx={-4} cy={14} r={22} />
    </g>
  );
}

function CloudsTile({ height }: { height: number }) {
  // A few clouds per tile, deterministically placed within the tile band.
  const clouds = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        x: rand(i * 3 + 1) * (TILE - 200) + 60,
        y: 60 + rand(i * 5 + 2) * (height * 0.28),
        scale: 0.7 + rand(i * 7 + 3) * 0.7,
      })),
    [height]
  );
  return (
    <svg width={TILE} height={height} viewBox={`0 0 ${TILE} ${height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      {clouds.map((c, i) => (
        <Cloud key={i} x={c.x} y={c.y} scale={c.scale} />
      ))}
    </svg>
  );
}

interface Dot {
  x: number;
  y: number;
  r: number;
  delay: number;
  dur: number;
}

function StarsTile({ height, reducedMotion }: { height: number; reducedMotion: boolean }) {
  const dots = useMemo<Dot[]>(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: rand(i * 2 + 11) * TILE,
        y: rand(i * 4 + 13) * (height * 0.72),
        r: 1 + rand(i * 6 + 17) * 1.8,
        delay: rand(i * 8 + 19) * 4,
        dur: 2.4 + rand(i * 9 + 23) * 2.6,
      })),
    [height]
  );
  return (
    <svg width={TILE} height={height} viewBox={`0 0 ${TILE} ${height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      {dots.map((d, i) =>
        reducedMotion ? (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} className="fill-slate-400/30 dark:fill-white/60" />
        ) : (
          <motion.circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            className="fill-slate-400/40 dark:fill-white/70"
            initial={{ opacity: 0.25 }}
            animate={{ opacity: [0.2, 0.85, 0.2] }}
            transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: "easeInOut" }}
          />
        )
      )}
    </svg>
  );
}

interface Floater {
  x: number;
  y: number;
  r: number;
  drift: number;
  delay: number;
  dur: number;
  kind: 0 | 1;
}

/** Drifting sparkles / leaves in the foreground haze. */
function FloatersTile({ height, reducedMotion }: { height: number; reducedMotion: boolean }) {
  const floaters = useMemo<Floater[]>(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        x: rand(i * 3 + 31) * TILE,
        y: 40 + rand(i * 5 + 37) * (height * 0.6),
        r: 4 + rand(i * 7 + 41) * 5,
        drift: 10 + rand(i * 9 + 43) * 16,
        delay: rand(i * 11 + 47) * 3,
        dur: 6 + rand(i * 13 + 53) * 5,
        kind: (i % 2) as 0 | 1,
      })),
    [height]
  );
  return (
    <svg width={TILE} height={height} viewBox={`0 0 ${TILE} ${height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      {floaters.map((f, i) => {
        const shape =
          f.kind === 0 ? (
            // Four-point sparkle.
            <path
              d={`M0 ${-f.r} Q ${f.r * 0.28} ${-f.r * 0.28} ${f.r} 0 Q ${f.r * 0.28} ${f.r * 0.28} 0 ${f.r} Q ${-f.r * 0.28} ${f.r * 0.28} ${-f.r} 0 Q ${-f.r * 0.28} ${-f.r * 0.28} 0 ${-f.r} Z`}
              className="fill-brand-400/60 dark:fill-brand-300/50"
            />
          ) : (
            // Simple leaf.
            <path
              d={`M0 ${-f.r} Q ${f.r} 0 0 ${f.r} Q ${-f.r} 0 0 ${-f.r} Z`}
              className="fill-brand-500/50 dark:fill-brand-400/40"
            />
          );
        if (reducedMotion) {
          return (
            <g key={i} transform={`translate(${f.x} ${f.y})`}>
              {shape}
            </g>
          );
        }
        return (
          <motion.g
            key={i}
            initial={{ x: f.x, y: f.y, opacity: 0.3, rotate: 0 }}
            animate={{ y: [f.y, f.y + f.drift, f.y], opacity: [0.25, 0.7, 0.25], rotate: [0, f.kind === 1 ? 12 : 0, 0] }}
            transition={{ duration: f.dur, delay: f.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            {shape}
          </motion.g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Composed background.                                                 */
/* ------------------------------------------------------------------ */

export default function Background({ scrollX, width, height, reducedMotion }: BackgroundProps) {
  // Parallax offset per layer, wrapped modulo TILE so the finite tile strip
  // covers any scrollX. The extra leading tile in ParallaxLayer absorbs this.
  const shift = (factor: number): number => -(((scrollX * factor) % TILE + TILE) % TILE);

  const mountainH = height * 0.7;
  const hillsH = height * 0.55;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" style={{ width, height }}>
      {/* Base sky gradient — NOT parallaxed. */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50 to-white dark:from-slate-950 dark:to-slate-900" />

      {/* Distant mountains — slowest. */}
      <ParallaxLayer factor={0.12} width={width} className="opacity-90">
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: mountainH, transform: `translate3d(${shift(0.12)}px, 0, 0)`, willChange: "transform" }}>
          <MountainsTile height={mountainH} />
        </div>
      </ParallaxLayer>

      {/* Rolling hills. */}
      <ParallaxLayer factor={0.22} width={width}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: hillsH, transform: `translate3d(${shift(0.22)}px, 0, 0)`, willChange: "transform" }}>
          <HillsTile height={hillsH} />
        </div>
      </ParallaxLayer>

      {/* Clouds. */}
      <ParallaxLayer factor={0.4} width={width}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height, transform: `translate3d(${shift(0.4)}px, 0, 0)`, willChange: "transform" }}>
          <CloudsTile height={height} />
        </div>
      </ParallaxLayer>

      {/* Twinkling stars / dots — fastest. */}
      <ParallaxLayer factor={0.6} width={width}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height, transform: `translate3d(${shift(0.6)}px, 0, 0)`, willChange: "transform" }}>
          <StarsTile height={height} reducedMotion={reducedMotion} />
        </div>
      </ParallaxLayer>

      {/* Drifting sparkles / leaves. */}
      <ParallaxLayer factor={0.5} width={width}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height, transform: `translate3d(${shift(0.5)}px, 0, 0)`, willChange: "transform" }}>
          <FloatersTile height={height} reducedMotion={reducedMotion} />
        </div>
      </ParallaxLayer>

      {/* Gentle top-down vignette to sink decoration behind the roadmap. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/40 dark:to-slate-950/40" />
    </div>
  );
}
