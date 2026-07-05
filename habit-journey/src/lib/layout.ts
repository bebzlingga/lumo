import type { Point } from "@/types";

/**
 * Geometry of the roadmap. All positions are deterministic functions of a
 * milestone's index, so the map can be virtualized (only visible nodes render)
 * and extended infinitely without storing per-node coordinates.
 */

/** Horizontal distance between adjacent node centers. */
export const NODE_SPACING = 240;
/** Diameter of the circular icon bubble. */
export const NODE_SIZE = 88;
/** Vertical center of the winding band. */
export const BASE_Y = 300;
/** How far nodes rise above / dip below the baseline. */
export const AMPLITUDE = 92;
/** X position of the first node (index 0). */
export const FIRST_NODE_X = 210;
/** Fixed height of the roadmap content band. */
export const CONTENT_HEIGHT = 560;
/** Frequency of the gentle sine curve the path follows. */
const CURVE_FREQUENCY = 0.9;

export const nodeX = (index: number): number => FIRST_NODE_X + index * NODE_SPACING;

export const nodeY = (index: number): number => BASE_Y + Math.sin(index * CURVE_FREQUENCY) * AMPLITUDE;

export const nodeCenter = (index: number): Point => ({ x: nodeX(index), y: nodeY(index) });

/** Total content width needed to lay out `count` milestones. */
export const contentWidthFor = (count: number): number => FIRST_NODE_X + Math.max(0, count - 1) * NODE_SPACING + FIRST_NODE_X;

/** Offset that centers a node of the given index in a viewport of `viewportWidth`. */
export const centerOffsetFor = (index: number, viewportWidth: number): number => nodeX(index) - viewportWidth / 2;

/**
 * Inclusive index range of nodes potentially visible for a given scroll offset,
 * padded by `buffer` nodes on each side so entering/leaving nodes animate in.
 */
export function visibleRange(
  scrollX: number,
  viewportWidth: number,
  buffer = 2
): { start: number; end: number } {
  const start = Math.max(0, Math.floor((scrollX - FIRST_NODE_X) / NODE_SPACING) - buffer);
  const end = Math.ceil((scrollX + viewportWidth - FIRST_NODE_X) / NODE_SPACING) + buffer;
  return { start, end: Math.max(start, end) };
}

/** Nearest snap index for a given scroll offset (used for keyboard + settle snapping). */
export function nearestIndex(scrollX: number, viewportWidth: number): number {
  return Math.max(0, Math.round((scrollX + viewportWidth / 2 - FIRST_NODE_X) / NODE_SPACING));
}
