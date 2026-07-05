import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import Background from "@/components/Background";
import Milestone from "@/components/Milestone";
import RoadPath from "@/components/Path";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useInfiniteRoadmap } from "@/hooks/useInfiniteRoadmap";
import { CURRENT_INDEX } from "@/data/habitTips";
import { CONTENT_HEIGHT, FIRST_NODE_X, NODE_SPACING, nodeCenter, nodeX, visibleRange } from "@/lib/layout";
import type { Point } from "@/types";

export default function Roadmap() {
  const reducedMotion = Boolean(useReducedMotion());

  // Start at width 0 so "has the viewport been measured yet?" is unambiguous —
  // this prevents the initial centering from using a placeholder width.
  const [viewport, setViewport] = useState({ width: 0, height: CONTENT_HEIGHT });
  const [focusedIndex, setFocusedIndex] = useState<number>(CURRENT_INDEX);
  const didInit = useRef(false);
  // True only while the user is navigating by keyboard, so scrolling never
  // steals DOM focus (see Milestone's focus guard).
  const keyboardNavRef = useRef(false);

  const { milestones, contentWidth, ensureIndexLoaded } = useInfiniteRoadmap({
    initialCount: 100,
    threshold: 14,
    batchSize: 40
  });

  const { scrollX, containerRef, isDragging, scrollToIndex, handlers } = useDragScroll({
    contentWidth,
    viewportWidth: viewport.width || 1,
    snapStep: NODE_SPACING,
    snapOffset: FIRST_NODE_X - (viewport.width || 1) / 2,
    onActiveIndexChange: (index) => {
      // Keep the roving-tabindex target on the settled/centered node so a
      // keyboard user never loses their place when nodes virtualize out.
      setFocusedIndex(index);
      ensureIndexLoaded(index + 6);
    }
  });

  // Measure the viewport before paint so the very first centering uses the
  // real width, not the width:0 placeholder.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight || CONTENT_HEIGHT });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  // Open the journey centered on the current milestone — only once a real
  // width has been measured.
  useEffect(() => {
    if (didInit.current || viewport.width <= 0) return;
    didInit.current = true;
    scrollToIndex(CURRENT_INDEX);
  }, [viewport.width, scrollToIndex]);

  const viewportWidth = viewport.width || 1;
  const { start, end } = visibleRange(scrollX, viewportWidth, 3);

  useEffect(() => {
    ensureIndexLoaded(end);
  }, [end, ensureIndexLoaded]);

  const visibleMilestones = useMemo(() => {
    const items = [];
    for (let i = start; i <= end && i < milestones.length; i += 1) items.push(milestones[i]);
    return items;
  }, [start, end, milestones]);

  // Render the visible window relative to a LOCAL origin so the translated
  // layer + SVG stay small (a few node-spacings), instead of growing to the
  // full — potentially hundreds of thousands of px — content width.
  const originIndex = Math.max(0, start - 1);
  const originX = nodeX(originIndex);
  const windowWidth = nodeX(end + 2) - originX;

  const points = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    for (let i = originIndex; i <= end + 1; i += 1) {
      const c = nodeCenter(i);
      pts.push({ x: c.x - originX, y: c.y });
    }
    return pts;
  }, [originIndex, end, originX]);

  const handleSelect = useCallback(
    (index: number) => {
      keyboardNavRef.current = false;
      setFocusedIndex(index);
      scrollToIndex(index);
    },
    [scrollToIndex]
  );

  function moveFocus(delta: number | "home") {
    keyboardNavRef.current = true;
    const next = delta === "home" ? 0 : Math.max(0, focusedIndex + delta);
    setFocusedIndex(next);
    ensureIndexLoaded(next + 6);
    scrollToIndex(next);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus("home");
    } else {
      handlers.onKeyDown(event);
    }
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-[2rem] border border-black/5 bg-white/40 shadow-soft dark:border-white/10 dark:bg-slate-900/40"
      style={{ height: CONTENT_HEIGHT }}
    >
      <Background scrollX={scrollX} width={viewportWidth} height={CONTENT_HEIGHT} reducedMotion={reducedMotion} />

      <div
        ref={containerRef}
        data-roadmap="true"
        role="group"
        aria-roledescription="Habit roadmap"
        aria-label="Habit journey roadmap. Use Left and Right arrow keys to move between milestones, and Home to return to the start."
        tabIndex={0}
        onPointerDown={(event) => {
          keyboardNavRef.current = false;
          handlers.onPointerDown(event);
        }}
        onWheel={(event) => {
          keyboardNavRef.current = false;
          handlers.onWheel(event);
        }}
        onKeyDown={onKeyDown}
        className="roadmap-surface no-scrollbar absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <div
          className="absolute left-0 top-0 h-full will-change-transform"
          style={{ width: windowWidth, transform: `translate3d(${-(scrollX - originX)}px, 0, 0)` }}
        >
          <RoadPath points={points} width={windowWidth} height={CONTENT_HEIGHT} reducedMotion={reducedMotion} />
          {visibleMilestones.map((milestone) => {
            const c = nodeCenter(milestone.index);
            return (
              <Milestone
                key={milestone.id}
                milestone={milestone}
                center={{ x: c.x - originX, y: c.y }}
                focused={focusedIndex === milestone.index}
                keyboardActive={keyboardNavRef.current}
                reducedMotion={reducedMotion}
                onSelect={handleSelect}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
