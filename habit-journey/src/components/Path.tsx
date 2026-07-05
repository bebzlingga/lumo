import { useId, useMemo } from "react";
import { motion } from "framer-motion";

import type { PathProps, Point } from "@/types";

/**
 * Build a smooth cubic-bezier "d" string that flows through every point using
 * Catmull-Rom → Bézier conversion. Each segment's control points are derived
 * from the surrounding neighbours, so the curve passes exactly through the
 * nodes while easing gently between them (no hard corners, no straight `L`s).
 */
function buildSmoothPath(points: Point[], tension = 0.5): string {
  if (points.length < 2) return "";

  const first = points[0];
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    // Clamp neighbour indices so endpoints reuse their nearest point.
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    // Catmull-Rom → cubic Bézier control points.
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;

    d +=
      ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}` +
      ` ${c2x.toFixed(2)} ${c2y.toFixed(2)}` +
      ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}

export default function Path(props: PathProps) {
  const { points, width, height, reducedMotion } = props;

  // Unique, collision-free ids for this instance's gradients/filters.
  const rawId = useId();
  const uid = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, ""), [rawId]);
  const strokeGradId = `path-stroke-${uid}`;
  const haloGradId = `path-halo-${uid}`;

  const d = useMemo(() => buildSmoothPath(points), [points]);

  // Nothing meaningful to connect: render a single soft dot for one point,
  // or nothing at all when the roadmap is empty.
  if (points.length < 2) {
    if (points.length === 1) {
      const only = points[0];
      return (
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          aria-hidden="true"
        >
          <circle cx={only.x} cy={only.y} r={7} className="fill-brand-400/60" />
        </svg>
      );
    }
    return null;
  }

  return (
    <motion.svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      initial={false}
      animate={reducedMotion ? { y: 0 } : { y: [0, -5, 0] }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: 6, repeat: Infinity, ease: "easeInOut" }
      }
    >
      <defs>
        {/* Horizontal accent gradient for the main trail stroke. */}
        <linearGradient id={strokeGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#79e3a3" />
          <stop offset="55%" stopColor="#42cd7d" />
          <stop offset="100%" stopColor="#1eb862" />
        </linearGradient>
        {/* Softer, wider halo gradient sitting beneath the trail. */}
        <linearGradient id={haloGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#79e3a3" />
          <stop offset="100%" stopColor="#1eb862" />
        </linearGradient>
      </defs>

      {/* Layer 1a: low-opacity halo underneath for a soft glow. */}
      <path
        d={d}
        stroke={`url(#${haloGradId})`}
        strokeWidth={22}
        strokeOpacity={0.18}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Layer 1b: thick base trail stroke. */}
      <path
        d={d}
        stroke={`url(#${strokeGradId})`}
        strokeWidth={14}
        strokeOpacity={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Layer 2: thin dotted accent riding on top to read as footsteps. */}
      <path
        d={d}
        stroke="#ffffff"
        strokeWidth={3.5}
        strokeOpacity={0.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 16"
        fill="none"
        className="dark:stroke-slate-100/80"
      />
    </motion.svg>
  );
}
