import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragScrollOptions, DragScrollResult } from '@/types';

const FRICTION = 0.94;
const MIN_VELOCITY = 0.4;
const TWEEN_MS = 350;
const WHEEL_SNAP_MS = 140;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

export function useDragScroll(options: DragScrollOptions): DragScrollResult {
  const { contentWidth, viewportWidth, snapStep, snapOffset, onActiveIndexChange } = options;

  const [scrollX, setScrollXState] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Latest values kept in refs to avoid stale closures inside rAF/window listeners.
  const scrollXRef = useRef(0);
  const maxScrollRef = useRef(0);
  const snapStepRef = useRef(snapStep);
  const snapOffsetRef = useRef(snapOffset);
  const viewportWidthRef = useRef(viewportWidth);
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);

  // Gesture / animation bookkeeping.
  const rafRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const lastPointerXRef = useRef(0);
  const activeIndexRef = useRef(0);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the derived bounds and option refs current across renders.
  maxScrollRef.current = Math.max(0, contentWidth - viewportWidth);
  snapStepRef.current = snapStep;
  snapOffsetRef.current = snapOffset;
  viewportWidthRef.current = viewportWidth;
  onActiveIndexChangeRef.current = onActiveIndexChange;

  const nearestIndexFor = useCallback((x: number): number => {
    const step = snapStepRef.current || 1;
    const raw = Math.round((x - snapOffsetRef.current) / step);
    return Math.max(0, raw);
  }, []);

  const snapTargetFor = useCallback((index: number): number => {
    const safeIndex = Math.max(0, index);
    const target = snapOffsetRef.current + safeIndex * snapStepRef.current;
    return clamp(target, 0, maxScrollRef.current);
  }, []);

  const notifyActiveIndex = useCallback((x: number) => {
    const index = nearestIndexFor(x);
    if (index !== activeIndexRef.current) {
      activeIndexRef.current = index;
      onActiveIndexChangeRef.current?.(index);
    }
  }, [nearestIndexFor]);

  const commitScroll = useCallback((x: number) => {
    const clamped = clamp(x, 0, maxScrollRef.current);
    scrollXRef.current = clamped;
    setScrollXState(clamped);
    notifyActiveIndex(clamped);
  }, [notifyActiveIndex]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // rAF tween toward a target scroll position (ease-out).
  const tweenTo = useCallback((target: number) => {
    cancelRaf();
    const from = scrollXRef.current;
    const to = clamp(target, 0, maxScrollRef.current);
    const delta = to - from;
    if (Math.abs(delta) < 0.5) {
      commitScroll(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const t = clamp(elapsed / TWEEN_MS, 0, 1);
      const eased = easeOutCubic(t);
      commitScroll(from + delta * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [cancelRaf, commitScroll]);

  const snapToNearest = useCallback(() => {
    const index = nearestIndexFor(scrollXRef.current);
    tweenTo(snapTargetFor(index));
  }, [nearestIndexFor, snapTargetFor, tweenTo]);

  const scrollToIndex = useCallback((index: number) => {
    cancelRaf();
    velocityRef.current = 0;
    tweenTo(snapTargetFor(index));
  }, [cancelRaf, snapTargetFor, tweenTo]);

  // Momentum loop: apply decaying velocity, then snap.
  const startMomentum = useCallback(() => {
    cancelRaf();
    const step = () => {
      const velocity = velocityRef.current;
      if (Math.abs(velocity) < MIN_VELOCITY) {
        rafRef.current = null;
        snapToNearest();
        return;
      }
      const next = clamp(scrollXRef.current + velocity, 0, maxScrollRef.current);
      // Kill momentum if we hit a boundary.
      if (next === scrollXRef.current) {
        velocityRef.current = 0;
        rafRef.current = null;
        snapToNearest();
        return;
      }
      commitScroll(next);
      velocityRef.current = velocity * FRICTION;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [cancelRaf, commitScroll, snapToNearest]);

  // --- Pointer drag ---------------------------------------------------------

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    const deltaX = e.clientX - lastPointerXRef.current;
    lastPointerXRef.current = e.clientX;
    velocityRef.current = -deltaX;
    commitScroll(scrollXRef.current - deltaX);
  }, [commitScroll]);

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    pointerIdRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    startMomentum();
  }, [handlePointerMove, startMomentum]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    cancelRaf();
    velocityRef.current = 0;
    draggingRef.current = true;
    setIsDragging(true);
    pointerIdRef.current = e.pointerId;
    lastPointerXRef.current = e.clientX;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw in some environments; safe to ignore.
    }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, [cancelRaf, handlePointerMove, endDrag]);

  // --- Wheel ----------------------------------------------------------------

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    cancelRaf();
    velocityRef.current = 0;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    commitScroll(scrollXRef.current + delta);
    if (wheelTimeoutRef.current !== null) {
      clearTimeout(wheelTimeoutRef.current);
    }
    wheelTimeoutRef.current = setTimeout(() => {
      wheelTimeoutRef.current = null;
      snapToNearest();
    }, WHEEL_SNAP_MS);
  }, [cancelRaf, commitScroll, snapToNearest]);

  // --- Keyboard -------------------------------------------------------------

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = nearestIndexFor(scrollXRef.current);
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        scrollToIndex(0);
        break;
      default:
        break;
    }
  }, [nearestIndexFor, scrollToIndex]);

  // Re-clamp when bounds shrink (content/viewport change).
  useEffect(() => {
    const max = Math.max(0, contentWidth - viewportWidth);
    if (scrollXRef.current > max) {
      commitScroll(max);
    }
  }, [contentWidth, viewportWidth, commitScroll]);

  // Cleanup all rAF, timers, and window listeners on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [handlePointerMove, endDrag]);

  return {
    scrollX,
    containerRef,
    isDragging,
    scrollToIndex,
    handlers: { onPointerDown, onWheel, onKeyDown },
  };
}
