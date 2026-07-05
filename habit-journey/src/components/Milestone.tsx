import { memo, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { HabitIcon } from "@/components/icons";
import { BASE_Y, NODE_SIZE } from "@/lib/layout";
import type { MilestoneProps } from "@/types";

/** Fixed positions for the one-shot completion sparkle burst (unit offsets). */
const SPARKLES: ReadonlyArray<{ x: number; y: number; d: number }> = [
  { x: -30, y: -26, d: 0 },
  { x: 30, y: -22, d: 0.08 },
  { x: 26, y: 26, d: 0.16 },
  { x: -28, y: 24, d: 0.12 },
  { x: 0, y: -36, d: 0.04 }
];

// Which completed nodes have already played their sparkle burst. Lives outside
// the component so a node that virtualizes out and back in does NOT re-sparkle.
const sparkled = new Set<number>();

function MilestoneComponent(props: MilestoneProps) {
  const { milestone, center, focused, keyboardActive, reducedMotion, onSelect } = props;
  const { index, title, description, icon, completed, current, locked, streak } = milestone;

  const buttonRef = useRef<HTMLButtonElement>(null);

  // Move DOM focus to this node only when it is the focus target AND the user
  // is actually navigating by keyboard — so plain scrolling (which keeps the
  // roving-tabindex target on the centered node) never steals focus.
  useEffect(() => {
    if (focused && keyboardActive) buttonRef.current?.focus();
  }, [focused, keyboardActive]);

  // Play the completion sparkle at most once per node, the first time it is
  // revealed while completed.
  const playSparkle = completed && !reducedMotion && !sparkled.has(index);
  useEffect(() => {
    if (completed) sparkled.add(index);
  }, [completed, index]);

  // Cards sit clear of the winding path: below the bubble when the node is
  // above the baseline, above the bubble when it dips below.
  const aboveBaseline = center.y < BASE_Y;

  // Stagger the bob so neighbours don't move in lockstep.
  const bobDelay = useMemo(() => (index % 6) * 0.28, [index]);

  const label = useMemo(() => {
    const state = locked ? "Locked" : current ? "Current" : "Completed";
    return `Milestone ${index + 1}: ${title}. ${description}. ${state}.`;
  }, [index, title, description, locked, current]);

  const bubbleTone = locked
    ? "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-black/5 dark:border-white/10"
    : current
      ? "bg-white text-brand-500 dark:bg-slate-900 dark:text-brand-400 border-black/5 dark:border-white/10"
      : "bg-brand-500 text-white border-brand-600/40";

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-current={current ? "step" : undefined}
      tabIndex={focused ? 0 : -1}
      onClick={() => onSelect(index)}
      initial={false}
      animate={reducedMotion || locked ? { y: 0 } : { y: [0, -6, 0] }}
      transition={
        reducedMotion || locked
          ? { duration: 0 }
          : { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: bobDelay }
      }
      whileHover={reducedMotion ? undefined : { scale: 1.05 }}
      whileTap={reducedMotion ? undefined : { scale: 0.97 }}
      className="group absolute flex flex-col items-center outline-none"
      style={{
        left: center.x,
        top: center.y,
        transform: "translate(-50%, -50%)"
      }}
    >
      {/* Text card ABOVE the bubble when the node dips below the baseline. */}
      {!aboveBaseline && (
        <TextCard
          title={title}
          description={description}
          current={current}
          placement="above"
        />
      )}

      {/* Icon bubble — centered exactly on `center`. */}
      <span
        className={["relative flex items-center justify-center", locked ? "opacity-60" : ""].join(" ")}
        style={{ width: NODE_SIZE, height: NODE_SIZE }}
      >
        {/* Pulsing glow ring for the current node. */}
        {current && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand-400/70"
            initial={false}
            animate={
              reducedMotion
                ? { scale: 1, opacity: 0.55 }
                : { scale: [1, 1.28, 1], opacity: [0.55, 0, 0.55] }
            }
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 2.2, repeat: Infinity, ease: "easeOut" }
            }
          />
        )}

        {/* Bubble surface. */}
        <span
          className={[
            "flex h-full w-full items-center justify-center rounded-full border shadow-soft transition-shadow",
            "group-focus-visible:ring-2 group-focus-visible:ring-brand-400 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-white dark:group-focus-visible:ring-offset-slate-900",
            bubbleTone,
            current ? "shadow-glow ring-2 ring-brand-400/60" : ""
          ].join(" ")}
        >
          <HabitIcon name={icon} className="h-8 w-8" />
        </span>

        {/* Completed check badge. */}
        {completed && !current && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-soft dark:border-slate-950"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          </span>
        )}

        {/* Locked affordance. */}
        {locked && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-400 text-white shadow-soft dark:border-slate-950 dark:bg-slate-600"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="6" y="10.5" width="12" height="9" rx="2" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
            </svg>
          </span>
        )}

        {/* Streak pill, top-right of the bubble. */}
        {streak > 0 && !locked && (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full border border-amber-300/60 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 shadow-soft dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-300"
          >
            <HabitIcon name="flame" className="h-3 w-3" />
            {streak}
          </span>
        )}

        {/* One-shot sparkle burst the first time a completed node is revealed. */}
        {playSparkle && (
          <AnimatePresence>
            {SPARKLES.map((s, i) => (
              <motion.span
                key={i}
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-brand-300"
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{ x: s.x, y: s.y, scale: [0, 1.1, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 0.9, delay: s.d, ease: "easeOut" }}
              />
            ))}
          </AnimatePresence>
        )}
      </span>

      {/* Text card BELOW the bubble when the node sits above the baseline. */}
      {aboveBaseline && (
        <TextCard
          title={title}
          description={description}
          current={current}
          placement="below"
        />
      )}
    </motion.button>
  );
}

interface TextCardProps {
  title: string;
  description: string;
  current: boolean;
  placement: "above" | "below";
}

function TextCard({ title, description, current, placement }: TextCardProps) {
  return (
    <span
      className={[
        "block w-44 max-w-[11rem] rounded-2xl border bg-white px-3 py-2 text-center shadow-soft dark:bg-slate-900",
        placement === "above" ? "mb-3" : "mt-3",
        current
          ? "border-brand-400/60 dark:border-brand-400/40"
          : "border-black/5 dark:border-white/10"
      ].join(" ")}
    >
      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </span>
      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
        {description}
      </span>
    </span>
  );
}

/**
 * Roadmap re-renders every scroll frame (scrollX drives the container transform),
 * but a node only needs to re-render when its own inputs change. `center` is a
 * fresh object each render, so compare it numerically here — this lets the ~15-20
 * visible nodes skip reconciliation on every non-boundary frame.
 */
function areEqual(prev: MilestoneProps, next: MilestoneProps): boolean {
  return (
    prev.milestone === next.milestone &&
    prev.center.x === next.center.x &&
    prev.center.y === next.center.y &&
    prev.focused === next.focused &&
    prev.keyboardActive === next.keyboardActive &&
    prev.reducedMotion === next.reducedMotion &&
    prev.onSelect === next.onSelect
  );
}

const Milestone = memo(MilestoneComponent, areEqual);
export default Milestone;
