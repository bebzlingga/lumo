import {
  clampToRange,
  describeGoal,
  goalProgress,
  normalizeGoal,
  periodDays,
  periodKeyFor,
  periodResetsOn,
  withPeriodHit,
  DEFAULT_GOAL_TARGET,
  GOAL_MIN_M,
  GOAL_RANGE,
  HIT_HISTORY,
  type MoveGoal,
  type MoveGoalPeriod
} from "../goal";

/** A goal set well before any date these tests use, so nothing is clipped. */
function goal(overrides: Partial<MoveGoal> = {}): MoveGoal {
  return { targetM: 100_000, period: "weekly", startedAt: "2026-01-01T00:00:00.000Z", hitPeriods: [], ...overrides };
}

/** Distance lookup from a plain map of date key → kilometres. */
function walked(byDay: Record<string, number>) {
  return (dateKey: string) => (byDay[dateKey] ?? 0) * 1000;
}

describe("periods", () => {
  it("keys a week from its Monday, whichever day is asked", () => {
    // 2026-08-10 is a Monday; 2026-08-16 the Sunday that closes the same week.
    expect(periodKeyFor("weekly", "2026-08-10")).toBe("w:2026-08-10");
    expect(periodKeyFor("weekly", "2026-08-13")).toBe("w:2026-08-10");
    expect(periodKeyFor("weekly", "2026-08-16")).toBe("w:2026-08-10");
    // The Monday after starts a new one rather than extending it.
    expect(periodKeyFor("weekly", "2026-08-17")).toBe("w:2026-08-17");
  });

  it("keys a month from its first, and a day from itself", () => {
    expect(periodKeyFor("monthly", "2026-08-31")).toBe("m:2026-08-01");
    expect(periodKeyFor("monthly", "2026-09-01")).toBe("m:2026-09-01");
    expect(periodKeyFor("daily", "2026-08-13")).toBe("d:2026-08-13");
  });

  it("prefixes each kind, so switching period cannot reuse an old key", () => {
    // Without the prefix a monthly goal switched to daily on the 1st would find
    // its own month key in `hitPeriods` and read the day as already made.
    expect(periodKeyFor("daily", "2026-08-01")).not.toBe(periodKeyFor("monthly", "2026-08-01"));
  });

  it("covers the whole period, including days still ahead", () => {
    expect(periodDays("daily", "2026-08-13")).toEqual(["2026-08-13"]);
    expect(periodDays("weekly", "2026-08-13")).toHaveLength(7);
    expect(periodDays("weekly", "2026-08-13")[0]).toBe("2026-08-10");
    expect(periodDays("monthly", "2026-02-10")).toHaveLength(28);
    // A leap February, which a hand-rolled length table would get wrong.
    expect(periodDays("monthly", "2028-02-10")).toHaveLength(29);
  });

  it("resets on the day after the period ends", () => {
    expect(periodResetsOn("weekly", "2026-08-13")).toBe("2026-08-17");
    expect(periodResetsOn("daily", "2026-08-13")).toBe("2026-08-14");
    expect(periodResetsOn("monthly", "2026-08-13")).toBe("2026-09-01");
  });
});

describe("goalProgress", () => {
  it("sums the period and reports what is left", () => {
    const progress = goalProgress(
      goal(),
      "2026-08-13",
      walked({ "2026-08-10": 12, "2026-08-11": 8, "2026-08-13": 10 })
    );

    expect(progress.walkedM).toBe(30_000);
    expect(progress.remainingM).toBe(70_000);
    expect(progress.hit).toBe(false);
    expect(progress.ratio).toBeCloseTo(0.3);
  });

  it("keeps counting past the target rather than stopping at it", () => {
    // The rule the whole feature turns on: reaching the goal does not end it,
    // and the figure must show the good week rather than clamping to 100.
    const progress = goalProgress(goal(), "2026-08-13", walked({ "2026-08-10": 60, "2026-08-12": 52 }));

    expect(progress.hit).toBe(true);
    expect(progress.walkedM).toBe(112_000);
    expect(progress.remainingM).toBe(0);
    // Only the DRAWN ratio is clamped — the raw figures above are not.
    expect(progress.ratio).toBe(1);
  });

  it("ignores days before the goal was set", () => {
    // Set on the Thursday. Monday's 40 km was walked toward nothing, and
    // counting it would hand somebody a week they had not walked.
    const progress = goalProgress(
      goal({ startedAt: "2026-08-13T09:00:00.000Z" }),
      "2026-08-13",
      walked({ "2026-08-10": 40, "2026-08-13": 6 })
    );

    expect(progress.walkedM).toBe(6_000);
    expect(progress.days.map((day) => day.dateKey)).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  /**
   * The per-day figures are what the strip under the bar draws, and they have to
   * be the same arithmetic as the total above it — a day counted one way in the
   * sum and another in the chart is the bug this exists to catch.
   */
  it("reports each counted day with its own distance", () => {
    const progress = goalProgress(goal(), "2026-08-13", walked({ "2026-08-11": 4, "2026-08-13": 6 }))

    expect(progress.days).toEqual([
      { dateKey: "2026-08-10", metres: 0 },
      { dateKey: "2026-08-11", metres: 4_000 },
      { dateKey: "2026-08-12", metres: 0 },
      { dateKey: "2026-08-13", metres: 6_000 },
      { dateKey: "2026-08-14", metres: 0 },
      { dateKey: "2026-08-15", metres: 0 },
      { dateKey: "2026-08-16", metres: 0 },
    ])
    expect(progress.days.reduce((total, day) => total + day.metres, 0)).toBe(progress.walkedM)
  })

  /**
   * The pace a day has to hit, and the case that makes it not just
   * `target / 7`: a goal set on the Thursday has four days to walk the week's
   * target in, so each of them is a quarter of it.
   */
  it("spreads the target over the days that count, not the calendar", () => {
    // A full week: a hundred kilometres over seven days.
    expect(goalProgress(goal(), "2026-08-13", walked({})).dailyShareM).toBeCloseTo(100_000 / 7, 5)
    // Set on the Thursday, so the same hundred has four days to happen in.
    expect(
      goalProgress(goal({ startedAt: "2026-08-13T09:00:00.000Z" }), "2026-08-13", walked({})).dailyShareM,
    ).toBe(25_000)
  })

  it("counts today as a day left, so the last day is not zero", () => {
    // Sunday of the week: there is still today to walk it in.
    expect(goalProgress(goal(), "2026-08-16", walked({})).daysLeft).toBe(1);
    expect(goalProgress(goal(), "2026-08-13", walked({})).daysLeft).toBe(4);
    expect(goalProgress(goal({ period: "daily" }), "2026-08-13", walked({})).daysLeft).toBe(1);
  });

  it("starts each period over", () => {
    const byDay = walked({ "2026-08-16": 100, "2026-08-17": 3 });

    // Sunday made it; Monday opens at 3 km rather than carrying 100 across.
    expect(goalProgress(goal(), "2026-08-16", byDay).walkedM).toBe(100_000);
    expect(goalProgress(goal(), "2026-08-17", byDay).walkedM).toBe(3_000);
    expect(goalProgress(goal(), "2026-08-17", byDay).hit).toBe(false);
  });

  it("survives a zero target without dividing by it", () => {
    const progress = goalProgress(goal({ targetM: 0 }), "2026-08-13", walked({ "2026-08-13": 1 }));

    expect(Number.isFinite(progress.ratio)).toBe(true);
  });
});

describe("withPeriodHit", () => {
  it("records a period once and returns the same object thereafter", () => {
    const first = withPeriodHit(goal(), "w:2026-08-10");

    expect(first.hitPeriods).toEqual(["w:2026-08-10"]);
    // Identity, not just equality: the caller persists only when this changes.
    expect(withPeriodHit(first, "w:2026-08-10")).toBe(first);
  });

  it("keeps the history bounded", () => {
    let running = goal();

    for (let index = 0; index < HIT_HISTORY + 10; index += 1) {
      running = withPeriodHit(running, `w:${index}`);
    }

    expect(running.hitPeriods).toHaveLength(HIT_HISTORY);
    // The oldest go, not the newest.
    expect(running.hitPeriods[running.hitPeriods.length - 1]).toBe(`w:${HIT_HISTORY + 9}`);
  });
});

describe("normalizeGoal", () => {
  it("drops anything that is not a usable goal", () => {
    expect(normalizeGoal(null)).toBeNull();
    expect(normalizeGoal({})).toBeNull();
    expect(normalizeGoal({ targetM: 40_000 })).toBeNull();
    expect(normalizeGoal({ targetM: 40_000, period: "fortnightly" })).toBeNull();
    expect(normalizeGoal({ targetM: GOAL_MIN_M - 1, period: "weekly" })).toBeNull();
    expect(normalizeGoal({ targetM: Number.NaN, period: "weekly" })).toBeNull();
  });

  it("keeps a stored goal and repairs what it can", () => {
    const restored = normalizeGoal({ targetM: 40_000.4, period: "weekly", hitPeriods: ["w:2026-08-10", 7] });

    expect(restored).not.toBeNull();
    expect(restored?.targetM).toBe(40_000);
    expect(restored?.hitPeriods).toEqual(["w:2026-08-10"]);
    // A missing timestamp is stamped rather than dropping the whole goal.
    expect(typeof restored?.startedAt).toBe("string");
  });
});

describe("describeGoal", () => {
  it("says the distance and the cadence in one phrase", () => {
    expect(describeGoal(goal())).toBe("100 km a week");
    expect(describeGoal(goal({ targetM: 5_000, period: "daily" }))).toBe("5 km a day");
    expect(describeGoal(goal({ targetM: 2_500, period: "monthly" }))).toBe("2.5 km a month");
  });
});

describe("ranges", () => {
  const periods: MoveGoalPeriod[] = ["daily", "weekly", "monthly"];

  it("opens each period on a default that its own slider can reach", () => {
    // The bug this catches: nudging a range without moving the default leaves
    // the handle sitting off the end of its own track on first open.
    for (const period of periods) {
      expect(DEFAULT_GOAL_TARGET[period]).toBeGreaterThanOrEqual(GOAL_RANGE[period].min);
      expect(DEFAULT_GOAL_TARGET[period]).toBeLessThanOrEqual(GOAL_RANGE[period].max);
    }
  });

  it("holds a target inside the range of whichever period it is on", () => {
    // 250 km is a fine week and far off the top of the daily scale.
    expect(clampToRange(250_000, "weekly")).toBe(250_000);
    expect(clampToRange(250_000, "daily")).toBe(GOAL_RANGE.daily.max);
    // And a daily 2 km is under the floor of both longer periods.
    expect(clampToRange(2_000, "monthly")).toBe(GOAL_RANGE.monthly.min);
    expect(clampToRange(2_000, "daily")).toBe(2_000);
  });

  it("accepts a stored goal from outside the current range", () => {
    // `GOAL_RANGE` says what can be SET; a goal already being walked toward is
    // never deleted because the slider's ends moved.
    const wide = normalizeGoal({ targetM: GOAL_RANGE.weekly.max + 50_000, period: "weekly" });

    expect(wide?.targetM).toBe(GOAL_RANGE.weekly.max + 50_000);
  });
});
