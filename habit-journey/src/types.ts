import type { RefObject } from "react";

/** Names of the available simple SVG icons (see components/icons.tsx). */
export type IconName =
  | "seed"
  | "water"
  | "book"
  | "flame"
  | "trophy"
  | "rocket"
  | "star"
  | "sun"
  | "brain"
  | "footprints"
  | "lotus"
  | "pen"
  | "heart"
  | "apple"
  | "moon"
  | "wind"
  | "target"
  | "smile"
  | "bulb"
  | "shoe"
  | "sparkle"
  | "leaf";

/** A single stop on the habit roadmap. */
export interface Milestone {
  id: string;
  index: number;
  title: string;
  description: string;
  icon: IconName;
  completed: boolean;
  current: boolean;
  locked: boolean;
  xp: number;
  streak: number;
}

/** A point in absolute content-space coordinates (px). */
export interface Point {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* Component prop contracts — implementations MUST match these.        */
/* ------------------------------------------------------------------ */

export interface MilestoneProps {
  milestone: Milestone;
  /** Center of the icon bubble in the roadmap's local (windowed) coordinates. */
  center: Point;
  /** Whether this node is the roving-tabindex / focus target. */
  focused: boolean;
  /** True only while the user is navigating by keyboard (gates DOM focus). */
  keyboardActive: boolean;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
}

export interface PathProps {
  /** Ordered node centers to connect, in absolute content coordinates. */
  points: Point[];
  /** SVG canvas size (absolute content dimensions). */
  width: number;
  height: number;
  reducedMotion: boolean;
}

export interface BackgroundProps {
  /** Current horizontal scroll offset in px (>= 0). */
  scrollX: number;
  /** Viewport size. */
  width: number;
  height: number;
  reducedMotion: boolean;
}

/* ------------------------------------------------------------------ */
/* Hook contracts.                                                     */
/* ------------------------------------------------------------------ */

export interface DragScrollOptions {
  /** Total scrollable content width in px. */
  contentWidth: number;
  viewportWidth: number;
  /** Distance in px between adjacent snap points (node spacing). */
  snapStep: number;
  /** Offset so a snapped node lands centered in the viewport. */
  snapOffset: number;
  /** Fired when the settled/nearest milestone index changes. */
  onActiveIndexChange?: (index: number) => void;
}

export interface DragScrollResult {
  /** Current horizontal offset in px. */
  scrollX: number;
  containerRef: RefObject<HTMLDivElement>;
  isDragging: boolean;
  /** Smoothly scroll so the given milestone index is centered. */
  scrollToIndex: (index: number) => void;
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  };
}

export interface InfiniteRoadmapOptions {
  /** How many milestones to seed initially. */
  initialCount: number;
  /** Grow the list when the visible end is within this many nodes of the tail. */
  threshold: number;
  /** How many milestones to append each time the threshold is crossed. */
  batchSize: number;
}

export interface InfiniteRoadmapResult {
  /** Currently loaded milestones (length grows as the user scrolls). */
  milestones: Milestone[];
  /** Total loaded content width in px. */
  contentWidth: number;
  /** Ask the roadmap to make sure `index` (and a little beyond) is loaded. */
  ensureIndexLoaded: (index: number) => void;
}
