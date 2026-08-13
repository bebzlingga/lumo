import React from "react";
import { HeaderTabs, type HeaderTabOption } from "@/components/HeaderTabs";

/**
 * The Move screen's two views: what today looks like, and where it all adds up.
 *
 * The control itself is `HeaderTabs` — the page-bar pill shared with Friends,
 * which is where the shape, the fill and the sizing live. This file is just this
 * screen's pair of labels.
 */
export type MoveScope = "today" | "overall";

/**
 * The labels and the values are deliberately different words.
 *
 * The values are what the code reasons about — one tab is today, the other is
 * everything. The labels are what the tabs are FOR: the first is where a walk
 * starts, the second is where the figures live. "Today" also collided with the
 * app's own Today tab one bar down, which made the same word mean two places.
 */
const OPTIONS: HeaderTabOption<MoveScope>[] = [
  { value: "today", label: "Move" },
  { value: "overall", label: "Stats" }
];

export function MoveScopeTabs({
  value,
  onChange,
  /** Makes up the difference to a 44pt tap target when the track is shrunk. */
  hitSlop
}: {
  value: MoveScope;
  onChange: (scope: MoveScope) => void;
  hitSlop?: number;
}) {
  return (
    <HeaderTabs
      options={OPTIONS}
      value={value}
      onChange={onChange}
      hitSlop={hitSlop}
    />
  );
}
