import type { IconName } from "@/components/Icon";

/**
 * The toolkit strip on Today — things you DO, as opposed to the Explore rows
 * below it, which are things you read.
 *
 * A registry rather than hand-written tiles so adding a tool is one entry here
 * and nothing else. The strip scrolls horizontally two-up, so the list can grow
 * without the section growing taller and pushing the day's actual work down.
 *
 * `accent` is fixed per tool and does NOT follow the theme — the same call the
 * Explore rows and the focus activities make. It is wayfinding: the tile you
 * reach for should look the same whichever theme is on. Each is walked to 3:1
 * against the current card before it is drawn, so it stays legible either way.
 */
export type Tool = {
  slug: string;
  /** Cast at the push site — see the note in the Today screen. */
  route: string;
  name: string;
  /** One short line. Says what it does, not why it exists. */
  tagline: string;
  icon: IconName;
  accent: string;
  /** False shows a "Soon" tile that cannot be opened. */
  available: boolean;
};

/**
 * Walk's accent, exported because the Walk screen wears it too — the tile and
 * the screen it opens have to be the same colour or the tap does not land
 * anywhere recognisable. A leaf green against Focus's gold.
 */
export const WALK_ACCENT = "#6DA95F";

/**
 * Lumo Move's accent, exported because Move is a whole section rather than a
 * tile — the tab, the cards and the Home card all wear it.
 *
 * A warm, calm green rather than a sports blue or a neon: §41 asks for gentle
 * colours and explicitly rules out fitness-dashboard styling. Walked for
 * contrast at every draw site, see `useMoveAccent`.
 */
export const MOVE_ACCENT = "#5C9A6B";

export const TOOLS: Tool[] = [
  {
    slug: "focus",
    route: "/focus",
    name: "Focus",
    tagline: "Time a block of deep work",
    icon: "timer",
    accent: "#F0B45E",
    available: true
  },
  /**
   * The live GPS walk tracker is RETIRED from the toolkit.
   *
   * Lumo Move now has its own tab and reads movement from the health platform
   * automatically — §52 is explicit that nobody should have to press "Start
   * Walk" for their walking to count. Two entry points both called Move, one of
   * which needed a button pressed first, would be the confusing half of both.
   *
   * The feature itself is untouched and still routable at `/walk`
   * (`app/walk.tsx`, `lib/walk.ts`, 83 tests): §51 defers live GPS sessions
   * rather than deleting them, and this is the one line that brings it back as
   * an opt-in "track a walk live" companion when that is wanted.
   *
   *   { slug: "walk", route: "/move/track", name: "Track a walk", tagline: "Record a route as you go", icon: "walk", accent: WALK_ACCENT, available: true }
   */
];
